// frontend/src/components/Wallet.jsx

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useTonWallet, TonConnectButton } from "@tonconnect/ui-react";
import { api } from "../api";
import "./Wallet.css";
import {
  captureInviterCode,
  clearInviterCode,
} from "../utils/referral";

// =============================================
// توابع کمکی برای کار با localStorage
// =============================================
const USER_DATA_KEY = "my_app_user_data";
const INVITER_CODE_KEY = "inviter_code";

const loadUserDataFromStorage = () => {
  try {
    const data = localStorage.getItem(USER_DATA_KEY);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error("Error parsing localStorage data:", e);
    return null;
  }
};

const saveUserDataToStorage = (newData) => {
  try {
    const currentData = loadUserDataFromStorage() || {};
    const mergedData = { ...currentData, ...newData };
    localStorage.setItem(USER_DATA_KEY, JSON.stringify(mergedData));
  } catch (e) {
    console.error("Error saving to localStorage:", e);
  }
};

// =============================================
// کامپوننت اصلی Wallet
// =============================================
export default function Wallet() {
  const tonWallet = useTonWallet();
  
  const address = useMemo(
    () => tonWallet?.account?.address,
    [tonWallet]
  );

  const hasConnected = useRef(false);

  const [wallet, setWallet] = useState(null);
  const [walletLocked, setWalletLocked] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [errorType, setErrorType] = useState("none");

  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [withdrawAsset, setWithdrawAsset] = useState("ECG");
  const [destinationWallet, setDestinationWallet] = useState("");
  const [withdrawError, setWithdrawError] = useState("");
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  // =============================================
  // 📋 مرحله 1: دریافت کد دعوت در اولین لود
  // =============================================
  useEffect(() => {
    console.log('🔄 [Wallet] useEffect - Starting referral capture...');
    console.log('🔄 [Wallet] Current URL:', window.location.href);
    console.log('🔄 [Wallet] Search params:', window.location.search);
    
    const inviterCode = captureInviterCode();
    console.log('🔄 [Wallet] inviterCode from captureInviterCode():', inviterCode);
    
    if (inviterCode) {
      localStorage.setItem('inviter_code', inviterCode);
      console.log(`💾 [Wallet] Inviter code saved: ${inviterCode}`);
    } else {
      const savedCode = localStorage.getItem('inviter_code');
      console.log(`📂 [Wallet] Checking localStorage: ${savedCode}`);
    }
    
    // بررسی URL برای همه پارامترهای ممکن
    const urlParams = new URLSearchParams(window.location.search);
    console.log('🔍 [Wallet] All URL params:', Object.fromEntries(urlParams));
    
    // بررسی start_param تلگرام
    const tg = window.Telegram?.WebApp;
    console.log('🔍 [Wallet] Telegram WebApp:', !!tg);
    
    if (tg) {
      console.log('🔍 [Wallet] initDataUnsafe:', tg.initDataUnsafe);
      
      if (tg?.initDataUnsafe?.start_param) {
        const startParamValue = tg.initDataUnsafe.start_param;
        console.log(`✅ [Wallet] Telegram start_param found: ${startParamValue}`);
        
        if (startParamValue && startParamValue.startsWith('ref_')) {
          const refCode = startParamValue.replace('ref_', '');
          localStorage.setItem('inviter_code', refCode);
          console.log(`✅ [Wallet] Extracted ref from start_param: ${refCode}`);
        }
      }
    }
    
    const finalCode = localStorage.getItem('inviter_code');
    console.log(`✅ [Wallet] Final inviter_code in localStorage: ${finalCode}`);
    
  }, []);

  // ذخیره آدرس ولت در localStorage
  useEffect(() => {
    if (address) {
      const currentData = loadUserDataFromStorage() || {};
      saveUserDataToStorage({
        ...currentData,
        walletAddress: address
      });
      console.log(`💾 Wallet address saved: ${address.slice(0, 8)}...`);
    }
  }, [address]);

  // =============================================
  // 📋 مرحله 2: تابع اصلی اتصال به سرور
  // =============================================
  const connectAndLoadWallet = useCallback(async () => {
    if (hasConnected.current || !address) {
        console.log('⛔️ Skipping connect (already connected or no address)');
        return;
    }

    console.log('🔄 Starting connectAndLoadWallet...');
    hasConnected.current = true;
    setConnectError("");
    setErrorType("none");
    
    // ====== دریافت کد رفرال ======
    let inviter_code = localStorage.getItem('inviter_code');
    console.log(`📂 [connectAndLoadWallet] inviter_code from localStorage: ${inviter_code}`);
    
    if (!inviter_code) {
      console.log('🔄 [connectAndLoadWallet] No code in localStorage, trying captureInviterCode...');
      inviter_code = captureInviterCode();
      
      if (inviter_code) {
        localStorage.setItem('inviter_code', inviter_code);
        console.log(`💾 [connectAndLoadWallet] inviter_code saved: ${inviter_code}`);
      }
    }

    console.log(`📤 [connectAndLoadWallet] Final inviter_code: ${inviter_code}`);

    // ====== دریافت Telegram ID ======
    let telegramId = null;
    let telegramUsername = null;
    let isTelegram = false;
    let telegramPhotoUrl = null;

    const savedData = loadUserDataFromStorage();
    
    console.log('📂 [connectAndLoadWallet] Saved data from localStorage:', savedData);

    if (savedData?.telegramId && Number.isInteger(Number(savedData.telegramId)) && Number(savedData.telegramId) > 0) {
      telegramId = Number(savedData.telegramId);
      telegramUsername = savedData.telegramUsername || null;
      isTelegram = savedData.isTelegram || false;
      console.log(`📂 Using telegram_id from localStorage: ${telegramId}`);
    } else {
      const tg = window.Telegram?.WebApp;
      
      console.log('🔍 [connectAndLoadWallet] Checking Telegram WebApp:', !!tg);
      
      if (tg?.initDataUnsafe?.user) {
        const user = tg.initDataUnsafe.user;
        telegramId = Number(user.id);
        telegramUsername = user.username || null;
        telegramPhotoUrl = user.photo_url || null;
        isTelegram = true;
        console.log(`✅ Using telegram_id from Telegram: ${telegramId}`);
        
        saveUserDataToStorage({
          telegramId: telegramId,
          telegramUsername: telegramUsername,
           telegramPhotoUrl,
          isTelegram: true
        });
      } else {
        if (address) {
          let hash = 0;
          for (let i = 0; i < address.length; i++) {
            const char = address.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
          }
          telegramId = Number(Math.abs(hash) + 1000000000000);
          telegramUsername = `browser_${address.slice(0, 8)}`;
          isTelegram = false;
          console.log(`🌐 Generated browser telegram_id: ${telegramId}`);
          
          saveUserDataToStorage({
            telegramId: telegramId,
            telegramUsername: telegramUsername,
            isTelegram: false,
            walletAddress: address
          });
        }
      }
    }

    if (!telegramId) {
      telegramId = Number(Math.floor(Math.random() * 1000000000) + 100000000);
      console.log(`⚠️ Generated fallback telegram_id: ${telegramId}`);
    }

    // ====== ساخت Payload ======
    const payload = {
      wallet_address: address,
      inviter_code: inviter_code || null,
      telegram_id: telegramId,
      telegram_username: telegramUsername,
      telegram_photo_url: telegramPhotoUrl,
      is_telegram: isTelegram
    };

    console.log(`📤 Sending payload to /api/connect/`);
    console.log(`📤 Payload:`, payload);

    try {
      const response = await api.post("/connect/", payload);
      
      console.log(`✅ /connect/ response received`);
      console.log(`✅ Status: ${response.status}`);
      console.log(`✅ Response data:`, response.data);

      if (response.data?.user?.wallet_locked) {
        setWalletLocked(true);
        console.log(`🔒 Wallet is locked to this Telegram ID`);
      }

      if (response.data?.user) {
        const user = response.data.user;
        saveUserDataToStorage({
          telegramId: user.telegram_id || telegramId,
          telegramUsername: user.telegram_username || telegramUsername,
          isTelegram: user.is_telegram || isTelegram,
          walletAddress: address
        });
        console.log(`📝 User data saved to localStorage`);
      }

      console.log(`🔄 Fetching wallet data...`);
      const r = await api.get(`/wallet/${address}/`);
      console.log(`✅ Wallet data received:`, r.data);

      setWallet(r.data);
      setErrorType("none");
      console.log(`✅ Connection completed successfully!`);

    } catch (e) {
      console.log(`❌ Error in connectAndLoadWallet`);
      console.log(`❌ Error Message: ${e.message}`);
      
      if (e.response) {
        console.log(`❌ Status Code: ${e.response.status}`);
        console.log(`❌ Response Data:`, e.response.data);
      }

      const errorData = e?.response?.data;
      const statusCode = e?.response?.status;
      const isNetworkError = e.message === 'Network Error' || e.code === 'ERR_NETWORK' || !e.response;

      if (isNetworkError) {
        setErrorType("network_error");
        setConnectError("🌐 Network Error! Please check your internet connection.");
        console.log(`🌐 Network Error detected`);
      } else if (errorData?.error?.includes("already linked") || 
                 errorData?.error?.includes("locked") ||
                 errorData?.detail?.includes("already linked")) {
        setErrorType("locked");
        setConnectError("🔒 This wallet is already linked to another Telegram account.");
        console.log(`🔒 Wallet linked to another account`);
      } else if (statusCode === 400) {
        setErrorType("bad_request");
        const msg = errorData?.error || errorData?.detail || "Invalid wallet address format.";
        setConnectError(`⚠️ Bad Request: ${msg}`);
        console.log(`⚠️ Bad Request: ${msg}`);
      } else {
        setErrorType("server_error");
        const errorMessage = errorData?.error || errorData?.detail || e?.message || "Server error.";
        setConnectError(`❌ Server Error: ${errorMessage}`);
        console.log(`❌ Server Error: ${errorMessage}`);
      }

      if (statusCode !== 400 && !isNetworkError) {
        try {
          console.log(`🔄 Trying to fetch wallet data anyway...`);
          const r = await api.get(`/wallet/${address}/`);
          setWallet(r.data);
          console.log(`✅ Wallet data (fallback) received:`, r.data);
        } catch (e2) {
          console.log(`❌ Fallback also failed: ${e2.message}`);
        }
      }
    }
  }, [address]);

  useEffect(() => {
    console.log(`🔍 Address changed: ${address ? 'Wallet connected' : 'No wallet'}`);
    connectAndLoadWallet();
  }, [connectAndLoadWallet]);

  const disconnectWallet = () => {
    console.log(`🔌 Disconnecting wallet...`);
    
    localStorage.removeItem('telegram_id');
    localStorage.removeItem('inviter_code');
    localStorage.removeItem(INVITER_CODE_KEY);
    clearInviterCode();
    localStorage.removeItem(USER_DATA_KEY);
    
    setWallet(null);
    setWalletLocked(false);
    setConnectError("");
    setErrorType("none");
    hasConnected.current = false;
    
    window.location.reload();
  };

  const handleRetry = () => {
    console.log(`🔄 Retrying connection...`);
    setConnectError("");
    setErrorType("none");
    hasConnected.current = false;
    window.location.reload();
  };

  const openWithdraw = () => {
    setWithdrawError("");
    setAmount("");
    setWithdrawAsset("ECG");
    setDestinationWallet("");
    setIsWithdrawOpen(true);
  };

  const closeWithdraw = () => {
    if (isWithdrawing) return;
    setIsWithdrawOpen(false);
  };

  const onWithdraw = async () => {
    setWithdrawError("");

    const n = Number(amount);
    if (!Number.isFinite(n)) return setWithdrawError("Invalid amount.");
    if (n < 60) return setWithdrawError("Minimum withdrawal is 60.");
    if (!address) return setWithdrawError("Please connect your wallet first.");
    if (!destinationWallet.trim()) {
      return setWithdrawError(
        withdrawAsset === "TON"
          ? "Please enter the destination TON wallet address."
          : "Please enter the destination ECG wallet address."
      );
    }

    if (withdrawAsset === "TON") {
      const tonAddress = destinationWallet.trim();
      const isRawAddress = /^-?\d:[0-9a-fA-F]{64}$/.test(tonAddress);
      const isFriendlyAddress = /^[A-Za-z0-9_-]{48}$/.test(tonAddress);

      if (!isRawAddress && !isFriendlyAddress) {
        return setWithdrawError("Please enter a valid TON Network wallet address.");
      }
    }

    try {
      setIsWithdrawing(true);
      const payload = {
        wallet_address: address,
        destination_wallet: destinationWallet.trim(),
        asset: withdrawAsset,
        scope: "ALL_WITHDRAWABLE",
        amount: n,
      };
      await api.post("/withdraw/request/", payload);
      const r = await api.get(`/wallet/${address}/`);
      setWallet(r.data);
      setIsWithdrawOpen(false);
      setAmount("");
      setDestinationWallet("");
      console.log(`✅ Withdraw completed`);
    } catch (e) {
      setWithdrawError(e?.response?.data?.error || e?.response?.data?.detail || "Withdrawal failed.");
      console.log(`❌ Withdraw failed: ${e.message}`);
    } finally {
      setIsWithdrawing(false);
    }
  };

  return (
    <div className="wallet-page-container">
      <div className="wallet-box">

        <h1 className="wallet-title">
          Connect Wallet
        </h1>

        <div className="connect-button-wrapper">
          <TonConnectButton />
        </div>

        {/* ========== نمایش خطای اتصال ========== */}
        {connectError && (
          <div className="wallet-error" style={{
            color: errorType === 'locked' ? '#ff6b6b' : '#ff6b6b',
            background: errorType === 'locked' ? 'rgba(255,0,0,0.15)' : 'rgba(255,0,0,0.1)',
            padding: '16px 20px',
            borderRadius: '8px',
            marginTop: '12px',
            border: errorType === 'locked' ? '2px solid rgba(255,0,0,0.3)' : '1px solid rgba(255,0,0,0.2)',
            fontSize: '14px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '20px', marginBottom: '8px' }}>
              {errorType === 'locked' ? '🔒' : '⚠️'}
            </div>
            <div>{connectError}</div>
            
            {errorType === 'locked' && (
              <div style={{ marginTop: '12px' }}>
                <button onClick={disconnectWallet} style={{
                  padding: '8px 20px',
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600'
                }}>
                  🔄 Disconnect & Try Again
                </button>
              </div>
            )}

            {errorType === 'network_error' && (
              <div style={{ marginTop: '12px' }}>
                <button onClick={handleRetry} style={{
                  padding: '8px 20px',
                  background: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600'
                }}>
                  🔄 Retry Connection
                </button>
              </div>
            )}
          </div>
        )}

        {address && (
          <div className="wallet-content">
            {!wallet ? (
              <div className="loading-text">Loading...</div>
            ) : (
              <>
                <h3>Total Balance</h3>
                <div className="balance">{wallet.withdrawable_total}</div>
                {walletLocked && (
                  <div className="wallet-locked-badge" style={{
                    fontSize: '12px',
                    color: '#4caf50',
                    marginTop: '8px',
                    padding: '4px 12px',
                    background: 'rgba(76, 175, 80, 0.15)',
                    borderRadius: '20px',
                    display: 'inline-block'
                  }}>
                    🔒 Wallet Locked
                  </div>
                )}
                <button className="withdraw-btn" onClick={openWithdraw}>
                  Withdraw
                </button>
                <button onClick={disconnectWallet} style={{
                  marginTop: '12px',
                  padding: '6px 16px',
                  background: 'transparent',
                  color: '#999',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}>
                  Disconnect Wallet
                </button>
              </>
            )}
          </div>
        )}

      </div>

      {/* Withdraw Modal */}
      {isWithdrawOpen && (
        <div className="modal-backdrop" onClick={closeWithdraw}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Withdraw</h3>
              <button className="modal-close" onClick={closeWithdraw} disabled={isWithdrawing}>×</button>
            </div>
            <div className="modal-body">
              <label>Withdrawal Method</label>
              <div className="asset-picker">
                <button
                  type="button"
                  className={withdrawAsset === "ECG" ? "selected" : ""}
                  onClick={() => {
                    setWithdrawAsset("ECG");
                    setDestinationWallet("");
                    setWithdrawError("");
                  }}
                  disabled={isWithdrawing}
                >
                  Withdraw with ECG
                </button>
                <button
                  type="button"
                  className={withdrawAsset === "TON" ? "selected" : ""}
                  onClick={() => {
                    setWithdrawAsset("TON");
                    setDestinationWallet("");
                    setWithdrawError("");
                  }}
                  disabled={isWithdrawing}
                >
                  Withdraw with TON
                </button>
              </div>

              <label htmlFor="withdraw-destination">
                {withdrawAsset === "TON" ? "TON Wallet Address" : "ECG Wallet Address"}
              </label>
              <input
                id="withdraw-destination"
                type="text"
                value={destinationWallet}
                onChange={(e) => setDestinationWallet(e.target.value)}
                placeholder={
                  withdrawAsset === "TON"
                    ? "Enter destination TON wallet address"
                    : "Enter destination ECG wallet address"
                }
                disabled={isWithdrawing}
                autoComplete="off"
              />

              <label htmlFor="withdraw-amount">Withdrawal Amount (ECG)</label>
              <input
                id="withdraw-amount"
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Minimum 60 ECG"
                min="60"
                disabled={isWithdrawing}
              />
              {withdrawError && <div className="error-text">{withdrawError}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={closeWithdraw} disabled={isWithdrawing}>Cancel</button>
              <button className="btn-primary" onClick={onWithdraw} disabled={isWithdrawing}>
                {isWithdrawing ? "Submitting..." : "Confirm Withdrawal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
