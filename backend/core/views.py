# backend/core/views.py
from django.conf import settings
import time
import logging
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from decimal import Decimal
from datetime import timedelta
from django.utils import timezone
from .services import (
    get_or_create_user, 
    apply_referral, 
    register_purchase, 
    ecg_to_ton,
    register_purchase_usdt,
    register_purchase_bnb
)
from .models import (
    AppUser, Wallet, Ledger, Purchase, 
    WithdrawRequest, ReferralLevel,
    PurchaseUSDT, PurchaseBNB
)
from .serializers import WalletSerializer, PurchaseSerializer, UserSerializer
from django.conf import settings
from django.db import transaction
import os
import requests
import re
import base64

# =======================
# تنظیمات لاگینگ
# =======================
logger = logging.getLogger(__name__)

# TON service config
TON_SERVICE_URL = os.getenv(
    "TON_SERVICE_URL",
    "http://tonservice:3001"
)

service_url = TON_SERVICE_URL


# ============================================================
# TON / GRAM on-chain confirmation helpers
# ============================================================

TONCENTER_API_KEY = os.getenv(
    "TONCENTER_API_KEY",
    "",
).strip()

TONCENTER_MAINNET_URL = os.getenv(
    "TONCENTER_MAINNET_URL",
    "https://toncenter.com",
).rstrip("/")

TONCENTER_TESTNET_URL = os.getenv(
    "TONCENTER_TESTNET_URL",
    "https://testnet.toncenter.com",
).rstrip("/")


def _toncenter_base_url(network: str) -> str:
    """
    TON Connect network id:
      -239 = mainnet
      -3   = testnet
    """
    return (
        TONCENTER_TESTNET_URL
        if str(network) == "-3"
        else TONCENTER_MAINNET_URL
    )


def _toncenter_headers() -> dict:
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }

    if TONCENTER_API_KEY:
        headers["X-API-Key"] = TONCENTER_API_KEY

    return headers


def _ton_address_to_raw(address: str) -> str:
    """
    Convert a TON raw or TEP-2 user-friendly address to canonical raw form:
        workchain:64_hex_chars

    No external Python TON package is required.
    """
    value = str(address or "").strip()

    if not value:
        raise ValueError("Empty TON address")

    raw_match = re.fullmatch(
        r"(-?\d+):([0-9a-fA-F]{64})",
        value,
    )

    if raw_match:
        return (
            f"{int(raw_match.group(1))}:"
            f"{raw_match.group(2).lower()}"
        )

    # User-friendly address is 36 bytes:
    # tag(1) + workchain(1) + account_id(32) + crc16(2)
    normalized = (
        value
        .replace("-", "+")
        .replace("_", "/")
    )

    normalized += "=" * ((-len(normalized)) % 4)

    try:
        decoded = base64.b64decode(
            normalized,
            validate=True,
        )
    except Exception as exc:
        raise ValueError(
            "Invalid TON user-friendly address"
        ) from exc

    if len(decoded) != 36:
        raise ValueError(
            "Invalid TON user-friendly address length"
        )

    workchain = int.from_bytes(
        decoded[1:2],
        byteorder="big",
        signed=True,
    )

    account_id = decoded[2:34].hex()

    return f"{workchain}:{account_id}"


def _get_external_message_hash(
    boc: str,
    network: str,
) -> str:
    """
    TON Connect returns a signed external-message BOC.
    TON Center's sendBocReturnHash returns the message hash that can be
    used to locate the real on-chain wallet transaction.

    Re-broadcasting the same signed external message is safe for lookup:
    it is the same message, not a newly signed payment.
    """
    base_url = _toncenter_base_url(network)

    response = requests.post(
        f"{base_url}/api/v2/sendBocReturnHash",
        headers=_toncenter_headers(),
        json={"boc": boc},
        timeout=20,
    )

    try:
        data = response.json()
    except Exception as exc:
        raise RuntimeError(
            "TON Center returned a non-JSON response while resolving BOC"
        ) from exc

    if (
        response.status_code != 200
        or not data.get("ok")
    ):
        raise RuntimeError(
            data.get("error")
            or (
                "TON Center could not resolve the BOC "
                f"(HTTP {response.status_code})"
            )
        )

    result = data.get("result") or {}

    message_hash = str(
        result.get("hash_norm")
        or result.get("hash")
        or ""
    ).strip()

    if not message_hash:
        raise RuntimeError(
            "TON Center did not return a message hash"
        )

    return message_hash


