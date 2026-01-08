from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from decimal import Decimal
from datetime import timedelta
from django.utils import timezone
from .services import get_or_create_user, apply_referral, register_purchase
from .models import WithdrawRequest, Ledger
from .serializers import WalletSerializer, PurchaseSerializer, UserSerializer


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
    scope = request.data.get("scope")  # DOWNLINE_ONLY or ALL_WITHDRAWABLE
    amount = Decimal(str(request.data.get("amount", "0")))
    dest = request.data.get("destination_wallet")

    if not all([wallet_address, scope, dest]):
        return Response(
            {"error": "wallet_address, scope, destination_wallet required"},
            status=status.HTTP_400_BAD_REQUEST
        )

    user = get_or_create_user(wallet_address)
    w = user.wallet

    if amount < Decimal("60"):
        return Response({"error": "min withdraw is 60 ECG"}, status=status.HTTP_400_BAD_REQUEST)

    if scope == "DOWNLINE_ONLY":
        if amount > w.downline_profit_instant:
            return Response({"error": "insufficient downline instant balance"}, status=status.HTTP_400_BAD_REQUEST)

        w.downline_profit_instant = w.downline_profit_instant - amount
        w.save(update_fields=["downline_profit_instant"])

    elif scope == "ALL_WITHDRAWABLE":
        if amount > w.withdrawable_total():
            return Response({"error": "insufficient withdrawable total"}, status=status.HTTP_400_BAD_REQUEST)

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

    else:
        return Response({"error": "invalid scope"}, status=status.HTTP_400_BAD_REQUEST)

    req = WithdrawRequest.objects.create(
        user=user,
        scope=scope,
        amount=amount,
        destination_wallet=dest,
        status="PENDING"
    )
    return Response({"id": req.id, "status": req.status}, status=status.HTTP_201_CREATED)


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

    # ✅ این فیلد باید در مدل AppUser وجود داشته باشد
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

    # ✅ افزایش موجودی داخلی
    w.daily_reward_unlocked = w.daily_reward_unlocked + DAILY_REWARD
    w.save(update_fields=["daily_reward_unlocked"])

    Ledger.objects.create(
        user=user,
        typ="DAILY_UNLOCK",
        amount=DAILY_REWARD,
        meta={"source": "timer"}
    )

    # ✅ ست کردن زمان بعدی
    user.next_daily_claim_at = now + COOLDOWN
    user.save(update_fields=["next_daily_claim_at"])

    return Response({
        "status": "rewarded",  # ✅ دقیقا چیزی که فرانت می‌خواهد
        "message": "1 ECG added",
        "balance_ecg": str(w.withdrawable_total()),
        "total_rewards": str(w.withdrawable_total()),
        "referral_points": str(w.referral_bonus),
        "rewards_count": user.ledgers.filter(typ="DAILY_UNLOCK").count(),
        "seconds_remaining": int(COOLDOWN.total_seconds()),
    }, status=status.HTTP_200_OK)