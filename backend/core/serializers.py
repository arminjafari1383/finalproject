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
            "ecg_self_locked",
            "ecg_self_unlocked",
            "ecg_referral_profit",
            "usdt_self_locked",
            "usdt_self_unlocked",
            "usdt_referral_profit",
            "epl_balance",
            "epl_total_earned",
            "withdrawable_total",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def get_withdrawable_total(self, obj):
        return obj.available_ecg()


class PurchaseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Purchase
        fields = "__all__"


class WithdrawSerializer(serializers.ModelSerializer):
    destination_wallet = serializers.CharField(source="wallet_address", read_only=True)
    completed_at = serializers.SerializerMethodField()

    class Meta:
        model = WithdrawRequest
        fields = [
            "id",
            "asset",
            "amount",
            "wallet_address",
            "destination_wallet",
            "tx_hash",
            "status",
            "created_at",
            "updated_at",
            "completed_at",
        ]
        read_only_fields = [
            "id",
            "tx_hash",
            "status",
            "created_at",
            "updated_at",
            "completed_at",
        ]

    def get_completed_at(self, obj):
        status_value = str(obj.status or "").upper()
        if status_value in {"PAID", "SUCCESS", "COMPLETE", "COMPLETED"}:
            return obj.updated_at
        return None