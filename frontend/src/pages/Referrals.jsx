// frontend/src/components/Referrals.jsx

import { useEffect, useMemo, useRef, useState } from "react";
import { useTonWallet } from "@tonconnect/ui-react";
import { api } from "../api";
import "./Referrals.css";
import {
  captureInviterCode,
  getInviterCode,
} from "../utils/referral";

// ==========================================
// Constants
// ==========================================

const USER_DATA_KEY = "my_app_user_data";
const BOT_USERNAME = "Aipolynetbot";

// ==========================================
// LocalStorage Helpers
// ==========================================

const loadUserDataFromStorage = () => {
  try {
    const data = localStorage.getItem(USER_DATA_KEY);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error("❌ Error parsing localStorage:", error);
    return null;
  }
};

const saveUserDataToStorage = (newData) => {
  try {
    const currentData = loadUserDataFromStorage() || {};
    const mergedData = { ...currentData, ...newData };
    localStorage.setItem(USER_DATA_KEY, JSON.stringify(mergedData));
  } catch (error) {
    console.error("❌ Error saving localStorage:", error);
  }
};

// ==========================================
// Telegram
// ==========================================

const getTelegramWebApp = () => {
  const tg = window.Telegram?.WebApp || null;
  
  console.log("=========================================");
  console.log("📱 [TELEGRAM] getTelegramWebApp() called");
  console.log("📱 [TELEGRAM] window.Telegram:", window.Telegram);
  console.log("📱 [TELEGRAM] window.Telegram?.WebApp:", window.Telegram?.WebApp);
  console.log("📱 [TELEGRAM] Result:", tg);
  console.log("=========================================");
  
  return tg;
};

// ==========================================
// 🖼️ تابع دریافت عکس تلگرام
// ==========================================

const getTelegramAvatar = (telegramId, username) => {
  console.log(`🖼️ [AVATAR] telegramId: ${telegramId}, username: ${username}`);
  
  if (username && 
      username !== 'browser' && 
      !username.startsWith('browser_') &&
      username !== 'null' && 
      username !== 'undefined' &&
      username !== '') {
    const url = `https://t.me/i/userpic/320/${username}.jpg`;
    console.log(`✅ [AVATAR] Using Telegram avatar: ${url}`);
    return url;
  }
  
  if (telegramId && 
      telegramId !== '-' && 
      telegramId !== 'browser' && 
      typeof telegramId === 'number' && 
      telegramId > 0) {
    const url = `https://ui-avatars.com/api/?name=${telegramId}&background=random&size=32&rounded=true`;
    console.log(`✅ [AVATAR] Using UI Avatar: ${url}`);
    return url;
  }
  
  console.log(`⚠️ [AVATAR] Using fallback avatar`);
  return `https://ui-avatars.com/api/?name=User&background=random&size=32&rounded=true`;
};

// ==========================================
// 🐛 کامپوننت دیباگ روی صفحه با لاگ‌های بیشتر
// ==========================================

