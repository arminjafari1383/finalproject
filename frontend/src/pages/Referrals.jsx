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
  return window.Telegram?.WebApp || null;
};

// ==========================================
// 🖼️ تابع دریافت عکس تلگرام
// ==========================================

const getTelegramAvatar = (telegramId, username) => {
  if (username && 
      username !== 'browser' && 
      !username.startsWith('browser_') &&
      username !== 'null' && 
      username !== 'undefined' &&
      username !== '') {
    return `https://t.me/i/userpic/320/${username}.jpg`;
  }
  
  if (telegramId && 
      telegramId !== '-' && 
      telegramId !== 'browser' && 
      typeof telegramId === 'number' && 
      telegramId > 0) {
    return `https://ui-avatars.com/api/?name=${telegramId}&background=random&size=32&rounded=true`;
  }
  
  return `https://ui-avatars.com/api/?name=User&background=random&size=32&rounded=true`;
};

// ==========================================
// 🐛 کامپوننت دیباگ روی صفحه
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
          🐛 Telegram Username Debug
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
      
      <div style={{ marginBottom: '8px' }}>
        <div style={{ color: '#FFD93D', fontWeight: 'bold', marginBottom: '4px' }}>
          📱 Telegram User Info
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
            <span style={{ color: '#888' }}>Is Telegram WebApp:</span>
            <span style={{ color: data?.isTelegramWebApp ? '#4CAF50' : '#FF6B6B' }}>
              {data?.isTelegramWebApp ? '✅ Yes' : '❌ No'}
            </span>
          </div>
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
  // Telegram Initialization
  // ==========================================

  useEffect(() => {
    const tg = getTelegramWebApp();

    if (!tg) {
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
      
      return;
    }

    tg.ready();
    tg.expand();
    setIsTelegramWebApp(true);

    const user = tg.initDataUnsafe?.user || null;

    if (user) {
      const tgId = user.id;
      const tgUsername = user.username || null;

      setTelegramId(tgId);
      setTelegramUsername(tgUsername);

      setDebugData(prev => ({
        ...prev,
        isTelegramWebApp: true,
        telegramId: tgId,
        telegramUsername: tgUsername,
        user: user,
      }));

      saveUserDataToStorage({
        telegramId: tgId,
        telegramUsername: tgUsername,
        isTelegram: true,
      });
    } else {
      setDebugData(prev => ({
        ...prev,
        isTelegramWebApp: true,
        telegramId: null,
        telegramUsername: null,
        error: 'No user in initDataUnsafe',
      }));
    }

    const capturedCode = captureInviterCode();
    setInviterCode(capturedCode || false);
    setReferralReady(true);
  }, []);

  // ==========================================
  // Save Wallet
  // ==========================================

  useEffect(() => {
    if (!address) return;
    saveUserDataToStorage({ walletAddress: address });
  }, [address]);

  // ==========================================
  // Browser Telegram ID
  // ==========================================

  const browserTelegramId = useMemo(() => {
    if (!address) {
      return Math.floor(Date.now() / 1000) + 2000000000000;
    }

    let hash = 0;
    for (let i = 0; i < address.length; i++) {
      const char = address.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }

    return Math.abs(hash) + 1000000000000;
  }, [address]);

  // ==========================================
  // Register User
  // ==========================================

  useEffect(() => {
    if (!address || !referralReady || hasFetched.current) return;

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

        // ==========================================
        // 🐛 دیباگ: تصمیم‌گیری برای Telegram ID
        // ==========================================
        console.log('🐛 [DEBUG] Telegram detection decision:');
        console.log('  savedData?.telegramId:', savedData?.telegramId);
        console.log('  savedData?.telegramUsername:', savedData?.telegramUsername);
        console.log('  telegramId (state):', telegramId);
        console.log('  telegramUsername (state):', telegramUsername);
        console.log('  isTelegramWebApp:', isTelegramWebApp);

        if (savedData?.telegramId && savedData.telegramId > 0) {
          finalTelegramId = savedData.telegramId;
          finalTelegramUsername = savedData.telegramUsername || null;
          console.log('✅ Using Telegram ID from storage:', finalTelegramId);
        } else if (isTelegramWebApp && telegramId && telegramId > 0) {
          finalTelegramId = telegramId;
          finalTelegramUsername = telegramUsername;
          console.log('✅ Using real Telegram ID:', finalTelegramId);
        } else {
          finalTelegramId = browserTelegramId;
          finalTelegramUsername = null;
          console.log('⚠️ Using browser Telegram ID:', finalTelegramId);
        }

        // ==========================================
        // 🐛 به‌روزرسانی دیباگ
        // ==========================================
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

        // ==========================================
        // 🐛 ذخیره payload در دیباگ
        // ==========================================
        setDebugData(prev => ({
          ...prev,
          payload: payload,
        }));

        console.log('📤 Sending payload:', payload);

        const res = await api.post("/connect/", payload);

        if (cancelled) return;

        // ==========================================
        // 🐛 ذخیره پاسخ در دیباگ
        // ==========================================
        setBackendResponse(res.data);
        setDebugData(prev => ({
          ...prev,
          backendResponse: res.data,
        }));

        console.log('✅ Backend response:', res.data);

        const returnedCode = res.data?.user?.referral_code || null;
        setMyCode(returnedCode);

        const countRes = await api.get("/referrals/count/", {
          params: { wallet_address: address },
        });

        if (cancelled) return;

        const count = countRes.data?.count ?? 0;
        setRefCount(count);

      } catch (error) {
        if (cancelled) return;
        console.error('❌ Error:', error);
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

    async function fetchLevels() {
      try {
        const response = await api.get("/referral/levels/", {
          params: { wallet_address: address },
        });

        setLevels(response.data?.levels || {});
        setTotalReferrals(response.data?.total_referrals || 0);

        // ==========================================
        // 🐛 استخراج اولین کاربر برای دیباگ
        // ==========================================
        const firstLevel = response.data?.levels?.level_1;
        if (firstLevel?.users && firstLevel.users.length > 0) {
          setDebugData(prev => ({
            ...prev,
            firstLevelUser: firstLevel.users[0],
          }));
        }

      } catch (error) {
        console.error("❌ [LEVELS] Failed:", error);
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
                  
                  // ✅ اولویت نمایش: username > telegram_id > wallet
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
                    if (userWallet.length > 10) {
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
      {/* ==========================================
          🐛 دیباگ روی صفحه
          ========================================== */}
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