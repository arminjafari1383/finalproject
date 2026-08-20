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
INDIRECT_UPLINE_RATE = Decimal("0.01")

REFERRAL_TOKEN_REWARD = Decimal("3")

COINGECKO_URL = (
    "https://api.coingecko.com/api/v3/simple/price"
    "?ids=the-open-network&vs_currencies=usd"
)


# ============================================================
# Wallet helper
# ============================================================

def ensure_user_has_wallet(user: AppUser) -> Wallet:
    """Return the user wallet, creating it only when it is genuinely missing."""

    wallet, created = Wallet.objects.get_or_create(user=user)

    if created:
        logger.info(
            "✅ Wallet created for user %s",
            user.wallet_address,
        )

    return wallet


# ============================================================
# Get/Create user
# ============================================================

USER_ACTIVITY_WRITE_INTERVAL = timezone.timedelta(minutes=5)


def _activity_fields(user: AppUser):
    """
    Avoid turning every GET request into a SQLite WRITE.
    last_active is persisted at most once every five minutes.
    """
    now = timezone.now()
    fields = []

    if not user.is_active:
        user.is_active = True
        fields.append("is_active")

    if (
        user.last_active is None
        or now - user.last_active >= USER_ACTIVITY_WRITE_INTERVAL
    ):
        user.last_active = now
        fields.append("last_active")

    return fields


def _sync_replaced_wallet_in_referral_tree(
    user: AppUser,
    old_wallet: str,
    new_wallet: str,
):
    """
    Keep ReferralLevel JSON snapshots in sync when the same AppUser replaces
    their connected wallet address.

    The real relational data (Wallet, Purchase, Ledger, inviter, etc.) stays
    attached to the same AppUser primary key and is not recreated.
    """
    old_wallet = str(old_wallet or "").strip()
    new_wallet = str(new_wallet or "").strip()

    if not old_wallet or not new_wallet or old_wallet == new_wallet:
        return

    current = user.inviter
    level = 1

    while current and level <= 5:
        level_obj = (
            ReferralLevel.objects
            .select_for_update()
            .filter(user=current)
            .first()
        )

        if level_obj:
            level_field = f"level_{level}_users"
            stored_users = list(getattr(level_obj, level_field) or [])
            changed = False

            for index, item in enumerate(stored_users):
                # Legacy representation: the entry itself is a wallet string.
                if isinstance(item, str):
                    if item == old_wallet:
                        stored_users[index] = new_wallet
                        changed = True
                    continue

                if not isinstance(item, dict):
                    continue

                item_wallet = item.get("wallet")
                item_telegram_id = item.get("telegram_id")

                same_old_wallet = item_wallet == old_wallet
                same_telegram_user = (
                    user.telegram_id is not None
                    and item_telegram_id is not None
                    and str(item_telegram_id) == str(user.telegram_id)
                )

                if not (same_old_wallet or same_telegram_user):
                    continue

                updated_item = dict(item)
                updated_item["wallet"] = new_wallet
                updated_item["telegram_id"] = user.telegram_id
                updated_item["telegram_username"] = user.telegram_username
                updated_item["telegram_photo_url"] = user.telegram_photo_url
                stored_users[index] = updated_item
                changed = True

            if changed:
                setattr(level_obj, level_field, stored_users)
                # Count does not change: this is the same referral identity.
                level_obj.save(update_fields=[level_field])

                logger.info(
                    "[WALLET_REPLACE] referral snapshot updated "
                    "user_id=%s owner_id=%s level=%s old=%s new=%s",
                    user.id,
                    current.id,
                    level,
                    old_wallet,
                    new_wallet,
                )

        current = current.inviter
        level += 1


