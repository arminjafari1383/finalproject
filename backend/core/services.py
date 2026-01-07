from decimal import Decimal
from django.utils import timezone
from django.db import transaction
from django.db.models import F
import requests
import uuid
import logging
logger = logging.getLogger(__name__)

from .models import AppUser, Wallet, Ledger, Purchase


ECG_PER_USD = Decimal("312")  # مقدار هر 1 دلار به ECG
SELF_BONUS_RATE = Decimal("0.05")
UPLINE_RATE = Decimal("0.05")
COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd"

def get_or_create_user(wallet_address: str) -> AppUser:
    user, created = AppUser.objects.get_or_create(wallet_address=wallet_address)
    if created:
        Wallet.objects.create(user=user)
    return user

def apply_referral(inviter_code, user):
    logger.info("[REF] apply inviter_code=%s to user=%s (inviter_id=%s)",
                inviter_code, user.wallet_address, user.inviter_id)

    if user.inviter_id:
        logger.info("[REF] skipped: inviter already set")
        return

    inviter = AppUser.objects.filter(referral_code=inviter_code).first()
    logger.info("[REF] inviter found? %s", bool(inviter))

    if not inviter:
        logger.warning("[REF] invalid inviter_code=%s", inviter_code)
        return

    if inviter.id == user.id:
        logger.warning("[REF] self referral blocked user_id=%s", user.id)
        return

    user.inviter = inviter
    user.save(update_fields=["inviter"])
    logger.info("[REF] success user=%s inviter=%s", user.id, inviter.id)

def fetch_ton_usd_rate() -> Decimal:
    r = requests.get(COINGECKO_URL, timeout=10)
    r.raise_for_status()
    data = r.json()
    rate = data["the-open-network"]["usd"]
    return Decimal(str(rate))



@transaction.atomic
def register_purchase(user: AppUser, ton_amount: Decimal, ton_tx_hash: str, is_test: bool = False) -> Purchase:
    """
    ثبت خرید کاربر:
    - ایجاد Purchase
    - اضافه کردن Locked ها به Wallet کاربر
    - افزودن Ledger
    - پرداخت 5٪ به بالاسری در downline_profit_instant
    """
    logger.info("[BUY] start user=%s user_id=%s inviter_id=%s ton_amount=%s tx=%s",
                user.wallet_address, user.id, user.inviter_id, ton_amount, ton_tx_hash)

    # جلوگیری از تراکنش تکراری
    if Purchase.objects.filter(ton_tx_hash=ton_tx_hash).exists():
        logger.warning("[BUY] duplicate tx=%s", ton_tx_hash)
        raise ValueError("TX already registered")

    # fetch rate
    from .services import fetch_ton_usd_rate
    rate = fetch_ton_usd_rate()
    usd_value = ton_amount * rate
    ecg_value = usd_value * ECG_PER_USD
    self_bonus = ecg_value * SELF_BONUS_RATE
    upline_bonus = ecg_value * UPLINE_RATE

    now = timezone.now()
    invoice_no = uuid.uuid4().hex[:12].upper()
    principal_unlock_at = now + timezone.timedelta(days=365)
    self_profit_unlock_at = now + timezone.timedelta(days=30)

    logger.info("[BUY] computed ecg_value=%s self_bonus=%s upline_bonus=%s invoice=%s",
                ecg_value, self_bonus, upline_bonus, invoice_no)

    # 1) ایجاد Purchase
    p = Purchase.objects.create(
        user=user,
        invoice_no=invoice_no,
        ton_amount=ton_amount,
        ton_tx_hash=ton_tx_hash,
        ton_usd_rate=rate,
        usd_value=usd_value,
        ecg_value=ecg_value,
        self_profit_5=self_bonus,
        principal_unlock_at=principal_unlock_at,
        self_profit_unlock_at=self_profit_unlock_at,
    )
    logger.info("[BUY] purchase created id=%s", p.id)

    # 2) آپدیت کیف پول خود کاربر
    Wallet.objects.select_for_update().filter(user=user).update(
        principal_locked=F("principal_locked") + ecg_value,
        self_profit_locked=F("self_profit_locked") + self_bonus
    )

    Ledger.objects.create(user=user, typ="BUY_PRINCIPAL", amount=ecg_value, meta={"invoice": invoice_no, "tx": ton_tx_hash, "is_test": is_test})
    Ledger.objects.create(user=user, typ="BUY_SELF_PROFIT", amount=self_bonus, meta={"invoice": invoice_no, "tx": ton_tx_hash, "is_test": is_test})

    logger.info("[BUY] user wallet updated: +principal_locked=%s +self_profit_locked=%s", ecg_value, self_bonus)

    # 3) پرداخت سود به بالاسری (downline_profit_instant)
    if user.inviter_id:
        # مطمئن شو بالاسری Wallet داره
        inv_wallet, created = Wallet.objects.get_or_create(user=user.inviter)
        if created:
            logger.info("[BUY] inviter wallet created user_id=%s", user.inviter_id)

        Wallet.objects.filter(user=user.inviter).update(
            downline_profit_instant=F("downline_profit_instant") + upline_bonus
        )
        Ledger.objects.create(
            user=user.inviter,
            typ="DOWNLINE_PROFIT",
            amount=upline_bonus,
            meta={"from": user.wallet_address, "invoice": invoice_no, "tx": ton_tx_hash, "is_test": is_test}
        )
        logger.info("[BUY] upline wallet updated inviter_id=%s +downline_profit_instant=%s", user.inviter_id, upline_bonus)
    else:
        logger.info("[BUY] no inviter -> skip downline profit")

    # 4) refresh از دیتابیس برای لاگ دقیق
    user.wallet.refresh_from_db()
    logger.info("[BUY] AFTER user_wallet principal_locked=%s self_profit_locked=%s downline_profit_instant=%s",
                user.wallet.principal_locked, user.wallet.self_profit_locked, user.wallet.downline_profit_instant)

    if user.inviter_id:
        user.inviter.wallet.refresh_from_db()
        logger.info("[BUY] AFTER upline_wallet principal_locked=%s self_profit_locked=%s downline_profit_instant=%s",
                    user.inviter.wallet.principal_locked,
                    user.inviter.wallet.self_profit_locked,
                    user.inviter.wallet.downline_profit_instant)

    return p