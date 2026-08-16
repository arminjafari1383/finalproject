# backend/core/services.py

from decimal import Decimal, ROUND_DOWN
from django.utils import timezone
from django.db import transaction
from django.db.models import F, Sum
import requests
import uuid
import logging

from .models import (
    AppUser,
    Wallet,
    AssetBalance,
    Ledger,
    Purchase,
    ReferralLevel,
    PurchaseUSDT,
    PurchaseBNB,
)


logger = logging.getLogger(__name__)


# ============================================================
# Constants
# ============================================================

ECG_PER_USD = Decimal("312")

SELF_BONUS_RATE = Decimal("0.05")
UPLINE_RATE = Decimal("0.05")

REFERRAL_TOKEN_REWARD = Decimal("3")

COINGECKO_URL = (
    "https://api.coingecko.com/api/v3/simple/price"
    "?ids=the-open-network&vs_currencies=usd"
)


# ============================================================
# Wallet helper
# ============================================================

def ensure_user_has_wallet(user: AppUser) -> Wallet:
    """
    اطمینان از اینکه کاربر Wallet دارد.
    اگر Wallet وجود نداشته باشد ساخته می‌شود.
    """

    try:
        return user.wallet

    except Wallet.DoesNotExist:

        logger.warning(
            "⚠️ Wallet not found for user %s, creating...",
            user.wallet_address,
        )

        wallet = Wallet.objects.create(user=user)

        logger.info(
            "✅ Wallet created for user %s",
            user.wallet_address,
        )

        return wallet


# ============================================================
# Get/Create user
# ============================================================

