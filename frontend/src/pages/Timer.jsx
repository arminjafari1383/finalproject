import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTonWallet } from "@tonconnect/ui-react";
import axios from "axios";
import "./Timer.css";
import Logo from "../assets/2.png";
import Blade from "../assets/1.png";

const API = "https://cryptoocapitalhub.com/api/wallet";

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
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
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
    if (!walletAddress) return;

    const url = `${API}/reward_status/`;
    console.log("[Timer] fetchStatus =>", url, "wallet_address=", walletAddress);

    try {
      const res = await axios.get(url, {
        params: { wallet_address: walletAddress },
      });

      console.log("[Timer] reward_status HTTP:", res.status);
      console.log("[Timer] reward_status data:", res.data);

      const data = res.data;

      // ✅ اینجا دقیق می‌فهمی status چی هست
      if (data?.status === "ok") {
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
      } else {
        // ✅ لاگ دقیق علت Invalid response
        console.warn("[Timer] Invalid server response. Expected {status:'ok'} but got:", data);
        setMessage("❌ Invalid server response.");
      }
    } catch (e) {
      console.error("[Timer] fetchStatus ERROR:", e);
      console.error("[Timer] fetchStatus status:", e.response?.status);
      console.error("[Timer] fetchStatus data:", e.response?.data);
      setMessage("❌ Cannot load timer status from server.");
    }
  }, [walletAddress]);

  const canClaim = remaining === 0;

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
        wallet_address: walletAddress,
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
      } else {
        console.warn("[Timer] tick unexpected response:", data);
        setMessage("⚠️ " + (data.message || "Could not claim."));
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

<svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" className="lk">
        {/* ... (کد SVG شما از فایل اصلی) ... */}
         <defs>
          <linearGradient id="frontEdgeGrad" x1="0" y1="100" x2="0" y2="320" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#00e1ff" /><stop offset="100%" stopColor="#001833" />
          </linearGradient>
          <filter id="frontEdgeShadow" x="-5%" y="-5%" width="110%" height="110%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur" /> <feOffset dx="0" dy="1" result="offsetBlur" /> <feFlood floodColor="#001833" floodOpacity="0.5" /> <feComposite in2="offsetBlur" operator="in" result="shadow" />
            <feMerge> <feMergeNode in="shadow" /> <feMergeNode in="SourceGraphic" /> </feMerge>
          </filter>
          <clipPath id="boxClip"><rect x="60" y="100" width="280" height="220" rx="10" ry="10" /></clipPath>
          <filter id="centerBloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceGraphic" stdDeviation="22" /></filter>
          <mask id="mask-blades"><rect width="100%" height="100%" fill="white" /> <circle cx="200" cy="210" r="40" fill="black" /></mask>
        </defs>
        <path d="M80 80 L320 80 L340 100 L60 100 Z" fill="none" stroke="#00e1ff" strokeWidth="4" />
        <rect x="60" y="100" width="280" height="220" rx="10" ry="10" fill="none" stroke="url(#frontEdgeGrad)" strokeWidth="4" filter="url(#frontEdgeShadow)" />
        <circle cx="80" cy="120" r="5" fill="#00e1ff" /><circle cx="320" cy="120" r="5" fill="#00e1ff" /><circle cx="80" cy="300" r="5" fill="#00e1ff" /><circle cx="320" cy="300" r="5" fill="#00e1ff" />
        <rect x="130" y="320" width="40" height="10" rx="2" fill="none" stroke="#00e1ff" strokeWidth="3" /><rect x="230" y="320" width="40" height="10" rx="2" fill="none" stroke="#00e1ff" strokeWidth="3" />
        <g clipPath="url(#boxClip)">
          <g filter="url(#centerBloom)"><circle cx="200" cy="210" r="46" fill="#00e1ff" opacity="0.25" /></g>
          <g filter="url(#centerBloom)"><circle cx="200" cy="210" r="90" fill="#00e1ff" opacity="0.08" /></g>
        </g>
        <image className="fan-blades" href={Blade} x="100" y="110" width="200" height="200" mask="url(#mask-blades)" />
        <circle cx="200" cy="210" r="40" fill="#1a1448" stroke="#00e1ff" strokeWidth="3" />
        <text x="200" y="205" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold">MINER</text>
        <path d="M180 215 H190 M190 215 Q192 208 194 215 T198 215 Q200 208 202 215 T206 215 Q208 208 210 215 H220" stroke="#ffffff" strokeWidth="2" fill="none" />
        <text x="200" y="230" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold">ECG</text>
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