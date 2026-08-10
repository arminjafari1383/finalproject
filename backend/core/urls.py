from django.urls import path
from . import views

urlpatterns = [
    # ========================
    # اتصال والت
    # ========================
    path("connect/", views.connect_wallet, name="connect_wallet"),
    
    # ========================
    # کیف پول
    # ========================
    path("wallet/<str:wallet_address>/", views.wallet_view, name="wallet_view"),
    path("wallet/reward_status/", views.reward_status, name="reward_status"),
    path("wallet/tick/", views.tick, name="tick"),
    
    # ========================
    # خرید ECG با TON
    # ========================
    path("purchase/create/", views.create_purchase, name="create_purchase"),
    path("purchase/list/", views.list_purchases, name="list_purchases"),
    
    # ========================
    # خرید ECG با USDT (BEP-20)
    # ========================
    path("purchase/usdt/create/", views.create_purchase_usdt, name="create_purchase_usdt"),
    path("purchase/usdt/list/", views.list_purchases_usdt, name="list_purchases_usdt"),
    
    # ========================
    # خرید ECG با BNB (BEP-20)
    # ========================
    path("purchase/bnb/create/", views.create_purchase_bnb, name="create_purchase_bnb"),
    path("purchase/bnb/list/", views.list_purchases_bnb, name="list_purchases_bnb"),
    
    # ========================
    # برداشت
    # ========================
    path("withdraw/request/", views.request_withdraw, name="request_withdraw"),
    
    # ========================
    # سیستم معرف (Referral)
    # ========================
    path("referrals/count/", views.referral_count, name="referral_count"),
    path("referral/levels/", views.get_referral_levels, name="referral_levels"),
    
    # ========================
    # Test Endpoint
    # ========================
    path("test/", views.test_tick, name="test_tick"),
]