def get_or_create_user(
    wallet_address: str,
    telegram_id: int = None,
    is_telegram: bool = False,
) -> AppUser:
    """
    Telegram ID is the primary identity.

    Wallet locking/replacement restrictions are disabled:
    - the same Telegram user may connect a different wallet at any time;
    - no replace_wallet / previous_wallet flag is required;
    - wallet_locked is always kept False;
    - the same AppUser row is preserved, therefore balances, purchases,
      ledgers, inviter and other FK-related data remain attached to the user.

    We still reject a wallet that is already attached to a DIFFERENT AppUser.
    That collision guard prevents two user rows from sharing/stealing the same
    wallet identity and also avoids DB unique-constraint failures if the model
    defines wallet_address as unique.
    """
    wallet_address = str(wallet_address or "").strip()

    if telegram_id is not None:
        telegram_id = int(telegram_id)

    logger.info(
        "[USER_CONNECT_UNLOCKED] wallet=%s telegram_id=%s is_telegram=%s",
        wallet_address,
        telegram_id,
        is_telegram,
    )

    if not wallet_address:
        raise ValueError("wallet_address required")

    # ------------------------------------------------------------------
    # No Telegram identity: keep browser-wallet behavior.
    # ------------------------------------------------------------------
    if not telegram_id:
        user = (
            AppUser.objects
            .filter(wallet_address=wallet_address)
            .first()
        )

        if user:
            update_fields = _activity_fields(user)

            if user.wallet_locked:
                user.wallet_locked = False
                update_fields.append("wallet_locked")

            if (
                not user.telegram_username
                or user.telegram_username.startswith("browser_")
            ):
                user.telegram_username = f"user_{wallet_address[:8]}"
                update_fields.append("telegram_username")

            if update_fields:
                user.save(update_fields=list(dict.fromkeys(update_fields)))

            ensure_user_has_wallet(user)
            return user

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

        ensure_user_has_wallet(user)
        return user

    # ------------------------------------------------------------------
    # Telegram identity is the main account identity.
    # ------------------------------------------------------------------
    existing_user_by_telegram = (
        AppUser.objects
        .filter(telegram_id=telegram_id)
        .first()
    )

    if existing_user_by_telegram:
        with transaction.atomic():
            user = (
                AppUser.objects
                .select_for_update()
                .get(pk=existing_user_by_telegram.pk)
            )

            old_wallet = str(user.wallet_address or "").strip()

            # Collision guard only. This is NOT a replacement/lock restriction.
            wallet_owner = (
                AppUser.objects
                .select_for_update()
                .filter(wallet_address=wallet_address)
                .exclude(pk=user.pk)
                .first()
            )

            if wallet_owner:
                raise ValueError(
                    "This wallet is already used by another account."
                )

            update_fields = _activity_fields(user)

            if old_wallet != wallet_address:
                user.wallet_address = wallet_address
                update_fields.append("wallet_address")

            # Wallet locking is disabled completely.
            if user.wallet_locked:
                user.wallet_locked = False
                update_fields.append("wallet_locked")

            if is_telegram:
                if not user.is_telegram_user:
                    user.is_telegram_user = True
                    update_fields.append("is_telegram_user")

                if not user.telegram_verified:
                    user.telegram_verified = True
                    update_fields.append("telegram_verified")

            if (
                not user.telegram_username
                or user.telegram_username.startswith("browser_")
            ):
                user.telegram_username = (
                    str(telegram_id)
                    if is_telegram
                    else f"user_{wallet_address[:8]}"
                )
                update_fields.append("telegram_username")

            if update_fields:
                user.save(update_fields=list(dict.fromkeys(update_fields)))

            ensure_user_has_wallet(user)

            if old_wallet and old_wallet != wallet_address:
                _sync_replaced_wallet_in_referral_tree(
                    user=user,
                    old_wallet=old_wallet,
                    new_wallet=wallet_address,
                )

                logger.warning(
                    "[WALLET_AUTO_CHANGED] user_id=%s telegram_id=%s old=%s new=%s",
                    user.id,
                    telegram_id,
                    old_wallet,
                    wallet_address,
                )

            return user

    # ------------------------------------------------------------------
    # Telegram user does not exist yet. The wallet may be a browser-created
    # row. Claim that row only if it has no different Telegram identity.
    # ------------------------------------------------------------------
    existing_user_by_wallet = (
        AppUser.objects
        .filter(wallet_address=wallet_address)
        .first()
    )

    if existing_user_by_wallet:
        if (
            existing_user_by_wallet.telegram_id
            and existing_user_by_wallet.telegram_id != telegram_id
        ):
            raise ValueError(
                "This wallet is already used by another account."
            )

        user = existing_user_by_wallet
        update_fields = _activity_fields(user)

        user.telegram_id = telegram_id
        user.is_telegram_user = True
        user.telegram_verified = True
        user.wallet_locked = False

        update_fields.extend([
            "telegram_id",
            "is_telegram_user",
            "telegram_verified",
            "wallet_locked",
        ])

        if (
            not user.telegram_username
            or user.telegram_username.startswith("browser_")
        ):
            user.telegram_username = (
                str(telegram_id)
                if is_telegram
                else f"user_{wallet_address[:8]}"
            )
            update_fields.append("telegram_username")

        user.save(update_fields=list(dict.fromkeys(update_fields)))
        ensure_user_has_wallet(user)
        return user

    # ------------------------------------------------------------------
    # Completely new Telegram user.
    # ------------------------------------------------------------------
    user = AppUser.objects.create(
        wallet_address=wallet_address,
        telegram_id=telegram_id,
        is_telegram_user=True,
        telegram_verified=True,
        wallet_locked=False,
        is_active=True,
        is_admin=False,
        telegram_username=(
            str(telegram_id)
            if is_telegram
            else f"user_{wallet_address[:8]}"
        ),
    )

    ensure_user_has_wallet(user)
    return user


