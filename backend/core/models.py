# backend/core/models.py

from django.db import models
from django.utils import timezone
from django.db.models import F
import uuid

class AppUser(models.Model):
    telegram_id = models.BigIntegerField(unique=True, null=True, blank=True)
    telegram_username = models.CharField(max_length=100, null=True, blank=True, help_text="یوزرنیم تلگرام کاربر")
    telegram_photo_url = models.URLField(
        max_length=1000,
        null=True,
        blank=True,
        help_text="آدرس آواتار تلگرام کاربر"
    )
    wallet_address = models.CharField(max_length=128, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    # referral
    referral_code = models.CharField(max_length=32, unique=True, blank=True)
    inviter = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="invitees")
    next_daily_claim_at = models.DateTimeField(null=True, blank=True)

    is_telegram_user = models.BooleanField(default=False)
    telegram_verified = models.BooleanField(default=False)
    wallet_locked = models.BooleanField(default=False)
    
    # ==========================================
    # ✅ فیلدهای جدید
    # ==========================================
    is_admin = models.BooleanField(default=False, help_text="آیا کاربر ادمین است؟")
    is_active = models.BooleanField(default=True, help_text="آیا کاربر فعال است؟")
    last_active = models.DateTimeField(null=True, blank=True, help_text="آخرین فعالیت کاربر")
    total_investment = models.DecimalField(max_digits=24, decimal_places=6, default=0, help_text="کل سرمایه‌گذاری")
    total_earned = models.DecimalField(max_digits=24, decimal_places=6, default=0, help_text="کل سود کسب شده")
    
    def save(self, *args, **kwargs):
        if not self.referral_code:
            self.referral_code = uuid.uuid4().hex[:10].upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.telegram_id} - {self.wallet_address[:8]}..."
    
class Wallet(models.Model):
    user = models.OneToOneField(AppUser, on_delete=models.CASCADE, related_name="wallet")

    referral_bonus = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    daily_reward_locked = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    daily_reward_unlocked = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    downline_profit_instant = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    self_profit_locked = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    self_profit_unlocked = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    principal_locked = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    principal_unlocked = models.DecimalField(max_digits=24, decimal_places=6, default=0)

    updated_at = models.DateTimeField(auto_now=True)
    level_profits = models.JSONField(default=dict)
    total_deposited = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    total_withdrawn = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    last_withdraw_at = models.DateTimeField(null=True, blank=True)

    def withdrawable_total(self):
        return (
            self.referral_bonus
            + self.daily_reward_unlocked
            + self.downline_profit_instant
            + self.self_profit_unlocked
            + self.principal_unlocked
        )

    def __str__(self):
        return f"Wallet: {self.user.wallet_address[:8]}..."


class Ledger(models.Model):
    TYPE_CHOICES = [
        ("REF_BONUS", "Referral bonus"),
        ("DAILY_ADD", "Daily add locked"),
        ("DAILY_UNLOCK", "Daily unlock"),
        ("BUY_PRINCIPAL", "Buy principal locked"),
        ("BUY_SELF_PROFIT", "Buy self profit locked"),
        ("SELF_PROFIT_UNLOCK", "Self profit unlock"),
        ("PRINCIPAL_UNLOCK", "Principal unlock"),
        ("DOWNLINE_PROFIT", "Downline instant profit"),
        ("WITHDRAW", "Withdraw"),
        ("LEVEL5_BONUS", "Level 5 bonus"),
    ]
    user = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name="ledgers")
    typ = models.CharField(max_length=32, choices=TYPE_CHOICES)
    amount = models.DecimalField(max_digits=24, decimal_places=6)
    meta = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.typ} - {self.amount}"


class Purchase(models.Model):
    OUTPUT_ASSETS = [("ECG","ECG"),("USDT","USDT"),]
    """خرید ECG با TON"""
    user = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name="purchases")
    invoice_no = models.CharField(max_length=32, unique=True)

    ton_amount = models.DecimalField(max_digits=24, decimal_places=6)
    ton_tx_hash = models.CharField(max_length=256, unique=True)

    ton_usd_rate = models.DecimalField(max_digits=24, decimal_places=6)
    usd_value = models.DecimalField(max_digits=24, decimal_places=6)

    ecg_value = models.DecimalField(max_digits=24, decimal_places=6)
    self_profit_5 = models.DecimalField(max_digits=24, decimal_places=6)

    principal_unlock_at = models.DateTimeField()
    self_profit_unlock_at = models.DateTimeField()

    created_at = models.DateTimeField(auto_now_add=True)

    output_asset = models.CharField(max_length=8,choices=OUTPUT_ASSETS,default="ECG")
    output_amount = models.DecimalField(max_digits=24,decimal_places=6,default=0)
    profit_asset = models.CharField(max_length=8,choices=OUTPUT_ASSETS,default="ECG")
    

    def __str__(self):
        return f"TON: {self.invoice_no} - {self.ton_amount} TON"


