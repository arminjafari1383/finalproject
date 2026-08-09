from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from decimal import Decimal
from datetime import timedelta
from django.utils import timezone
from .services import get_or_create_user, apply_referral, register_purchase, ecg_to_ton
from .models import (
    AppUser, Wallet, Ledger, Purchase, 
    WithdrawRequest, ReferralLevel
)
from .serializers import WalletSerializer, PurchaseSerializer, UserSerializer
from django.conf import settings
import os
import requests


@api_view(["POST"])
def connect_wallet(request):
    wallet_address = request.data.get("wallet_address")
    inviter_code = request.data.get("inviter_code")
    telegram_id = request.data.get("telegram_id")
    is_telegram = request.data.get("is_telegram", False)

    print(f"🔍 connect_wallet called: {wallet_address}, {telegram_id}, {is_telegram}")

    if not wallet_address:
        return Response({"error": "wallet_address required"}, status=status.HTTP_400_BAD_REQUEST)

    if not telegram_id:
        return Response({"error": "telegram_id required"}, status=status.HTTP_400_BAD_REQUEST)

    # ✅ برای تست در مرورگر، این خط را کامنت کنید
    # if not is_telegram:
    #     return Response({"error": "Only Telegram mini-app allowed"}, status=status.HTTP_403_FORBIDDEN)

    try:
        user = get_or_create_user(wallet_address, telegram_id, is_telegram)
        
        # ✅ اگر کاربر جدید است و کد رفرال دارد، اعمال کن
        if inviter_code and not user.inviter_id:
            apply_referral(inviter_code, user)
            
    except ValueError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    return Response({
        "user": {
            "telegram_id": user.telegram_id,
            "wallet_address": user.wallet_address,
            "referral_code": user.referral_code,
            "wallet_locked": user.wallet_locked
        }
    }, status=status.HTTP_200_OK)


@api_view(["GET"])
def wallet_view(request, wallet_address):
    print(f"🔍 wallet_view called for: {wallet_address}")
    
    # ✅ دریافت telegram_id از کوئری پارامتر
    telegram_id = request.query_params.get("telegram_id")
    is_telegram = request.query_params.get("is_telegram", "false").lower() == "true"
    
    print(f"📊 telegram_id: {telegram_id}, is_telegram: {is_telegram}")
    
    try:
        # اگر telegram_id وجود داشت، با آن کاربر را پیدا کن
        if telegram_id:
            user = get_or_create_user(wallet_address, int(telegram_id), is_telegram)
        else:
            # اگر telegram_id وجود نداشت، فقط با wallet_address
            user = get_or_create_user(wallet_address, telegram_id=None, is_telegram=False)
            
        return Response(WalletSerializer(user.wallet).data, status=status.HTTP_200_OK)
    except Exception as e:
        print(f"❌ Error in wallet_view: {e}")
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
def create_purchase(request):
    print("DATA:", request.data)

    wallet_address = request.data.get("wallet_address")
    ton_amount = request.data.get("ton_amount")
    ton_tx_hash = request.data.get("ton_tx_hash")

    if wallet_address is None or ton_amount is None or ton_tx_hash is None:
        return Response({"error": "missing fields"}, status=400)

    try:
        ton_amount = Decimal(str(ton_amount))
        if ton_amount <= 0:
            raise ValueError()
    except:
        return Response({"error": "invalid ton_amount"}, status=400)

    # ✅ دریافت telegram_id از کوئری پارامتر یا هدر
    telegram_id = request.query_params.get("telegram_id") or request.headers.get("X-Telegram-Id")
    is_telegram = request.query_params.get("is_telegram", "false").lower() == "true" or request.headers.get("X-Telegram") == "true"
    
    if telegram_id:
        user = get_or_create_user(wallet_address, int(telegram_id), is_telegram)
    else:
        user = get_or_create_user(wallet_address, telegram_id=None, is_telegram=False)

    try:
        p = register_purchase(user, ton_amount, str(ton_tx_hash))
    except Exception as e:
        print("REGISTER ERROR:", e)
        return Response({"error": str(e)}, status=400)

    return Response(PurchaseSerializer(p).data, status=201)


@api_view(["GET"])
def list_purchases(request):
    wallet_address = request.query_params.get("wallet")
    if not wallet_address:
        return Response({"error": "wallet param required"}, status=400)

    # ✅ دریافت telegram_id از کوئری پارامتر
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
    wallet_address = request.data.get("wallet_address")
    scope = request.data.get("scope")
    amount = Decimal(str(request.data.get("amount", "0")))

    if not all([wallet_address, scope]):
        return Response({"error": "wallet_address, scope required"}, status=status.HTTP_400_BAD_REQUEST)

    if amount < Decimal("60"):
        return Response({"error": "min withdraw is 60 ECG"}, status=status.HTTP_400_BAD_REQUEST)

    # ✅ دریافت telegram_id از هدر
    telegram_id = request.headers.get("X-Telegram-Id")
    is_telegram = request.headers.get("X-Telegram") == "true"
    
    if telegram_id:
        user = get_or_create_user(wallet_address, int(telegram_id), is_telegram)
    else:
        user = get_or_create_user(wallet_address, telegram_id=None, is_telegram=False)
    
    w = user.wallet

    if scope == "DOWNLINE_ONLY":
        if amount > w.downline_profit_instant:
            return Response({"error": "insufficient downline instant balance"}, status=status.HTTP_400_BAD_REQUEST)
    elif scope == "ALL_WITHDRAWABLE":
        if amount > w.withdrawable_total():
            return Response({"error": "insufficient withdrawable total"}, status=status.HTTP_400_BAD_REQUEST)
    else:
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

    return Response(
        {"id": req.id, "status": req.status, "ton_amount": str(ton_amount), "destination_wallet": dest},
        status=status.HTTP_201_CREATED
    )