def get_or_create_user(
    wallet_address: str,
    telegram_id: int = None,
    is_telegram: bool = False,
) -> AppUser:

    logger.info(
        "🔍 get_or_create_user: wallet=%s telegram_id=%s is_telegram=%s",
        wallet_address,
        telegram_id,
        is_telegram,
    )

    # --------------------------------------------------------
    # No Telegram ID
    # --------------------------------------------------------

    if not telegram_id:

        logger.warning(
            "⚠️ No telegram_id, trying to find by wallet_address"
        )

        user = AppUser.objects.filter(
            wallet_address=wallet_address
        ).first()

        if user:

            logger.info(
                "✅ User found by wallet_address: %s",
                user.wallet_address,
            )

            user.is_active = True
            user.last_active = timezone.now()

            if (
                not user.telegram_username
                or user.telegram_username.startswith("browser_")
            ):
                user.telegram_username = (
                    f"user_{wallet_address[:8]}"
                )

                logger.info(
                    "✅ Fixed username for wallet user: %s",
                    user.telegram_username,
                )

            user.save()

            ensure_user_has_wallet(user)

            return user

        # Create new wallet-only user

        user = AppUser.objects.create(
            wallet_address=wallet_address,
            telegram_id=None,
            is_telegram_user=False,
            telegram_verified=False,
            wallet_locked=False,
            is_active=True,
            is_admin=False,
            telegram_username=f"user_{wallet_address[:8]}",
        )

        Wallet.objects.create(user=user)

        logger.info(
            "✅ New user created with wallet only: %s",
            wallet_address,
        )

        return user

    # --------------------------------------------------------
    # Search by Telegram ID
    # --------------------------------------------------------

    existing_user_by_telegram = (
        AppUser.objects
        .filter(telegram_id=telegram_id)
        .first()
    )

    if existing_user_by_telegram:

        logger.info(
            "✅ User found by telegram_id: %s",
            existing_user_by_telegram.wallet_address,
        )

        existing_user_by_telegram.is_active = True
        existing_user_by_telegram.last_active = timezone.now()

        if (
            not existing_user_by_telegram.telegram_username
            or existing_user_by_telegram.telegram_username.startswith(
                "browser_"
            )
        ):

            if is_telegram:
                existing_user_by_telegram.telegram_username = str(
                    telegram_id
                )
            else:
                existing_user_by_telegram.telegram_username = (
                    f"user_{wallet_address[:8]}"
                )

            existing_user_by_telegram.save(
                update_fields=["telegram_username"]
            )

        if existing_user_by_telegram.wallet_locked:

            if (
                existing_user_by_telegram.wallet_address
                != wallet_address
            ):
                raise ValueError(
                    "This Telegram ID is already linked to wallet: "
                    f"{existing_user_by_telegram.wallet_address[:6]}"
                    "..."
                    f"{existing_user_by_telegram.wallet_address[-4:]}"
                )

        else:

            if (
                existing_user_by_telegram.wallet_address
                != wallet_address
            ):

                existing_user_by_telegram.wallet_address = (
                    wallet_address
                )

                existing_user_by_telegram.wallet_locked = True

        existing_user_by_telegram.save()

        ensure_user_has_wallet(
            existing_user_by_telegram
        )

        return existing_user_by_telegram

    # --------------------------------------------------------
    # Search by Wallet
    # --------------------------------------------------------

    existing_user_by_wallet = (
        AppUser.objects
        .filter(wallet_address=wallet_address)
        .first()
    )

    if existing_user_by_wallet:

        logger.info(
            "⚠️ Wallet address already registered with telegram_id: %s",
            existing_user_by_wallet.telegram_id,
        )

        existing_user_by_wallet.is_active = True
        existing_user_by_wallet.last_active = timezone.now()

        if (
            not existing_user_by_wallet.telegram_username
            or existing_user_by_wallet.telegram_username.startswith(
                "browser_"
            )
        ):

            if is_telegram:
                existing_user_by_wallet.telegram_username = str(
                    telegram_id
                )

            else:
                existing_user_by_wallet.telegram_username = (
                    f"user_{wallet_address[:8]}"
                )

            existing_user_by_wallet.save(
                update_fields=["telegram_username"]
            )

        if existing_user_by_wallet.wallet_locked:

            if not existing_user_by_wallet.telegram_id:

                existing_user_by_wallet.telegram_id = (
                    telegram_id
                )

                existing_user_by_wallet.is_telegram_user = True
                existing_user_by_wallet.telegram_verified = True
                existing_user_by_wallet.wallet_locked = True

                existing_user_by_wallet.save()

                ensure_user_has_wallet(
                    existing_user_by_wallet
                )

                return existing_user_by_wallet

            raise ValueError(
                "This wallet is already linked to another "
                "Telegram account (Locked)"
            )

        existing_user_by_wallet.telegram_id = telegram_id
        existing_user_by_wallet.is_telegram_user = True
        existing_user_by_wallet.telegram_verified = True
        existing_user_by_wallet.wallet_locked = True

        existing_user_by_wallet.save()

        logger.info(
            "✅ Wallet paired with Telegram ID: %s",
            existing_user_by_wallet.wallet_address,
        )

        ensure_user_has_wallet(
            existing_user_by_wallet
        )

        return existing_user_by_wallet

    # --------------------------------------------------------
    # Completely new user
    # --------------------------------------------------------

    user = AppUser.objects.create(
        wallet_address=wallet_address,
        telegram_id=telegram_id,
        is_telegram_user=True,
        telegram_verified=True,
        wallet_locked=True,
        is_active=True,
        is_admin=False,
        telegram_username=(
            str(telegram_id)
            if is_telegram
            else f"user_{wallet_address[:8]}"
        ),
    )

    Wallet.objects.create(user=user)

    logger.info(
        "✅ New user created with locked wallet: %s",
        wallet_address,
    )

    return user


# ============================================================
# Referral
# ============================================================

@transaction.atomic
def apply_referral(
    inviter_code: str,
    user: AppUser,
):
    """
    اعمال referral به صورت Atomic.

    جلوگیری از:
    - ثبت چندباره inviter
    - درخواست همزمان
    - self referral
    - پرداخت چندباره bonus
    """

    logger.info(
        "[REF] apply inviter_code=%s user=%s",
        inviter_code,
        user.wallet_address,
    )

    # --------------------------------------------------------
    # Lock invitee
    # --------------------------------------------------------

    locked_user = (
        AppUser.objects
        .select_for_update()
        .get(pk=user.pk)
    )

    # دوباره بعد از lock بررسی می‌کنیم
    if locked_user.inviter_id:

        logger.info(
            "[REF] skipped: inviter already set "
            "user=%s inviter=%s",
            locked_user.id,
            locked_user.inviter_id,
        )

        return

    # --------------------------------------------------------
    # Find inviter
    # --------------------------------------------------------

    inviter = (
        AppUser.objects
        .filter(referral_code=inviter_code)
        .first()
    )

    if not inviter:

        logger.warning(
            "[REF] invalid inviter_code=%s",
            inviter_code,
        )

        return

    # --------------------------------------------------------
    # Prevent self referral
    # --------------------------------------------------------

    if inviter.id == locked_user.id:

        logger.warning(
            "[REF] self referral blocked user_id=%s",
            locked_user.id,
        )

        return

    # --------------------------------------------------------
    # Save inviter
    # --------------------------------------------------------

    locked_user.inviter = inviter

    locked_user.save(
        update_fields=["inviter"]
    )

    logger.info(
        "[REF] success user=%s inviter=%s",
        locked_user.id,
        inviter.id,
    )

    # --------------------------------------------------------
    # Update levels
    # --------------------------------------------------------

    update_referral_levels(
        locked_user,
        inviter,
    )

    # --------------------------------------------------------
    # Give direct referral bonus
    # --------------------------------------------------------

    give_referral_bonus(
        inviter,
        locked_user,
    )