class PurchaseUSDT(models.Model):
    """خرید ECG با USDT (BEP-20)"""
    user = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name="purchases_usdt")
    invoice_no = models.CharField(max_length=32, unique=True)

    usdt_amount = models.DecimalField(max_digits=24, decimal_places=6)
    usdt_tx_hash = models.CharField(max_length=256, unique=True)

    usdt_usd_rate = models.DecimalField(max_digits=24, decimal_places=6, default=1)
    usd_value = models.DecimalField(max_digits=24, decimal_places=6)

    ecg_value = models.DecimalField(max_digits=24, decimal_places=6)
    self_profit_5 = models.DecimalField(max_digits=24, decimal_places=6)

    principal_unlock_at = models.DateTimeField()
    self_profit_unlock_at = models.DateTimeField()

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"USDT: {self.invoice_no} - {self.usdt_amount} USDT"


class PurchaseBNB(models.Model):
    """خرید ECG با BNB (BEP-20)"""
    user = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name="purchases_bnb")
    invoice_no = models.CharField(max_length=32, unique=True)

    bnb_amount = models.DecimalField(max_digits=24, decimal_places=6)
    bnb_tx_hash = models.CharField(max_length=256, unique=True)

    bnb_usd_rate = models.DecimalField(max_digits=24, decimal_places=6)
    usd_value = models.DecimalField(max_digits=24, decimal_places=6)

    ecg_value = models.DecimalField(max_digits=24, decimal_places=6)
    self_profit_5 = models.DecimalField(max_digits=24, decimal_places=6)

    principal_unlock_at = models.DateTimeField()
    self_profit_unlock_at = models.DateTimeField()

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"BNB: {self.invoice_no} - {self.bnb_amount} BNB"


class WithdrawRequest(models.Model):
    STATUS = [
        ("PENDING", "Pending"),
        ("SUCCESS", "Success"),
        ("FAILED", "Failed"),
    ]
    SCOPE = [
        ("DOWNLINE_ONLY", "Downline only"),
        ("ALL_WITHDRAWABLE", "All withdrawable"),
        ]

    ASSET = [
        ("TON","TON"),
        ("ECG","ECG"),
    ]




    user = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name="withdraws")
    scope = models.CharField(max_length=32, choices=SCOPE,default="ALL_WITHDRAWABLE",)
    asset = models.CharField(max_length=8,choices=ASSET,default="TON")
    amount = models.DecimalField(max_digits=24, decimal_places=6)
    ton_amount = models.DecimalField(max_digits=24, decimal_places=9, default=0)
    destination_wallet = models.CharField(max_length=128)
    tx_hash = models.CharField(max_length=256, blank=True, default="")
    fail_reason = models.TextField(blank=True, default="")
    balance_breakdown = models.JSONField(default=dict,blank=True)
    status = models.CharField(max_length=16, choices=STATUS, default="PENDING")
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True,blank=True)

    def __str__(self):
        return f"{self.status} - {self.amount} ECG ->{self.asset}"


class ReferralLevel(models.Model):
    user = models.OneToOneField(AppUser, on_delete=models.CASCADE, related_name='referral_level')

    level_1_count = models.IntegerField(default=0)
    level_2_count = models.IntegerField(default=0)
    level_3_count = models.IntegerField(default=0)
    level_4_count = models.IntegerField(default=0)
    level_5_count = models.IntegerField(default=0)

    # ==========================================
    # ✅ ذخیره اطلاعات کامل کاربران
    # ==========================================
    level_1_users = models.JSONField(default=list, blank=True)
    level_2_users = models.JSONField(default=list, blank=True)
    level_3_users = models.JSONField(default=list, blank=True)
    level_4_users = models.JSONField(default=list, blank=True)
    level_5_users = models.JSONField(default=list, blank=True)

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.wallet_address[:8]}... - Levels"