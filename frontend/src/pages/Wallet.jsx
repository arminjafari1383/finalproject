// frontend/src/components/Wallet.jsx

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useTonWallet, TonConnectButton } from "@tonconnect/ui-react";
import { api } from "../api";
import "./Wallet.css";
import {
  captureInviterCode,
  clearInviterCode,
  getInviterCode,  // ✅ تابع جدید برای دریافت کد از localStorage
} from "../utils/referral";

// =============================================
// توابع کمکی برای کار با localStorage
// =============================================
const USER_DATA_KEY = "my_app_user_data";
const DEBUG_REFERRAL_KEY = "debug_referral_logs";
const INVITER_CODE_KEY = "inviter_code";  // ✅ کلید ذخیره کد رفرال

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

// ✅ تابع ذخیره کد رفرال در localStorage
const saveInviterCodeToStorage = (code) => {
  if (code) {
    localStorage.setItem(INVITER_CODE_KEY, code);
    console.log(`💾 Inviter code saved to localStorage: ${code}`);
  }
};

// ✅ تابع دریافت کد رفرال از localStorage
const getInviterCodeFromStorage = () => {
  return localStorage.getItem(INVITER_CODE_KEY);
};

// =============================================
// 📋 دیباگ لاگر رفرال با نمایش روی صفحه
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
  
  // ذخیره در localStorage
  try {
    const logs = JSON.parse(localStorage.getItem(DEBUG_REFERRAL_KEY) || '[]');
    logs.push(logEntry);
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
    'CAPTURE': '#FF6B6B',
    'REFERRAL': '#FFD93D',
    'FETCH': '#6BCB77',
    'WALLET': '#4D96FF',
    'SKIP': '#9E9E9E',
    'LOCKED': '#FF6B6B',
    'NETWORK_ERROR': '#FF4757',
    'SERVER_ERROR': '#FF4757',
    'BAD_REQUEST': '#FF4757',
    'FALLBACK': '#FF6B6B',
    'ADDRESS_CHANGE': '#00D2D3',
    'DISCONNECT': '#FF6B6B',
    'RETRY': '#54A0FF',
    'RESET': '#FF6B6B',
  };
  
  const color = colors[step] || '#FFFFFF';
  console.log(
    `%c📋 [${step}] ${timestamp}`,
    `background: ${color}; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;`
  );
  console.log(`📋 Data:`, data);
  console.log(`📋 URL: ${window.location.href}`);
  console.log('---');
  
  // بروزرسانی نمایشگر روی صفحه
  if (typeof window.updateDebugDisplay === 'function') {
    window.updateDebugDisplay(logEntry);
  }
  
  return logEntry;
};

