# backend/core/services.py

from decimal import Decimal
from django.utils import timezone
from django.db import transaction
from django.db.models import F, Sum
import requests
import uuid
import logging
from decimal import Decimal, ROUND_DOWN

logger = logging.getLogger(__name__)

from .models import AppUser, Wallet, Ledger, Purchase, ReferralLevel, PurchaseUSDT, PurchaseBNB


# ثابت‌ها
ECG_PER_USD = Decimal("312")  # مقدار هر 1 دلار به ECG
SELF_BONUS_RATE = Decimal("0.05")
UPLINE_RATE = Decimal("0.05")
COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd"
REFERRAL_TOKEN_REWARD = Decimal("3")  # پاداش هر دعوت


# ==========================================
# تابع کمکی برای اطمینان از وجود Wallet
# ==========================================
def ensure_user_has_wallet(user: AppUser) -> Wallet:
    """
    اطمینان از اینکه کاربر کیف پول دارد، اگر ندارد ایجاد می‌کند
    """
    try:
        wallet = user.wallet
        return wallet
    except Wallet.DoesNotExist:
        logger.warning(f"⚠️ Wallet not found for user {user.wallet_address}, creating...")
        wallet = Wallet.objects.create(user=user)
        logger.info(f"✅ Wallet created for user {user.wallet_address}")
        return wallet


# ==========================================
# دریافت یا ایجاد کاربر (اصلاح شده)
# ==========================================
def get_or_create_user(wallet_address: str, telegram_id: int = None, is_telegram: bool = False) -> AppUser:
    """
    دریافت یا ساخت کاربر جدید با قفل شدن ولت پس از اولین اتصال
    """
    logger.info(f"🔍 get_or_create_user: wallet={wallet_address}, telegram_id={telegram_id}, is_telegram={is_telegram}")
    
    # اگر telegram_id وجود نداشت، با ولت آدرس پیدا کن
    if not telegram_id:
        logger.warning("⚠️ No telegram_id, trying to find by wallet_address")
        user = AppUser.objects.filter(wallet_address=wallet_address).first()
        if user:
            logger.info(f"✅ User found by wallet_address: {user.wallet_address}")
            user.is_active = True
            user.last_active = timezone.now()
            
            # ✅ اگر username نداشت یا browser_ بود، اصلاح کن
            if not user.telegram_username or user.telegram_username.startswith('browser_'):
                user.telegram_username = f"user_{wallet_address[:8]}"
                logger.info(f"✅ Fixed username for wallet user: {user.telegram_username}")
            
            user.save()
            ensure_user_has_wallet(user)
            return user
        
        # ایجاد کاربر جدید
        user = AppUser.objects.create(
            wallet_address=wallet_address,
            telegram_id=None,
            is_telegram_user=False,
            telegram_verified=False,
            wallet_locked=False,
            is_active=True,
            is_admin=False,
            telegram_username=f"user_{wallet_address[:8]}",  # ✅ username پیش‌فرض
        )
        Wallet.objects.create(user=user)
        logger.info(f"✅ New user created with wallet only: {wallet_address}")
        return user
    
    # جستجو با telegram_id
    existing_user_by_telegram = AppUser.objects.filter(telegram_id=telegram_id).first()
    
    if existing_user_by_telegram:
        logger.info(f"✅ User found by telegram_id: {existing_user_by_telegram.wallet_address}")
        existing_user_by_telegram.is_active = True
        existing_user_by_telegram.last_active = timezone.now()
        
        # ✅ اصلاح username
        if not existing_user_by_telegram.telegram_username or existing_user_by_telegram.telegram_username.startswith('browser_'):
            if is_telegram:
                existing_user_by_telegram.telegram_username = str(telegram_id)
                logger.info(f"✅ Using telegram_id as username: {telegram_id}")
            else:
                existing_user_by_telegram.telegram_username = f"user_{wallet_address[:8]}"
                logger.info(f"✅ Using wallet as username: {existing_user_by_telegram.telegram_username}")
            existing_user_by_telegram.save(update_fields=["telegram_username"])
        
        if existing_user_by_telegram.wallet_locked:
            if existing_user_by_telegram.wallet_address != wallet_address:
                raise ValueError(
                    f"This Telegram ID is already linked to wallet: "
                    f"{existing_user_by_telegram.wallet_address[:6]}...{existing_user_by_telegram.wallet_address[-4:]}"
                )
        else:
            if existing_user_by_telegram.wallet_address != wallet_address:
                existing_user_by_telegram.wallet_address = wallet_address
                existing_user_by_telegram.wallet_locked = True
        
        existing_user_by_telegram.save()
        ensure_user_has_wallet(existing_user_by_telegram)
        return existing_user_by_telegram
    
    # جستجو با wallet_address
    existing_user_by_wallet = AppUser.objects.filter(wallet_address=wallet_address).first()
    
    if existing_user_by_wallet:
        logger.info(f"⚠️ Wallet address already registered with telegram_id: {existing_user_by_wallet.telegram_id}")
        existing_user_by_wallet.is_active = True
        existing_user_by_wallet.last_active = timezone.now()
        
        # ✅ اصلاح username
        if not existing_user_by_wallet.telegram_username or existing_user_by_wallet.telegram_username.startswith('browser_'):
            if is_telegram:
                existing_user_by_wallet.telegram_username = str(telegram_id)
            else:
                existing_user_by_wallet.telegram_username = f"user_{wallet_address[:8]}"
            existing_user_by_wallet.save(update_fields=["telegram_username"])
            logger.info(f"✅ Fixed username: {existing_user_by_wallet.telegram_username}")
        
        if existing_user_by_wallet.wallet_locked:
            if not existing_user_by_wallet.telegram_id:
                existing_user_by_wallet.telegram_id = telegram_id
                existing_user_by_wallet.is_telegram_user = True
                existing_user_by_wallet.telegram_verified = True
                existing_user_by_wallet.wallet_locked = True
                existing_user_by_wallet.save()
                logger.info(f"🔒 Wallet locked for existing user: {existing_user_by_wallet.wallet_address}")
                ensure_user_has_wallet(existing_user_by_wallet)
                return existing_user_by_wallet
            
            raise ValueError("This wallet is already linked to another Telegram account (Locked)")
        else:
            existing_user_by_wallet.telegram_id = telegram_id
            existing_user_by_wallet.is_telegram_user = True
            existing_user_by_wallet.telegram_verified = True
            existing_user_by_wallet.wallet_locked = True
            existing_user_by_wallet.save()
            logger.info(f"✅ Wallet paired with Telegram ID: {existing_user_by_wallet.wallet_address}")
            ensure_user_has_wallet(existing_user_by_wallet)
            return existing_user_by_wallet

    # ایجاد کاربر جدید
    user = AppUser.objects.create(
        wallet_address=wallet_address,
        telegram_id=telegram_id,
        is_telegram_user=True,
        telegram_verified=True,
        wallet_locked=True,
        is_active=True,
        is_admin=False,
        telegram_username=str(telegram_id) if is_telegram else f"user_{wallet_address[:8]}",
    )
    
    Wallet.objects.create(user=user)
    logger.info(f"✅ New user created with locked wallet: {wallet_address}")
    
    return user


