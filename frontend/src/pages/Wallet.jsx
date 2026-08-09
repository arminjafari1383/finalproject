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
  const [errorType, setErrorType] = useState("none");

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

  // =============================================
  // ⭐ سیستم لاگ‌گیری روی صفحه (Screen Logger)
  // =============================================
  const [logs, setLogs] = useState([]);
  
  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, message, type }]);
    // همچنین در کنسول هم چاپ می‌شود
    if (type === 'error') console.error(`[${timestamp}] ${message}`);
    else if (type === 'success') console.log(`✅ [${timestamp}] ${message}`);
    else console.log(`[${timestamp}] ${message}`);
  };

  const clearLogs = () => setLogs([]);
  // =============================================

  // دریافت کد دعوت در اولین لود
  useEffect(() => {
    addLog("🔍 Capturing referral code...");
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
      addLog(`💾 Wallet address saved: ${address.slice(0, 8)}...`);
    }
  }, [address]);

  // ✅ تابع اصلی اتصال به سرور
  const connectAndLoadWallet = useCallback(async () => {
    if (hasConnected.current || !address) {
        addLog("⛔️ Skipping connect (already connected or no address)", 'info');
        return;
    }

    addLog("🔄 Starting connectAndLoadWallet...", 'info');
    hasConnected.current = true;
    setConnectError("");
    setErrorType("none");
    
    const tgStartParam =
      window.Telegram?.WebApp?.initDataUnsafe?.start_param || "";
    const lsInviterCode =
      localStorage.getItem("inviter_code") || "";
    const inviter_code = captureInviterCode();

    // ====== دریافت Telegram ID ======
    let telegramId = null;
    let telegramUsername = null;
    let isTelegram = false;

    const savedData = loadUserDataFromStorage();
    
    if (savedData?.telegramId && Number.isInteger(Number(savedData.telegramId)) && Number(savedData.telegramId) > 0) {
      telegramId = Number(savedData.telegramId);
      telegramUsername = savedData.telegramUsername || null;
      isTelegram = savedData.isTelegram || false;
      addLog(`📂 Using telegram_id from localStorage: ${telegramId}`);
    } else {
      const tg = window.Telegram?.WebApp;
      if (tg?.initDataUnsafe?.user) {
        const user = tg.initDataUnsafe.user;
        telegramId = Number(user.id);
        telegramUsername = user.username || null;
        isTelegram = true;
        addLog(`✅ Using telegram_id from Telegram: ${telegramId}`);
        
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
          addLog(`🌐 Generated browser telegram_id: ${telegramId}`);
          
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
      addLog(`⚠️ Generated fallback telegram_id: ${telegramId}`);
    }

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

    addLog(`📤 Sending payload to /api/connect/`, 'info');
    addLog(`📤 Payload: ${JSON.stringify(payload, null, 2)}`);

    try {
      const response = await api.post("/connect/", payload);
      addLog(`✅ /connect/ response received`, 'success');
      addLog(`✅ Status: ${response.status}`);

      if (response.data?.user?.wallet_locked) {
        setWalletLocked(true);
        addLog(`🔒 Wallet is locked to this Telegram ID`, 'info');
      }

      if (response.data?.user) {
        const user = response.data.user;
        saveUserDataToStorage({
          telegramId: user.telegram_id || telegramId,
          telegramUsername: user.telegram_username || telegramUsername,
          isTelegram: user.is_telegram || isTelegram,
          walletAddress: address
        });
        addLog(`📝 User data saved to localStorage`, 'success');
      }

      setDebug((d) => ({
        ...d,
        connectStatus: "connect OK ✅",
        connectError: "",
      }));

      addLog(`🔄 Fetching wallet data...`, 'info');
      const r = await api.get(`/wallet/${address}/`);
      addLog(`✅ Wallet data received`, 'success');

      setWallet(r.data);
      setErrorType("none");
      addLog(`✅ Connection completed successfully!`, 'success');

    } catch (e) {
      addLog(`❌ Error in connectAndLoadWallet`, 'error');
      addLog(`❌ Error Message: ${e.message}`, 'error');
      
      if (e.response) {
        addLog(`❌ Status Code: ${e.response.status}`, 'error');
        addLog(`❌ Response Data: ${JSON.stringify(e.response.data)}`, 'error');
      } else if (e.request) {
        addLog(`⚠️ Request made but NO response received (Network Error / CORS)`, 'error');
        addLog(`⚠️ This is likely a CORS or DNS issue.`, 'error');
      } else {
        addLog(`❌ Request setup error: ${e.message}`, 'error');
      }

      const errorData = e?.response?.data;
      const statusCode = e?.response?.status;
      const isNetworkError = e.message === 'Network Error' || e.code === 'ERR_NETWORK' || !e.response;

      if (isNetworkError) {
        setErrorType("network_error");
        setConnectError("🌐 Network Error! Please check your internet connection.");
        addLog(`🌐 Network Error detected. Server unreachable.`, 'error');
      } else if (errorData?.error?.includes("already linked") || 
                 errorData?.error?.includes("locked") ||
                 errorData?.detail?.includes("already linked")) {
        setErrorType("locked");
        setConnectError("🔒 This wallet is already linked to another Telegram account.");
        addLog(`🔒 Wallet linked to another account`, 'error');
      } else if (statusCode === 400) {
        setErrorType("bad_request");
        const msg = errorData?.error || errorData?.detail || "Invalid wallet address format.";
        setConnectError(`⚠️ Bad Request: ${msg}`);
        addLog(`⚠️ Bad Request: ${msg}`, 'error');
      } else {
        setErrorType("server_error");
        const errorMessage = errorData?.error || errorData?.detail || e?.message || "Server error.";
        setConnectError(`❌ Server Error: ${errorMessage}`);
        addLog(`❌ Server Error: ${errorMessage}`, 'error');
      }

      setDebug((d) => ({
        ...d,
        connectStatus: "connect FAILED ❌",
        connectError: errorData?.error || errorData?.detail || "",
      }));

      if (statusCode !== 400 && !isNetworkError) {
        try {
          addLog(`🔄 Trying to fetch wallet data anyway...`, 'info');
          const r = await api.get(`/wallet/${address}/`);
          setWallet(r.data);
          addLog(`✅ Wallet data (fallback) received`, 'success');
        } catch (e2) {
          addLog(`❌ Fallback also failed: ${e2.message}`, 'error');
        }
      }
    }
  }, [address]);

  useEffect(() => {
    addLog(`🔍 Address changed: ${address ? 'Wallet connected' : 'No wallet'}`);
    connectAndLoadWallet();
  }, [connectAndLoadWallet]);

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
    addLog(`🔌 Wallet disconnected`, 'info');
    
    window.location.reload();
  };

  const handleRetry = () => {
    setConnectError("");
    setErrorType("none");
    hasConnected.current = false;
    addLog(`🔄 Retrying connection...`, 'info');
    window.location.reload();
  };

  const resetReferral = () => {
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
      addLog(`✅ Withdraw completed`, 'success');
    } catch (e) {
      setWithdrawError(e?.response?.data?.error || e?.response?.data?.detail || "Withdrawal failed.");
      addLog(`❌ Withdraw failed: ${e.message}`, 'error');
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
                <p style={{ fontSize: '13px', color: '#666', marginBottom: '10px' }}>
                  This wallet is connected to another Telegram account. 
                  Please use the wallet that is linked to your current Telegram account.
                </p>
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
                <p style={{ fontSize: '13px', color: '#666', marginBottom: '10px' }}>
                  The server is currently unreachable. Please check your internet connection.
                </p>
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
                <button className="withdraw-btn" onClick={openWithdraw} disabled={walletLocked}>
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
              <h3>Withdraw ECG</h3>
              <button className="modal-close" onClick={closeWithdraw} disabled={isWithdrawing}>×</button>
            </div>
            <div className="modal-body">
              <label>Withdrawal Amount (ECG)</label>
              <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 60" min="0" />
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

      {/* ================================================== */}
      {/* ⭐ پنل نمایش لاگ‌ها روی صفحه (فقط برای دیباگ) */}
      {/* ================================================== */}
      <div style={{
        position: 'fixed',
        bottom: '80px',
        left: '10px',
        right: '10px',
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        color: '#fff',
        padding: '12px',
        borderRadius: '10px',
        maxHeight: '250px',
        overflowY: 'auto',
        fontSize: '11px',
        fontFamily: 'monospace',
        zIndex: 9999,
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        border: '1px solid #333'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', borderBottom: '1px solid #444', paddingBottom: '6px' }}>
          <span style={{ fontWeight: 'bold', color: '#4fc3f7' }}>📋 Debug Logs</span>
          <button onClick={clearLogs} style={{ background: 'transparent', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>Clear</button>
        </div>
        {logs.length === 0 && <div style={{ color: '#777' }}>No logs yet. Connect your wallet...</div>}
        {logs.map((log, idx) => (
          <div key={idx} style={{
            padding: '2px 0',
            color: log.type === 'error' ? '#ff6b6b' : log.type === 'success' ? '#69db7c' : '#e0e0e0',
            borderBottom: '1px solid #222'
          }}>
            <span style={{ color: '#888' }}>[{log.timestamp}]</span> {log.message}
          </div>
        ))}
      </div>
    </div>
  );
}