# ============================================================
# Direct referral reward
# ============================================================

@transaction.atomic
def give_referral_bonus(
    inviter: AppUser,
    new_user: AppUser,
):
    """
    پرداخت 3 ECG به inviter.

    هر invitee فقط یک بار می‌تواند
    REF_BONUS ایجاد کند.
    """

    ensure_user_has_wallet(inviter)

    # Lock wallet
    wallet = (
        Wallet.objects
        .select_for_update()
        .get(user=inviter)
    )

    # --------------------------------------------------------
    # Idempotency check
    # --------------------------------------------------------

    already_rewarded = (
        Ledger.objects
        .filter(
            user=inviter,
            typ="REF_BONUS",
            meta__invitee=new_user.wallet_address,
        )
        .exists()
    )

    if already_rewarded:

        logger.warning(
            "[REF] duplicate bonus blocked "
            "inviter=%s invitee=%s wallet=%s",
            inviter.id,
            new_user.id,
            new_user.wallet_address,
        )

        return

    # --------------------------------------------------------
    # Add reward
    # --------------------------------------------------------

    wallet.referral_bonus = (
        (wallet.referral_bonus or Decimal("0"))
        + REFERRAL_TOKEN_REWARD
    )

    wallet.save(
        update_fields=[
            "referral_bonus",
            "updated_at",
        ]
    )

    # --------------------------------------------------------
    # Ledger
    # --------------------------------------------------------

    Ledger.objects.create(
        user=inviter,
        typ="REF_BONUS",
        amount=REFERRAL_TOKEN_REWARD,
        meta={
            "invitee": new_user.wallet_address,
        },
    )

    logger.info(
        "[REF] inviter rewarded %s ECG "
        "for invitee=%s",
        REFERRAL_TOKEN_REWARD,
        new_user.wallet_address,
    )


# ============================================================
# Referral levels
# ============================================================

def update_referral_levels(
    new_user: AppUser,
    direct_inviter: AppUser,
):
    """
    بروزرسانی Level 1 تا Level 5.

    این نسخه:
    - duplicate user اضافه نمی‌کند
    - count را بدون duplicate نگه می‌دارد
    - برای همزمانی ReferralLevel را lock می‌کند
    """

    current = direct_inviter
    level = 1

    while current and level <= 5:

        # ----------------------------------------------------
        # Ensure ReferralLevel exists
        # ----------------------------------------------------

        level_obj, _ = (
            ReferralLevel.objects
            .get_or_create(user=current)
        )

        # Lock row
        level_obj = (
            ReferralLevel.objects
            .select_for_update()
            .get(pk=level_obj.pk)
        )

        # ----------------------------------------------------
        # User data
        # ----------------------------------------------------

        user_data = {
            "telegram_id": new_user.telegram_id,
            "telegram_username": new_user.telegram_username,
            "telegram_photo_url": new_user.telegram_photo_url,
            "wallet": new_user.wallet_address,
            "investment": 0,
            "profit": 0,
        }

        level_field = (
            f"level_{level}_users"
        )

        count_field = (
            f"level_{level}_count"
        )

        stored_users = (
            getattr(level_obj, level_field)
            or []
        )

        # ----------------------------------------------------
        # Detect existing wallet
        # ----------------------------------------------------

        existing_wallets = set()

        for stored_user in stored_users:

            if isinstance(stored_user, dict):

                wallet = stored_user.get(
                    "wallet"
                )

                if wallet:
                    existing_wallets.add(wallet)

            elif isinstance(stored_user, str):

                existing_wallets.add(
                    stored_user
                )

        # ----------------------------------------------------
        # Add only if not already present
        # ----------------------------------------------------

        if (
            new_user.wallet_address
            not in existing_wallets
        ):

            stored_users.append(
                user_data
            )

            setattr(
                level_obj,
                level_field,
                stored_users,
            )

            # count should reflect unique referrals
            unique_wallets = set()

            for item in stored_users:

                if isinstance(item, dict):

                    wallet = item.get("wallet")

                    if wallet:
                        unique_wallets.add(wallet)

                elif isinstance(item, str):

                    unique_wallets.add(item)

            setattr(
                level_obj,
                count_field,
                len(unique_wallets),
            )

            level_obj.save(
                update_fields=[
                    level_field,
                    count_field,
                ]
            )

            logger.info(
                "[LEVEL] Added user=%s "
                "to owner=%s level=%s count=%s",
                new_user.wallet_address,
                current.wallet_address,
                level,
                len(unique_wallets),
            )

        else:

            logger.info(
                "[LEVEL] duplicate blocked "
                "user=%s owner=%s level=%s",
                new_user.wallet_address,
                current.wallet_address,
                level,
            )

        current = current.inviter
        level += 1


