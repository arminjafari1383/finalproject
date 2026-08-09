import { useEffect, useMemo, useState, useRef } from "react";
import { useTonWallet } from "@tonconnect/ui-react";
import { api } from "../api";
import "./Referrals.css";
import { captureInviterCode } from "../utils/referral";

// ==========================================
// ✅ توابع کمکی برای کار با localStorage (جایگزین کوکی)
// ==========================================
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

export default function Referrals() {
  const tonWallet = useTonWallet();
  const address = useMemo(() => tonWallet?.account?.address, [tonWallet]);
  
  // ✅ استفاده از useRef برای جلوگیری از ارسال درخواست‌های تکراری
  const hasFetched = useRef(false);

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

  const SITE_URL = "https://aipolynet.com/";

  /* ---------------- Telegram Detection ---------------- */
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    console.log("🔍 [DEBUG] Checking Telegram WebApp...");
    
    if (tg) {
      console.log("✅ [DEBUG] Telegram WebApp found!");
      tg.ready();
      tg.expand();
      
      if (tg.initDataUnsafe?.user) {
        const user = tg.initDataUnsafe.user;
        const tgId = user.id;
        const tgUsername = user.username || null;
        
        setTelegramId(tgId);
        setTelegramUsername(tgUsername);
        setIsTelegramWebApp(true);
        
        // ذخیره در localStorage
        saveUserDataToStorage({
          telegramId: tgId,
          telegramUsername: tgUsername,
          isTelegram: true
        });
        
        console.log("✅ [DEBUG] Telegram ID (number):", tgId);
        console.log("✅ [DEBUG] Telegram Username:", tgUsername);
      } else {
        console.log("⚠️ [DEBUG] No user data found in initDataUnsafe");
        setIsTelegramWebApp(true);
      }
    } else {
      console.log("⚠️ [DEBUG] Telegram WebApp NOT found - running in browser mode");
      setIsTelegramWebApp(false);
    }
  }, []);

  /* ---------------- ذخیره آدرس ولت در localStorage ---------------- */
  useEffect(() => {
    if (address) {
      const currentData = loadUserDataFromStorage() || {};
      saveUserDataToStorage({
        ...currentData,
        walletAddress: address
      });
      console.log("💾 [DEBUG] Wallet address saved to localStorage:", address);
    }
  }, [address]);

  /* -------- Generate browser telegram_id -------- */
  const getBrowserTelegramId = useMemo(() => {
    if (address) {
      let hash = 0;
      for (let i = 0; i < address.length; i++) {
        const char = address.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return Math.abs(hash) + 1000000000000;
    }
    return Math.floor(Date.now() / 1000) + 2000000000000;
  }, [address]);

  /* -------- Capture inviter code once -------- */
  useEffect(() => {
    console.log("🔍 [DEBUG] Capturing inviter code...");
    captureInviterCode();
  }, []);

  /* -------- Register user & fetch referrals -------- */
  useEffect(() => {
    if (!address) {
      setMyCode(null);
      setRefCount(null);
      setError("");
      return;
    }

    // ✅ اگر قبلاً درخواست داده شده، دیگر تکرار نکن
    if (hasFetched.current) {
        console.log("⛔️ [DEBUG] Data already fetched, skipping.");
        return;
    }

    let cancelled = false;
    hasFetched.current = true; // قفل را فعال کن

    async function fetchData() {
      try {
        setLoading(true);
        setError("");

        const inviterCode = localStorage.getItem("inviter_code");

        // تعیین telegram_id نهایی از localStorage
        let finalTelegramId;
        let finalTelegramUsername = null;
        
        const savedData = loadUserDataFromStorage();
        
        if (savedData?.telegramId && savedData.telegramId > 0) {
          finalTelegramId = savedData.telegramId;
          finalTelegramUsername = savedData.telegramUsername;
          console.log("📂 [DEBUG] Using telegram_id from localStorage:", finalTelegramId);
        } else if (isTelegramWebApp && telegramId && telegramId > 0) {
          finalTelegramId = telegramId;
          finalTelegramUsername = telegramUsername;
          console.log("✅ [DEBUG] Using real telegram_id:", finalTelegramId);
        } else {
          finalTelegramId = getBrowserTelegramId;
          finalTelegramUsername = `browser_${address.slice(0, 8)}`;
          console.log("🌐 [DEBUG] Using browser telegram_id:", finalTelegramId);
        }

        const payload = {
          wallet_address: address,
          inviter_code: inviterCode || null,
          telegram_id: finalTelegramId,
          telegram_username: finalTelegramUsername,
          is_telegram: isTelegramWebApp || savedData?.isTelegram || false
        };

        console.log("📤 [DEBUG] Sending payload to /connect/:", payload);

        const res = await api.post("/connect/", payload);

        if (cancelled) return;

        setMyCode(res.data?.user?.referral_code || null);
        console.log("✅ [DEBUG] User registered successfully");

        // دریافت تعداد referrals
        const countRes = await api.get("/referrals/count/", {
          params: { wallet_address: address },
        });

        if (cancelled) return;
        setRefCount(countRes.data?.count ?? 0);
        console.log("✅ [DEBUG] Referral count:", countRes.data?.count ?? 0);
        
      } catch (e) {
        if (cancelled) return;
        console.error("❌ [DEBUG] Error in fetchData:", e);
        console.error("❌ [DEBUG] Error response:", e?.response?.data);
        
        setError(
          e?.response?.data?.error ||
            e?.response?.data?.detail ||
            e?.message ||
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
  }, [address, telegramId, telegramUsername, isTelegramWebApp, getBrowserTelegramId]);

  /* -------- Fetch referral levels -------- */
  useEffect(() => {
    if (!address) return;

    async function fetchLevels() {
      try {
        console.log("🔄 [DEBUG] Fetching referral levels...");
        const response = await api.get("/referral/levels/", {
          params: { wallet_address: address }
        });
        setLevels(response.data.levels);
        setTotalReferrals(response.data.total_referrals || 0);
        console.log("✅ [DEBUG] Levels fetched:", response.data);
      } catch (e) {
        console.log("❌ [DEBUG] Failed to fetch levels:", e);
      }
    }
    fetchLevels();

  }, [address]);

  /* -------- Fetch test data -------- */
  async function fetchTestData() {
    if (!address) return;
    
    try {
      setLoading(true);
      const response = await api.get("/referral/levels/", {
        params: {
          wallet_address: address,
          test: "true"
        }
      });
      setTestData(response.data.levels);
      setShowTestTable(true);
    } catch (e) {
      setError(`Failed to load test data: ${e?.response?.data?.error || e?.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }

  /* ---------------- Referral link ---------------- */
  const referralLink = myCode
    ? `${SITE_URL}/?ref=${encodeURIComponent(myCode)}`
    : "";

  /* ==================== دکمه اشتراک‌گذاری ==================== */
  function shareOnTelegram() {
    if (!referralLink) return;

    const message = `🎯 Join me on AI PolyNet!\n\n` +
                    `🚀 Use my referral link to get started:\n` +
                    `${referralLink}\n\n` +
                    `💎 Don't miss out on the rewards!`;

    const tg = window.Telegram?.WebApp;

    if (tg) {
      try {
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(message)}`;
        tg.openTelegramLink(shareUrl);
      } catch (error) {
        window.open(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(message)}`, '_blank');
      }
    } else {
      window.open(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(message)}`, '_blank');
    }
  }

  /* ---------------- Open website link ---------------- */
  function openReferralLink() {
    if (!referralLink) return;
    const tg = window.Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(referralLink);
    } else {
      window.open(referralLink, "_blank");
    }
  }

  /* ---------------- Copy referral link ---------------- */
  function copyReferralLink() {
    if (!referralLink) return;
    navigator.clipboard?.writeText(referralLink);
    alert("✅ Referral link copied to clipboard!");
  }

  /* ---------------- Render level table ---------------- */
  function renderLevelTable(level, data) {
    if (!data) {
      return (
        <div className="level-table">
          <h4>⭐ Level {level}</h4>
          <p className="no-data">No data available</p>
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
                <th>Telegram ID</th>
                <th>Wallet Address</th>
                <th>Investment (TON)</th>
                <th>Profit</th>
              </tr>
            </thead>
            <tbody>
              {displayUsers.length === 0 ? (
                <tr>
                  <td colSpan="5" className="empty-message">No users in this level</td>
                </tr>
              ) : (
                displayUsers.map((user, index) => {
                  const isString = typeof user === 'string';
                  const telegramId = isString ? '-' : (user.telegram_id || '-');
                  const wallet = isString ? user : (user.wallet || '-');
                  const investment = isString ? 0 : (user.investment || 0);
                  const profit = isString ? 0 : (user.profit || 0);
                  
                  return (
                    <tr key={index}>
                      <td>{index + 1}</td>
                      <td className="telegram-id">{telegramId}</td>
                      <td className="wallet-address">
                        {wallet.length > 10 ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : wallet}
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

  // اگر ولت متصل نیست
  if (!address) {
    return <div className="connect-warning">🔌 Please connect your wallet first.</div>;
  }

  return (
    <div className="referrals-container">
      <h2 className="ref-title">🎯 Referral Dashboard</h2>

      {loading && <div className="loading-spinner">Loading...</div>}
      {error && <div className="error-message">❌ {error}</div>}

      {myCode ? (
        <>
          {/* بخش لینک دعوت */}
          <div className="referral-link-section">
            <p className="referral-link-label">🔗 Website Invite Link</p>

            <div className="link-actions">
              <input 
                value={referralLink} 
                readOnly 
                className="link-input" 
              />

              <button
                onClick={openReferralLink}
                disabled={!referralLink}
                className="btn-open"
              >
                🌐 Open
              </button>

              <button
                onClick={copyReferralLink}
                disabled={!referralLink}
                className="btn-copy"
              >
                📋 Copy
              </button>

              <button
                onClick={shareOnTelegram}
                disabled={!referralLink}
                className="btn-share-telegram"
              >
                📤 Share on Telegram
              </button>
            </div>

            {/* بخش آمار */}
            <div className="stats-box">
              <div className="stat-item">
                <span className="stat-label">👥 Direct Invites</span>
                <span className="stat-value">{refCount === null ? '...' : refCount}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">🌳 Total Tree</span>
                <span className="stat-value">{totalReferrals}</span>
              </div>
            </div>

            {/* نمایش وضعیت تلگرام */}
            <div className="telegram-status">
              {isTelegramWebApp || loadUserDataFromStorage()?.isTelegram ? (
                <span className="status-active">✅ Connected to Telegram</span>
              ) : (
                <span className="status-inactive">🌐 Browser Mode</span>
              )}
            </div>

            <div className="info-note">
              💡 This link is a <b>website</b> link. Your friend can open it and then press <b>OPEN APP</b> in Telegram.
            </div>
          </div>

          {/* ========== بخش نمایش سطوح ========== */}
          <div className="levels-section">
            <h3>🔺 Referral Tree (5 Levels)</h3>
            
            <div className="levels-grid">
              {[1, 2, 3, 4, 5].map(level => (
                <div key={level} className="level-card">
                  {renderLevelTable(level, levels?.[`level_${level}`])}
                </div>
              ))}
            </div>

            {/* دکمه برای نمایش جدول تستی */}
            <div className="test-actions">
              <button 
                onClick={fetchTestData}
                className="btn-test"
                disabled={loading}
              >
                🧪 Show Test Table
              </button>
            </div>

            {/* جدول تستی */}
            {showTestTable && testData && (
              <div className="test-table-section">
                <div className="test-header">
                  <h3>🧪 Test Data (5 Levels)</h3>
                  <button 
                    onClick={() => setShowTestTable(false)}
                    className="btn-close"
                  >
                    ✕ Close
                  </button>
                </div>
                <div className="levels-grid">
                  {[1, 2, 3, 4, 5].map(level => (
                    <div key={`test-${level}`} className="level-card test-card">
                      {renderLevelTable(level, testData?.[`level_${level}`])}
                    </div>
                  ))}
                </div>
                <div className="test-note">
                  ⚡ This is test data showing how the referral tree will look with sample users
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