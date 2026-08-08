from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from decimal import Decimal
from datetime import timedelta
from django.utils import timezone
from .services import get_or_create_user, apply_referral, register_purchase, ecg_to_ton
from .models import (
    AppUser, Wallet, Ledger, Purchase, 
    WithdrawRequest, ReferralLevel  # ✅ هماهنگ با models
)
from .serializers import WalletSerializer, PurchaseSerializer, UserSerializer
from django.conf import settings
import os
import requests  # ✅ اضافه شد


@api_view(["POST"])
def connect_wallet(request):
    wallet_address = request.data.get("wallet_address")
    inviter_code = request.data.get("inviter_code")  # optional

    if not wallet_address:
        return Response({"error": "wallet_address required"}, status=status.HTTP_400_BAD_REQUEST)

    user = get_or_create_user(wallet_address)
    if inviter_code:
        apply_referral(inviter_code, user)

    return Response({
        "user": UserSerializer(user).data,
        "wallet": WalletSerializer(user.wallet).data
    }, status=status.HTTP_200_OK)


@api_view(["GET"])
def wallet_view(request, wallet_address):
    user = get_or_create_user(wallet_address)
    return Response(WalletSerializer(user.wallet).data, status=status.HTTP_200_OK)


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

    user = get_or_create_user(wallet_address)

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

    user = get_or_create_user(wallet_address)
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

    user = get_or_create_user(wallet_address)
    w = user.wallet

    # 1) فقط چک موجودی
    if scope == "DOWNLINE_ONLY":
        if amount > w.downline_profit_instant:
            return Response({"error": "insufficient downline instant balance"}, status=status.HTTP_400_BAD_REQUEST)
    elif scope == "ALL_WITHDRAWABLE":
        if amount > w.withdrawable_total():
            return Response({"error": "insufficient withdrawable total"}, status=status.HTTP_400_BAD_REQUEST)
    else:
        return Response({"error": "invalid scope"}, status=status.HTTP_400_BAD_REQUEST)

    # 2) محاسبه TON معادل (معکوسِ خرید)
    ton_amount = ecg_to_ton(amount)

    dest = wallet_address  # ✅ مقصد همیشه ولت وصل‌شده

    # 3) ثبت درخواست
    req = WithdrawRequest.objects.create(
        user=user,
        scope=scope,
        amount=amount,
        ton_amount=ton_amount,
        destination_wallet=dest,
        status="PENDING",
    )

    # 4) ارسال TON از خزانه (ton-service)
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

    # 5) فقط اگر انتقال TON موفق شد -> حالا ECG را کم کن
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

    # 6) نهایی‌سازی
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

    user = get_or_create_user(wallet_address)
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

    user = get_or_create_user(wallet_address)
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

    user = get_or_create_user(wallet_address)
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
# ✅ Referral Levels API (هماهنگ با models)
# =======================

@api_view(["GET"])
def get_referral_levels(request):
    """
    دریافت اطلاعات سطوح referral برای یک کاربر
    شامل 5 سطح با لیست کاربران و تعداد
    """
    wallet_address = request.query_params.get("wallet_address")
    if not wallet_address:
        return Response({"error": "wallet_address required"}, status=status.HTTP_400_BAD_REQUEST)

    user = get_or_create_user(wallet_address)

    # ✅ استفاده از ReferralLevel (هماهنگ با models)
    level_obj, created = ReferralLevel.objects.get_or_create(user=user)

    is_test = request.query_params.get("test", "false").lower() == "true"

    if is_test:
        test_data = generate_test_data()
        return Response({
            "levels": {
                "level_1": {
                    "count": len(test_data["level_1"]),
                    "users": test_data["level_1"]
                },
                "level_2": {
                    "count": len(test_data["level_2"]),
                    "users": test_data["level_2"]
                },
                "level_3": {
                    "count": len(test_data["level_3"]),
                    "users": test_data["level_3"]
                },
                "level_4": {
                    "count": len(test_data["level_4"]),
                    "users": test_data["level_4"]
                },
                "level_5": {
                    "count": len(test_data["level_5"]),
                    "users": test_data["level_5"]
                }
            },
            "is_test": True
        }, status=status.HTTP_200_OK)

    # داده‌های واقعی
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


def generate_test_data():
    """تولید داده‌های تستی برای نمایش جدول"""
    import random
    import string

    def random_wallet():
        return "0x" + ''.join(random.choices(string.hexdigits.lower(), k=40))

    return {
        "level_1": [random_wallet() for _ in range(3)],
        "level_2": [random_wallet() for _ in range(7)],
        "level_3": [random_wallet() for _ in range(15)],
        "level_4": [random_wallet() for _ in range(31)],
        "level_5": [random_wallet() for _ in range(63)]
    }