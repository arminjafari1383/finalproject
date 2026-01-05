from django.db import models
from django.utils import timezone
from django.db.models import F
import uuid

class AppUser(models.Model):
    wallet_address = models.CharField(max_length=128, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    # referral
    referral_code = models.CharField(max_length=32, unique=True, blank=True)
    inviter = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="invitees")
    next_daily_claim_at = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        if not self.referral_code:
            self.referral_code = uuid.uuid4().hex[:10]
        super().save(*args, **kwargs)

    def __str__(self):
        return self.wallet_address


class Wallet(models.Model):
    user = models.OneToOneField(AppUser, on_delete=models.CASCADE, related_name="wallet")

    # 1) 3-token referral bonus
    referral_bonus = models.DecimalField(max_digits=24, decimal_places=6, default=0)

    # 2) daily reward locked (unlocks end of month)
    daily_reward_locked = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    daily_reward_unlocked = models.DecimalField(max_digits=24, decimal_places=6, default=0)

    # 3) downline purchase profit instant withdrawable
    downline_profit_instant = models.DecimalField(max_digits=24, decimal_places=6, default=0)

    # 4) self purchase profit locked then unlocked after 30 days
    self_profit_locked = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    self_profit_unlocked = models.DecimalField(max_digits=24, decimal_places=6, default=0)

    # 5) principal locked then unlocked after 365 days
    principal_locked = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    principal_unlocked = models.DecimalField(max_digits=24, decimal_places=6, default=0)

    updated_at = models.DateTimeField(auto_now=True)

    def withdrawable_total(self):
        return (
            self.referral_bonus
            + self.daily_reward_unlocked
            + self.downline_profit_instant
            + self.self_profit_unlocked
            + self.principal_unlocked
        )


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
    ]
    user = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name="ledgers")
    typ = models.CharField(max_length=32, choices=TYPE_CHOICES)
    amount = models.DecimalField(max_digits=24, decimal_places=6)
    meta = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class Purchase(models.Model):
    user = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name="purchases")
    invoice_no = models.CharField(max_length=32, unique=True)

    ton_amount = models.DecimalField(max_digits=24, decimal_places=6)
    ton_tx_hash = models.CharField(max_length=256, unique=True)

    ton_usd_rate = models.DecimalField(max_digits=24, decimal_places=6)
    usd_value = models.DecimalField(max_digits=24, decimal_places=6)

    ecg_value = models.DecimalField(max_digits=24, decimal_places=6)  # usd*200
    self_profit_5 = models.DecimalField(max_digits=24, decimal_places=6)  # 5% of ecg_value

    principal_unlock_at = models.DateTimeField()
    self_profit_unlock_at = models.DateTimeField()

    created_at = models.DateTimeField(auto_now_add=True)


class WithdrawRequest(models.Model):
    STATUS = [("PENDING", "Pending"), ("APPROVED", "Approved"), ("REJECTED", "Rejected")]
    SCOPE = [
        ("DOWNLINE_ONLY", "Downline only"),
        ("ALL_WITHDRAWABLE", "All withdrawable"),
    ]
    user = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name="withdraws")
    scope = models.CharField(max_length=32, choices=SCOPE)
    amount = models.DecimalField(max_digits=24, decimal_places=6)
    destination_wallet = models.CharField(max_length=128)
    status = models.CharField(max_length=16, choices=STATUS, default="PENDING")
    created_at = models.DateTimeField(auto_now_add=True)