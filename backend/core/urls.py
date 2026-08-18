from django.urls import path
from . import views
from .admin_dashboard import admin_system_dashboard


urlpatterns = [
    # ========================
    # اتصال والت
    # ========================
    path(
        "connect/",
        views.connect_wallet,
        name="connect_wallet",
    ),

    # ========================
    # کیف پول - مسیرهای ثابت باید اول باشند
    # ========================
    path(
        "wallet/reward_status/",
        views.reward_status,
        name="reward_status",
    ),

    path(
        "wallet/tick/",
        views.tick,
        name="tick",
    ),

    # ========================
    # کیف پول - مسیر داینامیک باید بعد از مسیرهای ثابت باشد
    # ========================
    path(
        "wallet/<str:wallet_address>/",
        views.wallet_view,
        name="wallet_view",
    ),

    # ========================
    # خرید ECG با TON
    # ========================
    path(
        "purchase/create/",
        views.create_purchase,
        name="create_purchase",
    ),

    path(
        "purchase/list/",
        views.list_purchases,
        name="list_purchases",
    ),

    # ========================
    # خرید ECG با USDT
    # ========================
    path(
        "purchase/usdt/create/",
        views.create_purchase_usdt,
        name="create_purchase_usdt",
    ),

    path(
        "purchase/usdt/list/",
        views.list_purchases_usdt,
        name="list_purchases_usdt",
    ),

    # ========================
    # خرید ECG با BNB
    # ========================
    path(
        "purchase/bnb/create/",
        views.create_purchase_bnb,
        name="create_purchase_bnb",
    ),

    path(
        "purchase/bnb/list/",
        views.list_purchases_bnb,
        name="list_purchases_bnb",
    ),

    # ========================
    # ساخت تراکنش TON
    # ========================
    path(
        "purchase/create-transaction/",
        views.create_ton_transaction,
        name="create_ton_transaction",
    ),

    # ========================
    # برداشت کاربر
    # ECG و TON هر دو Pending
    # ========================
    path(
        "withdraw/request/",
        views.request_withdraw,
        name="request_withdraw",
    ),

    path(
        "withdraw/history/",
        views.withdraw_history,
        name="withdraw_history",
    ),

    # ========================
    # پنل ادمین
    # ========================
    path(
        "admin/system-dashboard/",
        admin_system_dashboard,
        name="admin-system-dashboard",
    ),

    # ========================
    # تایید برداشت توسط ادمین
    #
    # POST:
    # /admin/withdrawals/15/complete/
    #
    # بعد از پرداخت دستی ادمین:
    # PENDING -> SUCCESS
    # در فرانت به صورت Complete نمایش داده می‌شود.
    # ========================
    path(
        "admin/withdrawals/<int:withdraw_id>/complete/",
        views.admin_complete_withdraw,
        name="admin-complete-withdraw",
    ),

    # ========================
    # Referral
    # ========================
    path(
        "referrals/count/",
        views.referral_count,
        name="referral_count",
    ),

    path(
        "referral/levels/",
        views.get_referral_levels,
        name="referral_levels",
    ),

    # ========================
    # Test
    # ========================
    path(
        "test/",
        views.test_tick,
        name="test_tick",
    ),
]