import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTonWallet } from "@tonconnect/ui-react";
import axios from "axios";
import "./Timer.css";
import Logo from "../assets/2.png";
import Blade from "../assets/1.png";

// ✅ استفاده از آدرس نسبی برای جلوگیری از مشکل CORS و Nginx
const API = "/api/wallet";

function CountdownHourglass({ remaining, topSandHeight, bottomSandHeight }) {
  return (
    <svg
      viewBox="0 0 240 280"
      xmlns="http://www.w3.org/2000/svg"
      className={`countdown-hourglass ${remaining > 0 ? "hourglass-running" : "hourglass-ready"}`}
      role="img"
      aria-label="Daily reward countdown"
    >
      <defs>
        <linearGradient id="miniHourglassFrame" x1="45" y1="25" x2="195" y2="240" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#dff7ff" />
          <stop offset="50%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
        <linearGradient id="miniSand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fef3c7" />
          <stop offset="55%" stopColor="#facc15" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
        <clipPath id="miniTopChamber">
          <path d="M65 58 H175 L138 132 H102 Z" />
        </clipPath>
        <clipPath id="miniBottomChamber">
          <path d="M102 142 H138 L175 216 H65 Z" />
        </clipPath>
      </defs>

      <path d="M58 50 H182 M58 224 H182" stroke="url(#miniHourglassFrame)" strokeWidth="14" strokeLinecap="round" />
      <path d="M69 61 C74 96 103 114 112 137 C103 158 74 181 69 213" fill="none" stroke="url(#miniHourglassFrame)" strokeWidth="7" strokeLinecap="round" />
      <path d="M171 61 C166 96 137 114 128 137 C137 158 166 181 171 213" fill="none" stroke="url(#miniHourglassFrame)" strokeWidth="7" strokeLinecap="round" />
      <path d="M65 58 H175 L138 132 H102 Z" fill="rgba(186,230,253,0.08)" stroke="rgba(186,230,253,0.28)" />
      <path d="M102 142 H138 L175 216 H65 Z" fill="rgba(186,230,253,0.08)" stroke="rgba(186,230,253,0.28)" />

      <rect x="62" y={132 - topSandHeight * 0.74} width="116" height={topSandHeight * 0.74} fill="url(#miniSand)" clipPath="url(#miniTopChamber)" />
      <rect x="62" y={216 - bottomSandHeight * 0.74} width="116" height={bottomSandHeight * 0.74} fill="url(#miniSand)" clipPath="url(#miniBottomChamber)" />

      {remaining > 0 && (
        <path className="sand-stream" d="M120 130 V194" stroke="#facc15" strokeWidth="4" strokeLinecap="round" />
      )}

      <circle cx="120" cy="137" r="5" fill="#fef3c7" />
    </svg>
  );
}