# ============================================================
# Referral
# ============================================================

def apply_referral(
    inviter_code: str,
    user: AppUser,
):
    """
    Attach an inviter once and update the referral tree atomically.

    Important for SQLite: resolve the inviter before opening the write
    transaction, then make the first transactional query an UPDATE.
    This avoids the common DEFERRED read->write lock-upgrade race.
    """

    logger.info(
        "[REF] apply inviter_code=%s user=%s",
        inviter_code,
        user.wallet_address,
    )

    inviter = (
        AppUser.objects
        .filter(referral_code=inviter_code)
        .first()
    )

    if not inviter:
        logger.warning("[REF] invalid inviter_code=%s", inviter_code)
        return

    if inviter.id == user.id:
        logger.warning("[REF] self referral blocked user_id=%s", user.id)
        return

    with transaction.atomic():
        # Idempotent claim. If another /connect/ already attached an inviter,
        # this UPDATE affects zero rows and we do not duplicate level/bonus work.
        attached = (
            AppUser.objects
            .filter(pk=user.pk, inviter__isnull=True)
            .update(inviter=inviter)
        )

        if not attached:
            logger.info(
                "[REF] skipped: inviter already set user=%s",
                user.id,
            )
            return

        user.inviter = inviter

        update_referral_levels(user, inviter)
        give_referral_bonus(inviter, user)

        logger.info(
            "[REF] success user=%s inviter=%s",
            user.id,
            inviter.id,
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

        # ----------------------------------------------------
        # User data
        # ----------------------------------------------------

        user_data = {
            "telegram_id": new_user.telegram_id,
            "telegram_username": new_user.telegram_username,
            "telegram_photo_url": new_user.telegram_photo_url,
            "wallet": new_user.wallet_address,
            "investment": 0,
            # Backward-compatible aggregate/default field. New UI uses
            # the two asset-specific fields below.
            "profit": 0,
            "profit_ecg": 0,
            "profit_usdt": 0,
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

                    current_investment = Decimal(
                        str(
                            users[i].get(
                                "investment",
                                0,
                            )
                        )
                    )

                    # Referral Tree shows the user's cumulative investment.
                    users[i]["investment"] = float(
                        current_investment + Decimal(str(amount))
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
    asset: str = "ECG",
):
    """
    Update the Referral Tree row using separate ECG and USDT profit fields.

    Existing rows that only have the legacy ``profit`` field are treated as
    ECG for backward compatibility.
    """

    level_obj = (
        ReferralLevel.objects
        .filter(user=user)
        .first()
    )

    if not level_obj:
        return

    asset = str(asset or "ECG").upper()
    if asset not in {"ECG", "USDT"}:
        asset = "ECG"

    level_field = f"level_{level}_users"
    users = getattr(level_obj, level_field) or []
    field_name = "profit_usdt" if asset == "USDT" else "profit_ecg"

    for i, item in enumerate(users):
        if not isinstance(item, dict):
            continue

        if item.get("wallet") == from_wallet:
            # Migrate old rows lazily: the historical single ``profit`` value
            # belongs to ECG unless an explicit asset marker says otherwise.
            legacy_profit = Decimal(str(item.get("profit", 0) or 0))
            legacy_asset = str(item.get("profit_asset", "ECG") or "ECG").upper()

            if "profit_ecg" not in item:
                item["profit_ecg"] = float(
                    legacy_profit if legacy_asset == "ECG" else Decimal("0")
                )

            if "profit_usdt" not in item:
                item["profit_usdt"] = float(
                    legacy_profit if legacy_asset == "USDT" else Decimal("0")
                )

            current_profit = Decimal(str(item.get(field_name, 0) or 0))
            item[field_name] = float(current_profit + Decimal(str(profit)))

            # Keep legacy ``profit`` synced to ECG so old clients do not break.
            item["profit"] = float(Decimal(str(item.get("profit_ecg", 0) or 0)))
            users[i] = item
            break

    setattr(level_obj, level_field, users)
    level_obj.save(update_fields=[level_field])



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
    profit_asset: str = "ECG",
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

    profit_asset = str(profit_asset or "ECG").upper()
    if profit_asset not in {"ECG", "USDT"}:
        profit_asset = "ECG"

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
        if profit_asset == "USDT":
            asset_balance, _ = AssetBalance.objects.get_or_create(
                user=inviter,
                asset="USDT",
            )
            current_balance = asset_balance.profit_unlocked or Decimal("0")
        else:
            wallet = (
                Wallet.objects
                .select_for_update()
                .get(user=inviter)
            )
            current_balance = wallet.downline_profit_instant or Decimal("0")

        logger.warning(
            "[UPLINE5] duplicate blocked invoice=%s buyer=%s inviter=%s asset=%s balance=%s",
            invoice_no,
            buyer.wallet_address,
            inviter.wallet_address,
            profit_asset,
            current_balance,
        )

        return {
            "credited": False,
            "reason": "already_credited",
            "inviter": inviter.wallet_address,
            "bonus": str(bonus),
            "asset": profit_asset,
            "balance": str(current_balance),
        }

    if profit_asset == "USDT":
        asset_balance, _ = (
            AssetBalance.objects
            .select_for_update()
            .get_or_create(user=inviter, asset="USDT")
        )
        before = Decimal(str(asset_balance.profit_unlocked or Decimal("0")))
        after = before + bonus
        asset_balance.profit_unlocked = after
        asset_balance.save(update_fields=["profit_unlocked", "updated_at"])
    else:
        wallet = (
            Wallet.objects
            .select_for_update()
            .get(user=inviter)
        )
        before = Decimal(
            str(wallet.downline_profit_instant or Decimal("0"))
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
            "asset": profit_asset,
            "level": 1,
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
        asset=profit_asset,
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
# Indirect uplines: Level 2 -> Level 5 = 1% each
# ============================================================

@transaction.atomic
def credit_indirect_upline_purchase_bonuses(
    buyer: AppUser,
    purchase_ecg_value: Decimal,
    invoice_no: str,
    tx_hash: str,
    currency: str,
    is_test: bool = False,
    profit_asset: str = "ECG",
    purchase_profit_value: Decimal = None,
):
    """
    Credit 1% of the purchase ECG value to each indirect upline
    from referral Level 2 through Level 5.

    Each level is idempotent per invoice, and ReferralLevel.profit is
    updated for the exact downline row shown in Referrals.jsx.
    """

    purchase_ecg_value = Decimal(str(purchase_ecg_value))
    profit_asset = str(profit_asset or "ECG").upper()
    if profit_asset not in {"ECG", "USDT"}:
        profit_asset = "ECG"

    profit_base = (
        Decimal(str(purchase_profit_value))
        if purchase_profit_value is not None
        else purchase_ecg_value
    )

    if profit_base <= 0:
        return []

    # Level 1 is handled by credit_direct_upline_purchase_bonus (5%).
    direct_inviter = buyer.inviter
    current = direct_inviter.inviter if direct_inviter else None
    level = 2
    results = []

    while current and level <= 5:
        bonus = (profit_base * INDIRECT_UPLINE_RATE)

        ensure_user_has_wallet(current)

        already_credited = (
            Ledger.objects
            .filter(
                user=current,
                typ="DOWNLINE_PROFIT",
                meta__invoice=invoice_no,
                meta__level=level,
            )
            .exists()
        )

        if already_credited:
            results.append({
                "level": level,
                "credited": False,
                "reason": "already_credited",
                "upline": current.wallet_address,
            })
            current = current.inviter
            level += 1
            continue

        if profit_asset == "USDT":
            asset_balance, _ = (
                AssetBalance.objects
                .select_for_update()
                .get_or_create(user=current, asset="USDT")
            )
            before = Decimal(str(asset_balance.profit_unlocked or Decimal("0")))
            after = before + bonus
            asset_balance.profit_unlocked = after
            asset_balance.save(update_fields=["profit_unlocked", "updated_at"])
        else:
            wallet = (
                Wallet.objects
                .select_for_update()
                .get(user=current)
            )
            before = Decimal(
                str(wallet.downline_profit_instant or Decimal("0"))
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
            user=current,
            typ="DOWNLINE_PROFIT",
            amount=bonus,
            meta={
                "from": buyer.wallet_address,
                "invoice": invoice_no,
                "tx": tx_hash,
                "currency": currency,
                "asset": profit_asset,
                "level": level,
                "rate": "1%",
                "is_test": is_test,
            },
        )

        update_level_profit(
            current,
            level,
            buyer.wallet_address,
            bonus,
            asset=profit_asset,
        )

        logger.info(
            "[UPLINE1] CREDITED buyer=%s upline=%s level=%s "
            "invoice=%s bonus=%s before=%s after=%s",
            buyer.wallet_address,
            current.wallet_address,
            level,
            invoice_no,
            bonus,
            before,
            after,
        )

        results.append({
            "level": level,
            "credited": True,
            "upline": current.wallet_address,
            "bonus": str(bonus),
            "balance_before": str(before),
            "balance_after": str(after),
        })

        current = current.inviter
        level += 1

    return results


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
        output_amount
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
        profit_asset=output_asset,
    )

    logger.info(
        "[BUY] upline 5%% result: %s",
        upline_result,
    )

    update_user_investment(
        user,
        ton_amount,
    )

    indirect_results = credit_indirect_upline_purchase_bonuses(
        buyer=user,
        purchase_ecg_value=ecg_value,
        invoice_no=invoice_no,
        tx_hash=ton_tx_hash,
        currency="TON",
        is_test=is_test,
        profit_asset=output_asset,
        purchase_profit_value=output_amount,
    )

    logger.info(
        "[BUY] indirect upline 1%% results: %s",
        indirect_results,
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

    indirect_results = credit_indirect_upline_purchase_bonuses(
        buyer=user,
        purchase_ecg_value=ecg_value,
        invoice_no=invoice_no,
        tx_hash=usdt_tx_hash,
        currency="USDT",
        is_test=is_test,
    )

    logger.info(
        "[REGISTER_PURCHASE_USDT] indirect upline 1%% results: %s",
        indirect_results,
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

    indirect_results = credit_indirect_upline_purchase_bonuses(
        buyer=user,
        purchase_ecg_value=ecg_value,
        invoice_no=invoice_no,
        tx_hash=bnb_tx_hash,
        currency="BNB",
        is_test=is_test,
    )

    logger.info(
        "[REGISTER_PURCHASE_BNB] indirect upline 1%% results: %s",
        indirect_results,
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