# ==========================================
# توابع رفرال
# ==========================================
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

    user.inviter = inviter
    user.save(update_fields=["inviter"])
    logger.info("[REF] success user=%s inviter=%s", user.id, inviter.id)

    update_referral_levels(user, inviter)
    give_referral_bonus(inviter, user)


def give_referral_bonus(inviter: AppUser, new_user: AppUser):
    """پاداش ۳ توکن به دعوت‌کننده"""
    try:
        with transaction.atomic():
            ensure_user_has_wallet(inviter)
            
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


# ==========================================
# ✅ اصلاح شده نهایی: بروزرسانی سطوح با username مناسب
# ==========================================
def update_referral_levels(new_user: AppUser, direct_inviter: AppUser):
    """
    بروزرسانی سطوح ۱ تا ۵ برای همه بالاسری‌ها
    هر سطح شامل: telegram_id, telegram_username, wallet, investment, profit
    """
    current = direct_inviter
    level = 1

    while current and level <= 5:
        level_obj, created = ReferralLevel.objects.get_or_create(user=current)

        # ==========================================
        # ✅ تعیین username مناسب
        # ==========================================
        username = None
        
        # 1. اگر telegram_username داره و browser_ نیست
        if new_user.telegram_username and not new_user.telegram_username.startswith('browser_'):
            username = new_user.telegram_username
        # 2. اگر telegram_id داره
        elif new_user.telegram_id:
            username = str(new_user.telegram_id)
        # 3. اگر هیچکدام نبود، از wallet استفاده کن
        else:
            username = new_user.wallet_address[:8] if new_user.wallet_address else 'Unknown'

        user_data = {
            "telegram_id": new_user.telegram_id,
            "telegram_username": new_user.telegram_username,
            "telegram_photo_url": new_user.telegram_photo_url,
            "wallet": new_user.wallet_address,
            "investment": 0,
            "profit": 0,
            }

        if level == 1:
            level_obj.level_1_count += 1
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


