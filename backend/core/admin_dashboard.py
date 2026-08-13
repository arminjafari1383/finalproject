# backend/core/admin_dashboard.py

import os
import secrets
from decimal import Decimal

import requests

from django.db.models import Count, Sum

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import (
    AppUser,
    AssetBalance,
    Ledger,
    Purchase,
    Wallet,
    WithdrawRequest,
)


# =========================================================
# ابزارهای کمکی
# =========================================================

def _money(value):
    """
    تبدیل Decimal و مقدار None به رشته مناسب برای JSON.
    """
    return str(
        value
        if value is not None
        else Decimal("0")
    )


def _admin_allowed(request):
    """
    دسترسی فقط با ADMIN_DASHBOARD_TOKEN کنترل می‌شود.
    """
    configured_token = os.getenv(
        "ADMIN_DASHBOARD_TOKEN",
        "",
    ).strip()

    supplied_token = request.headers.get(
        "X-Admin-Token",
        "",
    ).strip()

    if not configured_token:
        return False

    if not supplied_token:
        return False

    return secrets.compare_digest(
        supplied_token,
        configured_token,
    )


# =========================================================
# موجودی کیف پول اصلی TON
# =========================================================

def _treasury_balance():
    address = os.getenv(
        "TREASURY_TON_ADDRESS",
        "",
    ).strip()

    if not address:
        return {
            "address": "",
            "balance_ton": None,
            "minimum_ton": "100",
            "low_balance": None,
            "error": (
                "TREASURY_TON_ADDRESS "
                "is not configured"
            ),
        }

    headers = {}

    api_key = os.getenv(
        "TONCENTER_API_KEY",
        "",
    ).strip()

    if api_key:
        headers["X-API-Key"] = api_key

    try:
        response = requests.get(
            (
                "https://toncenter.com/api/v2/"
                "getAddressBalance"
            ),
            params={
                "address": address,
            },
            headers=headers,
            timeout=12,
        )

        response.raise_for_status()

        result = response.json().get(
            "result",
            "0",
        )

        balance = (
            Decimal(str(result))
            / Decimal("1000000000")
        )

        return {
            "address": address,
            "balance_ton": str(balance),
            "minimum_ton": "100",
            "low_balance": (
                balance < Decimal("100")
            ),
            "error": "",
        }

    except Exception as exc:
        return {
            "address": address,
            "balance_ton": None,
            "minimum_ton": "100",
            "low_balance": None,
            "error": str(exc),
        }


# =========================================================
# صفحه مدیریت کامل سیستم
# =========================================================