def _find_verified_gram_payment(
    *,
    message_hash: str,
    wallet_address: str,
    gram_address: str,
    network: str,
):
    """
    Find the wallet transaction created by the external message and verify
    that it produced a real outgoing GRAM payment to our configured merchant.

    Returns:
        None                      -> not indexed/confirmed yet
        {tx_hash, gram_nano,...} -> verified payment
    """
    base_url = _toncenter_base_url(network)

    response = requests.get(
        f"{base_url}/api/v3/transactionsByMessage",
        headers=_toncenter_headers(),
        params={
            "msg_hash": message_hash,
            "direction": "in",
            "limit": 10,
        },
        timeout=20,
    )

    if response.status_code == 429:
        logger.warning(
            "TON Center rate limit reached during confirmation; retrying later."
        )
        return None

    try:
        data = response.json()
    except Exception as exc:
        raise RuntimeError(
            "TON Center returned a non-JSON transaction response"
        ) from exc

    if response.status_code != 200:
        raise RuntimeError(
            data.get("error")
            or (
                "TON Center transaction lookup failed "
                f"(HTTP {response.status_code})"
            )
        )

    transactions = data.get("transactions") or []

    if not transactions:
        return None

    expected_sender_raw = _ton_address_to_raw(
        wallet_address
    )

    expected_merchant_raw = _ton_address_to_raw(
        gram_address
    )

    for tx in transactions:
        # Indexed API may expose emulated entries. Never accept them as payment.
        if tx.get("emulated") is True:
            continue

        try:
            tx_account_raw = _ton_address_to_raw(
                tx.get("account")
            )
        except ValueError:
            continue

        # The external message must have executed on the connected user's wallet.
        if tx_account_raw != expected_sender_raw:
            continue

        description = tx.get("description") or {}

        if description.get("aborted") is True:
            continue

        tx_hash = str(
            tx.get("hash") or ""
        ).strip()

        if not tx_hash:
            continue

        matching_messages = []

        for message in tx.get("out_msgs") or []:
            destination = message.get("destination")

            if not destination:
                continue

            try:
                destination_raw = _ton_address_to_raw(
                    destination
                )
            except ValueError:
                continue

            if destination_raw != expected_merchant_raw:
                continue

            # A bounced outgoing transfer must not be credited.
            if message.get("bounced") is True:
                continue

            try:
                value_nano = int(
                    str(message.get("value") or "0")
                )
            except (TypeError, ValueError):
                continue

            if value_nano <= 0:
                continue

            matching_messages.append(
                {
                    "hash": str(
                        message.get("hash") or ""
                    ),
                    "value_nano": value_nano,
                    "destination": destination,
                }
            )

        if not matching_messages:
            continue

        # create_ton_transaction creates one merchant message, but summing keeps
        # verification correct even if a wallet produces multiple matching msgs.
        total_gram_nano = sum(
            item["value_nano"]
            for item in matching_messages
        )

        return {
            "tx_hash": tx_hash,
            "wallet_transaction": tx,
            "gram_nano": total_gram_nano,
            "matching_messages": matching_messages,
        }

    return None