# ==========================================
# ✅ اصلاح شده: حفظ telegram_username در بروزرسانی سرمایه‌گذاری
# ==========================================
def update_user_investment(user: AppUser, amount: Decimal):
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
            
            for i, u in enumerate(users):
                if u.get("wallet") == user.wallet_address:
                    users[i]["investment"] = float(amount)
                    # ✅ حفظ telegram_username
                    if user.telegram_username and not user.telegram_username.startswith('browser_'):
                        users[i]["telegram_username"] = user.telegram_username
                    break
            
            setattr(level_obj, level_field, users)
            level_obj.save()

        current = current.inviter
        level += 1


# ==========================================
# ✅ اصلاح شده: حفظ telegram_username در بروزرسانی سود
# ==========================================
def update_level_profit(user: AppUser, level: int, from_wallet: str, profit: Decimal):
    """بروزرسانی سود در جدول سطوح"""
    level_obj = ReferralLevel.objects.filter(user=user).first()
    if not level_obj:
        return

    level_field = f"level_{level}_users"
    users = getattr(level_obj, level_field)

    for i, u in enumerate(users):
        if u.get("wallet") == from_wallet:
            current_profit = Decimal(str(u.get("profit", 0)))
            users[i]["profit"] = float(current_profit + profit)
            break

    setattr(level_obj, level_field, users)
    level_obj.save()


# ==========================================
# توابع دریافت نرخ ارز
# ==========================================
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
        return Decimal("2.5")


def fetch_bnb_usd_rate() -> Decimal:
    """
    گرفتن نرخ BNB به USD از CoinGecko
    """
    try:
        r = requests.get("https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd", timeout=10)
        r.raise_for_status()
        data = r.json()
        rate = data["binancecoin"]["usd"]
        return Decimal(str(rate))
    except Exception as e:
        logger.error(f"Failed to fetch BNB rate: {e}")
        return Decimal("600")


# ==========================================
# توابع ثبت خرید (بدون تغییر)
# ==========================================
@transaction.atomic
def register_purchase(user: AppUser, ton_amount: Decimal, ton_tx_hash: str, is_test: bool = False) -> Purchase:
    """
    ثبت خرید کاربر با TON
    """
    logger.info("[BUY] start user=%s user_id=%s inviter_id=%s ton_amount=%s tx=%s",
                user.wallet_address, user.id, user.inviter_id, ton_amount, ton_tx_hash)

    if Purchase.objects.filter(ton_tx_hash=ton_tx_hash).exists():
        logger.warning("[BUY] duplicate tx=%s", ton_tx_hash)
        raise ValueError("TX already registered")

    rate = fetch_ton_usd_rate()
    usd_value = ton_amount * rate
    ecg_value = usd_value * ECG_PER_USD
    self_bonus = ecg_value * SELF_BONUS_RATE
    upline_bonus = ecg_value * UPLINE_RATE

    now = timezone.now()
    invoice_no = uuid.uuid4().hex[:12].upper()
    principal_unlock_at = now + timezone.timedelta(days=365)
    self_profit_unlock_at = now + timezone.timedelta(days=30)

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

    ensure_user_has_wallet(user)
    
    Wallet.objects.select_for_update().filter(user=user).update(
        principal_locked=F("principal_locked") + ecg_value,
        self_profit_locked=F("self_profit_locked") + self_bonus
    )

    Ledger.objects.create(user=user, typ="BUY_PRINCIPAL", amount=ecg_value,
                          meta={"invoice": invoice_no, "tx": ton_tx_hash, "currency": "TON", "is_test": is_test})
    Ledger.objects.create(user=user, typ="BUY_SELF_PROFIT", amount=self_bonus,
                          meta={"invoice": invoice_no, "tx": ton_tx_hash, "currency": "TON", "is_test": is_test})

    if user.inviter_id:
        ensure_user_has_wallet(user.inviter)
        
        Wallet.objects.filter(user=user.inviter).update(
            downline_profit_instant=F("downline_profit_instant") + upline_bonus
        )
        Ledger.objects.create(
            user=user.inviter,
            typ="DOWNLINE_PROFIT",
            amount=upline_bonus,
            meta={"from": user.wallet_address, "invoice": invoice_no, "tx": ton_tx_hash, "currency": "TON", "is_test": is_test}
        )

    update_user_investment(user, ton_amount)

    level_obj = ReferralLevel.objects.filter(user=user).first()
    if level_obj and level_obj.level_5_count > 0:
        distribute_level_5_purchase(user, ecg_value)

    update_user_total_investment(user)

    return p


