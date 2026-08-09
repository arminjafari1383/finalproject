import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useTonWallet, TonConnectButton } from "@tonconnect/ui-react";
import { api } from "../api";
import "./Wallet.css";
import {
  captureInviterCode,
  clearInviterCode,
} from "../utils/referral";

// =============================================
// توابع کمکی برای کار با localStorage (جایگزین کوکی)
// =============================================
const USER_DATA_KEY = "my_app_user_data";

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

export default function Wallet() {
  const tonWallet = useTonWallet();
  
  // آدرس ولت
  const address = useMemo(
    () => tonWallet?.account?.address,
    [tonWallet]
  );

  // ✅ قفل اتصال برای جلوگیری از حلقه (لوپ)
  const hasConnected = useRef(false);

  const [wallet, setWallet] = useState(null);
  const [walletLocked, setWalletLocked] = useState(false);
  const [connectError, setConnectError] = useState("");
  
  // ✅ نوع خطا را ذخیره می‌کنیم تا در UI نمایش دهیم
  const [errorType, setErrorType] = useState("none"); // 'locked', 'bad_request', 'server_error', 'network_error', 'none'

  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [withdrawError, setWithdrawError] = useState("");
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const [debug, setDebug] = useState({
    tgStartParam: "",
    lsInviterCode: "",
    sentInviterCode: "",
    connectStatus: "",
    connectError: "",
  });

  // دریافت کد دعوت در اولین لود
  useEffect(() => {
    console.log("🔍 [Wallet] useEffect - Capture referral");
    const code = captureInviterCode();
    
    setDebug((d) => ({
      ...d,
      tgStartParam:
        window.Telegram?.WebApp?.initDataUnsafe?.start_param || "",
      lsInviterCode:
        localStorage.getItem("inviter_code") || "",
      sentInviterCode: code || "",
      connectStatus: "Wallet page loaded",
      connectError: "",
    }));
  }, []);

  // ذخیره آدرس ولت در localStorage
  useEffect(() => {
    if (address) {
      const currentData = loadUserDataFromStorage() || {};
      saveUserDataToStorage({
        ...currentData,
        walletAddress: address
      });
      console.log("💾 [Wallet] Wallet address saved to localStorage:", address);
    }
  }, [address]);

  // ✅ تابع اصلی اتصال به سرور
  const connectAndLoadWallet = useCallback(async () => {
    // اگر قبلاً درخواست فرستاده شده یا آدرس نداریم، خارج شو
    if (hasConnected.current || !address) {
        console.log("⛔️ [Wallet] Already connected or no address, skipping connect.");
        return;
    }

    console.log("🔄 [Wallet] Starting connectAndLoadWallet...");
    hasConnected.current = true; // قفل را بزن
    setConnectError("");
    setErrorType("none"); // ریست کردن نوع خطا
    
    const tgStartParam =
      window.Telegram?.WebApp?.initDataUnsafe?.start_param || "";
    console.log("📊 [Wallet] tgStartParam:", tgStartParam);

    const lsInviterCode =
      localStorage.getItem("inviter_code") || "";
    console.log("📊 [Wallet] lsInviterCode:", lsInviterCode);

    const inviter_code = captureInviterCode();
    console.log("📊 [Wallet] inviter_code from capture:", inviter_code);

    // ====== دریافت Telegram ID ======
    let telegramId = null;
    let telegramUsername = null;
    let isTelegram = false;

    const savedData = loadUserDataFromStorage();
    console.log("📂 [Wallet] Saved data from localStorage:", savedData);

    if (savedData?.telegramId && Number.isInteger(Number(savedData.telegramId)) && Number(savedData.telegramId) > 0) {
      telegramId = Number(savedData.telegramId);
      telegramUsername = savedData.telegramUsername || null;
      isTelegram = savedData.isTelegram || false;
      console.log("📂 [Wallet] Using telegram_id from localStorage:", telegramId);
    } else {
      const tg = window.Telegram?.WebApp;
      if (tg?.initDataUnsafe?.user) {
        const user = tg.initDataUnsafe.user;
        telegramId = Number(user.id);
        telegramUsername = user.username || null;
        isTelegram = true;
        console.log("✅ [Wallet] Using telegram_id from Telegram:", telegramId);
        
        saveUserDataToStorage({
          telegramId: telegramId,
          telegramUsername: telegramUsername,
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
          console.log("🌐 [Wallet] Generated browser telegram_id:", telegramId);
          
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
      console.log("⚠️ [Wallet] Generated fallback telegram_id:", telegramId);
    }
    // ======================================

    setDebug((d) => ({
      ...d,
      tgStartParam,
      lsInviterCode,
      sentInviterCode: inviter_code || "",
      connectStatus: "Sending /connect ...",
      connectError: "",
    }));

    const payload = {
      wallet_address: address,
      inviter_code: inviter_code || null,
      is_telegram: isTelegram
    };

    if (telegramId && Number.isInteger(telegramId) && telegramId > 0) {
      payload.telegram_id = telegramId;
      payload.telegram_username = telegramUsername || null;
    }

    console.log("📤 [Wallet] Sending to /api/connect/:");
    console.log("📤 [Wallet] Payload:", JSON.stringify(payload, null, 2));

    // ============================================================
    // ⏱️ شروع زمان‌بندی و لاگ‌های گسترده
    // ============================================================
    const startTime = Date.now();
    console.group(`📡 [Request] /connect/ (Started at ${new Date().toISOString()})`);

    try {
      console.log("📤 [Axios] Sending POST request...");
      console.log("📤 [Axios] URL:", api.defaults.baseURL + "/connect/");
      console.log("📤 [Axios] Payload:", payload);
      
      const response = await api.post("/connect/", payload);
      const endTime = Date.now();
      console.log(`⏱️ [Timing] Request took ${endTime - startTime}ms`);

      console.log("✅ [Axios] Response received!");
      console.log("✅ [Axios] Status:", response.status);
      console.log("✅ [Axios] Status Text:", response.statusText);
      console.log("✅ [Axios] Full Response Headers:", response.headers);
      console.log("✅ [Axios] Response Data:", response.data);

      console.log("✅ [Wallet] /connect/ response:", response.data);

      if (response.data?.user?.wallet_locked) {
        setWalletLocked(true);
        console.log("🔒 [Wallet] Wallet is locked to this Telegram ID");
      }

      if (response.data?.user) {
        const user = response.data.user;
        saveUserDataToStorage({
          telegramId: user.telegram_id || telegramId,
          telegramUsername: user.telegram_username || telegramUsername,
          isTelegram: user.is_telegram || isTelegram,
          walletAddress: address
        });
      }

      setDebug((d) => ({
        ...d,
        connectStatus: "connect OK ✅",
        connectError: "",
      }));

      console.log("🔄 [Wallet] Fetching wallet data...");
      console.log("🔄 [Axios] Fetching /wallet/${address}/...");
      
      const r = await api.get(`/wallet/${address}/`);
      console.log("✅ [Axios] Wallet Data Response:", r.data);
      console.log("✅ [Wallet] Wallet data:", r.data);

      setWallet(r.data);
      setErrorType("none"); // اتصال موفق
      
      console.groupEnd(); // پایان گروه لاگ

    } catch (e) {
      const endTime = Date.now();
      console.log(`⏱️ [Timing] Request failed after ${endTime - startTime}ms`);
      console.groupEnd(); // پایان گروه لاگ

      console.log("❌ [Wallet] Error in connectAndLoadWallet:");
      
      // ✅ لاگ‌گیری کامل از خطا برای دیباگ
      console.log("🔍 [Wallet] FULL ERROR OBJECT START ----------------------------");
      console.log("🔍 [Wallet] Error Name:", e.name);
      console.log("🔍 [Wallet] Error Message:", e.message);
      console.log("🔍 [Wallet] Error Code:", e.code);
      console.log("🔍 [Wallet] Error Stack:", e.stack);
      
      if (e.response) {
        console.log("🔍 [Wallet] ✅ A response was received from the server.");
        console.log("🔍 [Wallet] Response Status Code:", e.response.status);
        console.log("🔍 [Wallet] Response Status Text:", e.response.statusText);
        console.log("🔍 [Wallet] Response Headers:", e.response.headers);
        console.log("🔍 [Wallet] Response Data:", e.response.data);
      } else if (e.request) {
        console.log("🔍 [Wallet] ⚠️ Request was made but NO response received.");
        console.log("🔍 [Wallet] Request object:", e.request);
        console.log("🔍 [Wallet] This usually means a Network Error (CORS or DNS).");
      } else {
        console.log("🔍 [Wallet] ❌ Something happened in setting up the request.");
        console.log("🔍 [Wallet] Error message:", e.message);
      }
      console.log("🔍 [Wallet] FULL ERROR OBJECT END ------------------------------");

      const errorData = e?.response?.data;
      const statusCode = e?.response?.status;
      const isNetworkError = e.message === 'Network Error' || e.code === 'ERR_NETWORK' || !e.response;

      // ====== 1. تشخیص خطای شبکه (Network Error) ======
      if (isNetworkError) {
        setErrorType("network_error");
        setConnectError("🌐 Network Error! Please check your internet connection and try again.");
        console.log("❌ [Wallet] Network Error detected. The server is unreachable.");
      }
      // ====== 2. تشخیص خطای قفل بودن ولت (Locked) ======
      else if (errorData?.error?.includes("already linked") || 
               errorData?.error?.includes("locked") ||
               errorData?.detail?.includes("already linked")) {
        setErrorType("locked");
        setConnectError("🔒 This wallet is already linked to another Telegram account.");
        console.log("🔒 [Wallet] Wallet linked to another account");
      } 
      // ====== 3. تشخیص خطای 400 (Bad Request) ======
      else if (statusCode === 400) {
        setErrorType("bad_request");
        const msg = errorData?.error || errorData?.detail || "The wallet address format is invalid.";
        setConnectError(`⚠️ Bad Request: ${msg}`);
        console.log("❌ [Wallet] Bad Request (400). Check your wallet address format.");
      } 
      // ====== 4. سایر خطاهای سرور ======
      else {
        setErrorType("server_error");
        const errorMessage = errorData?.error ||
                            errorData?.detail ||
                            e?.message ||
                            "Failed to connect wallet. Please try again.";
        setConnectError(`❌ Server Error: ${errorMessage}`);
      }

      setDebug((d) => ({
        ...d,
        connectStatus: "connect FAILED ❌",
        connectError: errorData?.error || errorData?.detail || "",
      }));

      // تلاش برای دریافت اطلاعات ولت (فقط اگر خطای 400 یا Network نباشد)
      if (statusCode !== 400 && !isNetworkError) {
        try {
          console.log("🔄 [Wallet] Trying to fetch wallet data anyway...");
          const r = await api.get(`/wallet/${address}/`);
          console.log("✅ [Wallet] Wallet data (fallback):", r.data);
          setWallet(r.data);
        } catch (e2) {
          console.log("❌ [Wallet] Fallback also failed:", e2);
        }
      }
    }
  }, [address]);

  // ✅ useEffect فقط به تابع اتصال وابسته است
  useEffect(() => {
    console.log("🔍 [Wallet] useEffect triggered (address changed)");
    connectAndLoadWallet();
  }, [connectAndLoadWallet]);

  // تابع قطع ارتباط
  const disconnectWallet = () => {
    localStorage.removeItem('telegram_id');
    localStorage.removeItem('inviter_code');
    clearInviterCode();
    localStorage.removeItem(USER_DATA_KEY);
    
    setWallet(null);
    setWalletLocked(false);
    setConnectError("");
    setErrorType("none");
    hasConnected.current = false;
    
    window.location.reload();
  };

  // تابع تلاش مجدد (Retry) برای خطای شبکه
  const handleRetry = () => {
    setConnectError("");
    setErrorType("none");
    hasConnected.current = false; // ریست کردن قفل
    window.location.reload(); // رفرش کردن صفحه برای تلاش مجدد
  };

  const resetReferral = () => {
    console.log("🔄 [Wallet] resetReferral called");
    clearInviterCode();

    setDebug((d) => ({
      ...d,
      lsInviterCode: "",
      sentInviterCode: "",
      connectStatus: "Referral reset done",
      connectError: "",
    }));

    alert("inviter_code پاک شد");
  };

  const openWithdraw = () => {
    setWithdrawError("");
    setAmount("");
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

    try {
      setIsWithdrawing(true);
      const payload = { wallet_address: address, scope: "ALL_WITHDRAWABLE", amount: n };
      await api.post("/withdraw/request/", payload);
      const r = await api.get(`/wallet/${address}/`);
      setWallet(r.data);
      setIsWithdrawOpen(false);
    } catch (e) {
      setWithdrawError(e?.response?.data?.error || e?.response?.data?.detail || "Withdrawal failed.");
    } finally {
      setIsWithdrawing(false);
    }
  };

  console.log("📊 [Wallet] Component state:", {
    address,
    wallet: wallet,
    walletLocked,
    connectError,
    errorType,
    isWithdrawOpen,
    amount,
    withdrawError,
    isWithdrawing,
    debug,
  });

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
            
            {/* اگر خطای قفل بود، دکمه قطع اتصال را نشان بده */}
            {errorType === 'locked' && (
              <div style={{ marginTop: '12px' }}>
                <p style={{ fontSize: '13px', color: '#666', marginBottom: '10px' }}>
                  This wallet is connected to another Telegram account. 
                  Please use the wallet that is linked to your current Telegram account.
                </p>
                <button
                  onClick={disconnectWallet}
                  style={{
                    padding: '8px 20px',
                    background: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '600'
                  }}
                >
                  🔄 Disconnect & Try Again
                </button>
              </div>
            )}

            {/* اگر خطای ۴۰۰ یا سرور بود، راهنمایی نشان بده */}
            {errorType === 'bad_request' && (
              <div style={{ marginTop: '12px', fontSize: '13px', color: '#888' }}>
                Make sure you are using a valid TON wallet address.
              </div>
            )}

            {/* اگر خطای شبکه (Network Error) بود، دکمه Retry را نشان بده */}
            {errorType === 'network_error' && (
              <div style={{ marginTop: '12px' }}>
                <p style={{ fontSize: '13px', color: '#666', marginBottom: '10px' }}>
                  The server is currently unreachable. Please check your internet connection.
                </p>
                <button
                  onClick={handleRetry}
                  style={{
                    padding: '8px 20px',
                    background: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '600'
                  }}
                >
                  🔄 Retry Connection
                </button>
              </div>
            )}
          </div>
        )}

        {address && (
          <div className="wallet-content">

            {!wallet ? (
              <div className="loading-text">
                Loading...
              </div>
            ) : (
              <>
                <h3>Total Balance</h3>

                <div className="balance">
                  {wallet.withdrawable_total}
                </div>

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

                <button
                  className="withdraw-btn"
                  onClick={openWithdraw}
                  disabled={walletLocked}
                >
                  Withdraw
                </button>

                {/* دکمه قطع ارتباط */}
                <button
                  onClick={disconnectWallet}
                  style={{
                    marginTop: '12px',
                    padding: '6px 16px',
                    background: 'transparent',
                    color: '#999',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Disconnect Wallet
                </button>
              </>
            )}

          </div>
        )}

      </div>

      {/* Withdraw Modal */}
      {isWithdrawOpen && (
        <div
          className="modal-backdrop"
          onClick={closeWithdraw}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>Withdraw ECG</h3>

              <button
                className="modal-close"
                onClick={closeWithdraw}
                disabled={isWithdrawing}
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              <label>
                Withdrawal Amount (ECG)
              </label>

              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) =>
                  setAmount(e.target.value)
                }
                placeholder="e.g. 60"
                min="0"
              />

              {withdrawError && (
                <div className="error-text">
                  {withdrawError}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={closeWithdraw}
                disabled={isWithdrawing}
              >
                Cancel
              </button>

              <button
                className="btn-primary"
                onClick={onWithdraw}
                disabled={isWithdrawing}
              >
                {isWithdrawing
                  ? "Submitting..."
                  : "Confirm Withdrawal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}