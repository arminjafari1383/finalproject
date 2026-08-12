import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTonWallet } from "@tonconnect/ui-react";
import axios from "axios";
import "./Timer.css";
import Logo from "../assets/2.png";

// ✅ استفاده از آدرس نسبی برای جلوگیری از مشکل CORS و Nginx
const API = "/api/wallet";

export default function TimerPage() {
  const tonWallet = useTonWallet();
  const walletAddress = tonWallet?.account?.address || null;

  const [remaining, setRemaining] = useState(null);
  const [balance, setBalance] = useState("0");
  const [totalRewards, setTotalRewards] = useState("0");
  const [referralBonus, setReferralBonus] = useState("0");
  const [rewardCount, setRewardCount] = useState(0);

  const [message, setMessage] = useState("");
  const intervalRef = useRef(null);

  const formatTime = (sec) => {
    if (sec === null || sec === undefined) return "--:--:--";
    const h = String(Math.floor(sec / 3600)).padStart(2, "0");
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

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

  return (
    <div className="boost-page">
      <div className="header">
        <h1>AI POLIFY</h1>
        <img src={Logo} alt="AI POLIFY Logo" />
      </div>

      <svg
        viewBox="0 0 400 400"
        xmlns="http://www.w3.org/2000/svg"
        className={`hourglass ${remaining > 0 ? "hourglass-running" : "hourglass-ready"}`}
        role="img"
        aria-label="Daily reward countdown hourglass"
      >
        <defs>
          <linearGradient id="hourglassFrame" x1="100" y1="70" x2="300" y2="330" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#dff7ff" />
            <stop offset="48%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
          <linearGradient id="sandGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fef3c7" />
            <stop offset="55%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
          <filter id="hourglassGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="10" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <clipPath id="topChamber">
            <path d="M125 105 H275 L220 195 H180 Z" />
          </clipPath>
          <clipPath id="bottomChamber">
            <path d="M180 205 H220 L275 295 H125 Z" />
          </clipPath>
        </defs>

        <ellipse cx="200" cy="205" rx="122" ry="142" fill="#38bdf8" opacity="0.08" filter="url(#hourglassGlow)" />

        <path d="M120 100 H280 M120 300 H280" stroke="url(#hourglassFrame)" strokeWidth="18" strokeLinecap="round" />
        <path d="M130 112 C135 155 175 178 190 200 C175 222 135 245 130 288" fill="none" stroke="url(#hourglassFrame)" strokeWidth="9" strokeLinecap="round" />
        <path d="M270 112 C265 155 225 178 210 200 C225 222 265 245 270 288" fill="none" stroke="url(#hourglassFrame)" strokeWidth="9" strokeLinecap="round" />

        <path d="M125 105 H275 L220 195 H180 Z" fill="rgba(186,230,253,0.08)" stroke="rgba(186,230,253,0.3)" strokeWidth="2" />
        <path d="M180 205 H220 L275 295 H125 Z" fill="rgba(186,230,253,0.08)" stroke="rgba(186,230,253,0.3)" strokeWidth="2" />

        <rect
          x="120"
          y={195 - topSandHeight}
          width="160"
          height={topSandHeight}
          fill="url(#sandGradient)"
          clipPath="url(#topChamber)"
        />
        <rect
          x="120"
          y={295 - bottomSandHeight}
          width="160"
          height={bottomSandHeight}
          fill="url(#sandGradient)"
          clipPath="url(#bottomChamber)"
        />

        {remaining > 0 && (
          <path className="sand-stream" d="M200 192 V270" stroke="#facc15" strokeWidth="5" strokeLinecap="round" />
        )}

        <circle cx="200" cy="200" r="6" fill="#fef3c7" />
        <text x="200" y="350" textAnchor="middle" fill="#bae6fd" fontSize="18" fontWeight="700">
          DAILY REWARD
        </text>
      </svg>

      {!walletAddress ? (
        <p style={{ color: "red", textAlign: "center", fontSize: "1.2rem" }}>
          ⚠️ Please connect your TON wallet first.
        </p>
      ) : (
        <>
          <div className="b1">
            <h2 className="timer">{formatTime(remaining)}</h2>
          </div>

          <button
            className="claim-btn"
            onClick={claimReward}
            disabled={!canClaim}
            style={{ opacity: canClaim ? 1 : 0.5 }}
          >
            {canClaim ? "Claim 1 ECG" : "Mining..."}
          </button>

          <div className="info">
            🕐 Total Days Mined: <span className="highlight">{rewardCount}</span>
            {" | "} Referral Bonus: <span className="highlight">{Number(referralBonus).toFixed(4)} ECG</span>
          </div>

          <div className="info">
            Balance: <span className="highlight">{Number(balance).toFixed(4)} ECG</span>
            {" | "} Total Rewards: <span className="highlight">{Number(totalRewards).toFixed(4)} ECG</span>
          </div>

          {message && (
            <p style={{ textAlign: "center", marginTop: 8, color: "#a0c4ff" }}>
              {message}
            </p>
          )}
        </>
      )}
    </div>
  );
}