const DebugPanel = ({ data }) => {
  const [isOpen, setIsOpen] = useState(true);
  
  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 99999,
          padding: '10px 16px',
          background: '#dc3545',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 'bold',
        }}
      >
        🐛 Show Debug
      </button>
    );
  }
  
  return (
    <div style={{
      position: 'fixed',
      top: '10px',
      right: '10px',
      zIndex: 99999,
      width: '480px',
      maxHeight: '80vh',
      background: '#1a1a2e',
      color: '#e0e0e0',
      borderRadius: '12px',
      padding: '16px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.9)',
      fontFamily: 'monospace',
      fontSize: '12px',
      overflow: 'auto',
      border: '1px solid #333',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
        borderBottom: '1px solid #333',
        paddingBottom: '8px',
      }}>
        <span style={{ color: '#4CAF50', fontWeight: 'bold' }}>
          🐛 Telegram Debug
        </span>
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
      
      {/* Telegram Detection */}
      <div style={{ marginBottom: '8px', borderBottom: '1px solid #333', paddingBottom: '8px' }}>
        <div style={{ color: '#FF6B6B', fontWeight: 'bold', marginBottom: '4px' }}>
          📱 Telegram Detection
        </div>
        <div style={{ paddingLeft: '12px', fontSize: '11px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span style={{ color: '#888' }}>window.Telegram:</span>
            <span style={{ color: data?.hasTelegram ? '#4CAF50' : '#FF6B6B' }}>
              {data?.hasTelegram ? '✅ Yes' : '❌ No'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span style={{ color: '#888' }}>WebApp:</span>
            <span style={{ color: data?.hasWebApp ? '#4CAF50' : '#FF6B6B' }}>
              {data?.hasWebApp ? '✅ Yes' : '❌ No'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span style={{ color: '#888' }}>Platform:</span>
            <span style={{ color: '#FFD93D' }}>{data?.platform || 'Unknown'}</span>
          </div>
        </div>
      </div>
      
      {/* Telegram User Info */}
      <div style={{ marginBottom: '8px', borderBottom: '1px solid #333', paddingBottom: '8px' }}>
        <div style={{ color: '#FFD93D', fontWeight: 'bold', marginBottom: '4px' }}>
          👤 Telegram User Info
        </div>
        <div style={{ paddingLeft: '12px', fontSize: '11px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span style={{ color: '#888' }}>Telegram ID:</span>
            <span style={{ color: '#4CAF50' }}>{data?.telegramId || '❌ Not found'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span style={{ color: '#888' }}>Username:</span>
            <span style={{ color: '#4CAF50' }}>{data?.telegramUsername || '❌ Not found'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span style={{ color: '#888' }}>First Name:</span>
            <span style={{ color: '#4CAF50' }}>{data?.firstName || '❌ Not found'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span style={{ color: '#888' }}>Last Name:</span>
            <span style={{ color: '#4CAF50' }}>{data?.lastName || '❌ Not found'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span style={{ color: '#888' }}>Language:</span>
            <span style={{ color: '#4CAF50' }}>{data?.language || '❌ Not found'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span style={{ color: '#888' }}>Is Premium:</span>
            <span style={{ color: data?.isPremium ? '#4CAF50' : '#FF6B6B' }}>
              {data?.isPremium ? '✅ Yes' : '❌ No'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span style={{ color: '#888' }}>Is Telegram WebApp:</span>
            <span style={{ color: data?.isTelegramWebApp ? '#4CAF50' : '#FF6B6B' }}>
              {data?.isTelegramWebApp ? '✅ Yes' : '❌ No'}
            </span>
          </div>
        </div>
      </div>

      {/* initDataUnsafe */}
      <div style={{ marginBottom: '8px', borderBottom: '1px solid #333', paddingBottom: '8px' }}>
        <div style={{ color: '#9C27B0', fontWeight: 'bold', marginBottom: '4px' }}>
          📦 initDataUnsafe
        </div>
        <div style={{ 
          background: '#0d0d1a', 
          padding: '8px', 
          borderRadius: '4px',
          fontSize: '9px',
          overflow: 'auto',
          maxHeight: '100px',
        }}>
          <pre style={{ margin: 0, color: '#d4d4d4' }}>
            {JSON.stringify(data?.initDataUnsafe, null, 2) || 'No data'}
          </pre>
        </div>
      </div>

      <div style={{ marginBottom: '8px', borderTop: '1px solid #333', paddingTop: '8px' }}>
        <div style={{ color: '#2196F3', fontWeight: 'bold', marginBottom: '4px' }}>
          📤 Payload to Backend
        </div>
        <div style={{ 
          background: '#0d0d1a', 
          padding: '8px', 
          borderRadius: '4px',
          fontSize: '10px',
          overflow: 'auto',
          maxHeight: '150px',
        }}>
          <pre style={{ margin: 0, color: '#d4d4d4' }}>
            {JSON.stringify(data?.payload, null, 2) || 'Not sent yet'}
          </pre>
        </div>
      </div>

      <div style={{ marginBottom: '8px', borderTop: '1px solid #333', paddingTop: '8px' }}>
        <div style={{ color: '#00BCD4', fontWeight: 'bold', marginBottom: '4px' }}>
          📥 Backend Response
        </div>
        <div style={{ 
          background: '#0d0d1a', 
          padding: '8px', 
          borderRadius: '4px',
          fontSize: '10px',
          overflow: 'auto',
          maxHeight: '100px',
        }}>
          <pre style={{ margin: 0, color: '#d4d4d4' }}>
            {JSON.stringify(data?.backendResponse, null, 2) || 'Not received yet'}
          </pre>
        </div>
      </div>

      <div style={{ borderTop: '1px solid #333', paddingTop: '8px' }}>
        <div style={{ color: '#FF9800', fontWeight: 'bold', marginBottom: '4px' }}>
          📊 Level Data (First User)
        </div>
        <div style={{ 
          background: '#0d0d1a', 
          padding: '8px', 
          borderRadius: '4px',
          fontSize: '10px',
          overflow: 'auto',
          maxHeight: '100px',
        }}>
          <pre style={{ margin: 0, color: '#d4d4d4' }}>
            {JSON.stringify(data?.firstLevelUser, null, 2) || 'No users yet'}
          </pre>
        </div>
      </div>

      <div style={{ borderTop: '1px solid #333', paddingTop: '8px', marginTop: '8px' }}>
        <div style={{ color: '#9C27B0', fontWeight: 'bold', marginBottom: '4px' }}>
          💾 localStorage
        </div>
        <div style={{ fontSize: '10px', color: '#888' }}>
          <div>inviter_code: {localStorage.getItem('inviter_code') || 'null'}</div>
          <div>telegram_username: {localStorage.getItem('telegram_username') || 'null'}</div>
          <div>telegram_id: {localStorage.getItem('telegram_id') || 'null'}</div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// Component
// ==========================================

export default function Referrals() {
  const tonWallet = useTonWallet();

  const address = useMemo(
    () => tonWallet?.account?.address || null,
    [tonWallet]
  );

  // ==========================================
  // State
  // ==========================================

  const [myCode, setMyCode] = useState(null);
  const [refCount, setRefCount] = useState(null);
  const [levels, setLevels] = useState(null);
  const [showTestTable, setShowTestTable] = useState(false);
  const [testData, setTestData] = useState(null);
  const [totalReferrals, setTotalReferrals] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [telegramId, setTelegramId] = useState(null);
  const [telegramUsername, setTelegramUsername] = useState(null);
  const [isTelegramWebApp, setIsTelegramWebApp] = useState(false);

  const [inviterCode, setInviterCode] = useState(null);
  const [referralReady, setReferralReady] = useState(false);
  const [debugData, setDebugData] = useState({});
  const [backendResponse, setBackendResponse] = useState(null);

  const hasFetched = useRef(false);

  // ==========================================
  // Telegram Initialization با لاگ کامل
  // ==========================================

  useEffect(() => {
    console.log("=========================================");
    console.log("🔵 [INIT] Starting Telegram detection...");
    console.log("=========================================");
    
    // بررسی وجود Telegram
    const hasTelegram = typeof window.Telegram !== 'undefined';
    console.log(`📱 [INIT] window.Telegram exists: ${hasTelegram}`);
    
    if (hasTelegram) {
      console.log("📱 [INIT] window.Telegram:", window.Telegram);
    }
    
    const tg = getTelegramWebApp();
    console.log(`📱 [INIT] tg result:`, tg);
    
    // بررسی platform
    let platform = 'Unknown';
    if (tg) {
      platform = tg.platform || 'Unknown';
      console.log(`📱 [INIT] Platform: ${platform}`);
    }
    
    setDebugData(prev => ({
      ...prev,
      hasTelegram: hasTelegram,
      hasWebApp: !!tg,
      platform: platform,
    }));

    if (!tg) {
      console.log("❌ [INIT] No Telegram WebApp detected - Browser mode");
      setIsTelegramWebApp(false);
      const savedReferral = getInviterCode();
      setInviterCode(savedReferral || false);
      setReferralReady(true);
      
      setDebugData(prev => ({
        ...prev,
        isTelegramWebApp: false,
        telegramId: null,
        telegramUsername: null,
      }));
      
      console.log("=========================================");
      console.log("✅ [INIT] Browser mode ready");
      console.log("=========================================");
      return;
    }

    console.log("✅ [INIT] Telegram WebApp detected!");
    
    // آماده‌سازی Telegram
    try {
      console.log("📱 [INIT] Calling tg.ready()...");
      tg.ready();
      console.log("✅ [INIT] tg.ready() called");
      
      console.log("📱 [INIT] Calling tg.expand()...");
      tg.expand();
      console.log("✅ [INIT] tg.expand() called");
    } catch (error) {
      console.error("❌ [INIT] Error in tg.ready()/expand():", error);
    }
    
    setIsTelegramWebApp(true);

    // بررسی initDataUnsafe
    console.log("📦 [INIT] tg.initDataUnsafe:", tg.initDataUnsafe);
    console.log("📦 [INIT] tg.initData:", tg.initData);
    
    setDebugData(prev => ({
      ...prev,
      initDataUnsafe: tg.initDataUnsafe,
      isTelegramWebApp: true,
    }));

    const user = tg.initDataUnsafe?.user || null;
    console.log("👤 [INIT] Telegram user object:", user);

    if (user) {
      const tgId = user.id;
      const tgUsername = user.username || null;
      const firstName = user.first_name || null;
      const lastName = user.last_name || null;
      const languageCode = user.language_code || null;
      const isPremium = user.is_premium || false;

      console.log("=========================================");
      console.log("✅ [INIT] User data extracted:");
      console.log(`  ID: ${tgId}`);
      console.log(`  Username: ${tgUsername}`);
      console.log(`  First Name: ${firstName}`);
      console.log(`  Last Name: ${lastName}`);
      console.log(`  Language: ${languageCode}`);
      console.log(`  Is Premium: ${isPremium}`);
      console.log("=========================================");

      setTelegramId(tgId);
      setTelegramUsername(tgUsername);

      setDebugData(prev => ({
        ...prev,
        telegramId: tgId,
        telegramUsername: tgUsername,
        firstName: firstName,
        lastName: lastName,
        language: languageCode,
        isPremium: isPremium,
        user: user,
      }));

      saveUserDataToStorage({
        telegramId: tgId,
        telegramUsername: tgUsername,
        isTelegram: true,
      });
      
      console.log("💾 [INIT] User data saved to localStorage");
    } else {
      console.warn("⚠️ [INIT] No user in initDataUnsafe!");
      console.log("📦 [INIT] Full initDataUnsafe:", tg.initDataUnsafe);
      
      setDebugData(prev => ({
        ...prev,
        telegramId: null,
        telegramUsername: null,
        error: 'No user in initDataUnsafe',
      }));
    }

    // بررسی start_param
    const startParam = tg.initDataUnsafe?.start_param || null;
    console.log(`🎯 [INIT] start_param: ${startParam}`);

    const capturedCode = captureInviterCode();
    console.log(`🎯 [INIT] captureInviterCode() returned: ${capturedCode}`);
    
    setInviterCode(capturedCode || false);
    setReferralReady(true);

    console.log("✅ [INIT] Referral detection READY");
    console.log("=========================================");
  }, []);

  // ==========================================
  // Save Wallet
  // ==========================================

  useEffect(() => {
    if (!address) return;
    console.log(`💰 [WALLET] Saving address: ${address}`);
    saveUserDataToStorage({ walletAddress: address });
  }, [address]);

  // ==========================================
  // Browser Telegram ID
  // ==========================================

  const browserTelegramId = useMemo(() => {
    if (!address) {
      const generated = Math.floor(Date.now() / 1000) + 2000000000000;
      console.log(`🌐 [BROWSER] Generated Telegram ID: ${generated}`);
      return generated;
    }

    let hash = 0;
    for (let i = 0; i < address.length; i++) {
      const char = address.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }

    const generated = Math.abs(hash) + 1000000000000;
    console.log(`🌐 [BROWSER] Browser Telegram ID: ${generated}`);
    return generated;
  }, [address]);

  // ==========================================
  // Register User
  // ==========================================

  useEffect(() => {
    console.log("=========================================");
    console.log("🔴 [REGISTER] Register effect triggered");
    console.log("=========================================");
    console.log(`💰 address: ${address}`);
    console.log(`🔗 referralReady: ${referralReady}`);
    console.log(`🎯 inviterCode: ${inviterCode}`);
    console.log(`📱 telegramId: ${telegramId}`);
    console.log(`📱 telegramUsername: ${telegramUsername}`);
    console.log(`📱 isTelegramWebApp: ${isTelegramWebApp}`);
    console.log(`🚫 hasFetched.current: ${hasFetched.current}`);
    console.log("=========================================");
    
    if (!address) {
      console.log("⏳ [REGISTER] No wallet - waiting...");
      setMyCode(null);
      setRefCount(null);
      setError("");
      return;
    }

    if (!referralReady) {
      console.log("⏳ [REGISTER] Waiting for referral detection...");
      return;
    }

    if (hasFetched.current) {
      console.log("⛔️ [REGISTER] Already registered - skipping");
      return;
    }

    let cancelled = false;
    hasFetched.current = true;

    async function fetchData() {
      try {
        setLoading(true);
        setError("");

        const storedInviter = getInviterCode();
        const finalInviterCode = inviterCode || storedInviter || null;

        const savedData = loadUserDataFromStorage();

        let finalTelegramId;
        let finalTelegramUsername = null;

        console.log("=========================================");
        console.log("🐛 [REGISTER] Telegram detection decision:");
        console.log("=========================================");
        console.log(`📂 savedData?.telegramId: ${savedData?.telegramId}`);
        console.log(`📂 savedData?.telegramUsername: ${savedData?.telegramUsername}`);
        console.log(`📱 telegramId (state): ${telegramId}`);
        console.log(`📱 telegramUsername (state): ${telegramUsername}`);
        console.log(`📱 isTelegramWebApp: ${isTelegramWebApp}`);
        console.log(`🌐 browserTelegramId: ${browserTelegramId}`);
        console.log("=========================================");

        if (savedData?.telegramId && savedData.telegramId > 0) {
          finalTelegramId = savedData.telegramId;
          finalTelegramUsername = savedData.telegramUsername || null;
          console.log(`✅ [REGISTER] Using Telegram ID from storage: ${finalTelegramId}`);
        } else if (isTelegramWebApp && telegramId && telegramId > 0) {
          finalTelegramId = telegramId;
          finalTelegramUsername = telegramUsername;
          console.log(`✅ [REGISTER] Using real Telegram ID: ${finalTelegramId}`);
          console.log(`✅ [REGISTER] Using real Telegram username: ${finalTelegramUsername}`);
        } else {
          finalTelegramId = browserTelegramId;
          finalTelegramUsername = `user_${address.slice(0, 8)}`;
          console.log(`⚠️ [REGISTER] Using browser Telegram ID: ${finalTelegramId}`);
          console.log(`⚠️ [REGISTER] Using browser username: ${finalTelegramUsername}`);
        }

        setDebugData(prev => ({
          ...prev,
          finalTelegramId,
          finalTelegramUsername,
          source: savedData?.telegramId ? 'storage' : (isTelegramWebApp ? 'telegram' : 'browser'),
        }));

        const payload = {
          wallet_address: address,
          inviter_code: finalInviterCode,
          telegram_id: finalTelegramId,
          telegram_username: finalTelegramUsername,
          is_telegram: isTelegramWebApp || savedData?.isTelegram || false,
        };

        console.log("=========================================");
        console.log("📤 [REGISTER] FINAL PAYLOAD:");
        console.log(JSON.stringify(payload, null, 2));
        console.log("=========================================");

        setDebugData(prev => ({
          ...prev,
          payload: payload,
        }));

        console.log("🚀 [REGISTER] Sending POST /connect/ ...");

        const res = await api.post("/connect/", payload);

        if (cancelled) return;

        console.log("=========================================");
        console.log("✅ [REGISTER] Backend response received:");
        console.log(`  Status: ${res.status}`);
        console.log(`  Data:`, res.data);
        console.log("=========================================");

        setBackendResponse(res.data);
        setDebugData(prev => ({
          ...prev,
          backendResponse: res.data,
        }));

        const returnedCode = res.data?.user?.referral_code || null;
        console.log(`🎟️ [REGISTER] My referral code: ${returnedCode}`);
        setMyCode(returnedCode);

        console.log("🔄 [REGISTER] Fetching referral count...");
        const countRes = await api.get("/referrals/count/", {
          params: { wallet_address: address },
        });

        if (cancelled) return;

        const count = countRes.data?.count ?? 0;
        console.log(`👥 [REGISTER] Referral count: ${count}`);
        setRefCount(count);

      } catch (error) {
        if (cancelled) return;
        
        console.error("=========================================");
        console.error("❌ [REGISTER] CONNECT ERROR");
        console.error("=========================================");
        console.error("❌ Error:", error);
        console.error("❌ Error message:", error?.message);
        console.error("❌ HTTP status:", error?.response?.status);
        console.error("❌ Backend response:", error?.response?.data);
        console.error("=========================================");
        
        setError(
          error?.response?.data?.error ||
            error?.response?.data?.detail ||
            error?.message ||
            "Failed to fetch referral information."
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [address, referralReady, inviterCode, telegramId, telegramUsername, isTelegramWebApp, browserTelegramId]);

  // ==========================================
  // Fetch Referral Levels
  // ==========================================

  useEffect(() => {
    if (!address) return;

    console.log("🔄 [LEVELS] Fetching referral levels...");

    async function fetchLevels() {
      try {
        const response = await api.get("/referral/levels/", {
          params: { wallet_address: address },
        });

        console.log("✅ [LEVELS] Response:", response.data);
        setLevels(response.data?.levels || {});
        setTotalReferrals(response.data?.total_referrals || 0);

        const firstLevel = response.data?.levels?.level_1;
        if (firstLevel?.users && firstLevel.users.length > 0) {
          console.log("📊 [LEVELS] First user in level 1:", firstLevel.users[0]);
          setDebugData(prev => ({
            ...prev,
            firstLevelUser: firstLevel.users[0],
          }));
        }

      } catch (error) {
        console.error("❌ [LEVELS] Failed:", error);
        console.error("❌ [LEVELS] Backend:", error?.response?.data);
      }
    }

    fetchLevels();
  }, [address]);

  // ==========================================
  // Test Data
  // ==========================================

  async function fetchTestData() {
    if (!address) return;

    try {
      setLoading(true);
      const response = await api.get("/referral/levels/", {
        params: {
          wallet_address: address,
          test: "true",
        },
      });

      setTestData(response.data?.levels || {});
      setShowTestTable(true);
    } catch (error) {
      console.error("❌ [TEST] Failed:", error);
      setError(
        `Failed to load test data: ${
          error?.response?.data?.error ||
          error?.message ||
          "Unknown error"
        }`
      );
    } finally {
      setLoading(false);
    }
  }

  // ==========================================
  // Telegram Mini App Referral Link
  // ==========================================

  const getMiniAppLink = () => {
    if (!myCode) return "";
    return `https://t.me/${BOT_USERNAME}/app?startapp=ref_${encodeURIComponent(myCode)}`;
  };

  const referralLink = getMiniAppLink();

  // ==========================================
  // Open Mini App
  // ==========================================

  function openReferralLink() {
    if (!referralLink) return;
    const tg = getTelegramWebApp();

    if (tg && typeof tg.openTelegramLink === "function") {
      tg.openTelegramLink(referralLink);
    } else {
      window.open(referralLink, "_blank", "noopener,noreferrer");
    }
  }

  // ==========================================
  // Share Telegram
  // ==========================================

  function shareOnTelegram() {
    if (!referralLink) return;

    const message =
      `🎯 Join me on AI PolyNet!\n\n` +
      `🚀 Open the Mini App using my referral link:\n\n` +
      `${referralLink}\n\n` +
      `💎 Don't miss out on the rewards!`;

    const shareUrl =
      `https://t.me/share/url` +
      `?url=${encodeURIComponent(referralLink)}` +
      `&text=${encodeURIComponent(message)}`;

    const tg = getTelegramWebApp();

    if (tg && typeof tg.openTelegramLink === "function") {
      try {
        tg.openTelegramLink(shareUrl);
      } catch (error) {
        window.open(shareUrl, "_blank", "noopener,noreferrer");
      }
    } else {
      window.open(shareUrl, "_blank", "noopener,noreferrer");
    }
  }

  // ==========================================
  // Copy Referral Link
  // ==========================================

  async function copyReferralLink() {
    if (!referralLink) return;

    try {
      await navigator.clipboard.writeText(referralLink);
      alert("✅ Telegram referral link copied!");
    } catch (error) {
      console.error("❌ Copy failed:", error);
    }
  }

  // ==========================================
  // 🖼️ Render Level Table
  // ==========================================

  function renderLevelTable(level, data) {
    if (!data) {
      return (
        <div className="level-table">
          <div className="level-header">
            <h4>⭐ Level {level}</h4>
          </div>
          <div className="empty-message">No data available</div>
        </div>
      );
    }

    const users = data.users || [];
    const count = data.count || 0;
    const displayUsers = users.slice(0, 10);

    return (
      <div className="level-table">
        <div className="level-header">
          <h4>⭐ Level {level}</h4>
          <span className="level-count">Total: {count}</span>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>User</th>
                <th>Investment (TON)</th>
                <th>Profit</th>
              </tr>
            </thead>
            <tbody>
              {displayUsers.length === 0 ? (
                <tr>
                  <td colSpan="4" className="empty-message">
                    No users in this level
                  </td>
                </tr>
              ) : (
                displayUsers.map((user, index) => {
                  const isString = typeof user === "string";
                  
                  const userTelegramId = isString ? null : user.telegram_id;
                  const userTelegramUsername = isString ? null : user.telegram_username;
                  const userWallet = isString ? user : user.wallet || "-";
                  const investment = isString ? 0 : user.investment || 0;
                  const profit = isString ? 0 : user.profit || 0;
                  
                  let displayName = '';
                  let displayUsername = null;
                  
                  if (userTelegramUsername && 
                      userTelegramUsername !== 'browser' && 
                      !userTelegramUsername.startsWith('browser_') &&
                      userTelegramUsername !== 'null' && 
                      userTelegramUsername !== 'undefined' &&
                      userTelegramUsername !== '') {
                    displayName = userTelegramUsername;
                    displayUsername = `@${userTelegramUsername}`;
                  } else if (userTelegramId && 
                           userTelegramId !== '-' && 
                           userTelegramId !== 'browser' && 
                           typeof userTelegramId === 'number' && 
                           userTelegramId > 0) {
                    displayName = String(userTelegramId);
                  } else if (userWallet && userWallet !== '-') {
                    if (userWallet.startsWith('user_')) {
                      displayName = userWallet.replace('user_', 'User ');
                    } else if (userWallet.length > 10) {
                      displayName = `${userWallet.slice(0, 6)}...${userWallet.slice(-4)}`;
                    } else {
                      displayName = userWallet;
                    }
                  } else {
                    displayName = 'Anonymous User';
                  }
                  
                  const avatarUrl = getTelegramAvatar(userTelegramId, userTelegramUsername);

                  return (
                    <tr key={index}>
                      <td>{index + 1}</td>
                      <td className="user-cell">
                        <div className="user-avatar-wrapper">
                          <img
                            src={avatarUrl}
                            alt={displayName}
                            className="user-avatar"
                            onError={(e) => {
                              e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random&size=32&rounded=true`;
                            }}
                          />
                          <div className="user-info">
                            <span className="user-name">{displayName}</span>
                            {displayUsername && (
                              <span className="user-username">{displayUsername}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="investment-cell">{investment}</td>
                      <td className="profit-cell">+ {profit}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {users.length > 10 && (
          <div className="show-more">+ {users.length - 10} more users</div>
        )}
      </div>
    );
  }

  // ==========================================
  // Wallet Not Connected
  // ==========================================

  if (!address) {
    return (
      <div className="wallet-required">
        🔌 Please connect your wallet first.
      </div>
    );
  }

  // ==========================================
  // Main Render
  // ==========================================

  return (
    <div className="referral-dashboard">
      <DebugPanel data={debugData} />

      <h2>🎯 Referral Dashboard</h2>

      {loading && <div className="loading-spinner">Loading...</div>}
      {error && <div className="error-message">❌ {error}</div>}
      {!referralReady && <div className="loading-spinner">🔗 Preparing referral...</div>}

      {myCode ? (
        <>
          <div className="referral-link-section">
            <p className="referral-link-label">🔗 Telegram Mini App Invite Link</p>

            <div className="link-actions">
              <input value={referralLink} readOnly className="link-input" />
              <button onClick={openReferralLink} disabled={!referralLink} className="btn-open">
                🚀 Open Mini App
              </button>
              <button onClick={copyReferralLink} disabled={!referralLink} className="btn-copy">
                📋 Copy
              </button>
              <button onClick={shareOnTelegram} disabled={!referralLink} className="btn-share-telegram">
                📤 Share on Telegram
              </button>
            </div>

            <div className="stats-box">
              <div className="stat-item">
                <span className="stat-label">👥 Direct Invites</span>
                <span className="stat-value">{refCount === null ? "..." : refCount}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">🌳 Total Tree</span>
                <span className="stat-value">{totalReferrals}</span>
              </div>
            </div>

            <div className="telegram-status">
              {isTelegramWebApp ? (
                <span className="status-active">✅ Connected to Telegram</span>
              ) : (
                <span className="status-inactive">🌐 Browser Mode</span>
              )}
            </div>

            {inviterCode && (
              <div className="info-note">
                🎁 Invited by: <b>{inviterCode}</b>
              </div>
            )}

            <div className="info-note">
              💡 This link opens the Telegram Mini App and keeps the referral code.
            </div>
          </div>

          <div className="levels-section">
            <h3>🔺 Referral Tree (5 Levels)</h3>

            <div className="levels-grid">
              {[1, 2, 3, 4, 5].map((level) => (
                <div key={level} className="level-card">
                  {renderLevelTable(level, levels?.[`level_${level}`])}
                </div>
              ))}
            </div>

            <div className="test-actions">
              <button onClick={fetchTestData} className="btn-test" disabled={loading}>
                🧪 Show Test Table
              </button>
            </div>

            {showTestTable && testData && (
              <div className="test-table-section">
                <div className="test-header">
                  <h3>🧪 Test Data (5 Levels)</h3>
                  <button onClick={() => setShowTestTable(false)} className="btn-close">
                    ✕ Close
                  </button>
                </div>

                <div className="levels-grid">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <div key={`test-${level}`} className="level-card test-card">
                      {renderLevelTable(level, testData?.[`level_${level}`])}
                    </div>
                  ))}
                </div>

                <div className="test-note">
                  ⚡ This is test data showing how the referral tree will look with sample users.
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="loading-spinner">Loading referral data...</div>
      )}
    </div>
  );
}