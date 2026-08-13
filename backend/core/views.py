# backend/core/views.py

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

# =======================
# تنظیمات لاگینگ
# =======================
logger = logging.getLogger(__name__)


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
    logger.info("=" * 60)
    logger.info("💰 CREATE_PURCHASE CALLED")
    logger.info(f"📥 Data: {request.data}")

    wallet_address = request.data.get("wallet_address")
    ton_amount = request.data.get("ton_amount")
    ton_tx_hash = request.data.get("ton_tx_hash")
    output_asset = str(request.data.get("output_asset", "ECG")).strip().upper()

    if output_asset not in {"ECG", "USDT"}:
        return Response({"error": "Invalid output asset"}, status=status.HTTP_400_BAD_REQUEST)

    if wallet_address is None or ton_amount is None or ton_tx_hash is None:
        logger.error("❌ Missing fields")
        return Response({"error": "missing fields"}, status=400)

    try:
        ton_amount = Decimal(str(ton_amount))
        if ton_amount <= 0:
            raise ValueError()
    except:
        logger.error("❌ Invalid ton_amount")
        return Response({"error": "invalid ton_amount"}, status=400)

    telegram_id = request.query_params.get("telegram_id") or request.headers.get("X-Telegram-Id")
    is_telegram = request.query_params.get("is_telegram", "false").lower() == "true" or request.headers.get("X-Telegram") == "true"
    
    if telegram_id:
        user = get_or_create_user(wallet_address, int(telegram_id), is_telegram)
    else:
        user = get_or_create_user(wallet_address, telegram_id=None, is_telegram=False)

    try:
        p = register_purchase(user, ton_amount, str(ton_tx_hash), output_asset=output_asset)
        logger.info(f"✅ Purchase created: {p.invoice_no}")
    except Exception as e:
        logger.error(f"❌ REGISTER ERROR: {e}")
        return Response({"error": str(e)}, status=400)

    return Response(PurchaseSerializer(p).data, status=201)


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
    return Response(PurchaseSerializer(qs, many=True).data)


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
