from decimal import Decimal
from django.utils import timezone
from django.db import transaction
from django.db.models import F
import requests
import uuid

from .models import AppUser, Wallet, Ledger, Purchase

COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd"

def get_or_create_user(wallet_address: str) -> AppUser:
    user, created = AppUser.objects.get_or_create(wallet_address=wallet_address)
    if created:
        Wallet.objects.create(user=user)
    return user

def apply_referral(inviter_code: str, new_user: AppUser):
    if not inviter_code:
        return
    if new_user.inviter_id is not None:
        return

    inviter = AppUser.objects.filter(referral_code=inviter_code).first()
    if not inviter or inviter.id == new_user.id:
        return

    new_user.inviter = inviter
    new_user.save(update_fields=["inviter"])

    # reward inviter 3 tokens -> referral_bonus
    with transaction.atomic():
        w = inviter.wallet
        w.referral_bonus = F("referral_bonus") + Decimal("3")
        w.save(update_fields=["referral_bonus"])
        Ledger.objects.create(user=inviter, typ="REF_BONUS", amount=Decimal("3"), meta={"invitee": new_user.wallet_address})

def fetch_ton_usd_rate() -> Decimal:
    r = requests.get(COINGECKO_URL, timeout=10)
    r.raise_for_status()
    data = r.json()
    rate = data["the-open-network"]["usd"]
    return Decimal(str(rate))

@transaction.atomic
def register_purchase(user: AppUser, ton_amount: Decimal, ton_tx_hash: str):
    # prevent duplicates
    if Purchase.objects.filter(ton_tx_hash=ton_tx_hash).exists():
        raise ValueError("TX already registered")

    rate = fetch_ton_usd_rate()
    usd_value = ton_amount * rate
    ecg_value = usd_value * Decimal("200")
    self_profit = ecg_value * Decimal("0.05")

    now = timezone.now()
    principal_unlock_at = now + timezone.timedelta(days=365)
    self_profit_unlock_at = now + timezone.timedelta(days=30)

    invoice_no = uuid.uuid4().hex[:12].upper()

    p = Purchase.objects.create(
        user=user,
        invoice_no=invoice_no,
        ton_amount=ton_amount,
        ton_tx_hash=ton_tx_hash,
        ton_usd_rate=rate,
        usd_value=usd_value,
        ecg_value=ecg_value,
        self_profit_5=self_profit,
        principal_unlock_at=principal_unlock_at,
        self_profit_unlock_at=self_profit_unlock_at,
    )

    # add to wallet locked buckets
    w = user.wallet
    w.principal_locked = F("principal_locked") + ecg_value
    w.self_profit_locked = F("self_profit_locked") + self_profit
    w.save(update_fields=["principal_locked", "self_profit_locked"])

    Ledger.objects.create(user=user, typ="BUY_PRINCIPAL", amount=ecg_value, meta={"invoice": invoice_no})
    Ledger.objects.create(user=user, typ="BUY_SELF_PROFIT", amount=self_profit, meta={"invoice": invoice_no})

    # give inviter downline 5% instant (if exists)
    if user.inviter_id:
        inv_w = user.inviter.wallet
        inv_profit = ecg_value * Decimal("0.05")
        inv_w.downline_profit_instant = F("downline_profit_instant") + inv_profit
        inv_w.save(update_fields=["downline_profit_instant"])
        Ledger.objects.create(user=user.inviter, typ="DOWNLINE_PROFIT", amount=inv_profit, meta={"from": user.wallet_address, "invoice": invoice_no})

    return p