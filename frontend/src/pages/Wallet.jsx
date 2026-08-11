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
const DEBUG_REFERRAL_KEY = "debug_referral_logs";

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
// 📋 دیباگ لاگر رفرال
// =============================================
const debugReferral = (step, data) => {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    step,
    data,
    url: window.location.href,
    search: window.location.search,
    hash: window.location.hash,
  };
  
  // ذخیره در localStorage برای دیباگ
  try {
    const logs = JSON.parse(localStorage.getItem(DEBUG_REFERRAL_KEY) || '[]');
    logs.push(logEntry);
    // فقط ۵۰ تا آخرین لاگ رو نگه دار
    if (logs.length > 50) logs.shift();
    localStorage.setItem(DEBUG_REFERRAL_KEY, JSON.stringify(logs));
  } catch (e) {
    console.error("Error saving debug log:", e);
  }
  
  // نمایش در کنسول با رنگ
  const colors = {
    'START': '#4CAF50',
    'URL': '#2196F3',
    'STORAGE': '#FF9800',
    'TELEGRAM': '#9C27B0',
    'PAYLOAD': '#E91E63',
    'RESPONSE': '#00BCD4',
    'ERROR': '#F44336',
    'SUCCESS': '#4CAF50',
  };
  
  const color = colors[step] || '#FFFFFF';
  console.log(
    `%c📋 [${step}] ${timestamp}`,
    `background: ${color}; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;`
  );
  console.log(`📋 Data:`, data);
  console.log(`📋 URL: ${window.location.href}`);
  console.log(`📋 Search: ${window.location.search}`);
  console.log(`📋 Hash: ${window.location.hash}`);
  console.log('---');
  
  return logEntry;
};