@transaction.atomic
def register_purchase_usdt(user: AppUser, usdt_amount: Decimal, usdt_tx_hash: str, is_test: bool = False) -> PurchaseUSDT:
    """
    ثبت خرید کاربر با USDT
    """
    logger.info("[BUY_USDT] start user=%s usdt_amount=%s tx=%s", user.wallet_address, usdt_amount, usdt_tx_hash)

    if PurchaseUSDT.objects.filter(usdt_tx_hash=usdt_tx_hash).exists():
        raise ValueError("TX already registered")

    rate = Decimal("1")
    usd_value = usdt_amount * rate
    ecg_value = usd_value * ECG_PER_USD
    self_bonus = ecg_value * SELF_BONUS_RATE
    upline_bonus = ecg_value * UPLINE_RATE

    now = timezone.now()
    invoice_no = uuid.uuid4().hex[:12].upper()
    principal_unlock_at = now + timezone.timedelta(days=365)
    self_profit_unlock_at = now + timezone.timedelta(days=30)

    p = PurchaseUSDT.objects.create(
        user=user,
        invoice_no=invoice_no,
        usdt_amount=usdt_amount,
        usdt_tx_hash=usdt_tx_hash,
        usdt_usd_rate=rate,
        usd_value=usd_value,
        ecg_value=ecg_value,
        self_profit_5=self_bonus,
        principal_unlock_at=principal_unlock_at,
        self_profit_unlock_at=self_profit_unlock_at,
    )

    ensure_user_has_wallet(user)
    
    Wallet.objects.select_for_update().filter(user=user).update(
        principal_locked=F("principal_locked") + ecg_value,
        self_profit_locked=F("self_profit_locked") + self_bonus
    )

    Ledger.objects.create(user=user, typ="BUY_PRINCIPAL", amount=ecg_value,
                          meta={"invoice": invoice_no, "tx": usdt_tx_hash, "currency": "USDT", "is_test": is_test})
    Ledger.objects.create(user=user, typ="BUY_SELF_PROFIT", amount=self_bonus,
                          meta={"invoice": invoice_no, "tx": usdt_tx_hash, "currency": "USDT", "is_test": is_test})

    if user.inviter_id:
        ensure_user_has_wallet(user.inviter)
        
        Wallet.objects.filter(user=user.inviter).update(
            downline_profit_instant=F("downline_profit_instant") + upline_bonus
        )
        Ledger.objects.create(
            user=user.inviter,
            typ="DOWNLINE_PROFIT",
            amount=upline_bonus,
            meta={"from": user.wallet_address, "invoice": invoice_no, "currency": "USDT", "is_test": is_test}
        )

    update_user_investment(user, usdt_amount)

    level_obj = ReferralLevel.objects.filter(user=user).first()
    if level_obj and level_obj.level_5_count > 0:
        distribute_level_5_purchase(user, ecg_value)

    update_user_total_investment(user)

    return p


