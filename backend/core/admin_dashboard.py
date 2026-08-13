import os
from decimal import Decimal

import requests
from django.db.models import Sum
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import AppUser, AssetBalance, Ledger, Purchase, WithdrawRequest


def _money(value):
    return str(value or Decimal("0"))


def _admin_allowed(request):
    configured = os.getenv("ADMIN_DASHBOARD_TOKEN", "")
    supplied = request.headers.get("X-Admin-Token", "")
    wallet_address = request.headers.get("X-Admin-Wallet", "")
    if not configured or supplied != configured or not wallet_address:
        return False
    return AppUser.objects.filter(
        wallet_address=wallet_address,
        is_admin=True,
        is_active=True,
    ).exists()


def _treasury_balance():
    address = os.getenv("TREASURY_TON_ADDRESS", "").strip()
    if not address:
        return {"address": "", "balance_ton": None, "low_balance": None, "error": "TREASURY_TON_ADDRESS is not configured"}

    headers = {}
    api_key = os.getenv("TONCENTER_API_KEY", "").strip()
    if api_key:
        headers["X-API-Key"] = api_key

    try:
        response = requests.get(
            "https://toncenter.com/api/v2/getAddressBalance",
            params={"address": address},
            headers=headers,
            timeout=12,
        )
        response.raise_for_status()
        balance = Decimal(str(response.json()["result"])) / Decimal("1000000000")
        return {
            "address": address,
            "balance_ton": str(balance),
            "minimum_ton": "100",
            "low_balance": balance < Decimal("100"),
            "error": "",
        }
    except Exception as exc:
        return {"address": address, "balance_ton": None, "low_balance": None, "error": str(exc)}


@api_view(["GET"])
def admin_system_dashboard(request):
    if not _admin_allowed(request):
        return Response({"error": "Admin access denied."}, status=status.HTTP_403_FORBIDDEN)

    users_qs = AppUser.objects.select_related("wallet", "inviter").order_by("-created_at")
    purchases_qs = Purchase.objects.select_related("user").order_by("-created_at")
    withdraws_qs = WithdrawRequest.objects.select_related("user").order_by("-created_at")

    users = []
    for user in users_qs[:500]:
        wallet = getattr(user, "wallet", None)
        usdt = user.asset_balances.filter(asset="USDT").first()
        users.append({
            "id": user.id,
            "telegram_id": user.telegram_id,
            "username": user.telegram_username,
            "photo": user.telegram_photo_url,
            "wallet_address": user.wallet_address,
            "inviter": user.inviter.telegram_username if user.inviter else None,
            "is_active": user.is_active,
            "last_active": user.last_active,
            "created_at": user.created_at,
            "total_investment": _money(user.total_investment),
            "total_earned": _money(user.total_earned),
            "withdrawable_ecg": _money(wallet.withdrawable_total()) if wallet else "0",
            "locked_ecg": _money((wallet.principal_locked + wallet.self_profit_locked) if wallet else 0),
            "withdrawable_usdt": _money(usdt.withdrawable_total()) if usdt else "0",
            "locked_usdt": _money((usdt.principal_locked + usdt.profit_locked) if usdt else 0),
        })

    purchases = [{
        "id": item.id,
        "invoice_no": item.invoice_no,
        "username": item.user.telegram_username,
        "wallet_address": item.user.wallet_address,
        "ton_amount": _money(item.ton_amount),
        "usd_value": _money(item.usd_value),
        "output_asset": item.output_asset,
        "output_amount": _money(item.output_amount),
        "profit_asset": item.profit_asset,
        "self_profit_5": _money(item.self_profit_5),
        "tx_hash": item.ton_tx_hash,
        "created_at": item.created_at,
    } for item in purchases_qs[:500]]

    withdrawals = [{
        "id": item.id,
        "username": item.user.telegram_username,
        "wallet_address": item.user.wallet_address,
        "asset": item.asset,
        "amount": _money(item.amount),
        "ton_amount": _money(item.ton_amount),
        "destination_wallet": item.destination_wallet,
        "status": item.status,
        "tx_hash": item.tx_hash,
        "created_at": item.created_at,
    } for item in withdraws_qs[:500]]

    pending_ecg = withdraws_qs.filter(status="PENDING", asset="ECG").aggregate(total=Sum("amount"))["total"] or 0
    pending_ton = withdraws_qs.filter(status="PENDING", asset="TON").aggregate(total=Sum("ton_amount"))["total"] or 0
    profit_ecg = purchases_qs.filter(profit_asset="ECG").aggregate(total=Sum("self_profit_5"))["total"] or 0
    profit_usdt = purchases_qs.filter(profit_asset="USDT").aggregate(total=Sum("self_profit_5"))["total"] or 0

    return Response({
        "summary": {
            "total_users": users_qs.count(),
            "active_users": users_qs.filter(is_active=True).count(),
            "total_purchases": purchases_qs.count(),
            "total_ton_received": _money(purchases_qs.aggregate(total=Sum("ton_amount"))["total"]),
            "total_usd_value": _money(purchases_qs.aggregate(total=Sum("usd_value"))["total"]),
            "profit_payable_ecg": _money(profit_ecg),
            "profit_payable_usdt": _money(profit_usdt),
            "pending_withdraw_ecg": _money(pending_ecg),
            "pending_withdraw_ton": _money(pending_ton),
            "treasury": _treasury_balance(),
        },
        "users": users,
        "purchases": purchases,
        "withdrawals": withdrawals,
    })
