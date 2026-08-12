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
import os
import requests

# =======================
# تنظیمات لاگینگ
# =======================
logger = logging.getLogger(__name__)


@api_view(["POST"])
def connect_wallet(request):
    logger.info("=" * 60)
    logger.info("🔍 CONNECT_WALLET CALLED")
    logger.info(f"📥 Data: {request.data}")
    logger.info(f"📥 Headers: {request.headers}")
    
    wallet_address = request.data.get("wallet_address")
    inviter_code = request.data.get("inviter_code")
    telegram_id = request.data.get("telegram_id")
    telegram_username = request.data.get("telegram_username")
    is_telegram = request.data.get("is_telegram", False)

    if not wallet_address:
        logger.error("❌ wallet_address required")
        return Response({"error": "wallet_address required"}, status=status.HTTP_400_BAD_REQUEST)

    if not telegram_id:
        logger.error("❌ telegram_id required")
        return Response({"error": "telegram_id required"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user = get_or_create_user(wallet_address, telegram_id, is_telegram)
        
        # ذخیره telegram_username
        if telegram_username and user.telegram_username != telegram_username:
            user.telegram_username = telegram_username
            user.save(update_fields=["telegram_username"])
            logger.info(f"✅ Updated telegram_username: {telegram_username}")
        
        if inviter_code and not user.inviter_id:
            apply_referral(inviter_code, user)
            
    except ValueError as e:
        logger.error(f"❌ ValueError: {e}")
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    logger.info(f"✅ User connected: {user.wallet_address}")
    logger.info("=" * 60)
    
    return Response({
        "user": {
            "telegram_id": user.telegram_id,
            "telegram_username": user.telegram_username,
            "wallet_address": user.wallet_address,
            "referral_code": user.referral_code,
            "wallet_locked": user.wallet_locked
        }
    }, status=status.HTTP_200_OK)


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
        p = register_purchase(user, ton_amount, str(ton_tx_hash))
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
    logger.info("=" * 60)
    logger.info("💸 REQUEST_WITHDRAW CALLED")
    
    wallet_address = request.data.get("wallet_address")
    scope = request.data.get("scope")
    amount = Decimal(str(request.data.get("amount", "0")))

    if not all([wallet_address, scope]):
        logger.error("❌ wallet_address, scope required")
        return Response({"error": "wallet_address, scope required"}, status=status.HTTP_400_BAD_REQUEST)

    if amount < Decimal("60"):
        logger.error(f"❌ Amount too small: {amount}")
        return Response({"error": "min withdraw is 60 ECG"}, status=status.HTTP_400_BAD_REQUEST)

    telegram_id = request.headers.get("X-Telegram-Id")
    is_telegram = request.headers.get("X-Telegram") == "true"
    
    if telegram_id:
        user = get_or_create_user(wallet_address, int(telegram_id), is_telegram)
    else:
        user = get_or_create_user(wallet_address, telegram_id=None, is_telegram=False)
    
    w = user.wallet

    if scope == "DOWNLINE_ONLY":
        if amount > w.downline_profit_instant:
            logger.error(f"❌ Insufficient downline balance")
            return Response({"error": "insufficient downline instant balance"}, status=status.HTTP_400_BAD_REQUEST)
    elif scope == "ALL_WITHDRAWABLE":
        if amount > w.withdrawable_total():
            logger.error(f"❌ Insufficient withdrawable total")
            return Response({"error": "insufficient withdrawable total"}, status=status.HTTP_400_BAD_REQUEST)
    else:
        logger.error(f"❌ Invalid scope: {scope}")
        return Response({"error": "invalid scope"}, status=status.HTTP_400_BAD_REQUEST)

    ton_amount = ecg_to_ton(amount)
    dest = wallet_address

    req = WithdrawRequest.objects.create(
        user=user,
        scope=scope,
        amount=amount,
        ton_amount=ton_amount,
        destination_wallet=dest,
        status="PENDING",
    )

    ton_service_url = os.getenv("TON_SERVICE_URL", "http://tonservice:3001")
    try:
        r = requests.post(
            f"{ton_service_url}/send-ton",
            json={"destination": dest, "amountTon": str(ton_amount), "comment": "ECG withdraw"},
            timeout=30
        )
        data = r.json()
        if r.status_code != 200 or not data.get("ok"):
            raise Exception(data.get("error") or "ton-service failed")
    except Exception as e:
        req.status = "FAILED"
        req.fail_reason = str(e)[:500]
        req.save(update_fields=["status", "fail_reason"])
        logger.error(f"❌ TON transfer failed: {e}")
        return Response({"error": "ton transfer failed", "detail": req.fail_reason}, status=status.HTTP_502_BAD_GATEWAY)

    if scope == "DOWNLINE_ONLY":
        w.downline_profit_instant -= amount
        w.save(update_fields=["downline_profit_instant"])
    else:
        remaining = amount

        def take(field):
            nonlocal remaining
            if remaining <= 0:
                return
            val = getattr(w, field)
            if val <= 0:
                return
            use = min(val, remaining)
            setattr(w, field, val - use)
            remaining -= use

        take("downline_profit_instant")
        take("referral_bonus")
        take("daily_reward_unlocked")
        take("self_profit_unlocked")
        take("principal_unlocked")
        w.save()

    req.status = "SUCCESS"
    req.tx_hash = f"seqno:{data.get('sent_seqno')}"
    req.save(update_fields=["status", "tx_hash"])

    logger.info(f"✅ Withdraw successful: {req.id}")
    return Response(
        {"id": req.id, "status": req.status, "ton_amount": str(ton_amount), "destination_wallet": dest},
        status=status.HTTP_201_CREATED
    )


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
    
    # دریافت wallet_address
    wallet_address = request.data.get("wallet_address")
    if not wallet_address:
        logger.error("❌ wallet_address required")
        return Response(
            {"error": "wallet_address required"}, 
            status=status.HTTP_400_BAD_REQUEST
        )

    # دریافت telegram_id
    telegram_id = request.headers.get("X-Telegram-Id") or request.data.get("telegram_id")
    is_telegram = request.headers.get("X-Telegram") == "true" or request.data.get("is_telegram", False)
    
    logger.info(f"📊 wallet: {wallet_address}, telegram_id: {telegram_id}")
    
    try:
        # دریافت یا ساخت کاربر
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

        # بررسی اینکه زمان گذشته یا نه
        if next_at and next_at > now:
            seconds_remaining = int((next_at - now).total_seconds())
            logger.info(f"⏳ Too early! {seconds_remaining}s remaining")
            return Response({
                "status": "too_early",
                "message": f"Please wait {seconds_remaining} seconds",
                "seconds_remaining": seconds_remaining,
            }, status=status.HTTP_400_BAD_REQUEST)

        # اعمال پاداش روزانه
        logger.info(f"💰 Adding reward: {DAILY_REWARD} ECG")
        w.daily_reward_unlocked = w.daily_reward_unlocked + DAILY_REWARD
        w.save(update_fields=["daily_reward_unlocked"])

        # ثبت در Ledger
        Ledger.objects.create(
            user=user,
            typ="DAILY_UNLOCK",
            amount=DAILY_REWARD,
            meta={"source": "timer"}
        )

        # تنظیم زمان بعدی
        user.next_daily_claim_at = now + COOLDOWN
        user.save(update_fields=["next_daily_claim_at"])

        logger.info(f"✅ Reward claimed! Next claim at: {user.next_daily_claim_at}")
        logger.info("=" * 60)

        # پاسخ موفق
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
        return Response({"error": "wallet_address required"}, status=status.HTTP_400_BAD_REQUEST)

    user = AppUser.objects.filter(wallet_address=wallet_address).first()

    if not user:
        return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

    level_obj, created = ReferralLevel.objects.get_or_create(user=user)

    is_test = request.query_params.get("test", "false").lower() == "true"

    if is_test:
        test_data = generate_test_data_with_columns()
        return Response({
            "levels": test_data,
            "is_test": True
        }, status=status.HTTP_200_OK)

    # ==========================================
    # ✅ اصلاح شده: شامل telegram_username
    # ==========================================
    
    def process_users(users):
        """پردازش کاربران برای اضافه کردن telegram_username"""
        processed = []
        for user_data in users:
            if isinstance(user_data, dict):
                # اگر کاربر دیکشنری است و telegram_username ندارد
                if 'telegram_username' not in user_data:
                    # تلاش برای پیدا کردن کاربر از دیتابیس
                    wallet = user_data.get('wallet')
                    if wallet:
                        try:
                            app_user = AppUser.objects.filter(wallet_address=wallet).first()
                            if app_user and app_user.telegram_username:
                                user_data['telegram_username'] = app_user.telegram_username
                            else:
                                user_data['telegram_username'] = None
                        except:
                            user_data['telegram_username'] = None
                    else:
                        user_data['telegram_username'] = None
            processed.append(user_data)
        return processed

    return Response({
        "levels": {
            "level_1": {
                "count": level_obj.level_1_count,
                "users": process_users(level_obj.level_1_users[:20]) if level_obj.level_1_users else []
            },
            "level_2": {
                "count": level_obj.level_2_count,
                "users": process_users(level_obj.level_2_users[:20]) if level_obj.level_2_users else []
            },
            "level_3": {
                "count": level_obj.level_3_count,
                "users": process_users(level_obj.level_3_users[:20]) if level_obj.level_3_users else []
            },
            "level_4": {
                "count": level_obj.level_4_count,
                "users": process_users(level_obj.level_4_users[:20]) if level_obj.level_4_users else []
            },
            "level_5": {
                "count": level_obj.level_5_count,
                "users": process_users(level_obj.level_5_users[:20]) if level_obj.level_5_users else []
            }
        },
        "is_test": False,
        "total_referrals": (
            level_obj.level_1_count + level_obj.level_2_count + 
            level_obj.level_3_count + level_obj.level_4_count + 
            level_obj.level_5_count
        )
    }, status=status.HTTP_200_OK)


def generate_test_data_with_columns():
    import random
    
    def generate_user(level):
        telegram_id = random.randint(100000000, 999999999)
        wallet = "0x" + ''.join(random.choices('0123456789abcdef', k=40))
        investment = round(random.uniform(1, 100), 2)
        profit = round(random.uniform(0.01, 5), 4)
        
        # ✅ اضافه کردن telegram_username برای تست
        usernames = ['alex', 'john_doe', 'crypto_master', 'ton_fan', 'blockchain_dev', 'defi_expert', 'nft_collector']
        telegram_username = random.choice(usernames) + str(random.randint(1, 999))
        
        return {
            "telegram_id": telegram_id,
            "telegram_username": telegram_username,  # ✅ اضافه شد
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