export default function TimerPage() {
  const tonWallet = useTonWallet();
  const walletAddress = tonWallet?.account?.address || null;

  const [remaining, setRemaining] = useState(null);
  const [balance, setBalance] = useState("0");
  const [totalRewards, setTotalRewards] = useState("0");
  const [referralBonus, setReferralBonus] = useState("0");
  const [rewardCount, setRewardCount] = useState(0);

  const [message, setMessage] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const intervalRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const closeMenu = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, []);

  const stopTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const startTimer = () => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      setRemaining((sec) => {
        if (sec === null || sec === undefined) return sec;
        if (sec > 0) return sec - 1;
        return 0;
      });
    }, 1000);
  };

  const fetchStatus = useCallback(async () => {
    if (!walletAddress) {
      console.log("[Timer] No wallet address");
      return;
    }

    const url = `${API}/reward_status/`;
    console.log("[Timer] fetchStatus =>", url, "wallet_address=", walletAddress);

    try {
      const res = await axios.get(url, {
        params: { 
          wallet_address: walletAddress
        }
      });

      console.log("[Timer] reward_status HTTP:", res.status);
      console.log("[Timer] reward_status data:", res.data);

      const data = res.data;

      if (data && data.status === "ok") {
        const sec = data.seconds_remaining ?? 0;

        setRemaining(sec);
        setBalance(data.balance_ecg ?? "0");
        setTotalRewards(data.total_rewards ?? "0");
        setReferralBonus(data.referral_points ?? "0");
        setRewardCount(data.rewards_count ?? 0);

        if (sec > 0) {
          setMessage("⏳ Timer is running...");
          startTimer();
        } else {
          setMessage("✅ Ready to claim daily reward!");
          stopTimer();
        }
      } else if (data) {
        console.warn("[Timer] Unexpected response format, using data:", data);
        
        const sec = data.seconds_remaining ?? data.seconds ?? 0;
        setRemaining(sec);
        setBalance(data.balance_ecg ?? data.balance ?? data.withdrawable_total ?? "0");
        setTotalRewards(data.total_rewards ?? data.totalRewards ?? data.withdrawable_total ?? "0");
        setReferralBonus(data.referral_points ?? data.referralBonus ?? data.referral_bonus ?? "0");
        setRewardCount(data.rewards_count ?? data.rewardCount ?? 0);

        if (sec > 0) {
          setMessage("⏳ Timer is running...");
          startTimer();
        } else {
          setMessage("✅ Ready to claim daily reward!");
          stopTimer();
        }
      } else {
        setMessage("❌ Invalid server response.");
      }
    } catch (e) {
      console.error("[Timer] fetchStatus ERROR:", e);
      console.error("[Timer] fetchStatus status:", e.response?.status);
      console.error("[Timer] fetchStatus data:", e.response?.data);
      setMessage("❌ Cannot load timer status from server.");
    }
  }, [walletAddress]);

  const canClaim = remaining === 0 || remaining === null;
  const daySeconds = 24 * 60 * 60;
  const remainingRatio =
    remaining === null
      ? 1
      : Math.min(1, Math.max(0, remaining / daySeconds));
  const elapsedRatio = 1 - remainingRatio;
  const topSandHeight = 90 * remainingRatio;
  const bottomSandHeight = 90 * elapsedRatio;

  const claimReward = async () => {
    if (!walletAddress) {
      setMessage("⚠️ Please connect your wallet first.");
      return;
    }

    if (!canClaim) {
      setMessage("⚠️ Please wait for the timer to finish.");
      return;
    }

    const url = `${API}/tick/`;
    
    console.log("[Timer] claimReward =>", url, "wallet_address=", walletAddress);

    try {
      setMessage("⏳ Claiming reward...");

      const res = await axios.post(url, {
        wallet_address: walletAddress
      });

      console.log("[Timer] tick HTTP:", res.status);
      console.log("[Timer] tick data:", res.data);

      const data = res.data;

      if (data?.status === "rewarded") {
        setBalance(data.balance_ecg ?? "0");
        setTotalRewards(data.total_rewards ?? "0");
        setRewardCount(data.rewards_count ?? 0);
        setMessage(`🎉 ${data.message || "Reward claimed!"}`);

        await fetchStatus();
      } else if (data?.status === "too_early") {
        const sec = data.seconds_remaining || 0;
        setRemaining(sec);
        setMessage(`⏳ Please wait ${Math.floor(sec/60)} minutes ${sec%60} seconds`);
        startTimer();
      } else {
        console.warn("[Timer] tick unexpected response:", data);
        setMessage("⚠️ " + (data?.message || data?.error || "Could not claim."));
        setTimeout(fetchStatus, 5000);
      }
    } catch (e) {
      console.error("[Timer] claimReward ERROR:", e);
      console.error("[Timer] claimReward status:", e.response?.status);
      console.error("[Timer] claimReward data:", e.response?.data);

      const errorMsg =
        e.response?.data?.message ||
        e.response?.data?.error ||
        "Error claiming reward.";
      setMessage(`❌ ${errorMsg}`);
      
      if (e.response?.status === 405) {
        setMessage("❌ Server method not allowed. Please try again later.");
      }
      
      setTimeout(fetchStatus, 5000);
    }
  };

  useEffect(() => {
    stopTimer();

    if (!walletAddress) {
      setRemaining(null);
      setMessage("");
      console.log("[Timer] wallet not connected");
      return;
    }

    console.log("[Timer] wallet connected:", walletAddress);
    fetchStatus();

    return () => stopTimer();
  }, [walletAddress, fetchStatus]);

  // فرمت کردن زمان به HH:MM:SS
  const formatTime = (seconds) => {
    if (seconds === null || seconds === undefined) return "--:--:--";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${String(h).padStart(2, "0")} : ${String(m).padStart(2, "0")} : ${String(s).padStart(2, "0")}`;
  };

  const progress = Math.round(elapsedRatio * 100);
  const hours = remaining == null ? "--" : String(Math.floor(remaining / 3600)).padStart(2, "0");
  const minutes = remaining == null ? "--" : String(Math.floor((remaining % 3600) / 60)).padStart(2, "0");
  const seconds = remaining == null ? "--" : String(Math.floor(remaining % 60)).padStart(2, "0");

  return (
    <div className="boost-page">
      <main className="mining-shell">
        <header className="topbar">
          <div className="hamburger-menu" ref={menuRef}>
            <button
              type="button"
              className={`hamburger-btn ${menuOpen ? "is-open" : ""}`}
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
            >
              <span /><span /><span />
            </button>

            {menuOpen && (
              <>
                <button
                  type="button"
                  className="menu-backdrop"
                  aria-label="Close menu overlay"
                  onClick={() => setMenuOpen(false)}
                />

                <aside className="side-drawer" role="dialog" aria-modal="true" aria-label="Navigation menu">
                  <div className="drawer-header">
                    <button type="button" className="drawer-icon-btn" aria-label="Search">
                      <span className="drawer-icon">⌕</span>
                    </button>

                    <div className="drawer-brand">
                      <strong>AI POLIFY</strong>
                      <span>mining dashboard</span>
                    </div>

                    <button
                      type="button"
                      className="drawer-icon-btn"
                      aria-label="Close menu"
                      onClick={() => setMenuOpen(false)}
                    >
                      <span className="drawer-icon">×</span>
                    </button>
                  </div>

                  <div className="drawer-panel-preview" />

                  <nav className="drawer-nav">
                    <button type="button" className="drawer-link" onClick={() => setMenuOpen(false)}>Mine</button>
                    <button type="button" className="drawer-link" onClick={() => setMenuOpen(false)}>Stake</button>
                    <button type="button" className="drawer-link" onClick={() => setMenuOpen(false)}>Friends</button>
                    <button type="button" className="drawer-link" onClick={() => setMenuOpen(false)}>Wallets</button>
                    <button
                      type="button"
                      className="drawer-link"
                      onClick={() => {
                        setMessage("💬 Support: Please contact our support team.");
                        setMenuOpen(false);
                      }}
                    >
                      Support
                    </button>
                  </nav>

                  <div className="drawer-divider" />

                  <div className="drawer-actions">
                    <button type="button" className="drawer-text-btn" onClick={() => setMenuOpen(false)}>
                      Sign in
                    </button>

                    <button
                      type="button"
                      className="drawer-outline-btn"
                      onClick={() => {
                        setMessage("🛍️ Shopping section is coming soon.");
                        setMenuOpen(false);
                      }}
                    >
                      Open Shopping
                    </button>
                  </div>

                  <div className="drawer-footer-brand">
                    <strong>AI POLIFY</strong>
                    <span>smart mining</span>
                  </div>
                </aside>
              </>
            )}
          </div>

          <h1>AI POLIFY</h1>
          <img src={Logo} alt="AI POLIFY Logo" className="brand-logo" />
        </header>

        <section className="miner-card" aria-label="ECG Miner">
          <div className="miner-top-edge" />

          <svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" className="miner-svg">
            <defs>
              <filter id="centerBloom" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="24" />
              </filter>
              <mask id="mask-blades">
                <rect width="100%" height="100%" fill="white" />
                <circle cx="200" cy="210" r="47" fill="black" />
              </mask>
            </defs>

            <g filter="url(#centerBloom)">
              <circle cx="200" cy="210" r="115" fill="#039bea" opacity="0.14" />
              <circle cx="200" cy="210" r="72" fill="#00d9ff" opacity="0.18" />
            </g>

            <image
              className="fan-blades"
              href={Blade}
              x="72"
              y="82"
              width="256"
              height="256"
              mask="url(#mask-blades)"
            />

            <circle cx="200" cy="210" r="62" fill="#06142d" stroke="#0ab9ff" strokeWidth="3" />
            <circle cx="200" cy="210" r="55" fill="none" stroke="rgba(72,207,255,.18)" strokeWidth="2" />
            <text x="200" y="198" textAnchor="middle" fill="white" fontSize="18" fontWeight="800">MINER</text>
            <path d="M177 211 H189 M189 211 Q192 202 195 211 T201 211 Q204 202 207 211 T213 211 H224"
              stroke="#ffffff" strokeWidth="2.6" fill="none" />
            <text x="200" y="232" textAnchor="middle" fill="white" fontSize="22" fontWeight="700">ECG</text>
          </svg>

          <span className="corner-dot dot-a" />
          <span className="corner-dot dot-b" />
          <span className="corner-dot dot-c" />
          <span className="corner-dot dot-d" />
          <span className="miner-foot foot-left" />
          <span className="miner-foot foot-right" />
        </section>

        <section className="countdown-zone">
          <CountdownHourglass
            remaining={remaining}
            topSandHeight={topSandHeight}
            bottomSandHeight={bottomSandHeight}
          />

          <p className="mining-caption">
            {remaining === 0 ? "Mining completed!" : "Mining in progress..."}
          </p>

          <div className="digital-countdown" aria-label={formatTime(remaining)}>
            <div className="time-part">
              <strong>{hours}</strong>
              <span>HOURS</span>
            </div>
            <b className="colon">:</b>
            <div className="time-part">
              <strong>{minutes}</strong>
              <span>MINUTES</span>
            </div>
            <b className="colon">:</b>
            <div className="time-part">
              <strong>{seconds}</strong>
              <span>SECONDS</span>
            </div>
          </div>
        </section>

        <section className="reward-card glass-card">
          <div className="reward-heading">
            <span>Estimated Reward</span>
            <strong>1.0000 ECG</strong>
          </div>

          <div className="progress-track" aria-label={`Mining progress ${progress}%`}>
            <div className="progress-fill" style={{ width: `${progress}%` }}>
              <span>{progress}%</span>
            </div>
          </div>

          <div className="reward-stats">
            <div className="stat-item">
              <span className="stat-icon">▣</span>
              <span>Total Days Mined: <strong>{rewardCount}</strong></span>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <span className="stat-icon">♟</span>
              <span>Referral Bonus: <strong>{Number(referralBonus).toFixed(4)} ECG</strong></span>
            </div>
          </div>
        </section>

        <section className="status-card glass-card">
          <div className="coin-icon">
            <span />
            <span />
            <span />
          </div>
          <div>
            <h2>{remaining === 0 ? "Your reward is ready!" : "Mining will complete soon!"}</h2>
            <p>{remaining === 0 ? "Claim your daily reward now." : "Stay online to claim your reward."}</p>
          </div>
        </section>

        {canClaim && walletAddress && (
          <button className="claim-btn" onClick={claimReward}>
            Claim 1 ECG
          </button>
        )}

        {message && <p className="server-message">{message}</p>}

        <div className="balance-strip">
          <span>Balance <strong>{Number(balance).toFixed(4)} ECG</strong></span>
          <span>Total Rewards <strong>{Number(totalRewards).toFixed(4)} ECG</strong></span>
        </div>
      </main>

      <nav className="bottom-nav" aria-label="Main navigation">
        <button className="nav-item active">
          <span className="nav-icon">⚒</span>
          <span>Mine</span>
        </button>
        <button className="nav-item">
          <span className="nav-icon">◉</span>
          <span>Stake</span>
        </button>
        <button className="nav-item">
          <span className="nav-icon">🤝</span>
          <span>Friends</span>
        </button>
        <button className="nav-item">
          <span className="nav-icon">♙</span>
          <span>About Us</span>
        </button>
        <button className="nav-item">
          <span className="nav-icon">▢</span>
          <span>Wallets</span>
        </button>
      </nav>
    </div>
  );
}
