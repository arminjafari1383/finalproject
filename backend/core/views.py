# backend/core/views.py
from django.conf import settings
import time
import logging
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from decimal import Decimal, ROUND_UP
from datetime import timedelta
from django.utils import timezone
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from .services import (
    get_or_create_user, 
    apply_referral, 
    register_purchase, 
    ecg_to_ton,
    fetch_ton_usd_rate,
    ECG_PER_USD,
    register_purchase_usdt,
    register_purchase_bnb,
    reconcile_existing_referral_join_rewards,
    release_matured_purchase_profits,
)
from .models import (
    AppUser, Wallet, AssetBalance, Ledger, Purchase, 
    WithdrawRequest, ReferralLevel,
    PurchaseUSDT, PurchaseBNB
)
from .serializers import WalletSerializer, PurchaseSerializer, UserSerializer
from django.conf import settings
from django.db import transaction
from django.db.models import Sum
from django.db.utils import OperationalError
from django.core import signing
import os
import requests
import re
import base64
import hashlib
import hmac
import struct

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
    """
    Connect a wallet to the Telegram identity.

    There is no wallet-lock or explicit replacement flow anymore.
    If the same telegram_id connects with another wallet_address, the same
    AppUser is updated automatically by get_or_create_user().
    """
    wallet_address = str(
        request.data.get("wallet_address", "") or ""
    ).strip()

    inviter_code = request.data.get("inviter_code")
    telegram_id = request.data.get("telegram_id")
    telegram_username = request.data.get("telegram_username")
    telegram_photo_url = request.data.get("telegram_photo_url")

    def parse_bool(value):
        if isinstance(value, bool):
            return value
        return str(value or "").strip().lower() in {
            "1", "true", "yes", "on"
        }

    is_telegram = parse_bool(
        request.data.get("is_telegram", False)
    )

    logger.info(
        "[CONNECT_UNLOCKED] wallet=%s telegram_id=%s is_telegram=%s",
        wallet_address,
        telegram_id,
        is_telegram,
    )

    if not wallet_address:
        return Response(
            {"error": "wallet_address required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not telegram_id:
        return Response(
            {"error": "telegram_id required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        telegram_id = int(telegram_id)
    except (TypeError, ValueError):
        return Response(
            {"error": "Invalid telegram_id"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    max_attempts = 5

    for attempt in range(max_attempts):
        try:
            previous_user = (
                AppUser.objects
                .filter(telegram_id=telegram_id)
                .first()
            )

            previous_wallet = (
                previous_user.wallet_address
                if previous_user
                else None
            )

            user = get_or_create_user(
                wallet_address=wallet_address,
                telegram_id=telegram_id,
                is_telegram=is_telegram,
            )

            update_fields = []

            if telegram_username:
                clean_username = str(telegram_username).strip().lstrip("@")

                if (
                    clean_username
                    and not clean_username.startswith("browser_")
                    and user.telegram_username != clean_username
                ):
                    user.telegram_username = clean_username
                    update_fields.append("telegram_username")

            if telegram_photo_url:
                clean_photo = str(telegram_photo_url).strip()

                if (
                    clean_photo
                    and user.telegram_photo_url != clean_photo
                ):
                    user.telegram_photo_url = clean_photo
                    update_fields.append("telegram_photo_url")

            # Keep wallet locking disabled even for legacy rows.
            if user.wallet_locked:
                user.wallet_locked = False
                update_fields.append("wallet_locked")

            if update_fields:
                user.save(update_fields=list(dict.fromkeys(update_fields)))

            # Referral relationship remains one-time only. Wallet changes do not
            # recreate inviter relationships or referral bonuses.
            if inviter_code and not user.inviter_id:
                apply_referral(inviter_code, user)

            wallet_changed = bool(
                previous_wallet
                and previous_wallet != user.wallet_address
            )

            logger.info(
                "[CONNECT_UNLOCKED] success user_id=%s telegram_id=%s "
                "wallet=%s changed=%s",
                user.id,
                user.telegram_id,
                user.wallet_address,
                wallet_changed,
            )

            return Response(
                {
                    "success": True,
                    "wallet_changed": wallet_changed,
                    "previous_wallet": (
                        previous_wallet
                        if wallet_changed
                        else None
                    ),
                    "user": {
                        "id": user.id,
                        "telegram_id": user.telegram_id,
                        "telegram_username": user.telegram_username,
                        "telegram_photo_url": user.telegram_photo_url,
                        "wallet_address": user.wallet_address,
                        "referral_code": user.referral_code,
                        "wallet_locked": False,
                        "is_telegram": user.is_telegram_user,
                        "telegram_verified": user.telegram_verified,
                    },
                },
                status=status.HTTP_200_OK,
            )

        except OperationalError as exc:
            is_locked = "database is locked" in str(exc).lower()

            if not is_locked:
                logger.exception("connect_wallet database error")
                return Response(
                    {"error": "Database error"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            if attempt >= max_attempts - 1:
                logger.exception(
                    "connect_wallet SQLite remained locked after %s attempts",
                    max_attempts,
                )
                return Response(
                    {
                        "error": "Database is busy. Please retry.",
                        "code": "database_busy",
                    },
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )

            delay = 0.15 * (2 ** attempt)
            logger.warning(
                "SQLite locked during /connect/; retry %s/%s in %.2fs",
                attempt + 1,
                max_attempts,
                delay,
            )
            time.sleep(delay)

        except (TypeError, ValueError) as exc:
            message = str(exc)
            logger.warning("[CONNECT_UNLOCKED] validation/conflict: %s", message)

            if "another account" in message.lower():
                return Response(
                    {
                        "error": message,
                        "code": "wallet_collision",
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            return Response(
                {"error": message},
                status=status.HTTP_400_BAD_REQUEST,
            )

        except Exception as exc:
            logger.exception("[CONNECT_UNLOCKED] unexpected error")
            return Response(
                {
                    "error": "Unable to connect wallet",
                    "detail": str(exc),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


@api_view(["GET"])
def wallet_view(request, wallet_address):
    """
    Return a LIVE wallet snapshot.

    Important:
    - stake_balance is principal only (locked + unlocked stake).
    - referral/hourly rewards are returned as separate balances.
    - withdrawable_total / available_balance remain the current spendable ECG
      for the existing withdrawal flow and are not used as the main Wallet balance.
    - total_earned is calculated from earning ledgers.
    """
    user = (
        AppUser.objects
        .select_related("wallet")
        .filter(wallet_address=wallet_address)
        .first()
    )

    if not user:
        return Response(
            {"error": "User not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    # Upgrade any referrals that were created under the old 3 ECG rule before
    # returning balances, so Wallet and Referral Tree agree immediately.
    reconcile_existing_referral_join_rewards(user)

    # Unlock matured 5% self-profit lazily whenever the Wallet is opened.
    # This is idempotent and works for both ECG and USDT.
    release_matured_purchase_profits(user)

    user.refresh_from_db()
    wallet = Wallet.objects.get(user=user)
    usdt_balance, _ = AssetBalance.objects.get_or_create(
        user=user,
        asset="USDT",
    )

    # Existing serializer fields are kept for backward compatibility.
    payload = dict(
        WalletSerializer(wallet).data
    )

    # --------------------------------------------------------
    # Current available ECG profit balance
    # --------------------------------------------------------
    # Self 5% profit is withdrawable only after its 30-day unlock.
    # Referral purchase profit (5% / 1%) is credited to
    # downline_profit_instant and is withdrawable immediately.
    # Do NOT include locked self profit or principal here.
    available_balance = (
        Decimal(str(wallet.ecg_self_unlocked or 0))
        + Decimal(str(wallet.ecg_referral_profit or 0))
    )

    # --------------------------------------------------------
    # Lifetime mining statistics
    # --------------------------------------------------------
    daily_qs = user.ledgers.filter(
        typ="DAILY_UNLOCK"
    )

    total_mined = (
        daily_qs.aggregate(
            total=Sum("amount")
        )["total"]
        or Decimal("0")
    )

    mining_days = daily_qs.count()

    # --------------------------------------------------------
    # Lifetime earnings
    # --------------------------------------------------------
    total_earned = (
        user.ledgers
        .filter(
            typ__in=[
                "DAILY_UNLOCK",
                "SELF_PROFIT_UNLOCK",
                "DOWNLINE_PROFIT",
                "REF_BONUS",
                "LEVEL5_BONUS",
            ]
        )
        .aggregate(
            total=Sum("amount")
        )["total"]
        or Decimal("0")
    )

    # Current referral balance can decrease after a withdrawal.
    referral_bonus_current = (
        wallet.referral_bonus
        or Decimal("0")
    )

    # Lifetime referral join bonus earned by the user (direct + indirect).
    # Every successful referral reward is recorded as REF_BONUS.
    referral_bonus_total = (
        user.ledgers
        .filter(typ="REF_BONUS")
        .aggregate(total=Sum("amount"))["total"]
        or Decimal("0")
    )

    downline_profit_current = (
        wallet.ecg_referral_profit
        or Decimal("0")
    )

    principal_locked = (
        wallet.principal_locked
        or Decimal("0")
    )

    self_profit_locked = (
        wallet.self_profit_locked
        or Decimal("0")
    )

    principal_unlocked = (
        wallet.principal_unlocked
        or Decimal("0")
    )

    self_profit_unlocked = (
        wallet.ecg_self_unlocked
        or Decimal("0")
    )

    daily_reward_unlocked = (
        wallet.daily_reward_unlocked
        or Decimal("0")
    )

    # USDT / Tether profit buckets. Self-profit stays locked for 30 days;
    # referral 5%/1% USDT profit is credited directly to profit_unlocked.
    usdt_profit_locked = (
        usdt_balance.profit_locked
        or Decimal("0")
    )
    usdt_profit_unlocked = (
        usdt_balance.profit_unlocked
        or Decimal("0")
    )
    usdt_profit_total = (
        usdt_profit_locked
        + usdt_profit_unlocked
    )

    # ECG profit wallet:
    # - matured self 5% profit is unlocked after 30 days
    # - referral 5% / 1% profit is instantly withdrawable
    # Principal remains a separate bucket and is intentionally excluded here.
    withdrawable_ecg_profit = (
        self_profit_unlocked
        + downline_profit_current
    )

    total_ecg_profit = (
        self_profit_locked
        + self_profit_unlocked
        + downline_profit_current
    )

    ecg_balance = withdrawable_ecg_profit

    # EPL wallet: direct referral + hourly reward only.
    # These buckets are intentionally NOT withdrawable yet.
    epl_balance = (
        referral_bonus_current
        + daily_reward_unlocked
    )

    # Legacy stake display kept for older clients.
    stake_balance = (
        principal_locked
        + principal_unlocked
    )

    # Override/add explicit values consumed by Wallet.jsx.
    payload.update({
        # ECG withdrawal bucket only.
        "withdrawable_total": str(available_balance),
        "available_balance": str(available_balance),
        "ecg_balance": str(ecg_balance),

        # EPL is display-only / non-withdrawable for now.
        "epl_balance": str(epl_balance),

        # Legacy stake display for older clients.
        "stake_balance": str(stake_balance),

        # Hourly reward bucket is EPL.
        "hourly_reward_balance": str(daily_reward_unlocked),
        "hourly_reward_total": str(total_mined),
        "hourly_claims": mining_days,

        # Legacy aliases kept for existing clients.
        "total_mined": str(total_mined),
        "mining_days": mining_days,

        # Referral join bonus bucket is separate from stake.
        "referral_bonus": str(referral_bonus_current),
        "referral_bonus_balance": str(referral_bonus_current),
        "referral_bonus_total": str(referral_bonus_total),

        "ecg_referral_profit": str(downline_profit_current),

        "principal_locked": str(principal_locked),
        "principal_unlocked": str(principal_unlocked),
        "self_profit_locked": str(self_profit_locked),
        "ecg_self_unlocked": str(self_profit_unlocked),
        # ECG self-profit fields kept for backward compatibility.
        "purchase_profit_ecg": str(self_profit_locked + self_profit_unlocked),
        "purchase_profit_ecg_locked": str(self_profit_locked),
        "purchase_profit_ecg_unlocked": str(self_profit_unlocked),

        # New explicit ECG profit totals used by Wallet.jsx. Referral purchase
        # profit is instant; self purchase profit joins the withdrawable bucket
        # only after its 30-day unlock.
        "referral_profit_ecg_unlocked": str(downline_profit_current),
        "withdrawable_ecg_profit": str(withdrawable_ecg_profit),
        "total_ecg_profit": str(total_ecg_profit),

        # Tether profit wallet. Only unlocked USDT can be converted to TON.
        "purchase_profit_usdt": str(usdt_profit_total),
        "purchase_profit_usdt_locked": str(usdt_profit_locked),
        "purchase_profit_usdt_unlocked": str(usdt_profit_unlocked),
        "withdrawable_usdt_profit": str(usdt_profit_unlocked),

        "daily_reward_unlocked": str(daily_reward_unlocked),

        "total_earned": str(total_earned),
        "total_withdrawn": str(
            wallet.total_withdrawn
            or Decimal("0")
        ),
    })

    return Response(
        payload,
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
def create_purchase(request):
    """
    Create the purchase immediately after TON Connect reports sendTransaction
    success. This path intentionally does NOT wait for TON Center / on-chain
    indexing. The signed wallet BOC is hashed locally and used as the
    idempotency key so frontend retries cannot create duplicate invoices.

    IMPORTANT: blockchain_verified=False means this is wallet-accepted, not a
    final on-chain confirmation. Use a later reconciliation job if finality is
    required.
    """
    logger.info("=" * 60)
    logger.info("💰 CREATE_PURCHASE / WALLET-IMMEDIATE")
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

    expected_gram_amount_raw = str(
        request.data.get("expected_gram_amount", "")
    ).strip()

    if not wallet_address:
        return Response(
            {"error": "wallet_address required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not boc:
        return Response(
            {"error": "wallet BOC required"},
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

    try:
        gram_nano = int(expected_gram_amount_raw)
        if gram_nano <= 0:
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

    # Local receipt key. 64 hex chars keeps compatibility with a typical
    # tx-hash CharField while avoiding any network/indexer dependency.
    wallet_receipt_hash = hashlib.sha256(
        boc.encode("utf-8")
    ).hexdigest()

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

    try:
        user = get_or_create_user(
            wallet_address,
            int(telegram_id) if telegram_id else None,
            is_telegram if telegram_id else False,
        )

        logger.info(
            "[WALLET_IMMEDIATE] user=%s user_id=%s inviter_id=%s amount=%s receipt=%s",
            user.wallet_address,
            user.id,
            user.inviter_id,
            ton_amount,
            wallet_receipt_hash,
        )

        # Idempotency: the exact same signed wallet BOC can create only one
        # Purchase, even if React retries because the HTTP response was lost.
        existing = (
            Purchase.objects
            .filter(ton_tx_hash=wallet_receipt_hash)
            .first()
        )

        if existing:
            if existing.user_id != user.id:
                return Response(
                    {
                        "error":
                            "This wallet receipt is already registered to another user."
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            serialized = dict(
                PurchaseSerializer(existing).data
            )
            serialized["created_at"] = existing.created_at
            serialized["lock_period_days"] = 365
            serialized["payment_status"] = "WALLET_CONFIRMED"
            serialized["blockchain_verified"] = False

            return Response(
                {
                    "status": "confirmed",
                    "confirmation_source": "wallet",
                    "blockchain_verified": False,
                    "already_registered": True,
                    "ton_tx_hash": wallet_receipt_hash,
                    "wallet_receipt_hash": wallet_receipt_hash,
                    "message_hash": wallet_receipt_hash,
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
                wallet_receipt_hash,
                output_asset=output_asset,
            )
        except ValueError as exc:
            if "TX already registered" not in str(exc):
                raise

            purchase = (
                Purchase.objects
                .filter(ton_tx_hash=wallet_receipt_hash)
                .first()
            )

            if not purchase or purchase.user_id != user.id:
                raise

        serialized = dict(
            PurchaseSerializer(purchase).data
        )
        serialized["created_at"] = purchase.created_at
        serialized["lock_period_days"] = 365
        serialized["payment_status"] = "WALLET_CONFIRMED"
        serialized["blockchain_verified"] = False

        logger.info(
            "✅ WALLET-CONFIRMED INVOICE CREATED: invoice=%s user=%s inviter_id=%s receipt=%s",
            purchase.invoice_no,
            user.id,
            user.inviter_id,
            wallet_receipt_hash,
        )
        logger.info("=" * 60)

        return Response(
            {
                "status": "confirmed",
                "confirmation_source": "wallet",
                "blockchain_verified": False,
                "already_registered": False,
                "ton_tx_hash": wallet_receipt_hash,
                "wallet_receipt_hash": wallet_receipt_hash,
                "message_hash": wallet_receipt_hash,
                "gram_address": gram_address,
                "gram_amount": str(gram_nano),
                "ton_amount": str(ton_amount),
                "invoice": serialized,
            },
            status=status.HTTP_201_CREATED,
        )

    except OperationalError as exc:
        logger.exception("SQLite/database error during immediate purchase")
        return Response(
            {"error": str(exc)},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    except Exception as exc:
        logger.exception("Immediate wallet purchase error")
        return Response(
            {"error": str(exc)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["GET"])
def list_purchases(request):
    wallet_address = request.query_params.get("wallet")
    if not wallet_address:
        return Response({"error": "wallet param required"}, status=400)

    user = AppUser.objects.filter(wallet_address=wallet_address).first()
    if not user:
        return Response([], status=status.HTTP_200_OK)

    qs = user.purchases.order_by("-created_at")
    serialized = list(PurchaseSerializer(qs, many=True).data)

    for item, purchase in zip(serialized, qs):
        item["created_at"] = purchase.created_at
        item["lock_period_days"] = 365

    return Response(serialized)


@api_view(["POST"])
def request_withdraw(request):
    """
    Manual profit withdrawal/conversion flow.

    ECG source:
      - matured self_profit_unlocked is spendable after 30 days
      - downline_profit_instant (referral 5% / 1%) is spendable immediately
      - output may be ECG or TON, preserving the existing two-option UI

    USDT source:
      - only AssetBalance(USDT).profit_unlocked is spendable
      - output is TON only
      - the request amount is the SOURCE USDT amount
    """
    wallet_address = str(request.data.get("wallet_address", "") or "").strip()
    requested_asset = str(request.data.get("asset", "") or "").strip().upper()
    source_asset = str(request.data.get("source_asset", "ECG") or "ECG").strip().upper()
    scope = str(request.data.get("scope", "ALL_WITHDRAWABLE") or "ALL_WITHDRAWABLE")

    if source_asset not in {"ECG", "USDT"}:
        return Response({"error": "Invalid source_asset."}, status=400)

    is_ton = requested_asset in {"GRAM", "TON"}
    asset = "TON" if is_ton else requested_asset

    try:
        requested_amount = Decimal(str(request.data.get("amount", "0")))
    except Exception:
        return Response({"error": "Invalid amount."}, status=400)

    if not wallet_address or asset not in {"TON", "ECG"}:
        return Response(
            {"error": "wallet_address and asset are required."},
            status=400,
        )

    if requested_amount <= 0:
        return Response({"error": "Amount must be greater than zero."}, status=400)

    # USDT has a single allowed path: convert Tether profit -> TON.
    if source_asset == "USDT" and asset != "TON":
        return Response(
            {"error": "USDT profit can only be converted to TON."},
            status=400,
        )

    if source_asset == "USDT":
        scope = "USDT_PROFIT_ONLY"
    elif scope not in {"ALL_WITHDRAWABLE"}:
        return Response({"error": "Invalid scope."}, status=400)

    destination = str(
        request.data.get("destination_wallet", "") or ""
    ).strip()
    if not destination:
        return Response(
            {"error": f"destination_wallet is required for {asset} withdrawal."},
            status=400,
        )

    ton_rate = None

    if asset == "TON":
        try:
            _ton_address_to_raw(destination)
        except ValueError:
            return Response(
                {"error": "destination_wallet is not a valid TON address."},
                status=400,
            )

        ton_rate = fetch_ton_usd_rate()
        if ton_rate <= 0:
            return Response(
                {"error": "Unable to calculate TON conversion rate."},
                status=503,
            )

    telegram_id = request.headers.get("X-Telegram-Id")
    is_telegram = request.headers.get("X-Telegram") == "true"
    user = get_or_create_user(
        wallet_address,
        int(telegram_id) if telegram_id else None,
        is_telegram if telegram_id else False,
    )

    # Make any exactly-due 30-day profit spendable before checking balance.
    release_matured_purchase_profits(user)

    if source_asset == "USDT":
        # User enters the SOURCE Tether amount. 1 USDT ~= 1 USD.
        source_usdt = requested_amount.quantize(Decimal("0.000001"))
        ton_amount = (
            source_usdt / ton_rate
        ).quantize(Decimal("0.000000001"))

        if ton_amount < Decimal("1"):
            minimum_usdt = ton_rate.quantize(Decimal("0.000001"), rounding=ROUND_UP)
            return Response(
                {
                    "error": "Minimum conversion output is 1 TON.",
                    "minimum_usdt": str(minimum_usdt),
                    "estimated_ton": str(ton_amount),
                },
                status=400,
            )

        with transaction.atomic():
            balance, _ = (
                AssetBalance.objects
                .select_for_update()
                .get_or_create(
                    user=user,
                    asset="USDT",
                )
            )
            available = Decimal(str(balance.profit_unlocked or 0))

            if source_usdt > available:
                max_ton = (
                    available / ton_rate
                ).quantize(Decimal("0.000000001")) if available > 0 else Decimal("0")
                return Response(
                    {
                        "error": "Insufficient unlocked USDT profit.",
                        "available_usdt": str(available),
                        "max_ton": str(max_ton),
                    },
                    status=400,
                )

            balance.profit_unlocked = available - source_usdt
            balance.save(
                update_fields=[
                    "profit_unlocked",
                    "updated_at",
                ]
            )

            breakdown = {
                "source_asset": "USDT",
                "profit_unlocked": str(source_usdt),
                "usdt_debited": str(source_usdt),
            }

            req = WithdrawRequest.objects.create(
                user=user,
                scope=scope,
                asset="TON",
                # For a USDT-source conversion amount stores USDT debited.
                amount=source_usdt,
                ton_amount=ton_amount,
                destination_wallet=destination,
                status="PENDING",
                balance_breakdown=breakdown,
            )

            Ledger.objects.create(
                user=user,
                typ="WITHDRAW",
                amount=-source_usdt,
                meta={
                    "withdraw_id": req.id,
                    "source_asset": "USDT",
                    "asset": "TON",
                    "status": "PENDING",
                    "usdt_debited": str(source_usdt),
                    "requested_ton": str(ton_amount),
                    "destination": destination,
                    "approval_required": True,
                },
            )

    else:
        # ECG source keeps the old ECG / TON output choices.
        # Locked self-profit is not spendable before the 30-day unlock, while
        # referral purchase profit is immediately spendable.
        if is_ton:
            if requested_amount < Decimal("1"):
                return Response({"error": "Minimum TON withdrawal is 1 TON."}, status=400)

            ecg_amount = (
                requested_amount * ton_rate * ECG_PER_USD
            ).quantize(Decimal("0.000001"), rounding=ROUND_UP)
            ton_amount = requested_amount.quantize(Decimal("0.000000001"))
        else:
            if requested_amount < Decimal("60"):
                return Response({"error": "Minimum withdrawal is 60 ECG."}, status=400)

            ecg_amount = requested_amount.quantize(Decimal("0.000001"))
            ton_amount = Decimal("0")

        with transaction.atomic():
            locked_wallet = Wallet.objects.select_for_update().get(user=user)

            self_unlocked = Decimal(
                str(locked_wallet.ecg_self_unlocked or 0)
            )
            referral_unlocked = Decimal(
                str(locked_wallet.ecg_referral_profit or 0)
            )
            available = self_unlocked + referral_unlocked

            if ecg_amount > available:
                if is_ton:
                    max_ton = ecg_to_ton(available) if available > 0 else Decimal("0")
                    return Response(
                        {
                            "error": "Insufficient unlocked ECG profit for this TON withdrawal.",
                            "required_ecg": str(ecg_amount),
                            "available_ecg": str(available),
                            "available_self_profit_ecg": str(self_unlocked),
                            "available_referral_profit_ecg": str(referral_unlocked),
                            "max_ton": str(max_ton),
                        },
                        status=400,
                    )
                return Response(
                    {
                        "error": "Insufficient unlocked ECG profit.",
                        "available_ecg": str(available),
                        "available_self_profit_ecg": str(self_unlocked),
                        "available_referral_profit_ecg": str(referral_unlocked),
                    },
                    status=400,
                )

            # Spend instant referral profit first, then matured self profit.
            # This keeps the 30-day self-profit accounting clear and records
            # exactly how much was consumed from each bucket.
            referral_debit = min(referral_unlocked, ecg_amount)
            remaining = ecg_amount - referral_debit
            self_debit = min(self_unlocked, remaining)

            locked_wallet.ecg_referral_profit = (
                referral_unlocked - referral_debit
            )
            locked_wallet.ecg_self_unlocked = (
                self_unlocked - self_debit
            )
            locked_wallet.save(
                update_fields=[
                    "ecg_referral_profit",
                    "ecg_self_unlocked",
                    "updated_at",
                ]
            )

            breakdown = {
                "source_asset": "ECG",
                "ecg_self_unlocked": str(self_debit),
                "ecg_referral_profit": str(referral_debit),
                "ecg_debited": str(ecg_amount),
            }

            req = WithdrawRequest.objects.create(
                user=user,
                scope="ALL_WITHDRAWABLE",
                asset=asset,
                amount=ecg_amount,
                ton_amount=ton_amount,
                destination_wallet=destination,
                status="PENDING",
                balance_breakdown=breakdown,
            )

            Ledger.objects.create(
                user=user,
                typ="WITHDRAW",
                amount=-ecg_amount,
                meta={
                    "withdraw_id": req.id,
                    "source_asset": "ECG",
                    "asset": asset,
                    "status": "PENDING",
                    "requested_amount": str(ton_amount if is_ton else ecg_amount),
                    "requested_ton": str(ton_amount) if is_ton else None,
                    "ecg_debited": str(ecg_amount),
                    "self_profit_debited": str(self_debit),
                    "referral_profit_debited": str(referral_debit),
                    "destination": destination,
                    "approval_required": True,
                },
            )

    payload = serialize_withdraw(req)
    payload.update({
        "message": "Withdrawal request submitted. Please wait for admin approval.",
        "approval_required": True,
    })
    return Response(payload, status=201)


def serialize_withdraw(item):
    is_ton = item.asset == "TON"
    raw_status = str(item.status or "").upper()
    display_status = (
        "COMPLETE" if raw_status in {"SUCCESS", "COMPLETE", "COMPLETED"}
        else raw_status
    )

    breakdown = item.balance_breakdown or {}
    source_asset = str(breakdown.get("source_asset") or "ECG").upper()
    is_usdt_source = source_asset == "USDT"

    return {
        "id": item.id,
        "asset": "TON" if is_ton else item.asset,
        "raw_asset": item.asset,
        "source_asset": source_asset,
        "amount": str(item.amount),
        "ecg_debited": "0" if is_usdt_source else str(item.amount),
        "usdt_debited": str(item.amount) if is_usdt_source else "0",
        "ton_amount": str(item.ton_amount),
        "requested_amount": str(item.ton_amount if is_ton else item.amount),
        "requested_asset": "TON" if is_ton else "ECG",
        "destination_wallet": item.destination_wallet,
        "status": item.status,
        "display_status": display_status,
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
    rows = user.withdraw_requests.order_by("-created_at")[:50]
    return Response([serialize_withdraw(row) for row in rows])




# ============================================================
# MANUAL WITHDRAWAL ADMIN APPROVAL
# ============================================================

def _admin_totp_secret():
    """Use the same Google Authenticator secret for admin-only write actions."""
    candidates = [
        # Main secret used by your Google Authenticator setup.
        getattr(settings, "ADMIN_2FA_SECRET", None),
        os.getenv("ADMIN_2FA_SECRET"),

        # Backward-compatible names, if an older deployment still uses one.
        getattr(settings, "ADMIN_TOTP_SECRET", None),
        getattr(settings, "ADMIN_OTP_SECRET", None),
        getattr(settings, "GOOGLE_AUTH_SECRET", None),
        os.getenv("ADMIN_TOTP_SECRET"),
        os.getenv("ADMIN_OTP_SECRET"),
        os.getenv("GOOGLE_AUTH_SECRET"),
    ]
    return next((str(value).strip() for value in candidates if value), "")


def _totp_code(secret: str, counter: int) -> str:
    normalized = secret.replace(" ", "").upper()
    normalized += "=" * ((-len(normalized)) % 8)
    key = base64.b32decode(normalized, casefold=True)
    msg = struct.pack(">Q", counter)
    digest = hmac.new(key, msg, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    binary = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return f"{binary % 1_000_000:06d}"


def _verify_admin_totp(request) -> bool:
    provided = str(request.headers.get("X-Admin-OTP", "") or "").strip()
    secret = _admin_totp_secret()
    if not secret or not re.fullmatch(r"\d{6}", provided):
        return False

    current_counter = int(time.time() // 30)
    try:
        return any(
            hmac.compare_digest(provided, _totp_code(secret, current_counter + drift))
            for drift in (-1, 0, 1)
        )
    except Exception:
        logger.exception("Could not verify admin TOTP")
        return False




# A Google Authenticator code is only used to CREATE an admin session.
# Write actions use the signed session token, so the 30-second OTP expiring
# will not break Pending -> Complete actions.
ADMIN_SESSION_SALT = "core.admin-session.v1"


def _admin_session_max_age() -> int:
    try:
        value = int(os.getenv("ADMIN_SESSION_MAX_AGE", "43200"))
    except (TypeError, ValueError):
        value = 43200
    # Minimum 5 minutes; default 12 hours.
    return max(300, value)


def _create_admin_session_token() -> str:
    return signing.dumps(
        {
            "role": "admin",
            "v": 1,
            "issued_at": int(time.time()),
        },
        salt=ADMIN_SESSION_SALT,
        compress=True,
    )


def _verify_admin_session(request) -> bool:
    token = str(
        request.headers.get("X-Admin-Session", "") or ""
    ).strip()

    if not token:
        return False

    try:
        payload = signing.loads(
            token,
            salt=ADMIN_SESSION_SALT,
            max_age=_admin_session_max_age(),
        )
    except signing.SignatureExpired:
        return False
    except signing.BadSignature:
        return False
    except Exception:
        logger.exception("Could not verify admin session")
        return False

    return (
        isinstance(payload, dict)
        and payload.get("role") == "admin"
        and payload.get("v") == 1
    )


@api_view(["POST"])
def admin_create_session(request):
    """
    Exchange one fresh Google Authenticator code for a signed admin session.
    The frontend stores this session for the current browser tab/session and
    uses it for withdrawal completion.
    """
    if not _verify_admin_totp(request):
        return Response(
            {
                "error": (
                    "Invalid Google Authenticator code. "
                    "Enter the current 6-digit code and try again."
                )
            },
            status=403,
        )

    max_age = _admin_session_max_age()
    return Response({
        "success": True,
        "admin_session": _create_admin_session_token(),
        "expires_in": max_age,
    })


@api_view(["POST"])
def admin_complete_withdraw(request, withdraw_id):
    """
    Admin confirms that the manual payout was actually sent.

    This endpoint is idempotent: a completed request never increments totals twice.
    DB status stays SUCCESS for compatibility with the existing model/status choices;
    frontend/history display it as COMPLETE.
    """
    if not _verify_admin_session(request):
        return Response(
            {
                "error": (
                    "Admin session is missing or expired. "
                    "Sign in to the admin dashboard again."
                )
            },
            status=403,
        )

    tx_hash = str(request.data.get("tx_hash", "") or "").strip()

    with transaction.atomic():
        req = (
            WithdrawRequest.objects
            .select_for_update()
            .select_related("user")
            .filter(pk=withdraw_id)
            .first()
        )

        if not req:
            return Response({"error": "Withdrawal request not found."}, status=404)

        current_status = str(req.status or "").upper()

        # Safe retry: return the existing completed record without accounting again.
        if current_status in {"SUCCESS", "COMPLETE", "COMPLETED"}:
            return Response({
                "success": True,
                "already_completed": True,
                "withdrawal": serialize_withdraw(req),
            })

        if current_status != "PENDING":
            return Response(
                {"error": f"Only PENDING withdrawals can be completed (current: {req.status})."},
                status=409,
            )

        req.status = "SUCCESS"
        if tx_hash:
            req.tx_hash = tx_hash
        req.completed_at = timezone.now()

        update_fields = ["status", "completed_at"]
        if tx_hash:
            update_fields.append("tx_hash")
        req.save(update_fields=update_fields)

        locked_wallet = Wallet.objects.select_for_update().get(user=req.user)
        breakdown = req.balance_breakdown or {}
        source_asset = str(breakdown.get("source_asset") or "ECG").upper()

        # Wallet.total_withdrawn is historically ECG-denominated. Do not mix
        # USDT amounts into that field. USDT completion is still tracked by
        # WithdrawRequest + Ledger.
        update_fields = ["last_withdraw_at", "updated_at"]
        if source_asset != "USDT":
            locked_wallet.total_withdrawn = (
                (locked_wallet.total_withdrawn or Decimal("0")) + req.amount
            )
            update_fields.insert(0, "total_withdrawn")

        locked_wallet.last_withdraw_at = req.completed_at
        locked_wallet.save(update_fields=update_fields)

        ledger = (
            Ledger.objects
            .filter(user=req.user, typ="WITHDRAW", meta__withdraw_id=req.id)
            .order_by("-id")
            .first()
        )
        if ledger:
            meta = dict(ledger.meta or {})
            meta.update({
                "status": "SUCCESS",
                "display_status": "COMPLETE",
                "admin_completed_at": req.completed_at.isoformat(),
            })
            if tx_hash:
                meta["tx_hash"] = tx_hash
            ledger.meta = meta
            ledger.save(update_fields=["meta"])

    return Response({
        "success": True,
        "message": "Withdrawal marked complete.",
        "withdrawal": serialize_withdraw(req),
    })


@api_view(["GET"])
def referral_count(request):
    wallet_address = request.query_params.get("wallet_address")
    if not wallet_address:
        return Response(
            {"error": "wallet_address required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = AppUser.objects.filter(wallet_address=wallet_address).first()
    if not user:
        return Response({"count": 0}, status=status.HTTP_200_OK)

    return Response(
        {"count": user.invitees.count()},
        status=status.HTTP_200_OK,
    )


# =======================
# Timer endpoints
# =======================

HOURLY_REWARD = Decimal("100")
COOLDOWN = timedelta(hours=1)


def _hourly_reward_stats(user):
    """Return EPL hourly-reward statistics used by Timer and Wallet."""
    daily_qs = user.ledgers.filter(
        typ="DAILY_UNLOCK"
    )

    total_rewards = (
        daily_qs.aggregate(
            total=Sum("amount")
        )["total"]
        or Decimal("0")
    )

    referral_points = (
        user.ledgers
        .filter(typ="REF_BONUS")
        .aggregate(total=Sum("amount"))["total"]
        or Decimal("0")
    )

    return {
        "total_rewards": str(total_rewards),
        "referral_points": str(referral_points),
        "rewards_count": daily_qs.count(),
    }


@api_view(["GET"])
def reward_status(request):
    wallet_address = request.query_params.get(
        "wallet_address"
    )

    if not wallet_address:
        return Response(
            {"error": "wallet_address required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = (
        AppUser.objects
        .select_related("wallet")
        .filter(wallet_address=wallet_address)
        .first()
    )

    if not user:
        return Response(
            {"error": "User not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    now = timezone.now()
    next_at = user.next_daily_claim_at

    # Start every account on a real one-hour cycle. Existing accounts may still
    # carry the old 24-hour timestamp, so cap it to exactly one hour from now.
    max_next_at = now + COOLDOWN
    if not next_at or next_at > max_next_at:
        next_at = max_next_at
        user.next_daily_claim_at = next_at
        user.save(update_fields=["next_daily_claim_at"])

    seconds_remaining = max(
        0,
        int((next_at - now).total_seconds()),
    )

    stats = _hourly_reward_stats(user)

    return Response(
        {
            "status": "ok",
            "seconds_remaining": seconds_remaining,
            "next_claim_at": next_at,
            "total_rewards": stats["total_rewards"],
            "referral_points": stats["referral_points"],
            "rewards_count": stats["rewards_count"],
            "reward_amount": str(HOURLY_REWARD),
            "cooldown_seconds": int(COOLDOWN.total_seconds()),
            "hourly_reward_balance": str(
                user.wallet.daily_reward_unlocked or Decimal("0")
            ),
            "epl_balance": str(
                (user.wallet.referral_bonus or Decimal("0"))
                + (user.wallet.daily_reward_unlocked or Decimal("0"))
            ),
            "stake_balance": str(
                (user.wallet.principal_locked or Decimal("0"))
                + (user.wallet.principal_unlocked or Decimal("0"))
            ),
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
def tick(request):
    """Claim the 100 EPL hourly reward."""
    wallet_address = request.data.get(
        "wallet_address"
    )

    if not wallet_address:
        return Response(
            {"error": "wallet_address required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    telegram_id = (
        request.headers.get("X-Telegram-Id")
        or request.data.get("telegram_id")
    )

    is_telegram = (
        request.headers.get("X-Telegram") == "true"
        or request.data.get("is_telegram", False)
    )

    try:
        if telegram_id:
            user = get_or_create_user(
                wallet_address,
                int(telegram_id),
                is_telegram,
            )
        else:
            user = get_or_create_user(
                wallet_address,
                telegram_id=None,
                is_telegram=False,
            )

        if not user:
            return Response(
                {"error": "User not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        with transaction.atomic():
            locked_user = (
                AppUser.objects
                .select_for_update()
                .select_related("wallet")
                .get(pk=user.pk)
            )

            locked_wallet = (
                Wallet.objects
                .select_for_update()
                .get(user=locked_user)
            )

            now = timezone.now()
            next_at = (
                locked_user.next_daily_claim_at
            )

            # Normalize legacy 24-hour schedules and also prevent a first-time
            # immediate claim: every reward must follow a completed one-hour cycle.
            max_next_at = now + COOLDOWN
            if not next_at or next_at > max_next_at:
                next_at = max_next_at
                locked_user.next_daily_claim_at = next_at
                locked_user.save(update_fields=["next_daily_claim_at"])

            # Re-check under lock to block double claims.
            if next_at > now:
                seconds_remaining = int(
                    (next_at - now).total_seconds()
                )

                stats = _hourly_reward_stats(
                    locked_user
                )

                return Response(
                    {
                        "status": "too_early",
                        "message": (
                            f"Please wait "
                            f"{seconds_remaining} seconds"
                        ),
                        "seconds_remaining": seconds_remaining,
                        "total_rewards": stats["total_rewards"],
                        "referral_points": stats["referral_points"],
                        "rewards_count": stats["rewards_count"],
                        "reward_amount": str(HOURLY_REWARD),
                        "cooldown_seconds": int(COOLDOWN.total_seconds()),
                        "hourly_reward_balance": str(
                            locked_wallet.daily_reward_unlocked or Decimal("0")
                        ),
                        "epl_balance": str(
                            (locked_wallet.referral_bonus or Decimal("0"))
                            + (locked_wallet.daily_reward_unlocked or Decimal("0"))
                        ),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            locked_wallet.daily_reward_unlocked = (
                locked_wallet.daily_reward_unlocked
                + HOURLY_REWARD
            )

            locked_wallet.save(
                update_fields=[
                    "daily_reward_unlocked",
                    "updated_at",
                ]
            )

            Ledger.objects.create(
                user=locked_user,
                typ="DAILY_UNLOCK",
                amount=HOURLY_REWARD,
                meta={"source": "timer", "asset": "EPL"},
            )

            locked_user.next_daily_claim_at = (
                now + COOLDOWN
            )

            locked_user.save(
                update_fields=[
                    "next_daily_claim_at"
                ]
            )

        user = (
            AppUser.objects
            .select_related("wallet")
            .get(pk=user.pk)
        )

        stats = _hourly_reward_stats(user)

        return Response(
            {
                "status": "rewarded",
                "message": "100 EPL added to your Hourly Reward balance",
                # Legacy key retained for old clients; value is EPL hourly reward.
                "balance_ecg": str(
                    user.wallet.daily_reward_unlocked or Decimal("0")
                ),
                "hourly_reward_balance": str(
                    user.wallet.daily_reward_unlocked or Decimal("0")
                ),
                "epl_balance": str(
                    (user.wallet.referral_bonus or Decimal("0"))
                    + (user.wallet.daily_reward_unlocked or Decimal("0"))
                ),
                "stake_balance": str(
                    (user.wallet.principal_locked or Decimal("0"))
                    + (user.wallet.principal_unlocked or Decimal("0"))
                ),
                "reward_amount": str(HOURLY_REWARD),
                "cooldown_seconds": int(COOLDOWN.total_seconds()),
                "total_rewards": stats["total_rewards"],
                "referral_points": stats["referral_points"],
                "rewards_count": stats["rewards_count"],
                "seconds_remaining": int(
                    COOLDOWN.total_seconds()
                ),
                "next_claim_at": (
                    user.next_daily_claim_at
                ),
            },
            status=status.HTTP_200_OK,
        )

    except Exception as exc:
        logger.exception("Error in tick")

        return Response(
            {"error": str(exc)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
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

    # Lazy one-time reconciliation makes referrals already present in the tree
    # immediately follow the new 1000/500 ECG join-bonus rules.
    reconcile_existing_referral_join_rewards(user)

    level_obj = ReferralLevel.objects.filter(user=user).first()

    if not level_obj:
        empty_levels = {
            f"level_{level_number}": {"count": 0, "users": []}
            for level_number in range(1, 6)
        }
        return Response(
            {
                "levels": empty_levels,
                "total_referrals": 0,
                "is_test": False,
            },
            status=status.HTTP_200_OK,
        )

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
                    "profit": 0,
                    "referral_bonus": 0,
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

            # Referral purchase profit is stored per asset in ReferralLevel JSON.
            # Older rows may only have the legacy ``profit`` field, which was ECG.
            legacy_profit = item.get("profit", 0) or 0
            profit_asset = str(item.get("profit_asset", "ECG") or "ECG").upper()

            profit_ecg = item.get("profit_ecg")
            if profit_ecg is None:
                profit_ecg = 0 if profit_asset == "USDT" else legacy_profit

            profit_usdt = item.get("profit_usdt")
            if profit_usdt is None:
                profit_usdt = legacy_profit if profit_asset == "USDT" else 0

            result.append({
                "telegram_id": telegram_id,
                "telegram_username": username,
                "telegram_photo_url": photo_url,
                "wallet": wallet,
                "investment": item.get("investment", 0),
                # Keep legacy field for older frontends.
                "profit": legacy_profit,
                # IMPORTANT: expose both real asset fields to Referral Tree UI.
                "profit_ecg": profit_ecg,
                "profit_usdt": profit_usdt,
                "profit_asset": profit_asset,
                "referral_bonus": item.get("referral_bonus", 0),
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
            "profit": profit,
            "referral_bonus": 1000 if level == 1 else 500,
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

    user = AppUser.objects.filter(wallet_address=wallet_address).first()
    if not user:
        return Response([], status=status.HTTP_200_OK)

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


def list_purchases_bnb(request):

    purchases = PurchaseBNB.objects.all().order_by("-created_at")

    data = []

    for item in purchases:
        data.append({
            "invoice_no": item.invoice_no,
            "wallet": item.user.wallet_address,
            "bnb_amount": str(item.bnb_amount),
            "usd_value": str(item.usd_value),
            "ecg_value": str(item.ecg_value),
            "tx_hash": item.bnb_tx_hash,
            "created_at": item.created_at,
        })

    return JsonResponse({
        "status": "ok",
        "purchases": data
    })


@csrf_exempt
def create_ton_transaction(request):

    if request.method != "POST":
        return JsonResponse(
            {
                "status": "error",
                "message": "POST required"
            },
            status=405
        )


    try:
        body = json.loads(request.body)

        wallet_address = body.get(
            "wallet_address"
        )

        ton_amount = body.get(
            "ton_amount"
        )


        if not wallet_address or not ton_amount:
            return JsonResponse(
                {
                    "status": "error",
                    "message": "missing data"
                },
                status=400
            )


        user, _ = AppUser.objects.get_or_create(
            wallet_address=wallet_address
        )


        invoice = uuid.uuid4().hex[:12].upper()


        purchase = Purchase.objects.create(

            user=user,

            invoice_no=invoice,

            ton_amount=ton_amount,

            ton_tx_hash=invoice,

            ton_usd_rate=0,

            usd_value=0,

            ecg_value=0,

            self_profit_5=0,

            principal_unlock_at=timezone.now(),

            self_profit_unlock_at=timezone.now(),

        )


        return JsonResponse(
            {
                "status": "ok",
                "invoice_no": purchase.invoice_no
            }
        )


    except Exception as e:

        return JsonResponse(
            {
                "status": "error",
                "message": str(e)
            },
            status=500
        )