# ============================================================
# Update referral investment
# ============================================================

def update_user_investment(
    user: AppUser,
    amount: Decimal,
):
    """
    بروزرسانی investment کاربر در referral levels.
    """

    current = user.inviter
    level = 1

    while current and level <= 5:

        level_obj = (
            ReferralLevel.objects
            .filter(user=current)
            .first()
        )

        if level_obj:

            level_field = (
                f"level_{level}_users"
            )

            users = (
                getattr(level_obj, level_field)
                or []
            )

            for i, item in enumerate(users):

                if not isinstance(item, dict):
                    continue

                if (
                    item.get("wallet")
                    == user.wallet_address
                ):

                    users[i]["investment"] = float(
                        amount
                    )

                    if (
                        user.telegram_username
                        and not user.telegram_username.startswith(
                            "browser_"
                        )
                    ):

                        users[i][
                            "telegram_username"
                        ] = user.telegram_username

                    users[i][
                        "telegram_id"
                    ] = user.telegram_id

                    users[i][
                        "telegram_photo_url"
                    ] = user.telegram_photo_url

                    break

            setattr(
                level_obj,
                level_field,
                users,
            )

            level_obj.save(
                update_fields=[level_field]
            )

        current = current.inviter
        level += 1


# ============================================================
# Update referral level profit
# ============================================================

def update_level_profit(
    user: AppUser,
    level: int,
    from_wallet: str,
    profit: Decimal,
):
    """
    بروزرسانی سود در referral levels.
    """

    level_obj = (
        ReferralLevel.objects
        .filter(user=user)
        .first()
    )

    if not level_obj:
        return

    level_field = (
        f"level_{level}_users"
    )

    users = (
        getattr(level_obj, level_field)
        or []
    )

    for i, item in enumerate(users):

        if not isinstance(item, dict):
            continue

        if item.get("wallet") == from_wallet:

            current_profit = Decimal(
                str(
                    item.get(
                        "profit",
                        0,
                    )
                )
            )

            users[i]["profit"] = float(
                current_profit + profit
            )

            break

    setattr(
        level_obj,
        level_field,
        users,
    )

    level_obj.save(
        update_fields=[level_field]
    )



# ============================================================
# Direct upline 5% purchase bonus
# ============================================================