// =============================================
// 📊 کامپوننت نمایش لاگ روی صفحه
// =============================================
const ReferralDebugDisplay = () => {
  const [logs, setLogs] = useState([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const logsEndRef = useRef(null);

  // تابع برای آپدیت لاگ‌ها از بیرون
  useEffect(() => {
    window.updateDebugDisplay = (log) => {
      setLogs(prev => {
        const newLogs = [...prev, log];
        if (newLogs.length > 50) newLogs.shift();
        return newLogs;
      });
    };

    // بارگذاری لاگ‌های قبلی
    try {
      const savedLogs = JSON.parse(localStorage.getItem(DEBUG_REFERRAL_KEY) || '[]');
      setLogs(savedLogs);
    } catch (e) {
      console.error("Error loading saved logs:", e);
    }

    return () => {
      delete window.updateDebugDisplay;
    };
  }, []);

  // اسکرول به انتهای لیست
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // پاک کردن لاگ‌ها
  const clearLogs = () => {
    localStorage.removeItem(DEBUG_REFERRAL_KEY);
    setLogs([]);
  };

  // کپی لاگ‌ها
  const copyLogs = () => {
    const text = logs.map(log => 
      `[${new Date(log.timestamp).toLocaleTimeString()}] ${log.step}: ${JSON.stringify(log.data, null, 2)}`
    ).join('\n');
    navigator.clipboard?.writeText(text);
    alert('✅ Logs copied to clipboard!');
  };

  // گرفتن رنگ برای هر مرحله
  const getStepColor = (step) => {
    const colors = {
      'START': '#4CAF50',
      'SUCCESS': '#4CAF50',
      'CAPTURE': '#FF6B6B',
      'REFERRAL': '#FFD93D',
      'URL': '#2196F3',
      'STORAGE': '#FF9800',
      'TELEGRAM': '#9C27B0',
      'PAYLOAD': '#E91E63',
      'RESPONSE': '#00BCD4',
      'ERROR': '#F44336',
      'FETCH': '#6BCB77',
      'WALLET': '#4D96FF',
      'LOCKED': '#FF6B6B',
      'NETWORK_ERROR': '#FF4757',
      'SERVER_ERROR': '#FF4757',
      'BAD_REQUEST': '#FF4757',
      'SKIP': '#9E9E9E',
      'ADDRESS_CHANGE': '#00D2D3',
      'DISCONNECT': '#FF6B6B',
      'RETRY': '#54A0FF',
      'RESET': '#FF6B6B',
      'FALLBACK': '#FF6B6B',
      'FALLBACK_FETCH': '#FF6B6B',
      'FALLBACK_SUCCESS': '#4CAF50',
      'FALLBACK_ERROR': '#FF4757',
    };
    return colors[step] || '#666';
  };

  // گرفتن ایموجی برای هر مرحله
  const getStepEmoji = (step) => {
    const emojis = {
      'START': '🚀',
      'SUCCESS': '✅',
      'CAPTURE': '🎯',
      'REFERRAL': '🔗',
      'URL': '🔍',
      'STORAGE': '💾',
      'TELEGRAM': '📱',
      'PAYLOAD': '📤',
      'RESPONSE': '📥',
      'ERROR': '❌',
      'FETCH': '🔄',
      'WALLET': '💰',
      'LOCKED': '🔒',
      'NETWORK_ERROR': '🌐',
      'SERVER_ERROR': '⚠️',
      'BAD_REQUEST': '⚠️',
      'SKIP': '⛔',
      'ADDRESS_CHANGE': '📍',
      'DISCONNECT': '🔌',
      'RETRY': '🔄',
      'RESET': '🗑️',
      'FALLBACK': '🔄',
      'FALLBACK_SUCCESS': '✅',
      'FALLBACK_ERROR': '❌',
    };
    return emojis[step] || '📋';
  };

  return (
    <div style={{
      position: 'fixed',
      top: isMinimized ? 'auto' : '10px',
      bottom: isMinimized ? '10px' : 'auto',
      right: '10px',
      zIndex: 99999,
      width: isMinimized ? 'auto' : '450px',
      maxHeight: isMinimized ? 'auto' : '60vh',
      background: '#1a1a2e',
      color: '#e0e0e0',
      borderRadius: '12px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
      fontFamily: 'monospace',
      fontSize: '12px',
      border: '1px solid #333',
      overflow: 'hidden',
      transition: 'all 0.3s ease',
    }}>
      {/* هدر */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        background: '#16213e',
        borderBottom: '1px solid #333',
        cursor: 'pointer',
      }} onClick={() => setIsMinimized(!isMinimized)}>
        <span style={{ color: '#4CAF50', fontWeight: 'bold', fontSize: '13px' }}>
          🐛 Referral Debug ({logs.length})
        </span>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button 
            onClick={(e) => { e.stopPropagation(); clearLogs(); }}
            style={{
              background: 'transparent',
              color: '#ff6b6b',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12px',
              padding: '2px 6px',
            }}
            title="Clear logs"
          >
            🗑️
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); copyLogs(); }}
            style={{
              background: 'transparent',
              color: '#4CAF50',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12px',
              padding: '2px 6px',
            }}
            title="Copy logs"
          >
            📋
          </button>
          <span style={{ color: '#666', fontSize: '16px' }}>
            {isMinimized ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {/* محتوای لاگ‌ها */}
      {!isMinimized && (
        <div style={{
          padding: '8px',
          maxHeight: 'calc(60vh - 50px)',
          overflowY: 'auto',
        }}>
          {logs.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              color: '#666', 
              padding: '40px 20px',
              fontSize: '14px',
            }}>
              <div style={{ fontSize: '40px', marginBottom: '10px' }}>🔍</div>
              <div>No logs yet</div>
              <div style={{ fontSize: '11px', color: '#444', marginTop: '8px' }}>
                Open a referral link or connect wallet to start debugging
              </div>
            </div>
          ) : (
            logs.map((log, index) => {
              const color = getStepColor(log.step);
              const emoji = getStepEmoji(log.step);
              const time = new Date(log.timestamp).toLocaleTimeString();
              
              let message = '';
              let extraData = '';
              if (log.data?.message) {
                message = log.data.message;
                const { message: msg, ...rest } = log.data;
                extraData = JSON.stringify(rest).slice(0, 50);
              } else {
                message = JSON.stringify(log.data).slice(0, 100);
              }
              
              return (
                <div 
                  key={index}
                  style={{
                    padding: '4px 8px',
                    marginBottom: '3px',
                    background: index % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
                    borderRadius: '4px',
                    borderLeft: `3px solid ${color}`,
                    fontSize: '11px',
                    lineHeight: '1.4',
                  }}
                >
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    color: '#888',
                    fontSize: '10px',
                  }}>
                    <span>
                      <span style={{ color }}>{emoji}</span>
                      <span style={{ color: '#fff', marginLeft: '4px' }}>{log.step}</span>
                    </span>
                    <span>{time}</span>
                  </div>
                  <div style={{ 
                    color: '#d4d4d4', 
                    wordBreak: 'break-all',
                    marginTop: '2px',
                    fontSize: '11px',
                  }}>
                    {message}
                  </div>
                  {extraData && (
                    <div style={{ 
                      color: '#666', 
                      fontSize: '10px',
                      marginTop: '2px',
                      wordBreak: 'break-all',
                    }}>
                      {extraData}
                    </div>
                  )}
                  {log.data?.code && (
                    <div style={{ 
                      color: '#4CAF50', 
                      fontSize: '10px',
                      marginTop: '2px',
                      fontWeight: 'bold',
                    }}>
                      📌 Code: {log.data.code}
                    </div>
                  )}
                  {(log.step === 'URL' || log.step === 'CAPTURE') && log.search && (
                    <div style={{ 
                      color: '#FFD93D', 
                      fontSize: '10px',
                      marginTop: '2px',
                      wordBreak: 'break-all',
                    }}>
                      🔗 {log.search}
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={logsEndRef} />
        </div>
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
    
    // ✅ دریافت کد رفرال از URL و ذخیره در localStorage
    const inviterCode = captureInviterCode();
    
    // ✅ ذخیره در localStorage با کلید اختصاصی
    if (inviterCode) {
      saveInviterCodeToStorage(inviterCode);
      debugReferral('CAPTURE', {
        message: `✅ Inviter code captured and saved: ${inviterCode}`,
        code: inviterCode,
        localStorage: getInviterCodeFromStorage(),
      });
    } else {
      // ✅ اگر در URL نبود، از localStorage بخوان
      const savedCode = getInviterCodeFromStorage();
      if (savedCode) {
        debugReferral('CAPTURE', {
          message: `📂 Inviter code loaded from localStorage: ${savedCode}`,
          code: savedCode,
          localStorage: savedCode,
        });
      } else {
        debugReferral('CAPTURE', {
          message: 'ℹ️ No inviter code found in URL or localStorage',
          code: null,
          localStorage: null,
        });
      }
    }
    
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
      const startParamValue = tg.initDataUnsafe.start_param;
      debugReferral('TELEGRAM', {
        message: `✅ Telegram start_param found: ${startParamValue}`,
        start_param: startParamValue,
        initDataUnsafe: tg.initDataUnsafe,
      });
      
      // ✅ اگر start_param حاوی ref_ بود، استخراج و ذخیره کن
      if (startParamValue && startParamValue.startsWith('ref_')) {
        const refCode = startParamValue.replace('ref_', '');
        saveInviterCodeToStorage(refCode);
        debugReferral('TELEGRAM_REF', {
          message: `✅ Extracted ref from start_param: ${refCode}`,
          code: refCode,
        });
      }
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
    });
    
    hasConnected.current = true;
    setConnectError("");
    setErrorType("none");
    
    // ====== دریافت کد رفرال ======
    // ✅ اول از localStorage بخوان
    let inviter_code = getInviterCodeFromStorage();
    
    // ✅ اگر در localStorage نبود، از captureInviterCode استفاده کن (که URL رو چک میکنه)
    if (!inviter_code) {
      inviter_code = captureInviterCode();
      if (inviter_code) {
        saveInviterCodeToStorage(inviter_code);
      }
    }
    
    debugReferral('REFERRAL', {
      message: inviter_code ? `✅ Inviter code found: ${inviter_code}` : 'ℹ️ No inviter code found',
      code: inviter_code,
      localStorage: getInviterCodeFromStorage(),
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
      inviter_code_sent: inviter_code,
    });

    try {
      const response = await api.post("/connect/", payload);
      
      debugReferral('RESPONSE', {
        message: `✅ /connect/ response received`,
        status: response.status,
        data: response.data,
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
          status: e.response?.status,
          data: e.response?.data,
        },
      });

      const errorData = e?.response?.data;
      const statusCode = e?.response?.status;
      const isNetworkError = e.message === 'Network Error' || e.code === 'ERR_NETWORK' || !e.response;

      if (isNetworkError) {
        setErrorType("network_error");
        setConnectError("🌐 Network Error! Please check your internet connection.");
        debugReferral('NETWORK_ERROR', { message: '🌐 Network Error detected' });
      } else if (errorData?.error?.includes("already linked") || 
                 errorData?.error?.includes("locked") ||
                 errorData?.detail?.includes("already linked")) {
        setErrorType("locked");
        setConnectError("🔒 This wallet is already linked to another Telegram account.");
        debugReferral('LOCKED_ERROR', { errorData });
      } else if (statusCode === 400) {
        setErrorType("bad_request");
        const msg = errorData?.error || errorData?.detail || "Invalid wallet address format.";
        setConnectError(`⚠️ Bad Request: ${msg}`);
        debugReferral('BAD_REQUEST', { error: msg });
      } else {
        setErrorType("server_error");
        const errorMessage = errorData?.error || errorData?.detail || e?.message || "Server error.";
        setConnectError(`❌ Server Error: ${errorMessage}`);
        debugReferral('SERVER_ERROR', { error: errorMessage });
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
          });
        }
      }
    }
  }, [address]);

  useEffect(() => {
    debugReferral('ADDRESS_CHANGE', {
      message: `🔍 Address changed: ${address ? 'Wallet connected' : 'No wallet'}`,
      address: address,
    });
    
    connectAndLoadWallet();
  }, [connectAndLoadWallet]);

  const disconnectWallet = () => {
    debugReferral('DISCONNECT', {
      message: '🔌 Disconnecting wallet...',
    });
    
    localStorage.removeItem('telegram_id');
    localStorage.removeItem('inviter_code');
    localStorage.removeItem(INVITER_CODE_KEY);
    clearInviterCode();
    localStorage.removeItem(USER_DATA_KEY);
    localStorage.removeItem(DEBUG_REFERRAL_KEY);
    
    setWallet(null);
    setWalletLocked(false);
    setConnectError("");
    setErrorType("none");
    hasConnected.current = false;
    
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
    localStorage.removeItem(INVITER_CODE_KEY);
    localStorage.removeItem(DEBUG_REFERRAL_KEY);
    
    debugReferral('RESET', {
      message: '🔄 Referral data cleared',
    });
    
    alert("✅ inviter_code و debug logs پاک شد");
    window.location.reload();
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

          {/* ========== دکمه‌های دیباگ ========== */}
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
                background: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '11px',
              }}
            >
              🗑️ Clear All Debug
            </button>
            <button 
              onClick={() => {
                const logs = localStorage.getItem(DEBUG_REFERRAL_KEY);
                console.log('📋 Full Debug Logs:', logs ? JSON.parse(logs) : 'No logs');
                alert('✅ Check console for full debug logs!');
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
              📋 Console Logs
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
      
      {/* ========== 📊 نمایشگر دیباگ روی صفحه ========== */}
      <ReferralDebugDisplay />
    </>
  );
}