@api_view(["POST"])
def connect_wallet(request):
    wallet_address = request.data.get("wallet_address")
    inviter_code = request.data.get("inviter_code")
    telegram_id = request.data.get("telegram_id")
    telegram_username = request.data.get("telegram_username")
    telegram_photo_url = request.data.get("telegram_photo_url")
    is_telegram = request.data.get("is_telegram", False)

    if not wallet_address:
        return Response(
            {"error": "wallet_address required"},
            status=status.HTTP_400_BAD_REQUEST
        )

    if not telegram_id:
        return Response(
            {"error": "telegram_id required"},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        user = get_or_create_user(
            wallet_address=wallet_address,
            telegram_id=int(telegram_id),
            is_telegram=bool(is_telegram)
        )

        update_fields = []

        # یوزرنیم واقعی را ذخیره کن؛ ID را به‌عنوان username ذخیره نکن.
        if telegram_username:
            clean_username = str(telegram_username).strip().lstrip("@")

            if clean_username and not clean_username.startswith("browser_"):
                user.telegram_username = clean_username
                update_fields.append("telegram_username")

        if telegram_photo_url:
            user.telegram_photo_url = str(telegram_photo_url).strip()
            update_fields.append("telegram_photo_url")

        if update_fields:
            user.save(update_fields=list(set(update_fields)))

        if inviter_code and not user.inviter_id:
            apply_referral(inviter_code, user)

    except (TypeError, ValueError) as exc:
        logger.exception("connect_wallet validation error")

        return Response(
            {"error": str(exc)},
            status=status.HTTP_400_BAD_REQUEST
        )

    except Exception:
        logger.exception("connect_wallet unexpected error")

        return Response(
            {"error": "Unable to connect wallet"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    return Response(
        {
            "user": {
                "telegram_id": user.telegram_id,
                "telegram_username": user.telegram_username,
                "telegram_photo_url": user.telegram_photo_url,
                "wallet_address": user.wallet_address,
                "referral_code": user.referral_code,
                "wallet_locked": user.wallet_locked,
            }
        },
        status=status.HTTP_200_OK
    )

@api_view(["GET"])
def wallet_view(request, wallet_address):
    logger.info("=" * 60)
    logger.info(f"🔍 WALLET_VIEW called for: {wallet_address}")
    
    telegram_id = request.query_params.get("telegram_id")
    is_telegram = request.query_params.get("is_telegram", "false").lower() == "true"
    
    logger.info(f"📊 telegram_id: {telegram_id}, is_telegram: {is_telegram}")
    
    try:
        if telegram_id:
            user = get_or_create_user(wallet_address, int(telegram_id), is_telegram)
        else:
            user = get_or_create_user(wallet_address, telegram_id=None, is_telegram=False)
            
        logger.info(f"✅ Wallet data returned for: {user.wallet_address}")
        return Response(WalletSerializer(user.wallet).data, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"❌ Error in wallet_view: {e}")
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
def create_purchase(request):
    """
    Confirm TON/GRAM payment and create the real invoice automatically.

    The frontend never supplies a manual TX hash. It sends BOC/message_hash.
    register_purchase() runs only after the transaction is verified on-chain.

    Temporary TON provider/indexer failures return HTTP 202 with status=pending,
    so the frontend keeps the invoice visible as CONFIRMING and retries.
    """
    logger.info("=" * 60)
    logger.info("💰 CREATE_PURCHASE / ON-CHAIN CONFIRMATION")
    logger.info("📥 Data keys: %s", list(request.data.keys()))

    wallet_address = str(
        request.data.get("wallet_address", "")
    ).strip()

    boc = str(
        request.data.get("boc", "")
    ).strip()

    output_asset = str(
        request.data.get("output_asset", "ECG")
    ).strip().upper()

    network = str(
        request.data.get("network", "-239")
    ).strip()

    supplied_message_hash = str(
        request.data.get("message_hash", "")
    ).strip()

    expected_gram_amount_raw = str(
        request.data.get("expected_gram_amount", "")
    ).strip()

    if not wallet_address:
        return Response(
            {"error": "wallet_address required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not boc and not supplied_message_hash:
        return Response(
            {"error": "boc required for first confirmation attempt"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if output_asset not in {"ECG", "USDT"}:
        return Response(
            {"error": "Invalid output asset"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if network not in {"-239", "-3"}:
        return Response(
            {"error": "Invalid TON network"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    expected_gram_amount = None

    if expected_gram_amount_raw:
        try:
            expected_gram_amount = int(
                expected_gram_amount_raw
            )
            if expected_gram_amount <= 0:
                raise ValueError()
        except (TypeError, ValueError):
            return Response(
                {
                    "error":
                        "expected_gram_amount must be a positive integer in nanoTON"
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    gram_address = str(
        getattr(
            settings,
            "GRAM_MERCHANT_ADDRESS",
            "",
        ) or ""
    ).strip()

    if not gram_address:
        return Response(
            {"error": "GRAM_MERCHANT_ADDRESS is not configured"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    message_hash = supplied_message_hash

    try:
        if not message_hash:
            message_hash = _get_external_message_hash(
                boc=boc,
                network=network,
            )

        logger.info(
            "🔎 External message hash: %s",
            message_hash,
        )

        if (
            not supplied_message_hash
            and not TONCENTER_API_KEY
        ):
            time.sleep(1.1)

        verified = _find_verified_gram_payment(
            message_hash=message_hash,
            wallet_address=wallet_address,
            gram_address=gram_address,
            network=network,
        )

        if not verified:
            return Response(
                {
                    "status": "pending",
                    "message":
                        "Payment was sent and is waiting for on-chain confirmation.",
                    "message_hash": message_hash,
                    "gram_address": gram_address,
                },
                status=status.HTTP_202_ACCEPTED,
            )

        tx_hash = str(
            verified["tx_hash"]
        ).strip()

        gram_nano = int(
            verified["gram_nano"]
        )

        if (
            expected_gram_amount is not None
            and gram_nano != expected_gram_amount
        ):
            logger.error(
                "❌ Amount mismatch expected=%s actual=%s tx=%s",
                expected_gram_amount,
                gram_nano,
                tx_hash,
            )

            return Response(
                {
                    "error":
                        "Verified blockchain amount does not match requested payment amount.",
                    "expected_gram_amount":
                        str(expected_gram_amount),
                    "verified_gram_amount":
                        str(gram_nano),
                    "ton_tx_hash":
                        tx_hash,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        ton_amount = (
            Decimal(gram_nano)
            / Decimal("1000000000")
        )

        telegram_id = (
            request.query_params.get("telegram_id")
            or request.headers.get("X-Telegram-Id")
        )

        is_telegram = (
            request.query_params.get("is_telegram", "false").lower() == "true"
            or request.headers.get("X-Telegram") == "true"
        )

        user = get_or_create_user(
            wallet_address,
            int(telegram_id) if telegram_id else None,
            is_telegram if telegram_id else False,
        )

        # idempotency: one blockchain TX => one invoice
        existing = (
            Purchase.objects
            .filter(ton_tx_hash=tx_hash)
            .first()
        )

        if existing:
            if existing.user_id != user.id:
                return Response(
                    {
                        "error":
                            "This blockchain transaction is already registered to another user."
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            serialized = dict(
                PurchaseSerializer(existing).data
            )
            serialized["created_at"] = existing.created_at
            serialized["lock_period_days"] = 365

            return Response(
                {
                    "status": "confirmed",
                    "already_registered": True,
                    "ton_tx_hash": tx_hash,
                    "message_hash": message_hash,
                    "gram_address": gram_address,
                    "gram_amount": str(gram_nano),
                    "ton_amount": str(ton_amount),
                    "invoice": serialized,
                },
                status=status.HTTP_200_OK,
            )

        try:
            purchase = register_purchase(
                user,
                ton_amount,
                tx_hash,
                output_asset=output_asset,
            )
        except ValueError as exc:
            if "TX already registered" not in str(exc):
                raise

            existing = (
                Purchase.objects
                .filter(ton_tx_hash=tx_hash)
                .first()
            )

            if (
                not existing
                or existing.user_id != user.id
            ):
                raise

            purchase = existing

        serialized = dict(
            PurchaseSerializer(purchase).data
        )
        serialized["created_at"] = purchase.created_at
        serialized["lock_period_days"] = 365

        logger.info(
            "✅ REAL INVOICE CREATED AUTOMATICALLY: %s",
            purchase.invoice_no,
        )
        logger.info("=" * 60)

        return Response(
            {
                "status": "confirmed",
                "already_registered": False,
                "ton_tx_hash": tx_hash,
                "message_hash": message_hash,
                "gram_address": gram_address,
                "gram_amount": str(gram_nano),
                "ton_amount": str(ton_amount),
                "invoice": serialized,
            },
            status=status.HTTP_201_CREATED,
        )

    except ValueError as exc:
        logger.exception("TON payment validation error")
        return Response(
            {"error": str(exc)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    except (requests.RequestException, RuntimeError) as exc:
        # Wallet payment was already sent. Provider/indexer issue is temporary.
        logger.exception("TON provider/indexer temporary error")
        return Response(
            {
                "status": "pending",
                "message":
                    "Payment was sent. Blockchain provider/indexing is temporarily unavailable; retry confirmation.",
                "message_hash": message_hash,
                "gram_address": gram_address,
                "provider_error": str(exc),
            },
            status=status.HTTP_202_ACCEPTED,
        )

    except Exception as exc:
        logger.exception("Unexpected TON confirmation error")
        return Response(
            {
                "status": "pending",
                "message":
                    "Payment was sent. Confirmation will be retried.",
                "message_hash": message_hash,
                "gram_address": gram_address,
                "provider_error": str(exc),
            },
            status=status.HTTP_202_ACCEPTED,
        )


@api_view(["GET"])
def list_purchases(request):
    wallet_address = request.query_params.get("wallet")
    if not wallet_address:
        return Response({"error": "wallet param required"}, status=400)

    telegram_id = request.query_params.get("telegram_id")
    is_telegram = request.query_params.get("is_telegram", "false").lower() == "true"
    
    if telegram_id:
        user = get_or_create_user(wallet_address, int(telegram_id), is_telegram)
    else:
        user = get_or_create_user(wallet_address, telegram_id=None, is_telegram=False)
    
    qs = user.purchases.order_by("-created_at")

    serialized = list(
        PurchaseSerializer(qs, many=True).data
    )

    for item, purchase in zip(serialized, qs):
        item["created_at"] = purchase.created_at
        item["lock_period_days"] = 365

    return Response(serialized)


@api_view(["POST"])
def request_withdraw(request):
    wallet_address = str(request.data.get("wallet_address", "")).strip()
    destination = str(request.data.get("destination_wallet", "")).strip()
    asset = str(request.data.get("asset", "")).upper()
    scope = request.data.get("scope", "ALL_WITHDRAWABLE")

    try:
        amount = Decimal(str(request.data.get("amount", "0")))
    except Exception:
        return Response({"error": "Invalid amount."}, status=400)

    if not wallet_address or not destination or asset not in {"TON", "ECG"}:
        return Response({"error": "wallet_address, destination_wallet and asset are required."}, status=400)
    if amount < Decimal("60"):
        return Response({"error": "Minimum withdrawal is 60 ECG."}, status=400)
    if scope not in {"DOWNLINE_ONLY", "ALL_WITHDRAWABLE"}:
        return Response({"error": "Invalid scope."}, status=400)

    # Basic TON raw/user-friendly address validation. The TON service must perform
    # canonical parsing again before signing the transfer.
    if asset == "TON" and not (
        re.fullmatch(r"-?\d:[0-9a-fA-F]{64}", destination)
        or re.fullmatch(r"[A-Za-z0-9_-]{48}", destination)
    ):
        return Response({"error": "Destination must be a valid TON wallet address."}, status=400)

    telegram_id = request.headers.get("X-Telegram-Id")
    is_telegram = request.headers.get("X-Telegram") == "true"
    user = get_or_create_user(
        wallet_address,
        int(telegram_id) if telegram_id else None,
        is_telegram if telegram_id else False,
    )

    # Lock and reserve balance before any network call, preventing double spend.
    with transaction.atomic():
        locked_wallet = Wallet.objects.select_for_update().get(user=user)
        available = (
            locked_wallet.downline_profit_instant
            if scope == "DOWNLINE_ONLY"
            else locked_wallet.withdrawable_total()
        )
        if amount > available:
            return Response({"error": "Insufficient withdrawable balance."}, status=400)

        remaining = amount
        fields = (["downline_profit_instant"] if scope == "DOWNLINE_ONLY" else [
            "downline_profit_instant", "referral_bonus", "daily_reward_unlocked",
            "self_profit_unlocked", "principal_unlocked", "self_profit_locked",
        ])
        breakdown = {}
        for field in fields:
            value = getattr(locked_wallet, field)
            used = min(value, remaining)
            if used > 0:
                setattr(locked_wallet, field, value - used)
                breakdown[field] = str(used)
                remaining -= used
            if remaining <= 0:
                break
        locked_wallet.save(update_fields=list(breakdown.keys()) + ["updated_at"])

        ton_amount = ecg_to_ton(amount) if asset == "TON" else Decimal("0")
        req = WithdrawRequest.objects.create(
            user=user, scope=scope, asset=asset, amount=amount,
            ton_amount=ton_amount, destination_wallet=destination,
            status="PENDING", balance_breakdown=breakdown,
        )
        Ledger.objects.create(
            user=user, typ="WITHDRAW", amount=-amount,
            meta={"withdraw_id": req.id, "asset": asset, "status": "PENDING"},
        )

    # ECG is a manual admin request; funds are already reserved.
    if asset == "ECG":
        return Response(serialize_withdraw(req), status=201)

    try:
        service_url = os.getenv("TON_SERVICE_URL", "http://tonservice:3001")
        response = requests.post(
            f"{service_url}/send-ton",
            json={
                "destination": destination,
                "amountTon": str(ton_amount),
                "comment": f"ECG withdraw #{req.id}",
                "idempotencyKey": f"withdraw-{req.id}",
            },
            timeout=30,
        )
        data = response.json()
        if response.status_code not in (200, 201) or not data.get("ok"):
            raise RuntimeError(data.get("error") or "TON service failed")
        tx_hash = str(data.get("tx_hash") or data.get("txHash") or "").strip()
        if not tx_hash:
            raise RuntimeError("TON service did not return tx_hash")

        with transaction.atomic():
            req = WithdrawRequest.objects.select_for_update().get(pk=req.pk)
            req.status = "SUCCESS"
            req.tx_hash = tx_hash
            req.completed_at = timezone.now()
            req.save(update_fields=["status", "tx_hash", "completed_at"])
            locked_wallet = Wallet.objects.select_for_update().get(user=user)
            locked_wallet.total_withdrawn += amount
            locked_wallet.last_withdraw_at = timezone.now()
            locked_wallet.save(update_fields=["total_withdrawn", "last_withdraw_at", "updated_at"])
        return Response(serialize_withdraw(req), status=201)
    except Exception as exc:
        # Restore the exact reserved buckets on failure.
        with transaction.atomic():
            req = WithdrawRequest.objects.select_for_update().get(pk=req.pk)
            locked_wallet = Wallet.objects.select_for_update().get(user=user)
            for field, value in req.balance_breakdown.items():
                setattr(locked_wallet, field, getattr(locked_wallet, field) + Decimal(value))
            locked_wallet.save(update_fields=list(req.balance_breakdown.keys()) + ["updated_at"])
            req.status = "FAILED"
            req.fail_reason = str(exc)[:500]
            req.completed_at = timezone.now()
            req.save(update_fields=["status", "fail_reason", "completed_at"])
        logger.exception("TON withdrawal failed")
        return Response({"error": "TON transfer failed; balance was restored."}, status=502)


def serialize_withdraw(item):
    return {
        "id": item.id,
        "asset": item.asset,
        "amount": str(item.amount),
        "ton_amount": str(item.ton_amount),
        "destination_wallet": item.destination_wallet,
        "status": item.status,
        "tx_hash": item.tx_hash,
        "created_at": item.created_at,
        "completed_at": item.completed_at,
    }


@api_view(["GET"])
def withdraw_history(request):
    wallet_address = request.query_params.get("wallet_address")
    if not wallet_address:
        return Response({"error": "wallet_address required"}, status=400)
    user = AppUser.objects.filter(wallet_address=wallet_address).first()
    if not user:
        return Response([], status=200)
    rows = user.withdraws.order_by("-created_at")[:50]
    return Response([serialize_withdraw(row) for row in rows])


@api_view(["GET"])
def referral_count(request):
    wallet_address = request.query_params.get("wallet_address")
    if not wallet_address:
        return Response({"error": "wallet_address required"}, status=status.HTTP_400_BAD_REQUEST)

    telegram_id = request.query_params.get("telegram_id")
    is_telegram = request.query_params.get("is_telegram", "false").lower() == "true"
    
    if telegram_id:
        user = get_or_create_user(wallet_address, int(telegram_id), is_telegram)
    else:
        user = get_or_create_user(wallet_address, telegram_id=None, is_telegram=False)
    
    return Response({"count": user.invitees.count()}, status=status.HTTP_200_OK)


# =======================
# Timer endpoints
# =======================

DAILY_REWARD = Decimal("1.0")
COOLDOWN = timedelta(hours=24)


@api_view(["GET"])
def reward_status(request):
    logger.info("=" * 60)
    logger.info("⏰ REWARD_STATUS CALLED")
    
    wallet_address = request.query_params.get("wallet_address")
    if not wallet_address:
        logger.error("❌ wallet_address required")
        return Response({"error": "wallet_address required"}, status=status.HTTP_400_BAD_REQUEST)

    telegram_id = request.query_params.get("telegram_id")
    is_telegram = request.query_params.get("is_telegram", "false").lower() == "true"
    
    logger.info(f"📊 wallet: {wallet_address}, telegram_id: {telegram_id}")
    
    if telegram_id:
        user = get_or_create_user(wallet_address, int(telegram_id), is_telegram)
    else:
        user = get_or_create_user(wallet_address, telegram_id=None, is_telegram=False)
    
    w = user.wallet
    now = timezone.now()

    next_at = user.next_daily_claim_at

    if not next_at:
        seconds_remaining = 0
    else:
        seconds_remaining = max(0, int((next_at - now).total_seconds()))

    logger.info(f"✅ Reward status returned: {seconds_remaining}s remaining")
    logger.info("=" * 60)
    
    return Response({
        "status": "ok",
        "seconds_remaining": seconds_remaining,
        "balance_ecg": str(w.withdrawable_total()),
        "total_rewards": str(w.withdrawable_total()),
        "referral_points": str(w.referral_bonus),
        "rewards_count": user.ledgers.filter(typ="DAILY_UNLOCK").count(),
    }, status=status.HTTP_200_OK)


@api_view(["POST"])
def tick(request):
    """
    دریافت پاداش روزانه (1 ECG)
    """
    logger.info("=" * 60)
    logger.info("🔔 TICK FUNCTION CALLED")
    logger.info(f"📥 Request method: {request.method}")
    logger.info(f"📥 Request data: {request.data}")
    logger.info(f"📥 Request headers: {dict(request.headers)}")
    
    wallet_address = request.data.get("wallet_address")
    if not wallet_address:
        logger.error("❌ wallet_address required")
        return Response(
            {"error": "wallet_address required"}, 
            status=status.HTTP_400_BAD_REQUEST
        )

    telegram_id = request.headers.get("X-Telegram-Id") or request.data.get("telegram_id")
    is_telegram = request.headers.get("X-Telegram") == "true" or request.data.get("is_telegram", False)
    
    logger.info(f"📊 wallet: {wallet_address}, telegram_id: {telegram_id}")
    
    try:
        if telegram_id:
            user = get_or_create_user(wallet_address, int(telegram_id), is_telegram)
        else:
            user = get_or_create_user(wallet_address, telegram_id=None, is_telegram=False)
        
        if not user:
            logger.error("❌ User not found")
            return Response(
                {"error": "User not found"}, 
                status=status.HTTP_404_NOT_FOUND
            )
        
        w = user.wallet
        now = timezone.now()
        next_at = user.next_daily_claim_at

        if next_at and next_at > now:
            seconds_remaining = int((next_at - now).total_seconds())
            logger.info(f"⏳ Too early! {seconds_remaining}s remaining")
            return Response({
                "status": "too_early",
                "message": f"Please wait {seconds_remaining} seconds",
                "seconds_remaining": seconds_remaining,
            }, status=status.HTTP_400_BAD_REQUEST)

        logger.info(f"💰 Adding reward: {DAILY_REWARD} ECG")
        w.daily_reward_unlocked = w.daily_reward_unlocked + DAILY_REWARD
        w.save(update_fields=["daily_reward_unlocked"])

        Ledger.objects.create(
            user=user,
            typ="DAILY_UNLOCK",
            amount=DAILY_REWARD,
            meta={"source": "timer"}
        )

        user.next_daily_claim_at = now + COOLDOWN
        user.save(update_fields=["next_daily_claim_at"])

        logger.info(f"✅ Reward claimed! Next claim at: {user.next_daily_claim_at}")
        logger.info("=" * 60)

        return Response({
            "status": "rewarded",
            "message": "1 ECG added to your wallet",
            "balance_ecg": str(w.withdrawable_total()),
            "total_rewards": str(w.withdrawable_total()),
            "referral_points": str(w.referral_bonus),
            "rewards_count": user.ledgers.filter(typ="DAILY_UNLOCK").count(),
            "seconds_remaining": int(COOLDOWN.total_seconds()),
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"❌ Error in tick: {e}")
        import traceback
        traceback.print_exc()
        return Response(
            {"error": str(e)}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# =======================
# Test Endpoint
# =======================

@api_view(["GET", "POST"])
def test_tick(request):
    """
    تست ساده برای بررسی ارتباط
    """
    logger.info("=" * 60)
    logger.info("🧪 TEST_TICK CALLED")
    logger.info(f"Method: {request.method}")
    logger.info(f"Data: {request.data}")
    logger.info("=" * 60)
    
    return Response({
        "status": "ok",
        "message": "Test endpoint working!",
        "method": request.method,
        "data": request.data
    }, status=status.HTTP_200_OK)


# =======================
# Referral Levels API
# =======================

@api_view(["GET"])
def get_referral_levels(request):
    wallet_address = request.query_params.get("wallet_address")

    if not wallet_address:
        return Response(
            {"error": "wallet_address required"},
            status=status.HTTP_400_BAD_REQUEST
        )

    user = AppUser.objects.filter(
        wallet_address=wallet_address
    ).first()

    if not user:
        return Response(
            {"error": "User not found"},
            status=status.HTTP_404_NOT_FOUND
        )

    level_obj, _ = ReferralLevel.objects.get_or_create(user=user)

    def serialize_level_users(stored_users):
        stored_users = stored_users or []
        stored_users = stored_users[:20]

        wallets = [
            item.get("wallet")
            for item in stored_users
            if isinstance(item, dict) and item.get("wallet")
        ]

        telegram_ids = [
            item.get("telegram_id")
            for item in stored_users
            if isinstance(item, dict) and item.get("telegram_id")
        ]

        users_by_wallet = {
            app_user.wallet_address: app_user
            for app_user in AppUser.objects.filter(
                wallet_address__in=wallets
            )
        }

        users_by_telegram_id = {
            app_user.telegram_id: app_user
            for app_user in AppUser.objects.filter(
                telegram_id__in=telegram_ids
            )
        }

        result = []

        for item in stored_users:
            if isinstance(item, str):
                item = {
                    "wallet": item,
                    "investment": 0,
                    "profit": 0
                }

            if not isinstance(item, dict):
                continue

            wallet = item.get("wallet")
            telegram_id = item.get("telegram_id")

            app_user = (
                users_by_wallet.get(wallet)
                or users_by_telegram_id.get(telegram_id)
            )

            username = item.get("telegram_username")
            photo_url = item.get("telegram_photo_url")

            if app_user:
                username = (
                    app_user.telegram_username
                    or username
                )

                photo_url = (
                    app_user.telegram_photo_url
                    or photo_url
                )

                telegram_id = (
                    app_user.telegram_id
                    or telegram_id
                )

            result.append({
                "telegram_id": telegram_id,
                "telegram_username": username,
                "telegram_photo_url": photo_url,
                "wallet": wallet,
                "investment": item.get("investment", 0),
                "profit": item.get("profit", 0),
            })

        return result

    levels = {}

    total_referrals = 0

    for level_number in range(1, 6):
        count = getattr(
            level_obj,
            f"level_{level_number}_count"
        )

        stored_users = getattr(
            level_obj,
            f"level_{level_number}_users"
        )

        levels[f"level_{level_number}"] = {
            "count": count,
            "users": serialize_level_users(stored_users)
        }

        total_referrals += count

    return Response(
        {
            "levels": levels,
            "total_referrals": total_referrals,
            "is_test": False,
        },
        status=status.HTTP_200_OK
    )


def generate_test_data_with_columns():
    import random
    
    def generate_user(level):
        telegram_id = random.randint(100000000, 999999999)
        wallet = "0x" + ''.join(random.choices('0123456789abcdef', k=40))
        investment = round(random.uniform(1, 100), 2)
        profit = round(random.uniform(0.01, 5), 4)
        
        usernames = ['alex', 'john_doe', 'crypto_master', 'ton_fan', 'blockchain_dev', 'defi_expert', 'nft_collector']
        telegram_username = random.choice(usernames) + str(random.randint(1, 999))
        
        return {
            "telegram_id": telegram_id,
            "telegram_username": telegram_username,
            "wallet": wallet,
            "investment": investment,
            "profit": profit
        }
    
    level_counts = {
        "level_1": 3,
        "level_2": 7,
        "level_3": 15,
        "level_4": 31,
        "level_5": 63
    }
    
    return {
        "level_1": {
            "count": level_counts["level_1"],
            "users": [generate_user(1) for _ in range(level_counts["level_1"])]
        },
        "level_2": {
            "count": level_counts["level_2"],
            "users": [generate_user(2) for _ in range(level_counts["level_2"])]
        },
        "level_3": {
            "count": level_counts["level_3"],
            "users": [generate_user(3) for _ in range(level_counts["level_3"])]
        },
        "level_4": {
            "count": level_counts["level_4"],
            "users": [generate_user(4) for _ in range(level_counts["level_4"])]
        },
        "level_5": {
            "count": level_counts["level_5"],
            "users": [generate_user(5) for _ in range(level_counts["level_5"])]
        }
    }


# =======================
# USDT Purchase Endpoints
# =======================

@api_view(["POST"])
def create_purchase_usdt(request):
    logger.info("=" * 60)
    logger.info("💰 CREATE_PURCHASE_USDT CALLED")
    logger.info(f"📥 Data: {request.data}")
    
    wallet_address = request.data.get("wallet_address")
    usdt_amount = request.data.get("usdt_amount")
    usdt_tx_hash = request.data.get("usdt_tx_hash")

    if not wallet_address or not usdt_amount or not usdt_tx_hash:
        logger.error("❌ Missing fields")
        return Response({"error": "missing fields"}, status=400)

    try:
        usdt_amount = Decimal(str(usdt_amount))
        if usdt_amount <= 0:
            raise ValueError()
    except:
        logger.error("❌ Invalid usdt_amount")
        return Response({"error": "invalid usdt_amount"}, status=400)

    user = get_or_create_user(wallet_address, None, False)

    try:
        p = register_purchase_usdt(user, usdt_amount, str(usdt_tx_hash))
        logger.info(f"✅ USDT Purchase created: {p.invoice_no}")
    except Exception as e:
        logger.error(f"❌ Error: {e}")
        return Response({"error": str(e)}, status=400)

    return Response({
        "id": p.id,
        "invoice_no": p.invoice_no,
        "usdt_amount": str(p.usdt_amount),
        "ecg_value": str(p.ecg_value),
        "self_profit_5": str(p.self_profit_5),
        "principal_unlock_at": p.principal_unlock_at,
        "self_profit_unlock_at": p.self_profit_unlock_at,
    }, status=201)


@api_view(["GET"])
def list_purchases_usdt(request):
    wallet_address = request.query_params.get("wallet")

    if not wallet_address:
        return Response({"error": "wallet param required"}, status=400)

    user = get_or_create_user(wallet_address, None, False)
    qs = user.purchases_usdt.all().order_by("-created_at")

    return Response([{
        "id": p.id,
        "invoice_no": p.invoice_no,
        "usdt_amount": str(p.usdt_amount),
        "ecg_value": str(p.ecg_value),
        "self_profit_5": str(p.self_profit_5),
        "principal_unlock_at": p.principal_unlock_at,
        "self_profit_unlock_at": p.self_profit_unlock_at,
        "usdt_tx_hash": p.usdt_tx_hash,
    } for p in qs])


# =======================
# BNB Purchase Endpoints
# =======================

@api_view(["POST"])
def create_purchase_bnb(request):
    logger.info("=" * 60)
    logger.info("💰 CREATE_PURCHASE_BNB CALLED")
    logger.info(f"📥 Data: {request.data}")
    
    wallet_address = request.data.get("wallet_address")
    bnb_amount = request.data.get("bnb_amount")
    bnb_tx_hash = request.data.get("bnb_tx_hash")

    if not wallet_address or not bnb_amount or not bnb_tx_hash:
        logger.error("❌ Missing fields")
        return Response({"error": "missing fields"}, status=400)

    try:
        bnb_amount = Decimal(str(bnb_amount))
        if bnb_amount <= 0:
            raise ValueError()
    except:
        logger.error("❌ Invalid bnb_amount")
        return Response({"error": "invalid bnb_amount"}, status=400)

    user = get_or_create_user(wallet_address, None, False)

    try:
        p = register_purchase_bnb(user, bnb_amount, str(bnb_tx_hash))
        logger.info(f"✅ BNB Purchase created: {p.invoice_no}")
    except Exception as e:
        logger.error(f"❌ Error: {e}")
        return Response({"error": str(e)}, status=400)

    return Response({
        "id": p.id,
        "invoice_no": p.invoice_no,
        "bnb_amount": str(p.bnb_amount),
        "ecg_value": str(p.ecg_value),
        "self_profit_5": str(p.self_profit_5),
        "principal_unlock_at": p.principal_unlock_at,
        "self_profit_unlock_at": p.self_profit_unlock_at,
    }, status=201)


@api_view(["GET"])
def list_purchases_bnb(request):
    wallet_address = request.query_params.get("wallet")
    
    if not wallet_address:
        return Response({"error": "wallet param required"}, status=400)

    user = get_or_create_user(wallet_address, None, False)
    qs = user.purchases_bnb.all().order_by("-created_at")

    return Response([{
        "id": p.id,
        "invoice_no": p.invoice_no,
        "bnb_amount": str(p.bnb_amount),
        "ecg_value": str(p.ecg_value),
        "self_profit_5": str(p.self_profit_5),
        "principal_unlock_at": p.principal_unlock_at,
        "self_profit_unlock_at": p.self_profit_unlock_at,
        "bnb_tx_hash": p.bnb_tx_hash,
    } for p in qs])

@api_view(["POST"])
def create_ton_transaction(request):
    """
    Build the TON Connect transaction payload.

    Merchant address always comes from GRAM_MERCHANT_ADDRESS on the backend.
    The connected wallet address and network are bound into the TON Connect
    request when provided.
    """
    logger.info("=" * 60)
    logger.info("💎 CREATE_GRAM_TRANSACTION CALLED")
    logger.info("📥 Request data: %s", request.data)

    raw_amount = request.data.get("amount")

    wallet_address = str(
        request.data.get("wallet_address", "")
    ).strip()

    network = str(
        request.data.get("network", "-239")
    ).strip()

    if raw_amount in (None, ""):
        logger.error("❌ amount required")

        return Response(
            {"error": "amount required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        amount_int = int(
            str(raw_amount)
        )

        if amount_int <= 0:
            raise ValueError(
                "amount must be greater than zero"
            )

    except (TypeError, ValueError):
        logger.error(
            "❌ invalid amount: %r",
            raw_amount,
        )

        return Response(
            {
                "error":
                    "amount must be a positive integer in nanoTON"
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if network not in {"-239", "-3"}:
        return Response(
            {"error": "Invalid TON network"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    gram_address = str(
        getattr(
            settings,
            "GRAM_MERCHANT_ADDRESS",
            "",
        ) or ""
    ).strip()

    if not gram_address:
        logger.error(
            "❌ GRAM_MERCHANT_ADDRESS is not configured"
        )

        return Response(
            {
                "error":
                    "GRAM_MERCHANT_ADDRESS is not configured",
                "gram_address": "",
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    gram_amount = str(
        amount_int
    )

    transaction_data = {
        "validUntil":
            int(time.time()) + 600,

        # TON Connect recommends explicitly binding the network.
        "network":
            network,

        "messages": [
            {
                # TON Connect protocol field must stay named "address".
                "address":
                    gram_address,

                "amount":
                    gram_amount,
            }
        ],
    }

    if wallet_address:
        transaction_data["from"] = wallet_address

    gram_amount_ton = str(
        Decimal(gram_amount)
        / Decimal("1000000000")
    )

    logger.info(
        "✅ GRAM merchant address: %s",
        gram_address,
    )

    logger.info(
        "✅ GRAM amount nanoTON: %s",
        gram_amount,
    )

    logger.info(
        "✅ GRAM amount TON: %s",
        gram_amount_ton,
    )

    logger.info(
        "✅ TON Connect network: %s",
        network,
    )

    logger.info("=" * 60)

    return Response(
        {
            "transaction":
                transaction_data,

            "gram_address":
                gram_address,

            "gram_amount":
                gram_amount,

            "gram_amount_ton":
                gram_amount_ton,
        },
        status=status.HTTP_200_OK,
    )

