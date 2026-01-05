from django.urls import path
from . import views

urlpatterns = [
    path("connect/", views.connect_wallet),

    # ✅ اول مسیرهای ثابت
    path("wallet/reward_status/", views.reward_status),
    path("wallet/tick/", views.tick),

    path("referrals/count/", views.referral_count),

    # ✅ بعد مسیر داینامیک
    path("wallet/<str:wallet_address>/", views.wallet_view),

    path("purchase/create/", views.create_purchase),
    path("purchase/list/<str:wallet_address>/", views.list_purchases),
    path("withdraw/request/", views.request_withdraw),
]