@api_view(["GET"])
def admin_system_dashboard(request):
    if not _admin_allowed(request):
        return Response(
            {
                "error": "Admin access denied.",
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    # -----------------------------------------------------
    # QuerySets
    # -----------------------------------------------------

    users_qs = (
        AppUser.objects
        .select_related(
            "wallet",
            "inviter",
        )
        .prefetch_related(
            "asset_balances",
        )
        .annotate(
            referral_count=Count(
                "invitees",
                distinct=True,
            )
        )
        .order_by("-created_at")
    )

    purchases_qs = (
        Purchase.objects
        .select_related("user")
        .order_by("-created_at")
    )

    withdraws_qs = (
        WithdrawRequest.objects
        .select_related("user")
        .order_by("-created_at")
    )

    # -----------------------------------------------------
    # اطلاعات کاربران
    # -----------------------------------------------------

    users = []

    for user in users_qs[:500]:
        wallet = getattr(
            user,
            "wallet",
            None,
        )

        usdt = None

        for asset_balance in (
            user.asset_balances.all()
        ):
            if (
                asset_balance.asset
                == "USDT"
            ):
                usdt = asset_balance
                break

        # پاداش دعوت
        referral_bonus = (
            wallet.referral_bonus
            if wallet
            else Decimal("0")
        )

        # پاداش روزانه قفل‌شده
        daily_locked = (
            wallet.daily_reward_locked
            if wallet
            else Decimal("0")
        )

        # پاداش روزانه آزادشده
        daily_unlocked = (
            wallet.daily_reward_unlocked
            if wallet
            else Decimal("0")
        )

        # مجموع موجودی پاداش روزانه
        daily_total = (
            daily_locked
            + daily_unlocked
        )

        # سود شخصی
        self_profit_locked = (
            wallet.self_profit_locked
            if wallet
            else Decimal("0")
        )

        self_profit_unlocked = (
            wallet.self_profit_unlocked
            if wallet
            else Decimal("0")
        )

        # اصل سرمایه
        principal_locked = (
            wallet.principal_locked
            if wallet
            else Decimal("0")
        )

        principal_unlocked = (
            wallet.principal_unlocked
            if wallet
            else Decimal("0")
        )

        # سود زیرمجموعه
        downline_profit = (
            wallet.downline_profit_instant
            if wallet
            else Decimal("0")
        )

        # موجودی ECG قفل‌شده
        locked_ecg = (
            daily_locked
            + self_profit_locked
            + principal_locked
        )

        users.append({
            "id": user.id,

            "telegram_id": (
                user.telegram_id
            ),

            "username": (
                user.telegram_username
            ),

            "photo": (
                user.telegram_photo_url
            ),

            "wallet_address": (
                user.wallet_address
            ),

            "referral_code": (
                user.referral_code
            ),

            "inviter": (
                user.inviter.telegram_username
                if user.inviter
                else None
            ),

            "inviter_wallet": (
                user.inviter.wallet_address
                if user.inviter
                else None
            ),

            # تعداد زیرمجموعه مستقیم
            "referral_count": (
                user.referral_count
            ),

            "is_active": user.is_active,

            "last_active": (
                user.last_active
            ),

            "created_at": (
                user.created_at
            ),

            "total_investment": _money(
                user.total_investment
            ),

            "total_earned": _money(
                user.total_earned
            ),

            # پاداش ۳ ECG رفرال
            "referral_bonus": _money(
                referral_bonus
            ),

            # پاداش روزانه
            "daily_reward_locked": _money(
                daily_locked
            ),

            "daily_reward_unlocked": _money(
                daily_unlocked
            ),

            "daily_reward_total": _money(
                daily_total
            ),

            # سود شخصی
            "self_profit_locked": _money(
                self_profit_locked
            ),

            "self_profit_unlocked": _money(
                self_profit_unlocked
            ),

            # اصل سرمایه
            "principal_locked": _money(
                principal_locked
            ),

            "principal_unlocked": _money(
                principal_unlocked
            ),

            # سود زیرمجموعه
            "downline_profit": _money(
                downline_profit
            ),

            # موجودی ECG
            "withdrawable_ecg": (
                _money(
                    wallet.withdrawable_total()
                )
                if wallet
                else "0"
            ),

            "locked_ecg": _money(
                locked_ecg
            ),

            # موجودی USDT
            "withdrawable_usdt": (
                _money(
                    usdt.withdrawable_total()
                )
                if usdt
                else "0"
            ),

            "locked_usdt": (
                _money(
                    usdt.principal_locked
                    + usdt.profit_locked
                )
                if usdt
                else "0"
            ),
        })

    # -----------------------------------------------------
    # فهرست خریدها
    # -----------------------------------------------------

    purchases = []

    for item in purchases_qs[:500]:
        purchases.append({
            "id": item.id,

            "invoice_no": (
                item.invoice_no
            ),

            "username": (
                item.user.telegram_username
            ),

            "wallet_address": (
                item.user.wallet_address
            ),

            "ton_amount": _money(
                item.ton_amount
            ),

            "ton_usd_rate": _money(
                item.ton_usd_rate
            ),

            "usd_value": _money(
                item.usd_value
            ),

            "ecg_value": _money(
                item.ecg_value
            ),

            "output_asset": (
                item.output_asset
            ),

            "output_amount": _money(
                item.output_amount
            ),

            "profit_asset": (
                item.profit_asset
            ),

            "self_profit_5": _money(
                item.self_profit_5
            ),

            "tx_hash": (
                item.ton_tx_hash
            ),

            "principal_unlock_at": (
                item.principal_unlock_at
            ),

            "self_profit_unlock_at": (
                item.self_profit_unlock_at
            ),

            "created_at": (
                item.created_at
            ),
        })

    # -----------------------------------------------------
    # فهرست برداشت‌ها
    # -----------------------------------------------------

    withdrawals = []

    for item in withdraws_qs[:500]:
        withdrawals.append({
            "id": item.id,

            "username": (
                item.user.telegram_username
            ),

            "wallet_address": (
                item.user.wallet_address
            ),

            "asset": item.asset,

            "scope": item.scope,

            "amount": _money(
                item.amount
            ),

            "ton_amount": _money(
                item.ton_amount
            ),

            "destination_wallet": (
                item.destination_wallet
            ),

            "status": item.status,

            "tx_hash": item.tx_hash,

            "fail_reason": (
                item.fail_reason
            ),

            "balance_breakdown": (
                item.balance_breakdown
            ),

            "created_at": (
                item.created_at
            ),

            "completed_at": (
                item.completed_at
            ),
        })

    # -----------------------------------------------------
    # مجموع کیف پول همه کاربران
    # -----------------------------------------------------

    wallet_totals = Wallet.objects.aggregate(
        referral_bonus=Sum(
            "referral_bonus"
        ),

        daily_locked=Sum(
            "daily_reward_locked"
        ),

        daily_unlocked=Sum(
            "daily_reward_unlocked"
        ),

        downline_profit=Sum(
            "downline_profit_instant"
        ),

        self_profit_locked=Sum(
            "self_profit_locked"
        ),

        self_profit_unlocked=Sum(
            "self_profit_unlocked"
        ),

        principal_locked=Sum(
            "principal_locked"
        ),

        principal_unlocked=Sum(
            "principal_unlocked"
        ),

        total_deposited=Sum(
            "total_deposited"
        ),

        total_withdrawn=Sum(
            "total_withdrawn"
        ),
    )

    total_referral_bonus = (
        wallet_totals["referral_bonus"]
        or Decimal("0")
    )

    total_daily_locked = (
        wallet_totals["daily_locked"]
        or Decimal("0")
    )

    total_daily_unlocked = (
        wallet_totals["daily_unlocked"]
        or Decimal("0")
    )

    total_daily_rewards = (
        total_daily_locked
        + total_daily_unlocked
    )

    total_downline_profit = (
        wallet_totals["downline_profit"]
        or Decimal("0")
    )

    total_self_profit_locked = (
        wallet_totals[
            "self_profit_locked"
        ]
        or Decimal("0")
    )

    total_self_profit_unlocked = (
        wallet_totals[
            "self_profit_unlocked"
        ]
        or Decimal("0")
    )

    total_principal_locked = (
        wallet_totals[
            "principal_locked"
        ]
        or Decimal("0")
    )

    total_principal_unlocked = (
        wallet_totals[
            "principal_unlocked"
        ]
        or Decimal("0")
    )

    total_deposited = (
        wallet_totals[
            "total_deposited"
        ]
        or Decimal("0")
    )

    total_withdrawn = (
        wallet_totals[
            "total_withdrawn"
        ]
        or Decimal("0")
    )

    # -----------------------------------------------------
    # مجموع موجودی USDT کاربران
    # -----------------------------------------------------

    usdt_totals = (
        AssetBalance.objects
        .filter(asset="USDT")
        .aggregate(
            principal_locked=Sum(
                "principal_locked"
            ),
            principal_unlocked=Sum(
                "principal_unlocked"
            ),
            profit_locked=Sum(
                "profit_locked"
            ),
            profit_unlocked=Sum(
                "profit_unlocked"
            ),
        )
    )

    total_usdt_principal_locked = (
        usdt_totals[
            "principal_locked"
        ]
        or Decimal("0")
    )

    total_usdt_principal_unlocked = (
        usdt_totals[
            "principal_unlocked"
        ]
        or Decimal("0")
    )

    total_usdt_profit_locked = (
        usdt_totals[
            "profit_locked"
        ]
        or Decimal("0")
    )

    total_usdt_profit_unlocked = (
        usdt_totals[
            "profit_unlocked"
        ]
        or Decimal("0")
    )

    # -----------------------------------------------------
    # برداشت‌های در انتظار
    # -----------------------------------------------------

    pending_ecg = (
        withdraws_qs
        .filter(
            status="PENDING",
            asset="ECG",
        )
        .aggregate(
            total=Sum("amount")
        )["total"]
        or Decimal("0")
    )

    pending_ton = (
        withdraws_qs
        .filter(
            status="PENDING",
            asset="TON",
        )
        .aggregate(
            total=Sum("ton_amount")
        )["total"]
        or Decimal("0")
    )

    # -----------------------------------------------------
    # سود ۵٪ خریدها براساس ارز
    # -----------------------------------------------------

    profit_ecg = (
        purchases_qs
        .filter(
            profit_asset="ECG"
        )
        .aggregate(
            total=Sum("self_profit_5")
        )["total"]
        or Decimal("0")
    )

    profit_usdt = (
        purchases_qs
        .filter(
            profit_asset="USDT"
        )
        .aggregate(
            total=Sum("self_profit_5")
        )["total"]
        or Decimal("0")
    )

    # -----------------------------------------------------
    # تعداد و مبلغ رویدادهای Ledger
    # -----------------------------------------------------

    referral_ledger = (
        Ledger.objects
        .filter(typ="REF_BONUS")
        .aggregate(
            count=Count("id"),
            total=Sum("amount"),
        )
    )

    daily_add_ledger = (
        Ledger.objects
        .filter(typ="DAILY_ADD")
        .aggregate(
            count=Count("id"),
            total=Sum("amount"),
        )
    )

    daily_unlock_ledger = (
        Ledger.objects
        .filter(typ="DAILY_UNLOCK")
        .aggregate(
            count=Count("id"),
            total=Sum("amount"),
        )
    )

    # -----------------------------------------------------
    # پاسخ نهایی
    # -----------------------------------------------------

    return Response({
        "summary": {
            # کاربران
            "total_users": (
                users_qs.count()
            ),

            "active_users": (
                users_qs
                .filter(is_active=True)
                .count()
            ),

            # خریدها
            "total_purchases": (
                purchases_qs.count()
            ),

            "total_ton_received": _money(
                purchases_qs.aggregate(
                    total=Sum("ton_amount")
                )["total"]
            ),

            "total_usd_value": _money(
                purchases_qs.aggregate(
                    total=Sum("usd_value")
                )["total"]
            ),

            # پاداش رفرال
            "total_referral_bonus": _money(
                total_referral_bonus
            ),

            "referral_reward_events": (
                referral_ledger["count"]
                or 0
            ),

            "referral_reward_ledger_total": (
                _money(
                    referral_ledger["total"]
                )
            ),

            # پاداش روزانه
            "total_daily_rewards": _money(
                total_daily_rewards
            ),

            "total_daily_locked": _money(
                total_daily_locked
            ),

            "total_daily_unlocked": _money(
                total_daily_unlocked
            ),

            "daily_reward_events": (
                daily_add_ledger["count"]
                or 0
            ),

            "daily_reward_added_total": (
                _money(
                    daily_add_ledger["total"]
                )
            ),

            "daily_unlock_events": (
                daily_unlock_ledger["count"]
                or 0
            ),

            "daily_reward_unlocked_total": (
                _money(
                    daily_unlock_ledger[
                        "total"
                    ]
                )
            ),

            # سودها
            "total_downline_profit": _money(
                total_downline_profit
            ),

            "total_self_profit_locked": _money(
                total_self_profit_locked
            ),

            "total_self_profit_unlocked": _money(
                total_self_profit_unlocked
            ),

            "profit_payable_ecg": _money(
                profit_ecg
            ),

            "profit_payable_usdt": _money(
                profit_usdt
            ),

            # اصل سرمایه
            "total_principal_locked": _money(
                total_principal_locked
            ),

            "total_principal_unlocked": _money(
                total_principal_unlocked
            ),

            # مجموع واریز و برداشت
            "total_deposited": _money(
                total_deposited
            ),

            "total_withdrawn": _money(
                total_withdrawn
            ),

            # USDT
            "usdt_principal_locked": _money(
                total_usdt_principal_locked
            ),

            "usdt_principal_unlocked": _money(
                total_usdt_principal_unlocked
            ),

            "usdt_profit_locked": _money(
                total_usdt_profit_locked
            ),

            "usdt_profit_unlocked": _money(
                total_usdt_profit_unlocked
            ),

            # برداشت‌های در انتظار
            "pending_withdraw_ecg": _money(
                pending_ecg
            ),

            "pending_withdraw_ton": _money(
                pending_ton
            ),

            # خزانه TON
            "treasury": (
                _treasury_balance()
            ),
        },

        "users": users,
        "purchases": purchases,
        "withdrawals": withdrawals,
    })