
from django.contrib import admin
from .models import (
    AppUser,
    Wallet,
    AssetBalance,
    Ledger,
    Purchase,
    PurchaseUSDT,
    PurchaseBNB,
    WithdrawRequest,
    ReferralLevel,
)


@admin.register(AppUser)
class AppUserAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "wallet_address",
        "telegram_id",
        "referral_code",
        "inviter",
        "is_active",
        "created_at",
    )
    search_fields = (
        "wallet_address",
        "telegram_id",
        "referral_code",
    )
    readonly_fields = ("created_at", "referral_code")


@admin.register(Wallet)
class WalletAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "ecg_self_locked",
        "ecg_self_unlocked",
        "ecg_referral_profit",
        "usdt_self_locked",
        "usdt_self_unlocked",
        "usdt_referral_profit",
        "epl_balance",
        "updated_at",
    )
    search_fields = (
        "user__wallet_address",
        "user__telegram_id",
    )
    readonly_fields = ("created_at", "updated_at")


@admin.register(AssetBalance)
class AssetBalanceAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "asset",
        "available",
        "locked",
        "total_earned",
    )
    list_filter = ("asset",)
    search_fields = (
        "user__wallet_address",
        "user__telegram_id",
    )


@admin.register(Ledger)
class LedgerAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "typ",
        "amount",
        "created_at",
    )
    list_filter = ("typ", "created_at")
    search_fields = ("user__wallet_address",)


@admin.register(Purchase)
class PurchaseAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "invoice_no",
        "user",
        "output_asset",
        "output_amount",
        "created_at",
    )
    search_fields = (
        "invoice_no",
        "ton_tx_hash",
        "user__wallet_address",
    )


@admin.register(PurchaseUSDT)
class PurchaseUSDTAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "invoice_no",
        "user",
        "usdt_amount",
        "ecg_value",
    )
    search_fields = (
        "invoice_no",
        "usdt_tx_hash",
        "user__wallet_address",
    )


@admin.register(PurchaseBNB)
class PurchaseBNBAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "invoice_no",
        "user",
        "bnb_amount",
        "ecg_value",
        "created_at",
    )
    search_fields = (
        "invoice_no",
        "bnb_tx_hash",
        "user__wallet_address",
    )


@admin.register(WithdrawRequest)
class WithdrawRequestAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "source_asset",
        "asset",
        "amount",
        "status",
        "created_at",
    )
    list_filter = (
        "status",
        "asset",
        "source_asset",
    )
    search_fields = (
        "user__wallet_address",
        "wallet_address",
        "tx_hash",
    )


@admin.register(ReferralLevel)
class ReferralLevelAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "level_1_count",
        "level_2_count",
        "level_3_count",
        "level_4_count",
        "level_5_count",
        "updated_at",
    )
    search_fields = ("user__wallet_address",)
