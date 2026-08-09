import { useEffect, useMemo, useState } from "react";
import { useTonWallet } from "@tonconnect/ui-react";
import { api } from "../api";
import "./Referrals.css";
import { captureInviterCode } from "../utils/referral";

export default function Referrals() {
  const tonWallet = useTonWallet();
  const address = useMemo(() => tonWallet?.account?.address, [tonWallet]);

  const [myCode, setMyCode] = useState(null);
  const [refCount, setRefCount] = useState(null);
  const [levels, setLevels] = useState(null);
  const [showTestTable, setShowTestTable] = useState(false);
  const [testData, setTestData] = useState(null);
  const [totalReferrals, setTotalReferrals] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [telegramId, setTelegramId] = useState(null);

  const SITE_URL = "https://aipolynet.com/";

  /* ---------------- Telegram Ready ---------------- */
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    console.log("🔍 [DEBUG] Checking Telegram WebApp...");
    console.log("🔍 [DEBUG] window.Telegram:", window.Telegram);
    console.log("🔍 [DEBUG] window.Telegram?.WebApp:", window.Telegram?.WebApp);
    
    if (tg) {
      console.log("✅ [DEBUG] Telegram WebApp found!");
      tg.ready();
      tg.expand();
      console.log("✅ [DEBUG] tg.ready() and tg.expand() called");
      
      // دریافت ID تلگرام
      if (tg.initDataUnsafe?.user?.id) {
        setTelegramId(tg.initDataUnsafe.user.id);
        console.log("✅ [DEBUG] Telegram ID:", tg.initDataUnsafe.user.id);
        console.log("✅ [DEBUG] User:", tg.initDataUnsafe.user);
      } else {
        console.log("⚠️ [DEBUG] No user ID found in initDataUnsafe");
        console.log("📊 [DEBUG] initDataUnsafe:", tg.initDataUnsafe);
      }
    } else {
      console.log("❌ [DEBUG] Telegram WebApp NOT found!");
      console.log("⚠️ [DEBUG] Make sure you're opening from Telegram mini-app");
    }
  }, []);

  /* -------- Capture inviter code once (from ?ref or start_param) -------- */
  useEffect(() => {
    console.log("🔍 [DEBUG] Capturing inviter code...");
    captureInviterCode();
    console.log("📊 [DEBUG] inviter_code from localStorage:", localStorage.getItem("inviter_code"));
  }, []);

  /* -------- Register user & fetch referrals -------- */
  useEffect(() => {
    console.log("🔍 [DEBUG] Register user effect triggered");
    console.log("📊 [DEBUG] address:", address);
    console.log("📊 [DEBUG] telegramId:", telegramId);
    
    if (!address) {
      console.log("⚠️ [DEBUG] No address, clearing state");
      setMyCode(null);
      setRefCount(null);
      setError("");
      return;
    }

    let cancelled = false;

    async function fetchData() {
      try {
        console.log("🔄 [DEBUG] Starting fetchData...");
        setLoading(true);
        setError("");

        const inviterCode = localStorage.getItem("inviter_code");
        console.log("📊 [DEBUG] inviterCode from localStorage:", inviterCode);

        // ✅ ارسال اطلاعات تلگرام به سرور
        const payload = {
          wallet_address: address,
          inviter_code: inviterCode || null,
          telegram_id: telegramId,
          is_telegram: true
        };
        console.log("📤 [DEBUG] Sending to /connect/:", payload);

        const res = await api.post("/connect/", payload);
        console.log("✅ [DEBUG] /connect/ response:", res.data);

        if (cancelled) return;

        setMyCode(res.data?.user?.referral_code || null);
        console.log("📊 [DEBUG] myCode set to:", res.data?.user?.referral_code);

        console.log("🔄 [DEBUG] Fetching referral count...");
        const countRes = await api.get("/referrals/count/", {
          params: { wallet_address: address },
        });
        console.log("✅ [DEBUG] /referrals/count/ response:", countRes.data);

        if (cancelled) return;
        setRefCount(countRes.data?.count ?? 0);
        console.log("📊 [DEBUG] refCount set to:", countRes.data?.count ?? 0);
        
      } catch (e) {
        console.log("❌ [DEBUG] Error in fetchData:");
        console.log("❌ [DEBUG] Error object:", e);
        console.log("❌ [DEBUG] Error response:", e?.response);
        console.log("❌ [DEBUG] Error data:", e?.response?.data);
        console.log("❌ [DEBUG] Error status:", e?.response?.status);
        console.log("❌ [DEBUG] Error message:", e?.message);
        
        if (cancelled) return;
        setError(
          e?.response?.data?.error ||
            e?.response?.data?.detail ||
            e?.message ||
            "Failed to fetch referral information."
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
          console.log("✅ [DEBUG] fetchData completed");
        }
      }
    }

    if (telegramId) {
      console.log("✅ [DEBUG] telegramId exists, calling fetchData()");
      fetchData();
    } else {
      console.log("⚠️ [DEBUG] telegramId is null/undefined, waiting...");
    }

    return () => {
      console.log("🔚 [DEBUG] Cleanup: cancelling fetchData");
      cancelled = true;
    };
  }, [address, telegramId]);

  /* -------- Fetch referral levels -------- */
  useEffect(() => {
    console.log("🔍 [DEBUG] Fetch levels effect triggered");
    console.log("📊 [DEBUG] address:", address);
    
    if (!address) {
      console.log("⚠️ [DEBUG] No address, skipping fetchLevels");
      return;
    }

    async function fetchLevels() {
      try {
        console.log("🔄 [DEBUG] Fetching referral levels...");
        const response = await api.get("/referral/levels/", {
          params: { wallet_address: address }
        });
        console.log("✅ [DEBUG] Levels response:", response.data);
        setLevels(response.data.levels);
        setTotalReferrals(response.data.total_referrals || 0);
        console.log("📊 [DEBUG] levels set, totalReferrals:", response.data.total_referrals || 0);
      } catch (e) {
        console.log("❌ [DEBUG] Failed to fetch levels:");
        console.log("❌ [DEBUG] Error:", e);
        console.log("❌ [DEBUG] Error response:", e?.response);
        console.log("❌ [DEBUG] Error data:", e?.response?.data);
        console.log("❌ [DEBUG] Error status:", e?.response?.status);
      }
    }
    fetchLevels();

  }, [address]);

  /* -------- Fetch test data -------- */
  async function fetchTestData() {
    console.log("🔍 [DEBUG] fetchTestData called");
    console.log("📊 [DEBUG] address:", address);
    
    if (!address) {
      console.log("⚠️ [DEBUG] No address, returning");
      return;
    }
    
    try {
      console.log("🔄 [DEBUG] Fetching test data...");
      setLoading(true);
      const response = await api.get("/referral/levels/", {
        params: {
          wallet_address: address,
          test: "true"
        }
      });
      console.log("✅ [DEBUG] Test data response:", response.data);
      setTestData(response.data.levels);
      setShowTestTable(true);
      console.log("📊 [DEBUG] testData set, showTestTable: true");
    } catch (e) {
      console.log("❌ [DEBUG] Failed to fetch test data:");
      console.log("❌ [DEBUG] Error:", e);
      console.log("❌ [DEBUG] Error response:", e?.response);
      console.log("❌ [DEBUG] Error data:", e?.response?.data);
      console.log("❌ [DEBUG] Error status:", e?.response?.status);
      setError(`Failed to load test data: ${e?.response?.data?.error || e?.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
      console.log("✅ [DEBUG] fetchTestData completed");
    }
  }

  /* ---------------- Referral link ---------------- */
  const referralLink = myCode
    ? `${SITE_URL}/?ref=${encodeURIComponent(myCode)}`
    : "";

  console.log("📊 [DEBUG] referralLink:", referralLink);

  /* ---------------- Open website link ---------------- */
  function openReferralLink() {
    console.log("🔍 [DEBUG] openReferralLink called");
    console.log("📊 [DEBUG] referralLink:", referralLink);
    
    if (!referralLink) {
      console.log("⚠️ [DEBUG] No referral link, returning");
      return;
    }

    const tg = window.Telegram?.WebApp;
    console.log("📊 [DEBUG] window.Telegram?.WebApp:", tg);
    
    if (tg?.openTelegramLink) {
      console.log("✅ [DEBUG] Using tg.openTelegramLink");
      tg.openTelegramLink(referralLink);
    } else {
      console.log("✅ [DEBUG] Using window.open");
      window.open(referralLink, "_blank");
    }
  }

  function copyReferralLink() {
    console.log("🔍 [DEBUG] copyReferralLink called");
    if (!referralLink) {
      console.log("⚠️ [DEBUG] No referral link, returning");
      return;
    }
    navigator.clipboard?.writeText(referralLink);
    console.log("✅ [DEBUG] Referral link copied:", referralLink);
    alert("Website referral link copied");
  }

  /* ---------------- Render level table with 4 columns ---------------- */
  function renderLevelTable(level, data) {
    console.log(`🔍 [DEBUG] renderLevelTable called for level ${level}`);
    console.log(`📊 [DEBUG] data for level ${level}:`, data);
    
    if (!data) {
      console.log(`⚠️ [DEBUG] No data for level ${level}`);
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
    
    console.log(`📊 [DEBUG] Level ${level} - count: ${count}, users: ${users.length}, displaying: ${displayUsers.length}`);

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

  console.log("📊 [DEBUG] Component state:", {
    address,
    telegramId,
    myCode,
    refCount,
    levels,
    testData,
    totalReferrals,
    loading,
    error,
    showTestTable
  });

  // اگر ولت متصل نیست
  if (!address) {
    console.log("⚠️ [DEBUG] No address, showing connect warning");
    return <div className="connect-warning">🔌 Please connect your wallet first.</div>;
  }

  // اگر تلگرام ID دریافت نشده
  if (!telegramId) {
    console.log("⚠️ [DEBUG] No telegramId, showing warning");
    return (
      <div className="connect-warning">
        ⚠️ Please open this app from Telegram mini-app
      </div>
    );
  }

  return (
    <div className="referrals-container">
      <h2 className="ref-title">🎯 Referral Dashboard</h2>

      {loading && <div className="loading-spinner">Loading...</div>}
      {error && <div className="error-message">❌ {error}</div>}

      {myCode && (
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

            <div className="info-note">
              💡 This link is a <b>website</b> link. Your friend can open it and then press <b>OPEN APP</b> in Telegram.
            </div>
          </div>

          {/* ========== بخش نمایش سطوح با ۴ ستون ========== */}
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
      )}
    </div>
  );
}