from decimal import Decimal
from django.utils import timezone
from django.db import transaction
from django.db.models import F
import requests
import uuid
import logging
from decimal import Decimal, ROUND_DOWN

logger = logging.getLogger(__name__)

from .models import AppUser, Wallet, Ledger, Purchase , ReferralLevel



# ثابت‌ها
ECG_PER_USD = Decimal("312")  # مقدار هر 1 دلار به ECG
SELF_BONUS_RATE = Decimal("0.05")
UPLINE_RATE = Decimal("0.05")
COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd"
REFERRAL_TOKEN_REWARD = Decimal("3")  # پاداش هر دعوت


def get_or_create_user(wallet_address: str) -> AppUser:
    """
    دریافت یا ساخت کاربر جدید با ایجاد کیف پول
    """
    user, created = AppUser.objects.get_or_create(wallet_address=wallet_address)
    if created:
        Wallet.objects.create(user=user)
    return user


def apply_referral(inviter_code: str, user: AppUser):
    """
    اعمال کد دعوت (referral) به کاربر
    + دادن 3 توکن به inviter در referral_bonus
    """
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

    # ست کردن inviter
    user.inviter = inviter
    user.save(update_fields=["inviter"])
    logger.info("[REF] success user=%s inviter=%s", user.id, inviter.id)

    update_referral_levels(user,inviter)
    # 👇 دادن پاداش 3 توکن به inviter
    try:
        with transaction.atomic():
            # مطمئن شدن که wallet وجود دارد
            w, created = Wallet.objects.get_or_create(user=inviter)
            if created:
                logger.info("[REF] inviter wallet created inviter_id=%s", inviter.id)

            # اضافه کردن referral_bonus
            Wallet.objects.filter(user=inviter).update(
                referral_bonus=F("referral_bonus") + REFERRAL_TOKEN_REWARD
            )

            # ثبت Ledger برای ردگیری
            Ledger.objects.create(
                user=inviter,
                typ="REF_BONUS",
                amount=REFERRAL_TOKEN_REWARD,
                meta={"invitee": user.wallet_address}
            )
            logger.info("[REF] inviter rewarded %s tokens for invitee=%s",
                        REFERRAL_TOKEN_REWARD, user.wallet_address)
    except Exception as e:
        logger.exception("[REF] failed to reward inviter: %s", e)

def update_referral_levels(new_user: AppUser, direct_inviter:AppUser):

    current = direct_inviter

    level = 1

    while current and level <= 5:
        level_obj, created = ReferraLevel.objects.get_or_create(user = current)

        if level == 1:
            level_obj.level_1_count += 1

            if new_user.wallet_address not in level_obj.level_1_users:

                level_obj.level_1_users.append(new_user.wallet_address)

        elif level == 2:
            level_obj.level_2_count += 1
            if new_user.wallet_address not in level_obj.level_2_users:
                level_obj.level_2_users.append(new_user.wallet_address)

        elif level == 3:
            level_obj.level_3_count += 1
            if new_user.wallet_address not in level_obj.level_3_users:
                level_obj.level_3_users.append(new_user.wallet_address)

        elif level == 4:
            level_obj.level_4_count += 1
            if new_user.wallet_address not in level_obj.level_4_users:
                level_obj.level_4_users.append(new_user.wallet_address)

        elif level == 5:
            level_obj.level_5_count += 1
            if new_user.wallet_address not in level_obj.level_5_users:
                level_obj.level_5_users.append(new_user.wallet_address)

        level_obj.save()
        logger.info(f"[LEVEL] User {current.wallet_address} level {level} updated")

        current = current.inviter
        level += 1