@transaction.atomic
def register_purchase_bnb(user: AppUser, bnb_amount: Decimal, bnb_tx_hash: str, is_test: bool = False) -> PurchaseBNB:
    """
    ثبت خرید کاربر با BNB
    """
    logger.info("[BUY_BNB] start user=%s bnb_amount=%s tx=%s", user.wallet_address, bnb_amount, bnb_tx_hash)

    if PurchaseBNB.objects.filter(bnb_tx_hash=bnb_tx_hash).exists():
        raise ValueError("TX already registered")

    rate = fetch_bnb_usd_rate()
    usd_value = bnb_amount * rate
    ecg_value = usd_value * ECG_PER_USD
    self_bonus = ecg_value * SELF_BONUS_RATE
    upline_bonus = ecg_value * UPLINE_RATE

    now = timezone.now()
    invoice_no = uuid.uuid4().hex[:12].upper()
    principal_unlock_at = now + timezone.timedelta(days=365)
    self_profit_unlock_at = now + timezone.timedelta(days=30)

    p = PurchaseBNB.objects.create(
        user=user,
        invoice_no=invoice_no,
        bnb_amount=bnb_amount,
        bnb_tx_hash=bnb_tx_hash,
        bnb_usd_rate=rate,
        usd_value=usd_value,
        ecg_value=ecg_value,
        self_profit_5=self_bonus,
        principal_unlock_at=principal_unlock_at,
        self_profit_unlock_at=self_profit_unlock_at,
    )

    ensure_user_has_wallet(user)
    
    Wallet.objects.select_for_update().filter(user=user).update(
        principal_locked=F("principal_locked") + ecg_value,
        self_profit_locked=F("self_profit_locked") + self_bonus
    )

    Ledger.objects.create(user=user, typ="BUY_PRINCIPAL", amount=ecg_value,
                          meta={"invoice": invoice_no, "tx": bnb_tx_hash, "currency": "BNB", "is_test": is_test})
    Ledger.objects.create(user=user, typ="BUY_SELF_PROFIT", amount=self_bonus,
                          meta={"invoice": invoice_no, "tx": bnb_tx_hash, "currency": "BNB", "is_test": is_test})

    if user.inviter_id:
        ensure_user_has_wallet(user.inviter)
        
        Wallet.objects.filter(user=user.inviter).update(
            downline_profit_instant=F("downline_profit_instant") + upline_bonus
        )
        Ledger.objects.create(
            user=user.inviter,
            typ="DOWNLINE_PROFIT",
            amount=upline_bonus,
            meta={"from": user.wallet_address, "invoice": invoice_no, "currency": "BNB", "is_test": is_test}
        )

    update_user_investment(user, bnb_amount)

    level_obj = ReferralLevel.objects.filter(user=user).first()
    if level_obj and level_obj.level_5_count > 0:
        distribute_level_5_purchase(user, ecg_value)

    update_user_total_investment(user)

    return p


# ==========================================
# توابع تبدیل و توزیع
# ==========================================
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

    level_obj = ReferralLevel.objects.filter(user=user).first()
    if not level_obj or level_obj.level_5_count == 0:
        logger.info(f"[LEVEL5] User {user.wallet_address} is not level 5")
        return

    current = user.inviter
    level = 1
    bonus = Decimal("0.01")

    while current and level <= 4:
        with transaction.atomic():
            ensure_user_has_wallet(current)
            
            Wallet.objects.filter(user=current).update(
                referral_bonus=F("referral_bonus") + bonus
            )

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

            update_level_profit(current, level, user.wallet_address, bonus)

            logger.info(f"[LEVEL5] Bonus {bonus} given to level {level} user {current.wallet_address}")

        current = current.inviter
        level += 1

    if level <= 4:
        logger.info(f"[LEVEL5] Only {level-1} upline levels found, distributed to {level-1} users")


# ==========================================
# توابع بروزرسانی آمار کاربر
# ==========================================
def update_user_total_investment(user: AppUser):
    """
    بروزرسانی کل سرمایه‌گذاری کاربر
    """
    total_purchase_ton = Purchase.objects.filter(user=user).aggregate(
        total=Sum('ecg_value')
    )['total'] or Decimal('0')
    
    total_purchase_usdt = PurchaseUSDT.objects.filter(user=user).aggregate(
        total=Sum('ecg_value')
    )['total'] or Decimal('0')
    
    total_purchase_bnb = PurchaseBNB.objects.filter(user=user).aggregate(
        total=Sum('ecg_value')
    )['total'] or Decimal('0')
    
    total_investment = total_purchase_ton + total_purchase_usdt + total_purchase_bnb
    
    user.total_investment = total_investment
    user.save(update_fields=['total_investment'])
    
    logger.info(f"✅ Updated total_investment for {user.wallet_address}: {total_investment}")
    
    return total_investment


def update_user_total_earned(user: AppUser):
    """
    بروزرسانی کل سود کسب شده کاربر
    """
    total_earned = Ledger.objects.filter(
        user=user,
        typ__in=['DAILY_UNLOCK', 'SELF_PROFIT_UNLOCK', 'DOWNLINE_PROFIT', 'REF_BONUS', 'LEVEL5_BONUS']
    ).aggregate(total=Sum('amount'))['total'] or Decimal('0')
    
    user.total_earned = total_earned
    user.save(update_fields=['total_earned'])
    
    logger.info(f"✅ Updated total_earned for {user.wallet_address}: {total_earned}")
    
    return total_earned