@transaction.atomic
def credit_direct_upline_purchase_bonus(
    buyer: AppUser,
    bonus: Decimal,
    invoice_no: str,
    tx_hash: str,
    currency: str,
    is_test: bool = False,
):
    """
    Credit the direct inviter with the 5% purchase bonus and keep the
    Referral Tree profit column in sync with the real wallet balance.

    The Ledger invoice key makes the operation idempotent for the same
    purchase, so polling/retries cannot credit the same invoice twice.
    """

    if not buyer.inviter_id:
        logger.warning(
            "[UPLINE5] skipped: buyer=%s has no inviter",
            buyer.wallet_address,
        )
        return {
            "credited": False,
            "reason": "buyer_has_no_inviter",
        }

    bonus = Decimal(str(bonus))

    if bonus <= 0:
        logger.warning(
            "[UPLINE5] skipped non-positive bonus buyer=%s bonus=%s",
            buyer.wallet_address,
            bonus,
        )
        return {
            "credited": False,
            "reason": "invalid_bonus",
        }

    inviter = (
        AppUser.objects
        .select_for_update()
        .get(pk=buyer.inviter_id)
    )

    ensure_user_has_wallet(inviter)

    # Prevent the same purchase from paying the direct upline twice.
    already_credited = (
        Ledger.objects
        .filter(
            user=inviter,
            typ="DOWNLINE_PROFIT",
            meta__invoice=invoice_no,
        )
        .exists()
    )

    if already_credited:
        wallet = (
            Wallet.objects
            .select_for_update()
            .get(user=inviter)
        )

        logger.warning(
            "[UPLINE5] duplicate blocked invoice=%s buyer=%s inviter=%s balance=%s",
            invoice_no,
            buyer.wallet_address,
            inviter.wallet_address,
            wallet.downline_profit_instant,
        )

        return {
            "credited": False,
            "reason": "already_credited",
            "inviter": inviter.wallet_address,
            "bonus": str(bonus),
            "balance": str(wallet.downline_profit_instant or Decimal("0")),
        }

    wallet = (
        Wallet.objects
        .select_for_update()
        .get(user=inviter)
    )

    before = Decimal(
        str(
            wallet.downline_profit_instant
            or Decimal("0")
        )
    )

    after = before + bonus

    wallet.downline_profit_instant = after
    wallet.save(
        update_fields=[
            "downline_profit_instant",
            "updated_at",
        ]
    )

    Ledger.objects.create(
        user=inviter,
        typ="DOWNLINE_PROFIT",
        amount=bonus,
        meta={
            "from": buyer.wallet_address,
            "invoice": invoice_no,
            "tx": tx_hash,
            "currency": currency,
            "rate": "5%",
            "is_test": is_test,
        },
    )

    # This is the missing synchronization for Referrals.jsx.
    # It updates level_1_users[].profit for the direct inviter.
    update_level_profit(
        inviter,
        1,
        buyer.wallet_address,
        bonus,
    )

    logger.info(
        "[UPLINE5] CREDITED buyer=%s inviter=%s invoice=%s bonus=%s before=%s after=%s",
        buyer.wallet_address,
        inviter.wallet_address,
        invoice_no,
        bonus,
        before,
        after,
    )

    return {
        "credited": True,
        "inviter": inviter.wallet_address,
        "bonus": str(bonus),
        "balance_before": str(before),
        "balance_after": str(after),
    }

# ============================================================
# TON price
# ============================================================

def fetch_ton_usd_rate() -> Decimal:
    """
    دریافت قیمت TON/USD.
    """

    try:

        response = requests.get(
            COINGECKO_URL,
            timeout=10,
        )

        response.raise_for_status()

        data = response.json()

        rate = data[
            "the-open-network"
        ]["usd"]

        return Decimal(
            str(rate)
        )

    except Exception as exc:

        logger.error(
            "Failed to fetch TON rate: %s",
            exc,
        )

        return Decimal("2.5")


# ============================================================
# BNB price
# ============================================================

def fetch_bnb_usd_rate() -> Decimal:
    """
    دریافت قیمت BNB/USD.
    """

    try:

        response = requests.get(
            (
                "https://api.coingecko.com/api/v3/simple/price"
                "?ids=binancecoin&vs_currencies=usd"
            ),
            timeout=10,
        )

        response.raise_for_status()

        data = response.json()

        rate = data[
            "binancecoin"
        ]["usd"]

        return Decimal(
            str(rate)
        )

    except Exception as exc:

        logger.error(
            "Failed to fetch BNB rate: %s",
            exc,
        )

        return Decimal("600")


# ============================================================
# Register TON purchase
# ============================================================

