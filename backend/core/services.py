from decimal import Decimal
from django.utils import timezone
from django.db import transaction
from django.db.models import F
import requests
import uuid
import logging
from decimal import Decimal, ROUND_DOWN

logger = logging.getLogger(__name__)

from .models import AppUser, Wallet, Ledger, Purchase, ReferralLevel


# ثابت‌ها
ECG_PER_USD = Decimal("312")  # مقدار هر 1 دلار به ECG
SELF_BONUS_RATE = Decimal("0.05")
UPLINE_RATE = Decimal("0.05")
COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd"
REFERRAL_TOKEN_REWARD = Decimal("3")  # پاداش هر دعوت


def get_or_create_user(wallet_address: str, telegram_id: int = None, is_telegram: bool = False) -> AppUser:
    """
    دریافت یا ساخت کاربر جدید با قفل شدن ولت پس از اولین اتصال
    """
    logger.info(f"🔍 get_or_create_user: wallet={wallet_address}, telegram_id={telegram_id}, is_telegram={is_telegram}")
    
    # برای تست در مرورگر، این خط را کامنت کنید
    # if not is_telegram:
    #     raise ValueError("Only Telegram mini-app users are allowed")

    # ✅ اگر telegram_id وجود نداشت، فقط با wallet_address کار کن
    if not telegram_id:
        logger.warning("⚠️ No telegram_id, trying to find by wallet_address")
        user = AppUser.objects.filter(wallet_address=wallet_address).first()
        if user:
            logger.info(f"✅ User found by wallet_address: {user.wallet_address}")
            return user
        # اگر کاربر وجود نداشت، یکی بساز
        user = AppUser.objects.create(
            wallet_address=wallet_address,
            telegram_id=None,
            is_telegram_user=False,
            telegram_verified=False,
            wallet_locked=False
        )
        Wallet.objects.create(user=user)
        logger.info(f"✅ New user created with wallet only: {wallet_address}")
        return user
    
    # ✅ بررسی اینکه آیا این telegram_id قبلاً ثبت شده است
    existing_user_by_telegram = AppUser.objects.filter(telegram_id=telegram_id).first()
    
    if existing_user_by_telegram:
        logger.info(f"✅ User found by telegram_id: {existing_user_by_telegram.wallet_address}")
        
        # ✅ اگر ولت قفل شده باشد، اجازه تغییر ولت را نده
        if existing_user_by_telegram.wallet_locked:
            # اگر ولت قبلی با ولت جدید یکی نیست، خطا بده
            if existing_user_by_telegram.wallet_address != wallet_address:
                raise ValueError(f"This Telegram ID is already linked to wallet: {existing_user_by_telegram.wallet_address[:10]}...")
        else:
            # اگر ولت قفل نشده باشد، ولت را به‌روز کن و قفلش کن
            if existing_user_by_telegram.wallet_address != wallet_address:
                existing_user_by_telegram.wallet_address = wallet_address
                existing_user_by_telegram.wallet_locked = True
                existing_user_by_telegram.save()
                logger.info(f"🔒 Wallet locked for user: {existing_user_by_telegram.wallet_address}")
        
        return existing_user_by_telegram
    
    # ✅ بررسی اینکه آیا این wallet_address قبلاً با telegram_id دیگری ثبت شده است
    existing_user_by_wallet = AppUser.objects.filter(wallet_address=wallet_address).first()
    
    if existing_user_by_wallet:
        logger.info(f"⚠️ Wallet address already registered with telegram_id: {existing_user_by_wallet.telegram_id}")
        
        # اگر ولت قبلاً ثبت شده ولی telegram_id ندارد، به‌روز کن
        if not existing_user_by_wallet.telegram_id:
            existing_user_by_wallet.telegram_id = telegram_id
            existing_user_by_wallet.is_telegram_user = True
            existing_user_by_wallet.telegram_verified = True
            existing_user_by_wallet.wallet_locked = True
            existing_user_by_wallet.save()
            logger.info(f"🔒 Wallet locked for existing user: {existing_user_by_wallet.wallet_address}")
            return existing_user_by_wallet
        
        # اگر ولت قبلاً با telegram_id دیگری ثبت شده، خطا بده
        raise ValueError("This wallet is already linked to another Telegram account")
    
    # ✅ ایجاد کاربر جدید
    user = AppUser.objects.create(
        wallet_address=wallet_address,
        telegram_id=telegram_id,
        is_telegram_user=True,
        telegram_verified=True,
        wallet_locked=True
    )
    
    Wallet.objects.create(user=user)
    logger.info(f"✅ New user created with locked wallet: {wallet_address}")
    
    return user