@api_view(["GET"])
def referral_count(request):
    wallet_address = request.query_params.get("wallet_address")
    if not wallet_address:
        return Response({"error": "wallet_address required"}, status=status.HTTP_400_BAD_REQUEST)

    # ✅ دریافت telegram_id از کوئری پارامتر
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
    wallet_address = request.query_params.get("wallet_address")
    if not wallet_address:
        return Response({"error": "wallet_address required"}, status=status.HTTP_400_BAD_REQUEST)

    # ✅ دریافت telegram_id از کوئری پارامتر
    telegram_id = request.query_params.get("telegram_id")
    is_telegram = request.query_params.get("is_telegram", "false").lower() == "true"
    
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
    wallet_address = request.data.get("wallet_address")
    if not wallet_address:
        return Response({"error": "wallet_address required"}, status=status.HTTP_400_BAD_REQUEST)

    # ✅ دریافت telegram_id از هدر
    telegram_id = request.headers.get("X-Telegram-Id")
    is_telegram = request.headers.get("X-Telegram") == "true"
    
    if telegram_id:
        user = get_or_create_user(wallet_address, int(telegram_id), is_telegram)
    else:
        user = get_or_create_user(wallet_address, telegram_id=None, is_telegram=False)
    
    w = user.wallet
    now = timezone.now()

    next_at = user.next_daily_claim_at

    if next_at and next_at > now:
        seconds_remaining = int((next_at - now).total_seconds())
        return Response({
            "status": "too_early",
            "message": "Please wait for the timer to finish.",
            "seconds_remaining": seconds_remaining,
        }, status=status.HTTP_400_BAD_REQUEST)

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

    return Response({
        "status": "rewarded",
        "message": "1 ECG added",
        "balance_ecg": str(w.withdrawable_total()),
        "total_rewards": str(w.withdrawable_total()),
        "referral_points": str(w.referral_bonus),
        "rewards_count": user.ledgers.filter(typ="DAILY_UNLOCK").count(),
        "seconds_remaining": int(COOLDOWN.total_seconds()),
    }, status=status.HTTP_200_OK)


# =======================
# ✅ Referral Levels API با ۴ ستون
# =======================

@api_view(["GET"])
def get_referral_levels(request):
    """
    دریافت اطلاعات سطوح referral برای یک کاربر
    شامل 5 سطح با 4 ستون: telegram_id, wallet, investment, profit
    """
    wallet_address = request.query_params.get("wallet_address")
    if not wallet_address:
        return Response({"error": "wallet_address required"}, status=status.HTTP_400_BAD_REQUEST)

    user = AppUser.objects.filter(wallet_address=wallet_address).first()

    if not user:
        return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

    level_obj, created = ReferralLevel.objects.get_or_create(user=user)

    is_test = request.query_params.get("test", "false").lower() == "true"

    if is_test:
        # ✅ داده‌های تستی با ۴ ستون کامل
        test_data = generate_test_data_with_columns()
        return Response({
            "levels": test_data,
            "is_test": True
        }, status=status.HTTP_200_OK)

    # داده‌های واقعی با ۴ ستون
    return Response({
        "levels": {
            "level_1": {
                "count": level_obj.level_1_count,
                "users": level_obj.level_1_users[:20] if level_obj.level_1_users else []
            },
            "level_2": {
                "count": level_obj.level_2_count,
                "users": level_obj.level_2_users[:20] if level_obj.level_2_users else []
            },
            "level_3": {
                "count": level_obj.level_3_count,
                "users": level_obj.level_3_users[:20] if level_obj.level_3_users else []
            },
            "level_4": {
                "count": level_obj.level_4_count,
                "users": level_obj.level_4_users[:20] if level_obj.level_4_users else []
            },
            "level_5": {
                "count": level_obj.level_5_count,
                "users": level_obj.level_5_users[:20] if level_obj.level_5_users else []
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
    """
    تولید داده‌های تستی با 4 ستون:
    1. telegram_id
    2. wallet
    3. investment (TON)
    4. profit
    """
    import random
    
    def generate_user(level):
        """تولید یک کاربر تستی با ۴ ستون"""
        telegram_id = random.randint(100000000, 999999999)
        wallet = "0x" + ''.join(random.choices('0123456789abcdef', k=40))
        investment = round(random.uniform(1, 100), 2)
        profit = round(random.uniform(0.01, 5), 4)
        
        return {
            "telegram_id": telegram_id,
            "wallet": wallet,
            "investment": investment,
            "profit": profit
        }
    
    # تعداد کاربران در هر سطح (طبق درخت باینری)
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


# ✅ تابع قدیمی برای سازگاری (اختیاری)
def generate_test_data():
    """سازگاری با کدهای قبلی"""
    return generate_test_data_with_columns()