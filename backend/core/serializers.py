from rest_framework import serializers
from .models import AppUser, Wallet, Purchase, WithdrawRequest

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = AppUser
        fields = ["id", "wallet_address", "referral_code", "inviter"]

class WalletSerializer(serializers.ModelSerializer):
    withdrawable_total = serializers.SerializerMethodField()
    class Meta:
        model = Wallet
        fields = [
            "referral_bonus",
            "daily_reward_locked", "daily_reward_unlocked",
            "downline_profit_instant",
            "self_profit_locked", "self_profit_unlocked",
            "principal_locked", "principal_unlocked",
            "withdrawable_total",
        ]
    def get_withdrawable_total(self, obj):
        return obj.withdrawable_total()

class PurchaseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Purchase
        fields = "__all__"

class WithdrawSerializer(serializers.ModelSerializer):
    class Meta:
        model = WithdrawRequest
        fields = [
            "id",
            "asset",
            "scope",
            "amount",
            "ton_amount",
            "destination_wallet",
            "tx_hash",
            "status",
            "created_at",
            "completed_at",
        ]

        read_only_fields = [
            "id",
            "ton_amount",
            "tx_hash",
            "status",
            "created_at",
            "completed_at",
        ]
        