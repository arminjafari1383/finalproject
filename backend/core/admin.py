# backend/core/admin.py

from django.contrib import admin
from .models import AppUser, Wallet, Ledger, Purchase, PurchaseUSDT, PurchaseBNB, WithdrawRequest, ReferralLevel

# ==========================================
# AppUser Admin
# ==========================================
@admin.register(AppUser)
class AppUserAdmin(admin.ModelAdmin):
    list_display = (
        "id", 
        "wallet_address", 
        "telegram_id",
        "referral_code", 
        "inviter", 
        "is_telegram_user",
        "telegram_verified",
        "wallet_locked",
        "created_at"
    )
    list_filter = (
        "is_telegram_user", 
        "telegram_verified", 
        "wallet_locked",
        "created_at"
    )
    search_fields = (
        "wallet_address", 
        "referral_code", 
        "telegram_id",
        "inviter__wallet_address"
    )
    readonly_fields = ("created_at", "referral_code")
    ordering = ("-created_at",)
    
    fieldsets = (
        ("اطلاعات اصلی", {
            "fields": ("wallet_address", "telegram_id", "created_at")
        }),
        ("سیستم رفرال", {
            "fields": ("referral_code", "inviter", "next_daily_claim_at")
        }),
        ("وضعیت کاربر", {
            "fields": ("is_telegram_user", "telegram_verified", "wallet_locked")
        }),
    )

# ==========================================
# Wallet Admin
# ==========================================
@admin.register(Wallet)
class WalletAdmin(admin.ModelAdmin):
    list_display = (
        "id", 
        "user",
        "referral_bonus",
        "daily_reward_locked", 
        "daily_reward_unlocked",
        "downline_profit_instant",
        "self_profit_locked", 
        "self_profit_unlocked",
        "principal_locked", 
        "principal_unlocked",
        "updated_at"
    )
    list_filter = ("updated_at",)
    search_fields = ("user__wallet_address", "user__telegram_id")
    readonly_fields = ("updated_at",)
    
    fieldsets = (
        ("کاربر", {
            "fields": ("user",)
        }),
        ("پاداش رفرال", {
            "fields": ("referral_bonus",)
        }),
        ("سود روزانه", {
            "fields": ("daily_reward_locked", "daily_reward_unlocked")
        }),
        ("سود داونلاین", {
            "fields": ("downline_profit_instant",)
        }),
        ("سود شخصی", {
            "fields": ("self_profit_locked", "self_profit_unlocked")
        }),
        ("اصل سرمایه", {
            "fields": ("principal_locked", "principal_unlocked")
        }),
        ("سایر", {
            "fields": ("level_profits", "updated_at")
        }),
    )

# ==========================================
# Ledger Admin
# ==========================================
@admin.register(Ledger)
class LedgerAdmin(admin.ModelAdmin):
    list_display = (
        "id", 
        "user", 
        "typ", 
        "amount", 
        "created_at"
    )
    list_filter = (
        "typ", 
        "created_at"
    )
    search_fields = (
        "user__wallet_address", 
        "user__telegram_id"
    )
    readonly_fields = ("created_at",)
    
    fieldsets = (
        ("اطلاعات تراکنش", {
            "fields": ("user", "typ", "amount", "meta")
        }),
        ("زمان", {
            "fields": ("created_at",)
        }),
    )

# ==========================================
# Purchase Admin (TON)
# ==========================================
@admin.register(Purchase)
class PurchaseAdmin(admin.ModelAdmin):
    list_display = (
        "id", 
        "invoice_no", 
        "user", 
        "ton_amount", 
        "usd_value", 
        "ecg_value", 
        "created_at"
    )
    list_filter = ("created_at",)
    search_fields = (
        "invoice_no", 
        "ton_tx_hash", 
        "user__wallet_address"
    )
    readonly_fields = ("created_at",)
    
    fieldsets = (
        ("کاربر و فاکتور", {
            "fields": ("user", "invoice_no")
        }),
        ("مبالغ TON", {
            "fields": ("ton_amount", "ton_tx_hash", "ton_usd_rate")
        }),
        ("مبالغ USD", {
            "fields": ("usd_value",)
        }),
        ("مبالغ ECG", {
            "fields": ("ecg_value", "self_profit_5")
        }),
        ("زمان قفل", {
            "fields": ("principal_unlock_at", "self_profit_unlock_at")
        }),
        ("زمان ثبت", {
            "fields": ("created_at",)
        }),
    )

