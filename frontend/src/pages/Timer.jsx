import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import "./Timer.css";
import Logo from "../assets/2.png";
import Blade from "../assets/1.png";
import eplLogo from "../assets/epl-logo.png";

const API = "/api/wallet";
const BOT_USERNAME = "Aipolynetbot";
const USER_DATA_KEY = "my_app_user_data";
const OWN_REFERRAL_CODE_KEY = "my_referral_code";

/* =========================================================
   HOURGLASS COMPONENT
========================================================= */
function CountdownHourglass({ remaining, topSandHeight, bottomSandHeight }) {
  const topFill = Math.max(0, Math.min(77, topSandHeight * 0.84));
  const bottomFill = Math.max(0, Math.min(77, bottomSandHeight * 0.84));
  const topY = 132 - topFill;
  const bottomBase = 236;
  const bottomPeak = bottomFill <= 1 ? bottomBase : Math.max(169, bottomBase - bottomFill);
  const bottomHalfWidth = 13 + (bottomFill / 77) * 43;
  const bottomLeft = 120 - bottomHalfWidth;
  const bottomRight = 120 + bottomHalfWidth;

  return (
    <svg viewBox="0 0 240 285" xmlns="http://www.w3.org/2000/svg" className="countdown-hourglass">
      <defs>
        <linearGradient id="hgSand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff9ba" />
          <stop offset="50%" stopColor="#ffc72f" />
          <stop offset="100%" stopColor="#b85900" />
        </linearGradient>
        <filter id="hgGoldGlow">
          <feGaussianBlur stdDeviation="2" />
        </filter>
      </defs>

      {/* شیشه بالا */}
      <path d="M63 47 C64 87 77 108 103 129 C111 136 116 143 120 149 C124 143 129 136 137 129 C163 108 176 87 177 47" fill="rgba(0,73,120,0.05)" stroke="#0058bc" strokeWidth="2" />
      
      {/* شیشه پایین */}
      <path d="M120 149 C116 156 111 162 103 169 C77 190 64 211 63 239 M120 149 C124 156 129 162 137 169 C163 190 176 211 177 239" fill="rgba(0,73,120,0.05)" stroke="#0058bc" strokeWidth="2" />

      {/* ماسه بالا */}
      {topFill > 0 && (
        <rect x="57" y={topY} width="126" height={topFill + 5} fill="url(#hgSand)" filter="url(#hgGoldGlow)" />
      )}

      {/* ماسه پایین */}
      {bottomFill > 1 && (
        <path
          d={`M ${bottomLeft} ${bottomBase} Q 83 ${bottomPeak + 12} 120 ${bottomPeak} Q 157 ${bottomPeak + 12} ${bottomRight} ${bottomBase} Z`}
          fill="url(#hgSand)"
          filter="url(#hgGoldGlow)"
        />
      )}

      {/* جریان ماسه */}
      {remaining > 0 && topFill > 1 && (
        <line x1="120" y1="146" x2="120" y2={Math.max(205, bottomPeak)} stroke="#ffe470" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
      )}

      {/* درب بالا */}
      <rect x="59" y="34" width="122" height="15" rx="6" fill="#001c6d" stroke="#17cfff" strokeWidth="1.5" />
      
      {/* درب پایین */}
      <rect x="59" y="235" width="122" height="15" rx="6" fill="#001c6d" stroke="#17cfff" strokeWidth="1.5" />
      <ellipse cx="120" cy="250" rx="62" ry="8" fill="#002381" stroke="#099cff" strokeWidth="1.4" />
    </svg>
  );
}