def distribute_level_5_purchase(user: AppUser, purchase_amount: Decimal):

    logger.info(f"[LEVEL5] Distributing purchase for user {user.wallet_address}")

    current = user.inviter
    level = 1
    bouns = Decimal("0.01")

    while current and level <= 4:

        level_obj = ReferraLevel.objects.filter(user=user).first()
        if not level_obj or level_obj.level_5_count == 0:
            logger.info(f"[LEVEL5] User {user.wallet_address} not level 5 yet")
            return

        while transaction.atomic():
            w,created = Wallet.objects.get_or_create(user=current)
            if created:
                logger.info(f"[LEVEL5] Wallet created for {current.wallet_address}")

                Wallet.objects.filter(user=current).update(
                    referrral_bouns = F("referral_bouns") + bouns

                )
                Ledger.objects.create(
                    user=current,
                    typ = "LEVELS_BOUNS",
                    amount=bouns,
                    meta = {
                        "from":user.wallet_address,
                        "level":level,
                        "purchase_amount": str(purchase_amount)
                    }
                )
                logger.info(f"[LEVEL5] Bonus {bouns} given to level {level} user {current.wallet_address}")

                current - current.inviter
                level += 1



def fetch_ton_usd_rate() -> Decimal:
    """
    گرفتن نرخ TON به USD از CoinGecko
    """
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

    Ledger.objects.create(user=user, typ="BUY_PRINCIPAL", amount=ecg_value,
                          meta={"invoice": invoice_no, "tx": ton_tx_hash, "is_test": is_test})
    Ledger.objects.create(user=user, typ="BUY_SELF_PROFIT", amount=self_bonus,
                          meta={"invoice": invoice_no, "tx": ton_tx_hash, "is_test": is_test})

    logger.info("[BUY] user wallet updated: +principal_locked=%s +self_profit_locked=%s",
                ecg_value, self_bonus)

    # 3) پرداخت سود به بالاسری (downline_profit_instant)
    if user.inviter_id:
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
        logger.info("[BUY] upline wallet updated inviter_id=%s +downline_profit_instant=%s",
                    user.inviter_id, upline_bonus)
    else:
        logger.info("[BUY] no inviter -> skip downline profit")


    level_obj = ReferraLevel.objects.filter(user=user).first()
    if level_obj and level_obj.level_5_count > 0:
        logger.info(f"[LEVEL5] User {user.wallet_address} is level5,distributing bonuses")

        distribute_level_5_purchase(user,ecg_value)

    else:
        logger.info(f"[LEVEL5] User {user.wallet_address} is not level 5 yet (count:{level_obj.level_5_count if level_obj else 0})")


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

def ecg_to_ton(ecg_amount: Decimal) -> Decimal:
    rate = fetch_ton_usd_rate()  # USD per TON
    ecg_per_ton = rate * ECG_PER_USD
    # 9 رقم اعشار TON (nanoTON)
    return (ecg_amount / ecg_per_ton).quantize(Decimal("0.000000001"), rounding=ROUND_DOWN)


def distribute_level_5_purchase(user:AppUser,purchase_amount: Decimal):
    logger.info(f"[LEVEL5] Distributing purchase for user {user.wallet_address}")


    current = user.inviter
    level = 1
    bouns = Decimal

    while current and level <= 4:
        with transaction.atomic():
            w,created = Wallet.objects.get_or_create(user=current)
            if created:
                logger.info(f"[LEVEL5] Wallet created for {current.wallet_address}")

            Wallet.objects.filter(user=current).update(
                referral_bouns=F("referral_bouns") + bouns
            )

            Ledger.objects.create(
                user = current,
                typ="LEVEL5_BOUNS",
                amount=bouns,
                meta={
                    "from":user.wallet_address,
                    "level":level,
                    "purchase_amount":str(purchase_amount),
                    "timestamp":str(timezone.now())
                }

            )
            logger.info(f"[LEVEL5] Bouns{bouns} given to level {level} user {current.wallet_address}")

            current = current.inviter
            level += 1

        if level <= 4:
            logger.info(f"[LEVEL5] Only {level-1} upline levels found, distributed to {level-1} users")


        