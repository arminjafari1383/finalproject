from django.contrib import admin
from .models import AppUser, Wallet, Ledger, Purchase, WithdrawRequest

@admin.register(AppUser)
class AppUserAdmin(admin.ModelAdmin):
    list_display = ("id", "wallet_address", "referral_code", "inviter", "created_at")
    search_fields = ("wallet_address", "referral_code")
    list_filter = ("created_at",)

@admin.register(Wallet)
class WalletAdmin(admin.ModelAdmin):
    list_display = (
        "id", "user",
        "referral_bonus",
        "daily_reward_locked", "daily_reward_unlocked",
        "downline_profit_instant",
        "self_profit_locked", "self_profit_unlocked",
        "principal_locked", "principal_unlocked",
        "withdrawable_total",
        "updated_at",
    )
    search_fields = ("user__wallet_address",)

@admin.register(Ledger)
class LedgerAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "typ", "amount", "created_at")
    list_filter = ("typ", "created_at")
    search_fields = ("user__wallet_address",)
    readonly_fields = ("created_at",)

@admin.register(Purchase)
class PurchaseAdmin(admin.ModelAdmin):
    list_display = ("id", "invoice_no", "user", "ton_amount", "usd_value", "ecg_value", "ton_tx_hash", "created_at")
    search_fields = ("invoice_no", "ton_tx_hash", "user__wallet_address")
    list_filter = ("created_at",)
    readonly_fields = ("created_at",)

@admin.register(WithdrawRequest)
class WithdrawRequestAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "scope", "amount", "destination_wallet", "status", "created_at")
    list_filter = ("status", "scope", "created_at")
    search_fields = ("user__wallet_address", "destination_wallet")
    readonly_fields = ("created_at",)