@transaction.atomic
def register_purchase(
    user: AppUser,
    ton_amount: Decimal,
    ton_tx_hash: str,
    output_asset: str = "ECG",
    is_test: bool = False,
) -> Purchase:

    logger.info(
        "[BUY] start user=%s user_id=%s "
        "inviter_id=%s ton_amount=%s tx=%s",
        user.wallet_address,
        user.id,
        user.inviter_id,
        ton_amount,
        ton_tx_hash,
    )

    # --------------------------------------------------------
    # Duplicate TX protection
    # --------------------------------------------------------

    if (
        Purchase.objects
        .filter(
            ton_tx_hash=ton_tx_hash
        )
        .exists()
    ):

        logger.warning(
            "[BUY] duplicate tx=%s",
            ton_tx_hash,
        )

        raise ValueError(
            "TX already registered"
        )

    # --------------------------------------------------------
    # Calculate
    # --------------------------------------------------------

    rate = fetch_ton_usd_rate()

    usd_value = (
        ton_amount * rate
    )

    output_asset = (
        str(output_asset)
        .upper()
    )

    if output_asset not in {
        "ECG",
        "USDT",
    }:

        raise ValueError(
            "Invalid output asset"
        )

    ecg_value = (
        usd_value * ECG_PER_USD
    )

    if output_asset == "ECG":

        output_amount = (
            ecg_value
        )

    else:

        output_amount = (
            usd_value
        )

    self_bonus = (
        output_amount
        * SELF_BONUS_RATE
    )

    upline_bonus = (
        ecg_value
        * UPLINE_RATE
    )

    now = timezone.now()

    invoice_no = (
        uuid.uuid4()
        .hex[:12]
        .upper()
    )

    principal_unlock_at = (
        now
        + timezone.timedelta(
            days=365
        )
    )

    self_profit_unlock_at = (
        now
        + timezone.timedelta(
            days=30
        )
    )

    # --------------------------------------------------------
    # Purchase
    # --------------------------------------------------------

    purchase = Purchase.objects.create(
        user=user,
        invoice_no=invoice_no,
        ton_amount=ton_amount,
        ton_tx_hash=ton_tx_hash,
        ton_usd_rate=rate,
        usd_value=usd_value,
        ecg_value=ecg_value,
        output_asset=output_asset,
        output_amount=output_amount,
        profit_asset=output_asset,
        self_profit_5=self_bonus,
        principal_unlock_at=principal_unlock_at,
        self_profit_unlock_at=self_profit_unlock_at,
    )

    ensure_user_has_wallet(user)

    # --------------------------------------------------------
    # Add principal/profit
    # --------------------------------------------------------

    if output_asset == "ECG":

        (
            Wallet.objects
            .select_for_update()
            .filter(user=user)
            .update(
                principal_locked=(
                    F("principal_locked")
                    + output_amount
                ),
                self_profit_locked=(
                    F("self_profit_locked")
                    + self_bonus
                ),
            )
        )

    else:

        asset_balance, _ = (
            AssetBalance.objects
            .select_for_update()
            .get_or_create(
                user=user,
                asset="USDT",
            )
        )

        (
            AssetBalance.objects
            .filter(
                pk=asset_balance.pk
            )
            .update(
                principal_locked=(
                    F("principal_locked")
                    + output_amount
                ),
                profit_locked=(
                    F("profit_locked")
                    + self_bonus
                ),
            )
        )

    # --------------------------------------------------------
    # Ledger
    # --------------------------------------------------------

    Ledger.objects.create(
        user=user,
        typ="BUY_PRINCIPAL",
        amount=output_amount,
        meta={
            "invoice": invoice_no,
            "tx": ton_tx_hash,
            "currency": "TON",
            "asset": output_asset,
            "is_test": is_test,
        },
    )

    Ledger.objects.create(
        user=user,
        typ="BUY_SELF_PROFIT",
        amount=self_bonus,
        meta={
            "invoice": invoice_no,
            "tx": ton_tx_hash,
            "currency": "TON",
            "asset": output_asset,
            "is_test": is_test,
        },
    )

    # --------------------------------------------------------
    # Direct upline 5% purchase bonus
    # --------------------------------------------------------

    upline_result = credit_direct_upline_purchase_bonus(
        buyer=user,
        bonus=upline_bonus,
        invoice_no=invoice_no,
        tx_hash=ton_tx_hash,
        currency="TON",
        is_test=is_test,
    )

    logger.info(
        "[BUY] upline 5%% result: %s",
        upline_result,
    )

    update_user_investment(
        user,
        ton_amount,
    )

    level_obj = (
        ReferralLevel.objects
        .filter(user=user)
        .first()
    )

    if (
        level_obj
        and level_obj.level_5_count > 0
    ):

        distribute_level_5_purchase(
            user,
            ecg_value,
        )

    update_user_total_investment(
        user
    )

    return purchase


# ============================================================
# Register USDT purchase
# ============================================================