def apply_referral(inviter_code: str, user: AppUser):
    """
    اعمال کد دعوت (referral) به کاربر
    + دادن 3 توکن به inviter در referral_bonus
    + بروزرسانی سطوح
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

    # بروزرسانی سطوح
    update_referral_levels(user, inviter)

    # دادن پاداش 3 توکن به inviter
    give_referral_bonus(inviter, user)


def give_referral_bonus(inviter: AppUser, new_user: AppUser):
    """پاداش ۳ توکن به دعوت‌کننده"""
    try:
        with transaction.atomic():
            w, created = Wallet.objects.get_or_create(user=inviter)
            if created:
                logger.info("[REF] inviter wallet created inviter_id=%s", inviter.id)

            Wallet.objects.filter(user=inviter).update(
                referral_bonus=F("referral_bonus") + REFERRAL_TOKEN_REWARD
            )

            Ledger.objects.create(
                user=inviter,
                typ="REF_BONUS",
                amount=REFERRAL_TOKEN_REWARD,
                meta={"invitee": new_user.wallet_address}
            )
            logger.info("[REF] inviter rewarded %s tokens for invitee=%s",
                        REFERRAL_TOKEN_REWARD, new_user.wallet_address)
    except Exception as e:
        logger.exception("[REF] failed to reward inviter: %s", e)


def update_referral_levels(new_user: AppUser, direct_inviter: AppUser):
    """
    بروزرسانی سطوح ۱ تا ۵ برای همه بالاسری‌ها
    هر سطح شامل: telegram_id, wallet, investment, profit
    """
    current = direct_inviter
    level = 1

    while current and level <= 5:
        # ✅ استفاده از ReferralLevel
        level_obj, created = ReferralLevel.objects.get_or_create(user=current)

        # اطلاعات کاربر جدید با ۴ ستون
        user_data = {
            "telegram_id": new_user.telegram_id,
            "wallet": new_user.wallet_address,
            "investment": 0,
            "profit": 0
        }

        if level == 1:
            level_obj.level_1_count += 1
            # بررسی تکراری نبودن
            existing_wallets = [u.get("wallet") for u in level_obj.level_1_users]
            if new_user.wallet_address not in existing_wallets:
                level_obj.level_1_users.append(user_data)

        elif level == 2:
            level_obj.level_2_count += 1
            existing_wallets = [u.get("wallet") for u in level_obj.level_2_users]
            if new_user.wallet_address not in existing_wallets:
                level_obj.level_2_users.append(user_data)

        elif level == 3:
            level_obj.level_3_count += 1
            existing_wallets = [u.get("wallet") for u in level_obj.level_3_users]
            if new_user.wallet_address not in existing_wallets:
                level_obj.level_3_users.append(user_data)

        elif level == 4:
            level_obj.level_4_count += 1
            existing_wallets = [u.get("wallet") for u in level_obj.level_4_users]
            if new_user.wallet_address not in existing_wallets:
                level_obj.level_4_users.append(user_data)

        elif level == 5:
            level_obj.level_5_count += 1
            existing_wallets = [u.get("wallet") for u in level_obj.level_5_users]
            if new_user.wallet_address not in existing_wallets:
                level_obj.level_5_users.append(user_data)

        level_obj.save()
        logger.info(f"[LEVEL] User {current.wallet_address} level {level} updated")

        current = current.inviter
        level += 1


def update_user_investment(user: AppUser, ton_amount: Decimal):
    """
    بروزرسانی مبلغ سرمایه‌گذاری کاربر در جدول سطوح بالاسری‌ها
    """
    current = user.inviter
    level = 1

    while current and level <= 5:
        level_obj = ReferralLevel.objects.filter(user=current).first()
        if level_obj:
            level_field = f"level_{level}_users"
            users = getattr(level_obj, level_field)
            
            # پیدا کردن کاربر و بروزرسانی investment
            for i, u in enumerate(users):
                if u.get("wallet") == user.wallet_address:
                    users[i]["investment"] = float(ton_amount)
                    break
            
            setattr(level_obj, level_field, users)
            level_obj.save()

        current = current.inviter
        level += 1


def update_level_profit(user: AppUser, level: int, from_wallet: str, profit: Decimal):
    """بروزرسانی سود در جدول سطوح"""
    level_obj = ReferralLevel.objects.filter(user=user).first()
    if not level_obj:
        return

    level_field = f"level_{level}_users"
    users = getattr(level_obj, level_field)

    # پیدا کردن کاربر در لیست و بروزرسانی سود
    for i, u in enumerate(users):
        if u.get("wallet") == from_wallet:
            current_profit = Decimal(str(u.get("profit", 0)))
            users[i]["profit"] = float(current_profit + profit)
            break

    setattr(level_obj, level_field, users)
    level_obj.save()


def fetch_ton_usd_rate() -> Decimal:
    """
    گرفتن نرخ TON به USD از CoinGecko
    """
    try:
        r = requests.get(COINGECKO_URL, timeout=10)
        r.raise_for_status()
        data = r.json()
        rate = data["the-open-network"]["usd"]
        return Decimal(str(rate))
    except Exception as e:
        logger.error(f"Failed to fetch TON rate: {e}")
        return Decimal("2.5")  # مقدار پیش‌فرض


@transaction.atomic
def register_purchase(user: AppUser, ton_amount: Decimal, ton_tx_hash: str, is_test: bool = False) -> Purchase:
    """
    ثبت خرید کاربر:
    - ایجاد Purchase
    - اضافه کردن Locked ها به Wallet کاربر
    - افزودن Ledger
    - پرداخت 5٪ به بالاسری در downline_profit_instant
    - اگر کاربر سطح 5 باشد، به 4 سطح بالاتر 0.01 می‌دهد
    """
    logger.info("[BUY] start user=%s user_id=%s inviter_id=%s ton_amount=%s tx=%s",
                user.wallet_address, user.id, user.inviter_id, ton_amount, ton_tx_hash)

    # جلوگیری از تراکنش تکراری
    if Purchase.objects.filter(ton_tx_hash=ton_tx_hash).exists():
        logger.warning("[BUY] duplicate tx=%s", ton_tx_hash)
        raise ValueError("TX already registered")

    # fetch rate
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

    # ✅ بروزرسانی سرمایه‌گذاری در جدول سطوح
    update_user_investment(user, ton_amount)

    # ✅ بررسی سطح 5 و توزیع پاداش
    level_obj = ReferralLevel.objects.filter(user=user).first()
    if level_obj and level_obj.level_5_count > 0:
        logger.info(f"[LEVEL5] User {user.wallet_address} is level 5, distributing bonuses")
        distribute_level_5_purchase(user, ecg_value)
    else:
        logger.info(f"[LEVEL5] User {user.wallet_address} is not level 5 yet (count: {level_obj.level_5_count if level_obj else 0})")

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
    """
    تبدیل ECG به TON
    """
    rate = fetch_ton_usd_rate()
    ecg_per_ton = rate * ECG_PER_USD
    return (ecg_amount / ecg_per_ton).quantize(Decimal("0.000000001"), rounding=ROUND_DOWN)


def distribute_level_5_purchase(user: AppUser, purchase_amount: Decimal):
    """
    وقتی کاربر سطح 5 خرید انجام داد، به 4 سطح بالاتر 0.01 می‌دهد
    """
    logger.info(f"[LEVEL5] Distributing purchase for user {user.wallet_address}")

    # بررسی اینکه کاربر سطح 5 است
    level_obj = ReferralLevel.objects.filter(user=user).first()
    if not level_obj or level_obj.level_5_count == 0:
        logger.info(f"[LEVEL5] User {user.wallet_address} is not level 5")
        return

    current = user.inviter
    level = 1
    bonus = Decimal("0.01")  # ✅ مقدار ثابت 0.01

    while current and level <= 4:
        with transaction.atomic():
            w, created = Wallet.objects.get_or_create(user=current)
            if created:
                logger.info(f"[LEVEL5] Wallet created for {current.wallet_address}")

            # ✅ اصلاح: referral_bonus
            Wallet.objects.filter(user=current).update(
                referral_bonus=F("referral_bonus") + bonus
            )

            # ثبت در Ledger
            Ledger.objects.create(
                user=current,
                typ="LEVEL5_BONUS",
                amount=bonus,
                meta={
                    "from": user.wallet_address,
                    "level": level,
                    "purchase_amount": str(purchase_amount),
                    "timestamp": str(timezone.now())
                }
            )

            # ✅ بروزرسانی سود در جدول سطوح
            update_level_profit(current, level, user.wallet_address, bonus)

            logger.info(f"[LEVEL5] Bonus {bonus} given to level {level} user {current.wallet_address}")

        current = current.inviter
        level += 1

    if level <= 4:
        logger.info(f"[LEVEL5] Only {level-1} upline levels found, distributed to {level-1} users")