# ==========================================
# Purchase USDT Admin
# ==========================================
@admin.register(PurchaseUSDT)
class PurchaseUSDTAdmin(admin.ModelAdmin):
    list_display = (
        "id", 
        "invoice_no", 
        "user", 
        "usdt_amount", 
        "usd_value", 
        "ecg_value", 
        "created_at"
    )
    list_filter = ("created_at",)
    search_fields = (
        "invoice_no", 
        "usdt_tx_hash", 
        "user__wallet_address"
    )
    readonly_fields = ("created_at",)
    
    fieldsets = (
        ("کاربر و فاکتور", {
            "fields": ("user", "invoice_no")
        }),
        ("مبالغ USDT", {
            "fields": ("usdt_amount", "usdt_tx_hash", "usdt_usd_rate")
        }),
        ("مبالغ USD", {
            "fields": ("usd_value",)
        }),
        ("مبالغ ECG", {
            "fields": ("ecg_value", "self_profit_5")
        }),
        ("زمان قفل", {
            "fields": ("principal_unlock_at", "self_profit_unlock_at")
        }),
        ("زمان ثبت", {
            "fields": ("created_at",)
        }),
    )

# ==========================================
# Purchase BNB Admin
# ==========================================
@admin.register(PurchaseBNB)
class PurchaseBNBAdmin(admin.ModelAdmin):
    list_display = (
        "id", 
        "invoice_no", 
        "user", 
        "bnb_amount", 
        "usd_value", 
        "ecg_value", 
        "created_at"
    )
    list_filter = ("created_at",)
    search_fields = (
        "invoice_no", 
        "bnb_tx_hash", 
        "user__wallet_address"
    )
    readonly_fields = ("created_at",)
    
    fieldsets = (
        ("کاربر و فاکتور", {
            "fields": ("user", "invoice_no")
        }),
        ("مبالغ BNB", {
            "fields": ("bnb_amount", "bnb_tx_hash", "bnb_usd_rate")
        }),
        ("مبالغ USD", {
            "fields": ("usd_value",)
        }),
        ("مبالغ ECG", {
            "fields": ("ecg_value", "self_profit_5")
        }),
        ("زمان قفل", {
            "fields": ("principal_unlock_at", "self_profit_unlock_at")
        }),
        ("زمان ثبت", {
            "fields": ("created_at",)
        }),
    )

# ==========================================
# WithdrawRequest Admin
# ==========================================
@admin.register(WithdrawRequest)
class WithdrawRequestAdmin(admin.ModelAdmin):
    list_display = (
        "id", 
        "user", 
        "scope", 
        "amount", 
        "ton_amount",
        "destination_wallet", 
        "status", 
        "created_at"
    )
    list_filter = (
        "status", 
        "scope", 
        "created_at"
    )
    search_fields = (
        "user__wallet_address", 
        "destination_wallet",
        "tx_hash"
    )
    readonly_fields = ("created_at",)
    
    fieldsets = (
        ("کاربر", {
            "fields": ("user", "destination_wallet")
        }),
        ("مبالغ", {
            "fields": ("amount", "ton_amount")
        }),
        ("وضعیت", {
            "fields": ("status", "scope", "tx_hash", "fail_reason")
        }),
        ("زمان", {
            "fields": ("created_at",)
        }),
    )
    
    actions = ["approve_withdrawals", "reject_withdrawals"]
    
    def approve_withdrawals(self, request, queryset):
        """تایید برداشت‌های انتخاب شده"""
        updated = queryset.update(status="SUCCESS")
        self.message_user(request, f"{updated} برداشت با موفقیت تایید شد.")
    approve_withdrawals.short_description = "✅ تایید برداشت‌های انتخاب شده"
    
    def reject_withdrawals(self, request, queryset):
        """رد برداشت‌های انتخاب شده"""
        updated = queryset.update(status="FAILED", fail_reason="رد شده توسط ادمین")
        self.message_user(request, f"{updated} برداشت رد شد.")
    reject_withdrawals.short_description = "❌ رد برداشت‌های انتخاب شده"

# ==========================================
# ReferralLevel Admin
# ==========================================
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
        "updated_at"
    )
    list_filter = ("updated_at",)
    search_fields = ("user__wallet_address", "user__telegram_id")
    readonly_fields = ("updated_at",)
    
    fieldsets = (
        ("کاربر", {
            "fields": ("user",)
        }),
        ("تعداد در سطوح", {
            "fields": (
                "level_1_count",
                "level_2_count",
                "level_3_count",
                "level_4_count",
                "level_5_count"
            )
        }),
        ("لیست کاربران در سطوح", {
            "fields": (
                "level_1_users",
                "level_2_users",
                "level_3_users",
                "level_4_users",
                "level_5_users"
            ),
            "classes": ("collapse",)
        }),
        ("زمان بروزرسانی", {
            "fields": ("updated_at",)
        }),
    )

# ==========================================
# تنظیمات ظاهری پنل ادمین
# ==========================================
admin.site.site_header = "مدیریت AI PolyNet"
admin.site.site_title = "پنل مدیریت AI PolyNet"
admin.site.index_title = "خوش آمدید به پنل مدیریت"