@transaction.atomic
def register_purchase_usdt(
    user: AppUser,
    usdt_amount: Decimal,
    usdt_tx_hash: str,
    is_test: bool = False,
) -> PurchaseUSDT:

    logger.info(
        "[BUY_USDT] start user=%s amount=%s tx=%s",
        user.wallet_address,
        usdt_amount,
        usdt_tx_hash,
    )

    if (
        PurchaseUSDT.objects
        .filter(
            usdt_tx_hash=usdt_tx_hash
        )
        .exists()
    ):

        raise ValueError(
            "TX already registered"
        )

    rate = Decimal("1")

    usd_value = (
        usdt_amount * rate
    )

    ecg_value = (
        usd_value * ECG_PER_USD
    )

    self_bonus = (
        ecg_value
        * SELF_BONUS_RATE
    )

    upline_bonus = (
        ecg_value
        * UPLINE_RATE
    )

    now = timezone.now()

    invoice_no = (
        uuid.uuid4()
        .hex[:12]
        .upper()
    )

    principal_unlock_at = (
        now
        + timezone.timedelta(
            days=365
        )
    )

    self_profit_unlock_at = (
        now
        + timezone.timedelta(
            days=30
        )
    )

    purchase = (
        PurchaseUSDT.objects.create(
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
    )

    ensure_user_has_wallet(user)

    (
        Wallet.objects
        .select_for_update()
        .filter(user=user)
        .update(
            principal_locked=(
                F("principal_locked")
                + ecg_value
            ),
            self_profit_locked=(
                F("self_profit_locked")
                + self_bonus
            ),
        )
    )

    Ledger.objects.create(
        user=user,
        typ="BUY_PRINCIPAL",
        amount=ecg_value,
        meta={
            "invoice": invoice_no,
            "tx": usdt_tx_hash,
            "currency": "USDT",
            "is_test": is_test,
        },
    )

    Ledger.objects.create(
        user=user,
        typ="BUY_SELF_PROFIT",
        amount=self_bonus,
        meta={
            "invoice": invoice_no,
            "tx": usdt_tx_hash,
            "currency": "USDT",
            "is_test": is_test,
        },
    )

    upline_result = credit_direct_upline_purchase_bonus(
        buyer=user,
        bonus=upline_bonus,
        invoice_no=invoice_no,
        tx_hash=usdt_tx_hash,
        currency="USDT",
        is_test=is_test,
    )

    logger.info(
        "[REGISTER_PURCHASE_USDT] upline 5%% result: %s",
        upline_result,
    )

    update_user_investment(
        user,
        usdt_amount,
    )

    level_obj = (
        ReferralLevel.objects
        .filter(user=user)
        .first()
    )

    if (
        level_obj
        and level_obj.level_5_count > 0
    ):

        distribute_level_5_purchase(
            user,
            ecg_value,
        )

    update_user_total_investment(
        user
    )

    return purchase


# ============================================================
# Register BNB purchase
# ============================================================

@transaction.atomic
def register_purchase_bnb(
    user: AppUser,
    bnb_amount: Decimal,
    bnb_tx_hash: str,
    is_test: bool = False,
) -> PurchaseBNB:

    logger.info(
        "[BUY_BNB] start user=%s amount=%s tx=%s",
        user.wallet_address,
        bnb_amount,
        bnb_tx_hash,
    )

    if (
        PurchaseBNB.objects
        .filter(
            bnb_tx_hash=bnb_tx_hash
        )
        .exists()
    ):

        raise ValueError(
            "TX already registered"
        )

    rate = fetch_bnb_usd_rate()

    usd_value = (
        bnb_amount * rate
    )

    ecg_value = (
        usd_value * ECG_PER_USD
    )

    self_bonus = (
        ecg_value
        * SELF_BONUS_RATE
    )

    upline_bonus = (
        ecg_value
        * UPLINE_RATE
    )

    now = timezone.now()

    invoice_no = (
        uuid.uuid4()
        .hex[:12]
        .upper()
    )

    principal_unlock_at = (
        now
        + timezone.timedelta(
            days=365
        )
    )

    self_profit_unlock_at = (
        now
        + timezone.timedelta(
            days=30
        )
    )

    purchase = (
        PurchaseBNB.objects.create(
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
    )

    ensure_user_has_wallet(user)

    (
        Wallet.objects
        .select_for_update()
        .filter(user=user)
        .update(
            principal_locked=(
                F("principal_locked")
                + ecg_value
            ),
            self_profit_locked=(
                F("self_profit_locked")
                + self_bonus
            ),
        )
    )

    Ledger.objects.create(
        user=user,
        typ="BUY_PRINCIPAL",
        amount=ecg_value,
        meta={
            "invoice": invoice_no,
            "tx": bnb_tx_hash,
            "currency": "BNB",
            "is_test": is_test,
        },
    )

    Ledger.objects.create(
        user=user,
        typ="BUY_SELF_PROFIT",
        amount=self_bonus,
        meta={
            "invoice": invoice_no,
            "tx": bnb_tx_hash,
            "currency": "BNB",
            "is_test": is_test,
        },
    )

    upline_result = credit_direct_upline_purchase_bonus(
        buyer=user,
        bonus=upline_bonus,
        invoice_no=invoice_no,
        tx_hash=bnb_tx_hash,
        currency="BNB",
        is_test=is_test,
    )

    logger.info(
        "[REGISTER_PURCHASE_BNB] upline 5%% result: %s",
        upline_result,
    )

    update_user_investment(
        user,
        bnb_amount,
    )

    level_obj = (
        ReferralLevel.objects
        .filter(user=user)
        .first()
    )

    if (
        level_obj
        and level_obj.level_5_count > 0
    ):

        distribute_level_5_purchase(
            user,
            ecg_value,
        )

    update_user_total_investment(
        user
    )

    return purchase


# ============================================================
# ECG -> TON
# ============================================================

def ecg_to_ton(
    ecg_amount: Decimal,
) -> Decimal:

    rate = fetch_ton_usd_rate()

    ecg_per_ton = (
        rate * ECG_PER_USD
    )

    return (
        ecg_amount
        / ecg_per_ton
    ).quantize(
        Decimal("0.000000001"),
        rounding=ROUND_DOWN,
    )


# ============================================================
# Level 5 purchase distribution
# ============================================================

def distribute_level_5_purchase(
    user: AppUser,
    purchase_amount: Decimal,
):
    """
    پرداخت 0.01 ECG به چهار upline در شرایط Level 5.
    """

    logger.info(
        "[LEVEL5] Distributing purchase for user %s",
        user.wallet_address,
    )

    level_obj = (
        ReferralLevel.objects
        .filter(user=user)
        .first()
    )

    if (
        not level_obj
        or level_obj.level_5_count == 0
    ):

        logger.info(
            "[LEVEL5] User %s is not level 5",
            user.wallet_address,
        )

        return

    current = user.inviter
    level = 1

    bonus = Decimal("0.01")

    while (
        current
        and level <= 4
    ):

        with transaction.atomic():

            ensure_user_has_wallet(
                current
            )

            Wallet.objects.filter(
                user=current
            ).update(
                referral_bonus=(
                    F("referral_bonus")
                    + bonus
                )
            )

            Ledger.objects.create(
                user=current,
                typ="LEVEL5_BONUS",
                amount=bonus,
                meta={
                    "from": user.wallet_address,
                    "level": level,
                    "purchase_amount": str(
                        purchase_amount
                    ),
                    "timestamp": str(
                        timezone.now()
                    ),
                },
            )

            update_level_profit(
                current,
                level,
                user.wallet_address,
                bonus,
            )

            logger.info(
                "[LEVEL5] Bonus %s given to "
                "level %s user %s",
                bonus,
                level,
                current.wallet_address,
            )

        current = current.inviter
        level += 1

    if level <= 4:

        logger.info(
            "[LEVEL5] Only %s upline levels found",
            level - 1,
        )


# ============================================================
# Total investment
# ============================================================

def update_user_total_investment(
    user: AppUser,
):

    total_purchase_ton = (
        Purchase.objects
        .filter(user=user)
        .aggregate(
            total=Sum("ecg_value")
        )["total"]
        or Decimal("0")
    )

    total_purchase_usdt = (
        PurchaseUSDT.objects
        .filter(user=user)
        .aggregate(
            total=Sum("ecg_value")
        )["total"]
        or Decimal("0")
    )

    total_purchase_bnb = (
        PurchaseBNB.objects
        .filter(user=user)
        .aggregate(
            total=Sum("ecg_value")
        )["total"]
        or Decimal("0")
    )

    total_investment = (
        total_purchase_ton
        + total_purchase_usdt
        + total_purchase_bnb
    )

    user.total_investment = (
        total_investment
    )

    user.save(
        update_fields=[
            "total_investment"
        ]
    )

    logger.info(
        "✅ Updated total_investment for %s: %s",
        user.wallet_address,
        total_investment,
    )

    return total_investment


# ============================================================
# Total earned
# ============================================================

def update_user_total_earned(
    user: AppUser,
):

    total_earned = (
        Ledger.objects
        .filter(
            user=user,
            typ__in=[
                "DAILY_UNLOCK",
                "SELF_PROFIT_UNLOCK",
                "DOWNLINE_PROFIT",
                "REF_BONUS",
                "LEVEL5_BONUS",
            ],
        )
        .aggregate(
            total=Sum("amount")
        )["total"]
        or Decimal("0")
    )

    user.total_earned = (
        total_earned
    )

    user.save(
        update_fields=[
            "total_earned"
        ]
    )

    logger.info(
        "✅ Updated total_earned for %s: %s",
        user.wallet_address,
        total_earned,
    )

    return total_earned