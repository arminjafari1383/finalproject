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
  const [testData, setTestData] = useState(null); // ✅ اصلاح: useState بود
  const [totalReferrals, setTotalReferrals] = useState(0); // ✅ اصلاح: useState بود و مقدار پیش‌فرض 0
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const SITE_URL = "http://155.117.6.87/"; // ✅ دامنه خودت

  /* ---------------- Telegram Ready ---------------- */
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }
  }, []);

  /* -------- Capture inviter code once (from ?ref or start_param) -------- */
  useEffect(() => {
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

    let cancelled = false;

    async function fetchData() {
      try {
        setLoading(true);
        setError("");

        const inviterCode = localStorage.getItem("inviter_code");

        const res = await api.post("/connect/", {
          wallet_address: address,
          inviter_code: inviterCode || null,
        });

        if (cancelled) return;

        setMyCode(res.data?.user?.referral_code || null);

        const countRes = await api.get("/referrals/count/", {
          params: { wallet_address: address },
        });

        if (cancelled) return;
        setRefCount(countRes.data?.count ?? 0);
      } catch (e) {
        if (cancelled) return;
        setError(
          e?.response?.data?.error ||
            e?.response?.data?.detail ||
            "Failed to fetch referral information."
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [address]);

  /* -------- Fetch referral levels -------- */
  useEffect(() => { // ✅ اصلاح: useInsertionEffect به useEffect تغییر کرد
    if (!address) return;

    async function fetchLevels() {
      try {
        const response = await api.get("/referral/levels/", {
          params: { wallet_address: address }
        });
        setLevels(response.data.levels);
        setTotalReferrals(response.data.total_referrals || 0);
      } catch (e) {
        console.error("Failed to fetch levels:", e);
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
      console.error("Failed to fetch test data:", e);
      setError("Failed to load test data");
    } finally {
      setLoading(false);
    }
  }

  /* ---------------- Referral link (WEBSITE ONLY) ---------------- */
  const referralLink = myCode
    ? `${SITE_URL}/?ref=${encodeURIComponent(myCode)}`
    : "";

  /* ---------------- Open website link (NO Telegram share url) ---------------- */
  function openReferralLink() {
    if (!referralLink) return;

    // اگر داخل تلگرام باشیم، لینک وب را داخل تلگرام باز می‌کند
    const tg = window.Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(referralLink);
    } else {
      // خارج از تلگرام
      window.open(referralLink, "_blank");
    }
  }

  function copyReferralLink() {
    if (!referralLink) return;
    navigator.clipboard?.writeText(referralLink);
    alert("Website referral link copied");
  }

  /* ---------------- Render level table ---------------- */
  function renderLevelTable(level, data) {
    if (!data) {
      return (
        <div className="level-table">
          <h4>Level {level}</h4>
          <p>No data available</p>
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
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Wallet Address</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {displayUsers.length === 0 ? (
              <tr>
                <td colSpan="3" className="empty-message">No users in this level</td>
              </tr>
            ) : (
              displayUsers.map((wallet, index) => (
                <tr key={index}>
                  <td>{index + 1}</td>
                  <td className="wallet-address">
                    {wallet.length > 10 ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : wallet}
                  </td>
                  <td>🟢 Active</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {users.length > 10 && (
          <div className="show-more">+ {users.length - 10} more users</div>
        )}
      </div>
    );
  }

  if (!address) {
    return <div className="connect-warning">🔌 Please connect your wallet first.</div>;
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
            </div><br/><br /><br /><br /><br /><br />

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