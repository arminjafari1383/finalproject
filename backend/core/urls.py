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
    path("purchase/list/", views.list_purchases),
    path("withdraw/request/", views.request_withdraw),

    path('referral/levels/',views.get_referral_levels,name='referral_levels'),

    path("purchase/usdt/create/",views.create_purchase_usdt,name="create_purchase_usdt"),

    path("purchase/usdt/list/", views.list_purchases_usdt,name="list_purchases_usdt"),

    path("purchase/bnb/create/", views.create_purchase_bnb, name="create_purchase_bnb"),
    path("purchase/bnb/list/", views.list_purchases_bnb, name="list_purchases_bnb"),
]