/* =========================================================
   TIMER PAGE
========================================================= */
export default function TimerPage() {
  // =========================================================
  // STATE
  // =========================================================
  const [telegramId, setTelegramId] = useState(null);
  const [telegramUsername, setTelegramUsername] = useState(null);
  const [telegramPhotoUrl, setTelegramPhotoUrl] = useState(null);
  const [remaining, setRemaining] = useState(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(3600);
  const [totalRewards, setTotalRewards] = useState("0");
  const [referralBonus, setReferralBonus] = useState("0");
  const [rewardCount, setRewardCount] = useState(0);
  const [eplBalance, setEplBalance] = useState(0);
  const [referralCode, setReferralCode] = useState(null);
  const [message, setMessage] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // =========================================================
  // REFs
  // =========================================================
  const intervalRef = useRef(null);
  const menuRef = useRef(null);
  const loadedRef = useRef(false);

  // =========================================================
  // 📌 خواندن اطلاعات کاربر از localStorage
  // =========================================================
  const loadUserFromStorage = () => {
    try {
      const raw = localStorage.getItem(USER_DATA_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return {
        telegramId: data.telegramId || null,
        telegramUsername: data.telegramUsername || null,
        telegramPhotoUrl: data.telegramPhotoUrl || null,
      };
    } catch {
      return null;
    }
  };

  // =========================================================
  // 📌 دریافت کد رفرال از URL
  // =========================================================
  const getReferralFromUrl = () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const startParam = params.get('startapp');
      if (!startParam) return null;
      const match = startParam.match(/ref_([a-zA-Z0-9]+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  };

  // =========================================================
  // 📡 بارگذاری داده‌ها از سرور
  // =========================================================
  const loadData = async () => {
    if (loadedRef.current) return;

    const user = loadUserFromStorage();
    if (!user || !user.telegramId) {
      setMessage("⚠️ Telegram ID not found. Please login.");
      setLoading(false);
      return;
    }

    setTelegramId(user.telegramId);
    setTelegramUsername(user.telegramUsername);
    setTelegramPhotoUrl(user.telegramPhotoUrl);

    const referralCode = getReferralFromUrl();

    try {
      let url = `${API}/reward_status/?telegram_id=${user.telegramId}`;
      if (referralCode) {
        url += `&inviter_code=${encodeURIComponent(referralCode)}`;
      }

      const headers = {
        'X-Telegram-Id': String(user.telegramId),
        'X-Telegram': 'true',
      };
      if (user.telegramUsername) {
        headers['X-Telegram-Username'] = user.telegramUsername;
      }

      const response = await axios.get(url, { headers });
      const data = response.data;

      if (data && data.status !== "error") {
        setTotalRewards(data.total_rewards || "0");
        setReferralBonus(data.referral_bonus || "0");
        setRewardCount(data.rewards_count || 0);
        setCooldownSeconds(data.cooldown_seconds || 3600);
        
        const secs = data.seconds_remaining || 0;
        setRemaining(secs);
        
        setEplBalance(parseFloat(data.epl_balance || 0));
        setReferralCode(data.referral_code || null);

        if (data.referral_code) {
          localStorage.setItem(OWN_REFERRAL_CODE_KEY, data.referral_code);
        }

        if (secs > 0) {
          startTimer(secs);
        }

        loadedRef.current = true;
        setMessage("");
      }
    } catch (error) {
      console.error("Load error:", error);
      if (error?.response?.status === 404) {
        setRemaining(0);
        setMessage("Welcome! Start mining.");
      } else {
        setMessage("❌ Could not load data.");
      }
    } finally {
      setLoading(false);
    }
  };

  // =========================================================
  // ⏱️ تایمر
  // =========================================================
  const startTimer = (initialSeconds) => {
    if (intervalRef.current) return;
    
    let seconds = initialSeconds;
    intervalRef.current = setInterval(() => {
      seconds -= 1;
      setRemaining(seconds);
      if (seconds <= 0) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        setRemaining(0);
      }
    }, 1000);
  };

  const stopTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // =========================================================
  // 🎯 Claim Reward
  // =========================================================
  const claimReward = async () => {
    if (!telegramId) {
      setMessage("⚠️ Please login first.");
      return;
    }

    if (remaining !== 0 && remaining !== null) {
      setMessage("⏳ Please wait for timer to finish.");
      return;
    }

    try {
      setMessage("⏳ Claiming...");
      
      const headers = {
        'X-Telegram-Id': String(telegramId),
        'X-Telegram': 'true',
      };
      if (telegramUsername) {
        headers['X-Telegram-Username'] = telegramUsername;
      }

      const response = await axios.post(
        `${API}/tick/`,
        { telegram_id: telegramId },
        { headers }
      );

      const data = response.data;

      if (data?.status === "rewarded") {
        setTotalRewards(data.total_rewards || "0");
        setReferralBonus(data.referral_bonus || "0");
        setRewardCount(data.rewards_count || 0);
        setEplBalance(parseFloat(data.epl_balance || 0));
        setMessage(`🎉 ${data.message || "Reward claimed!"}`);
        
        loadedRef.current = false;
        setTimeout(() => window.location.reload(), 1500);
        return;
      }

      if (data?.status === "too_early") {
        const secs = data.seconds_remaining || 0;
        setRemaining(secs);
        startTimer(secs);
        setMessage(`⏳ Wait ${Math.floor(secs / 60)}m ${secs % 60}s`);
        return;
      }

      setMessage("⚠️ " + (data?.message || "Could not claim."));
    } catch (error) {
      console.error("Claim error:", error);
      setMessage("❌ Error claiming reward.");
    }
  };

  // =========================================================
  // 📤 Share Referral
  // =========================================================
  const shareReferral = async () => {
    if (inviteLoading) return;
    setInviteLoading(true);
    setInviteMessage("");

    try {
      let code = referralCode;
      if (!code) {
        const cached = localStorage.getItem(OWN_REFERRAL_CODE_KEY);
        if (cached) {
          code = cached;
        } else if (telegramId) {
          const response = await axios.get(`${API}/referral_count/`, {
            headers: {
              'X-Telegram-Id': String(telegramId),
              'X-Telegram': 'true',
            }
          });
          code = response.data?.referral_code;
          if (code) localStorage.setItem(OWN_REFERRAL_CODE_KEY, code);
        }
      }

      if (!code) {
        setInviteMessage("❌ No referral code available.");
        return;
      }

      const link = `https://t.me/${BOT_USERNAME}/app?startapp=ref_${code}`;
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("Join AI POLIFY with my referral link!")}`;

      if (window.Telegram?.WebApp?.openTelegramLink) {
        window.Telegram.WebApp.openTelegramLink(shareUrl);
      } else {
        window.open(shareUrl, "_blank");
      }
      setInviteMessage("✅ Referral link opened!");
    } catch (error) {
      console.error("Share error:", error);
      setInviteMessage("❌ Could not share.");
    } finally {
      setInviteLoading(false);
    }
  };

  // =========================================================
  // 📋 Copy Referral Link
  // =========================================================
  const copyReferralLink = async () => {
    try {
      let code = referralCode || localStorage.getItem(OWN_REFERRAL_CODE_KEY);
      if (!code) {
        setMessage("❌ No referral code available.");
        return;
      }
      const link = `https://t.me/${BOT_USERNAME}/app?startapp=ref_${code}`;
      await navigator.clipboard.writeText(link);
      setMessage("✅ Link copied!");
    } catch {
      setMessage("❌ Could not copy.");
    }
  };

  // =========================================================
  // 🚀 INIT
  // =========================================================
  useEffect(() => {
    loadData();
    return () => stopTimer();
  }, []);

  // =========================================================
  // 📊 محاسبات
  // =========================================================
  const canClaim = remaining === 0 || remaining === null;
  const progress = remaining !== null && remaining > 0 
    ? Math.round(((cooldownSeconds - remaining) / cooldownSeconds) * 100)
    : 100;

  const topSandHeight = remaining !== null && remaining > 0 
    ? 90 * (remaining / cooldownSeconds) 
    : 0;
  const bottomSandHeight = 90 - topSandHeight;

  const hours = remaining === null ? "--" : String(Math.floor(remaining / 3600)).padStart(2, "0");
  const minutes = remaining === null ? "--" : String(Math.floor((remaining % 3600) / 60)).padStart(2, "0");
  const secs = remaining === null ? "--" : String(Math.floor(remaining % 60)).padStart(2, "0");

  // =========================================================
  // 🖼️ UI
  // =========================================================
  if (loading) {
    return (
      <div className="boost-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
          <div style={{ fontSize: 18, color: '#00d9ff' }}>Loading...</div>
        </div>
      </div>
    );
  }

  const displayName = telegramUsername ? `@${telegramUsername}` : "Telegram User";

  return (
    <div className="boost-page">
      <main className="mining-shell">
        {/* Header */}
        <header className="topbar">
          <div className="hamburger-menu" ref={menuRef}>
            <button
              type="button"
              className={`hamburger-btn ${menuOpen ? "is-open" : ""}`}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <span /><span /><span />
            </button>
            {menuOpen && (
              <>
                <button className="menu-backdrop" onClick={() => setMenuOpen(false)} />
                <aside className="side-drawer">
                  <div className="drawer-header">
                    <div className="drawer-brand"><strong>AI POLIFY</strong></div>
                    <button className="drawer-icon-btn" onClick={() => setMenuOpen(false)}>×</button>
                  </div>
                  <div className="drawer-buttons">
                    <a className="drawer-main-btn drawer-support-btn" href="https://t.me/Ai_polyfi_support" target="_blank" rel="noreferrer">
                      🎧 Support
                    </a>
                  </div>
                </aside>
              </>
            )}
          </div>
          <h1>AI POLIFY</h1>
          <img src={Logo} alt="Logo" className="brand-logo" />
        </header>

        {/* User Info */}
        <section className="glass-card" style={{ marginTop: 14, padding: 14, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, color: "#00d9ff", marginBottom: 5 }}>TELEGRAM</div>
            <div style={{ fontSize: 15, fontWeight: 900 }}>{displayName}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>ID: {telegramId || "Not found"}</div>
          </div>
          {telegramPhotoUrl ? (
            <img src={telegramPhotoUrl} alt="Profile" style={{ width: 46, height: 46, borderRadius: "50%", border: "1px solid rgba(0,217,255,.55)" }} />
          ) : (
            <div style={{ width: 46, height: 46, borderRadius: "50%", background: "rgba(0,217,255,.1)", border: "1px solid rgba(0,217,255,.4)", display: "grid", placeItems: "center", fontSize: 20 }}>✈️</div>
          )}
        </section>

        {/* Miner */}
        <section className="miner-card">
          <div className="miner-top-edge" />
          <svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" className="miner-svg">
            <defs>
              <filter id="centerBloom"><feGaussianBlur stdDeviation="24" /></filter>
              <mask id="mask-blades">
                <rect width="100%" height="100%" fill="white" />
                <circle cx="200" cy="210" r="47" fill="black" />
              </mask>
            </defs>
            <g filter="url(#centerBloom)">
              <circle cx="200" cy="210" r="115" fill="#039bea" opacity="0.14" />
              <circle cx="200" cy="210" r="72" fill="#00d9ff" opacity="0.18" />
            </g>
            <image className="fan-blades" href={Blade} x="72" y="82" width="256" height="256" mask="url(#mask-blades)" />
            <circle cx="200" cy="210" r="62" fill="#06142d" stroke="#0ab9ff" strokeWidth="3" />
            <circle cx="200" cy="210" r="55" fill="none" stroke="rgba(72,207,255,.18)" strokeWidth="2" />
            <text x="200" y="198" textAnchor="middle" fill="white" fontSize="18" fontWeight="800">MINER</text>
            <path d="M177 211 H189 M189 211 Q192 202 195 211 T201 211 Q204 202 207 211 T213 211 H224" stroke="#ffffff" strokeWidth="2.6" fill="none" />
            <text x="200" y="232" textAnchor="middle" fill="white" fontSize="22" fontWeight="700">EPL</text>
          </svg>
        </section>

        {/* Countdown */}
        <section className="countdown-zone">
          <CountdownHourglass remaining={remaining} topSandHeight={topSandHeight} bottomSandHeight={bottomSandHeight} />
          <p className="mining-caption">{canClaim ? "Mining completed!" : "Mining in progress..."}</p>
          <div className="digital-countdown">
            <div className="time-part"><strong>{hours}</strong><span>HOURS</span></div>
            <b className="colon">:</b>
            <div className="time-part"><strong>{minutes}</strong><span>MINUTES</span></div>
            <b className="colon">:</b>
            <div className="time-part"><strong>{secs}</strong><span>SECONDS</span></div>
          </div>
        </section>

        {/* Reward */}
        <section className="reward-card glass-card">
          <div className="reward-heading">
            <span>Hourly Reward</span>
            <strong>100.0000 EPL</strong>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${Math.min(100, progress)}%` }}>
              <span>{Math.min(100, progress)}%</span>
            </div>
          </div>
          <div className="reward-stats">
            <div className="stat-item"><span className="stat-icon">▣</span> Claims: <strong>{rewardCount}</strong></div>
            <div className="stat-divider" />
            <div className="stat-item"><span className="stat-icon">♟</span> Referral: <strong>{parseFloat(referralBonus).toFixed(4)} EPL</strong></div>
          </div>
        </section>

        {/* Status */}
        <section className="status-card glass-card">
          <div className="coin-icon"><span /><span /><span /></div>
          <div>
            <h2>{canClaim ? "Reward ready!" : "Mining..."}</h2>
            <p>{canClaim ? "Claim your reward now." : "Stay online to claim."}</p>
          </div>
        </section>

        {/* Claim Button */}
        {telegramId && (
          <button className={`claim-btn ${!canClaim ? "claim-loading" : ""}`} onClick={claimReward} disabled={!canClaim}>
            {canClaim ? "Claim 100 EPL" : "Mining..."}
          </button>
        )}

        {/* Referral */}
        <section className="glass-card" style={{ marginTop: 18, padding: 16, borderRadius: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 14, color: "#00d9ff" }}>👥 REFERRAL</div>
          {[1, 2, 3, 4, 5].map((level) => (
            <div key={level} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: level !== 5 ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
              <span>🏆 Level {level}</span>
              <span style={{ color: "#00d9ff", fontWeight: 900 }}>+{level === 1 ? "1000" : "500"} <img src={eplLogo} alt="EPL" style={{ width: 18, height: 18, verticalAlign: "middle" }} /></span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={shareReferral} disabled={inviteLoading} style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid rgba(0,217,255,.5)", background: "rgba(0,217,255,.15)", color: "#fff", fontWeight: 900, cursor: "pointer" }}>
              {inviteLoading ? "..." : "📤 Invite"}
            </button>
            <button onClick={copyReferralLink} style={{ padding: "12px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.05)", color: "#fff", cursor: "pointer" }}>
              📋
            </button>
          </div>
          {inviteMessage && <div style={{ marginTop: 8, fontSize: 12, color: inviteMessage.includes("✅") ? "#66f5c7" : "#ff9a9a" }}>{inviteMessage}</div>}
        </section>

        {/* EPL Balance */}
        {telegramId && (
          <section className="glass-card" style={{ marginTop: 18, padding: 18, borderRadius: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>EPL BALANCE</div>
                <div style={{ fontSize: 26, fontWeight: 900 }}>{eplBalance.toFixed(4)} EPL</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              <div style={{ padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.05)" }}>
                <div style={{ fontSize: 11, opacity: 0.6 }}>Hourly</div>
                <strong>{parseFloat(totalRewards).toFixed(4)}</strong>
              </div>
              <div style={{ padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.05)" }}>
                <div style={{ fontSize: 11, opacity: 0.6 }}>Referral</div>
                <strong>{parseFloat(referralBonus).toFixed(4)}</strong>
              </div>
              <div style={{ padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.05)" }}>
                <div style={{ fontSize: 11, opacity: 0.6 }}>Claims</div>
                <strong>{rewardCount}</strong>
              </div>
            </div>
          </section>
        )}

        {message && <p className="server-message" style={{ textAlign: "center", marginTop: 12, fontSize: 14 }}>{message}</p>}
      </main>

      {/* Bottom Nav */}
      <nav className="bottom-nav">
        <button className="nav-item active"><span className="nav-icon">⚒</span><span>Mine</span></button>
        <button className="nav-item"><span className="nav-icon">◉</span><span>Stake</span></button>
        <button className="nav-item"><span className="nav-icon">🤝</span><span>Friends</span></button>
        <button className="nav-item"><span className="nav-icon">♙</span><span>About</span></button>
        <button className="nav-item"><span className="nav-icon">▢</span><span>Wallets</span></button>
      </nav>
    </div>
  );
}