// =============================================
// نمایش لاگ‌های رفرال در صفحه
// =============================================
const ReferralDebugger = () => {
  const [logs, setLogs] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  
  useEffect(() => {
    try {
      const logs = JSON.parse(localStorage.getItem(DEBUG_REFERRAL_KEY) || '[]');
      setLogs(logs);
    } catch (e) {
      console.error("Error loading debug logs:", e);
    }
  }, []);
  
  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 9999,
          padding: '10px 16px',
          background: '#333',
          color: '#4CAF50',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 'bold',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}
      >
        🐛 Referral Debug ({logs.length})
      </button>
    );
  }
  
  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: 9999,
      width: '500px',
      maxHeight: '400px',
      background: '#1e1e1e',
      color: '#d4d4d4',
      borderRadius: '8px',
      padding: '16px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
      overflow: 'auto',
      fontFamily: 'monospace',
      fontSize: '12px',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
        borderBottom: '1px solid #333',
        paddingBottom: '8px',
      }}>
        <span style={{ color: '#4CAF50', fontWeight: 'bold' }}>🐛 Referral Debug Logs</span>
        <button 
          onClick={() => setIsOpen(false)}
          style={{
            background: 'transparent',
            color: '#888',
            border: 'none',
            cursor: 'pointer',
            fontSize: '18px',
          }}
        >
          ✕
        </button>
      </div>
      
      <div style={{ marginBottom: '8px', display: 'flex', gap: '8px' }}>
        <button 
          onClick={() => {
            localStorage.removeItem(DEBUG_REFERRAL_KEY);
            setLogs([]);
          }}
          style={{
            padding: '4px 12px',
            background: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '11px',
          }}
        >
          Clear Logs
        </button>
        <button 
          onClick={() => {
            const logs = JSON.parse(localStorage.getItem(DEBUG_REFERRAL_KEY) || '[]');
            console.log('📋 Full Debug Logs:', logs);
          }}
          style={{
            padding: '4px 12px',
            background: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '11px',
          }}
        >
          Export to Console
        </button>
      </div>
      
      {logs.length === 0 ? (
        <div style={{ color: '#666', textAlign: 'center', padding: '20px' }}>
          No logs yet. Open a referral link to start debugging.
        </div>
      ) : (
        logs.map((log, index) => (
          <div key={index} style={{
            padding: '6px 8px',
            marginBottom: '4px',
            background: index % 2 === 0 ? '#252525' : '#1a1a1a',
            borderRadius: '4px',
            borderLeft: `3px solid ${log.data?.step === 'ERROR' ? '#F44336' : '#4CAF50'}`,
            fontSize: '11px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888' }}>
              <span>{log.step}</span>
              <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
            </div>
            <div style={{ color: '#d4d4d4', wordBreak: 'break-all' }}>
              {log.data?.message || JSON.stringify(log.data).slice(0, 100)}
              {JSON.stringify(log.data).length > 100 && '...'}
            </div>
            {log.data?.code && (
              <div style={{ color: '#4CAF50', fontSize: '10px' }}>
                Code: {log.data.code}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
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
  const [withdrawError, setWithdrawError] = useState("");
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  // =============================================
  // 📋 مرحله 1: دریافت کد دعوت در اولین لود
  // =============================================
  useEffect(() => {
    debugReferral('START', { 
      message: '🔍 Starting referral capture...',
      url: window.location.href,
      search: window.location.search,
    });
    
    const inviterCode = captureInviterCode();
    
    debugReferral('CAPTURE', {
      message: inviterCode ? `✅ Inviter code captured: ${inviterCode}` : 'ℹ️ No inviter code found',
      code: inviterCode,
      localStorage: localStorage.getItem('inviter_code'),
    });
    
    // بررسی URL برای پارامتر ref
    const urlParams = new URLSearchParams(window.location.search);
    const refParam = urlParams.get('ref');
    const startParam = urlParams.get('startapp');
    
    debugReferral('URL', {
      message: '🔍 Checking URL parameters',
      refParam,
      startParam,
      allParams: Object.fromEntries(urlParams),
    });
    
    // بررسی start_param تلگرام
    const tg = window.Telegram?.WebApp;
    if (tg?.initDataUnsafe?.start_param) {
      debugReferral('TELEGRAM', {
        message: `✅ Telegram start_param found: ${tg.initDataUnsafe.start_param}`,
        start_param: tg.initDataUnsafe.start_param,
        initDataUnsafe: tg.initDataUnsafe,
      });
    }
    
  }, []);

  // ذخیره آدرس ولت در localStorage
  useEffect(() => {
    if (address) {
      const currentData = loadUserDataFromStorage() || {};
      saveUserDataToStorage({
        ...currentData,
        walletAddress: address
      });
      debugReferral('STORAGE', {
        message: `💾 Wallet address saved: ${address.slice(0, 8)}...`,
        address: address,
        currentData: currentData,
      });
    }
  }, [address]);

  // =============================================
  // 📋 مرحله 2: تابع اصلی اتصال به سرور
  // =============================================
  const connectAndLoadWallet = useCallback(async () => {
    if (hasConnected.current || !address) {
        debugReferral('SKIP', {
          message: '⛔️ Skipping connect (already connected or no address)',
          hasConnected: hasConnected.current,
          address: address,
        });
        return;
    }

    debugReferral('START', {
      message: '🔄 Starting connectAndLoadWallet...',
      address: address,
      timestamp: new Date().toISOString(),
    });
    
    hasConnected.current = true;
    setConnectError("");
    setErrorType("none");
    
    // ====== دریافت کد رفرال ======
    const inviter_code = captureInviterCode();
    
    debugReferral('REFERRAL', {
      message: inviter_code ? `✅ Inviter code found: ${inviter_code}` : 'ℹ️ No inviter code found',
      code: inviter_code,
      localStorage: localStorage.getItem('inviter_code'),
    });

    // ====== دریافت Telegram ID ======
    let telegramId = null;
    let telegramUsername = null;
    let isTelegram = false;

    const savedData = loadUserDataFromStorage();
    
    debugReferral('STORAGE', {
      message: '📂 Loading user data from storage',
      savedData: savedData,
    });
    
    if (savedData?.telegramId && Number.isInteger(Number(savedData.telegramId)) && Number(savedData.telegramId) > 0) {
      telegramId = Number(savedData.telegramId);
      telegramUsername = savedData.telegramUsername || null;
      isTelegram = savedData.isTelegram || false;
      
      debugReferral('TELEGRAM', {
        message: `📂 Using telegram_id from localStorage: ${telegramId}`,
        telegramId: telegramId,
        telegramUsername: telegramUsername,
        isTelegram: isTelegram,
        source: 'localStorage',
      });
    } else {
      const tg = window.Telegram?.WebApp;
      
      debugReferral('TELEGRAM', {
        message: '🔍 Checking Telegram WebApp',
        hasTelegram: !!tg,
        initDataUnsafe: tg?.initDataUnsafe,
      });
      
      if (tg?.initDataUnsafe?.user) {
        const user = tg.initDataUnsafe.user;
        telegramId = Number(user.id);
        telegramUsername = user.username || null;
        isTelegram = true;
        
        debugReferral('TELEGRAM', {
          message: `✅ Using telegram_id from Telegram: ${telegramId}`,
          telegramId: telegramId,
          telegramUsername: telegramUsername,
          user: user,
          source: 'Telegram',
        });
        
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
          
          debugReferral('BROWSER', {
            message: `🌐 Generated browser telegram_id: ${telegramId}`,
            telegramId: telegramId,
            telegramUsername: telegramUsername,
            address: address,
            hash: hash,
          });
          
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
      debugReferral('FALLBACK', {
        message: `⚠️ Generated fallback telegram_id: ${telegramId}`,
        telegramId: telegramId,
      });
    }

    // ====== ساخت Payload ======
    const payload = {
      wallet_address: address,
      inviter_code: inviter_code || null,
      is_telegram: isTelegram
    };

    if (telegramId && Number.isInteger(telegramId) && telegramId > 0) {
      payload.telegram_id = telegramId;
      payload.telegram_username = telegramUsername || null;
    }

    debugReferral('PAYLOAD', {
      message: '📤 Sending payload to /api/connect/',
      payload: payload,
      fullPayload: JSON.stringify(payload, null, 2),
    });

    try {
      const response = await api.post("/connect/", payload);
      
      debugReferral('RESPONSE', {
        message: `✅ /connect/ response received`,
        status: response.status,
        data: response.data,
        headers: response.headers,
      });

      if (response.data?.user?.wallet_locked) {
        setWalletLocked(true);
        debugReferral('LOCKED', {
          message: '🔒 Wallet is locked to this Telegram ID',
          walletLocked: true,
        });
      }

      if (response.data?.user) {
        const user = response.data.user;
        saveUserDataToStorage({
          telegramId: user.telegram_id || telegramId,
          telegramUsername: user.telegram_username || telegramUsername,
          isTelegram: user.is_telegram || isTelegram,
          walletAddress: address
        });
        
        debugReferral('STORAGE', {
          message: '📝 User data saved to localStorage',
          user: user,
          savedData: {
            telegramId: user.telegram_id || telegramId,
            telegramUsername: user.telegram_username || telegramUsername,
            isTelegram: user.is_telegram || isTelegram,
          },
        });
      }

      debugReferral('FETCH', {
        message: '🔄 Fetching wallet data...',
        url: `/wallet/${address}/`,
      });
      
      const r = await api.get(`/wallet/${address}/`);
      
      debugReferral('WALLET', {
        message: '✅ Wallet data received',
        wallet: r.data,
      });

      setWallet(r.data);
      setErrorType("none");
      
      debugReferral('SUCCESS', {
        message: '✅ Connection completed successfully!',
        wallet: r.data,
      });

    } catch (e) {
      debugReferral('ERROR', {
        message: '❌ Error in connectAndLoadWallet',
        error: {
          message: e.message,
          response: e.response,
          request: e.request,
          stack: e.stack,
        },
      });
      
      console.log(`❌ Error in connectAndLoadWallet`);
      console.log(`❌ Error Message: ${e.message}`);
      
      if (e.response) {
        console.log(`❌ Status Code: ${e.response.status}`);
        console.log(`❌ Response Data: ${JSON.stringify(e.response.data)}`);
      } else if (e.request) {
        console.log(`⚠️ Request made but NO response received (Network Error / CORS)`);
        console.log(`⚠️ This is likely a CORS or DNS issue.`);
      } else {
        console.log(`❌ Request setup error: ${e.message}`);
      }

      const errorData = e?.response?.data;
      const statusCode = e?.response?.status;
      const isNetworkError = e.message === 'Network Error' || e.code === 'ERR_NETWORK' || !e.response;

      if (isNetworkError) {
        setErrorType("network_error");
        setConnectError("🌐 Network Error! Please check your internet connection.");
        
        debugReferral('NETWORK_ERROR', {
          message: '🌐 Network Error detected',
          error: e.message,
        });
      } else if (errorData?.error?.includes("already linked") || 
                 errorData?.error?.includes("locked") ||
                 errorData?.detail?.includes("already linked")) {
        setErrorType("locked");
        setConnectError("🔒 This wallet is already linked to another Telegram account.");
        
        debugReferral('LOCKED_ERROR', {
          message: '🔒 Wallet linked to another account',
          errorData: errorData,
        });
      } else if (statusCode === 400) {
        setErrorType("bad_request");
        const msg = errorData?.error || errorData?.detail || "Invalid wallet address format.";
        setConnectError(`⚠️ Bad Request: ${msg}`);
        
        debugReferral('BAD_REQUEST', {
          message: '⚠️ Bad Request',
          error: msg,
          errorData: errorData,
        });
      } else {
        setErrorType("server_error");
        const errorMessage = errorData?.error || errorData?.detail || e?.message || "Server error.";
        setConnectError(`❌ Server Error: ${errorMessage}`);
        
        debugReferral('SERVER_ERROR', {
          message: '❌ Server Error',
          error: errorMessage,
          errorData: errorData,
        });
      }

      if (statusCode !== 400 && !isNetworkError) {
        try {
          debugReferral('FALLBACK_FETCH', {
            message: '🔄 Trying to fetch wallet data anyway...',
          });
          
          const r = await api.get(`/wallet/${address}/`);
          setWallet(r.data);
          
          debugReferral('FALLBACK_SUCCESS', {
            message: '✅ Wallet data (fallback) received',
            wallet: r.data,
          });
        } catch (e2) {
          debugReferral('FALLBACK_ERROR', {
            message: `❌ Fallback also failed: ${e2.message}`,
            error: e2.message,
          });
        }
      }
    }
  }, [address]);

  useEffect(() => {
    debugReferral('ADDRESS_CHANGE', {
      message: `🔍 Address changed: ${address ? 'Wallet connected' : 'No wallet'}`,
      address: address,
      hasConnected: hasConnected.current,
    });
    
    connectAndLoadWallet();
  }, [connectAndLoadWallet]);

  const disconnectWallet = () => {
    debugReferral('DISCONNECT', {
      message: '🔌 Disconnecting wallet...',
    });
    
    localStorage.removeItem('telegram_id');
    localStorage.removeItem('inviter_code');
    clearInviterCode();
    localStorage.removeItem(USER_DATA_KEY);
    
    setWallet(null);
    setWalletLocked(false);
    setConnectError("");
    setErrorType("none");
    hasConnected.current = false;
    console.log(`🔌 Wallet disconnected`);
    
    window.location.reload();
  };

  const handleRetry = () => {
    debugReferral('RETRY', {
      message: '🔄 Retrying connection...',
    });
    
    setConnectError("");
    setErrorType("none");
    hasConnected.current = false;
    window.location.reload();
  };

  const resetReferral = () => {
    clearInviterCode();
    localStorage.removeItem(DEBUG_REFERRAL_KEY);
    
    debugReferral('RESET', {
      message: '🔄 Referral data cleared',
    });
    
    alert("✅ inviter_code و debug logs پاک شد");
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
      console.log(`✅ Withdraw completed`);
    } catch (e) {
      setWithdrawError(e?.response?.data?.error || e?.response?.data?.detail || "Withdrawal failed.");
      console.log(`❌ Withdraw failed: ${e.message}`);
    } finally {
      setIsWithdrawing(false);
    }
  };

  return (
    <>
      <div className="wallet-page-container">
        <div className="wallet-box">

          <h1 className="wallet-title">
            Connect Wallet
          </h1>

          <div className="connect-button-wrapper">
            <TonConnectButton />
          </div>

          {/* ========== دکمه دیباگ ========== */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            gap: '8px', 
            marginTop: '8px',
            flexWrap: 'wrap',
          }}>
            <button 
              onClick={resetReferral}
              style={{
                padding: '4px 12px',
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '11px',
              }}
            >
              🗑️ Clear Referral
            </button>
            <button 
              onClick={() => {
                const logs = localStorage.getItem(DEBUG_REFERRAL_KEY);
                console.log('📋 Full Debug Logs:', logs ? JSON.parse(logs) : 'No logs');
                alert('Check console for debug logs!');
              }}
              style={{
                padding: '4px 12px',
                background: '#17a2b8',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '11px',
              }}
            >
              📋 Show Logs
            </button>
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
      </div>
      
      {/* ========== کامپوننت دیباگ ========== */}
      <ReferralDebugger />
    </>
  );
}