import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import axios from "axios";

import "./Timer.css";

import Logo from "../assets/2.png";
import Blade from "../assets/1.png";
import eplLogo from "../assets/epl-logo.png";

const API = "/api/wallet";
const BOT_USERNAME = "Aipolynetbot";
const USER_DATA_KEY = "my_app_user_data";
const OWN_REFERRAL_CODE_KEY = "my_referral_code";
const USED_REFERRAL_KEY = "used_referral_code";

// =========================================================
// COUNTER FOR DEBUGGING
// =========================================================
let renderCounter = 0;

/* =========================================================
   TELEGRAM IDENTITY
========================================================= */

function readTelegramIdentity() {
  try {
    const tgUser =
      window.Telegram?.WebApp?.initDataUnsafe?.user || null;

    const raw = localStorage.getItem(USER_DATA_KEY);
    const stored = raw ? JSON.parse(raw) : {};

    const telegramId = Number(
      tgUser?.id ??
      stored?.telegramId ??
      localStorage.getItem("telegram_id") ??
      0
    );

    if (!Number.isFinite(telegramId) || telegramId <= 0) {
      return null;
    }

    const identity = {
      telegram_id: telegramId,
      telegram_username:
        tgUser?.username || stored?.telegramUsername || null,
      telegram_photo_url:
        tgUser?.photo_url || stored?.telegramPhotoUrl || null,
      telegram_first_name:
        tgUser?.first_name || stored?.telegramFirstName || null,
      telegram_last_name:
        tgUser?.last_name || stored?.telegramLastName || null,
      is_telegram: Boolean(tgUser?.id || stored?.isTelegram),
    };

    localStorage.setItem("telegram_id", String(telegramId));
    localStorage.setItem(
      USER_DATA_KEY,
      JSON.stringify({
        ...stored,
        telegramId,
        telegramUsername: identity.telegram_username,
        telegramPhotoUrl: identity.telegram_photo_url,
        telegramFirstName: identity.telegram_first_name,
        telegramLastName: identity.telegram_last_name,
        isTelegram: identity.is_telegram,
      })
    );

    return identity;
  } catch (error) {
    console.error("[Timer] Could not read Telegram identity:", error);
    return null;
  }
}

/* =========================================================
   HOURGLASS COMPONENT (خلاصه شده برای اختصار)
========================================================= */
function CountdownHourglass({ remaining, topSandHeight, bottomSandHeight }) {
  // ... (کد ساعت شنی مانند قبل)
  return (
    <svg viewBox="0 0 240 285" xmlns="http://www.w3.org/2000/svg">
      {/* ... */}
    </svg>
  );
}

/* =========================================================
   TIMER PAGE - نسخه نهایی بدون حلقه بی‌نهایت
========================================================= */

export default function TimerPage() {
  // =========================================================
  // COUNTER
  // =========================================================
  renderCounter += 1;
  const renderId = renderCounter;
  
  // فقط در 10 رندر اول لاگ بزن
  if (renderId <= 10) {
    console.log(`🔄 [RENDER #${renderId}] TimerPage rendering`);
  }

  // =========================================================
  // STATE - با مقداردهی اولیه
  // =========================================================
  const [telegramIdentity, setTelegramIdentity] = useState(null);
  const [remaining, setRemaining] = useState(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(60 * 60);
  const [totalRewards, setTotalRewards] = useState("0");
  const [referralBonus, setReferralBonus] = useState("0");
  const [rewardCount, setRewardCount] = useState(0);
  const [eplWallet, setEplWallet] = useState(null);
  const [eplLoading, setEplLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  // =========================================================
  // REFs - برای کنترل اجرا
  // =========================================================
  const intervalRef = useRef(null);
  const menuRef = useRef(null);
  
  // ✅ REFهای قوی برای جلوگیری از حلقه
  const initializedRef = useRef(false);
  const dataLoadedRef = useRef(false);
  const isLoadingRef = useRef(false);
  
  // ✅ REF برای ذخیره مقدار remaining (برای تایمر)
  const remainingRef = useRef(null);

  // =========================================================
  // CONSTANTS
  // =========================================================
  const telegramId = telegramIdentity?.telegram_id || null;
  const telegramUsername = telegramIdentity?.telegram_username || null;
  const telegramPhotoUrl = telegramIdentity?.telegram_photo_url || null;

  const telegramDisplayName =
    [
      telegramIdentity?.telegram_first_name,
      telegramIdentity?.telegram_last_name,
    ]
      .filter(Boolean)
      .join(" ") ||
    (telegramUsername ? `@${telegramUsername}` : "Telegram User");

  // =========================================================
  // ✅ TIMER FUNCTIONS - با useRef برای جلوگیری از بازسازی
  // =========================================================
  
  // تابع استاپ تایمر - با useRef ثابت
  const stopTimerRef = useRef(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  });

  // تابع استارت تایمر - با useRef ثابت
  const startTimerRef = useRef(() => {
    if (intervalRef.current) {
      return; // تایمر در حال اجراست
    }
    
    intervalRef.current = setInterval(() => {
      setRemaining((sec) => {
        if (sec === null || sec === undefined || sec <= 0) {
          return 0;
        }
        const newSec = sec - 1;
        remainingRef.current = newSec;
        return newSec;
      });
    }, 1000);
  });

  // =========================================================
  // ✅ EFFECT برای مدیریت تایمر - فقط یک بار
  // =========================================================
  useEffect(() => {
    // تابع پاک‌سازی
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []); // ✅ وابستگی خالی - فقط یک بار اجرا می‌شود

  // =========================================================
  // ✅ EFFECT برای شروع تایمر وقتی remaining تغییر می‌کند
  // =========================================================
  useEffect(() => {
    if (remaining !== null && remaining > 0) {
      startTimerRef.current();
    } else if (remaining === 0) {
      stopTimerRef.current();
    }
  }, [remaining]); // ✅ فقط به remaining وابسته است

  // =========================================================
  // 🔍 پردازش پارامترهای URL (رفرال)
  // =========================================================
  const processReferralParam = useCallback(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const startParam = urlParams.get('startapp');
      
      if (!startParam) return null;
      
      const match = startParam.match(/ref_([a-zA-Z0-9]+)/);
      if (match && match[1]) {
        const referralCode = match[1];
        const usedReferral = localStorage.getItem(USED_REFERRAL_KEY);
        
        if (usedReferral === referralCode) {
          return null;
        }
        
        localStorage.setItem('referral_code', referralCode);
        localStorage.setItem('pending_referral', referralCode);
        return referralCode;
      }
    } catch (error) {
      console.error("[Timer] Error processing referral param:", error);
    }
    return null;
  }, []);

  // =========================================================
  // 📡 بارگذاری داده‌های کاربر - با کنترل اجرا
  // =========================================================
  const loadUserData = useCallback(async (telegramId, referralCode = null) => {
    // ✅ جلوگیری از اجرای همزمان
    if (isLoadingRef.current) {
      return;
    }
    
    // ✅ جلوگیری از بارگذاری مجدد
    if (dataLoadedRef.current) {
      return;
    }

    if (!telegramId) {
      return;
    }

    // ✅ علامت‌گذاری شروع بارگذاری
    isLoadingRef.current = true;

    try {
      let statusUrl = `${API}/reward_status/?telegram_id=${telegramId}`;
      
      if (referralCode) {
        statusUrl += `&inviter_code=${encodeURIComponent(referralCode)}`;
      }

      const headers = {
        'X-Telegram-Id': String(telegramId),
        'X-Telegram': 'true',
      };
      
      if (telegramUsername) {
        headers['X-Telegram-Username'] = telegramUsername;
      }
      
      if (telegramPhotoUrl) {
        headers['X-Telegram-Photo-Url'] = telegramPhotoUrl;
      }

      const statusResponse = await axios.get(statusUrl, { headers });
      const data = statusResponse.data;
      
      if (data && data.status !== "error") {
        if (referralCode && data.referral_applied) {
          localStorage.setItem(USED_REFERRAL_KEY, referralCode);
        }
        
        setTotalRewards(data.total_rewards ?? "0");
        setReferralBonus(data.referral_bonus ?? "0");
        setRewardCount(data.rewards_count ?? 0);
        
        const serverCooldown = data.cooldown_seconds ?? 60 * 60;
        setCooldownSeconds(serverCooldown);
        
        const secondsRemaining = data.seconds_remaining ?? 0;
        remainingRef.current = secondsRemaining;
        setRemaining(secondsRemaining);
        
        setEplWallet({
          epl_balance: data.epl_balance || "0",
          hourly_reward_balance: data.hourly_reward_balance || data.total_rewards || "0",
          referral_bonus: data.referral_bonus || "0",
          hourly_claims: data.hourly_claims || data.rewards_count || 0,
          referral_code: data.referral_code || null,
        });
        
        if (data.referral_code) {
          localStorage.setItem(OWN_REFERRAL_CODE_KEY, data.referral_code);
        }
        
        if (referralCode) {
          localStorage.removeItem('pending_referral');
          localStorage.removeItem('referral_code');
        }
        
        // ✅ علامت‌گذاری بارگذاری موفق
        dataLoadedRef.current = true;
        setMessage("");
      } else {
        setMessage("ℹ️ No data available");
      }

    } catch (error) {
      console.error("[Timer] ❌ Error loading user data:", error);
      
      if (error?.response?.status === 404) {
        setRemaining(0);
        setMessage("Welcome! Start mining to earn rewards.");
        dataLoadedRef.current = true;
        return;
      }
      
      const errorMessage = error?.response?.data?.error || 
                           error?.response?.data?.message || 
                           error?.response?.data?.detail ||
                           error.message || 
                           "Could not connect to server";
      
      setMessage(`❌ ${errorMessage}`);
      
      // در صورت خطا، اجازه تلاش مجدد بدهیم
      isLoadingRef.current = false;
    } finally {
      // اگر موفق بود، isLoading رو false کن
      if (dataLoadedRef.current) {
        isLoadingRef.current = false;
      }
    }
  }, [telegramUsername, telegramPhotoUrl]);

  // =========================================================
  // ✅ TELEGRAM BOOTSTRAP & INITIAL LOAD - فقط یک بار
  // =========================================================
  useEffect(() => {
    // ✅ جلوگیری از اجرای مجدد
    if (initializedRef.current) {
      return;
    }
    
    initializedRef.current = true;

    try {
      const tg = window.Telegram?.WebApp;
      tg?.ready?.();
      tg?.expand?.();
    } catch (error) {
      // ignore
    }

    // خواندن هویت تلگرام
    const identity = readTelegramIdentity();
    
    if (identity) {
      setTelegramIdentity(identity);
    }

    // پردازش رفرال
    const referralCode = processReferralParam();
    
    // بارگذاری داده‌ها
    if (identity?.telegram_id) {
      // استفاده از setTimeout برای اطمینان از اینکه effect کامل شده
      const timerId = setTimeout(() => {
        loadUserData(identity.telegram_id, referralCode);
      }, 50);
      
      return () => clearTimeout(timerId);
    } else {
      // تلاش مجدد بعد از 500ms
      const timeoutId = setTimeout(() => {
        const retryIdentity = readTelegramIdentity();
        
        if (retryIdentity?.telegram_id) {
          setTelegramIdentity(retryIdentity);
          
          const retryReferral = localStorage.getItem('pending_referral');
          const usedReferral = localStorage.getItem(USED_REFERRAL_KEY);
          const finalReferral = (retryReferral && retryReferral !== usedReferral) ? retryReferral : null;
          
          loadUserData(retryIdentity.telegram_id, finalReferral);
        } else {
          setMessage("⚠️ Please open this app from Telegram.");
          dataLoadedRef.current = true;
        }
      }, 500);
      
      return () => clearTimeout(timeoutId);
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ✅ وابستگی خالی - فقط یک بار اجرا می‌شود

  // =========================================================
  // MENU
  // =========================================================
  useEffect(() => {
    const closeMenu = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, []);

  // =========================================================
  // CLAIM REWARD
  // =========================================================
  const claimReward = async () => {
    if (!telegramId) {
      setMessage("⚠️ Telegram identity not available.");
      return;
    }

    const canClaim = remaining === 0 || remaining === null;
    if (!canClaim) {
      setMessage("⚠️ Please wait for the timer to finish.");
      return;
    }

    const url = `${API}/tick/`;

    try {
      setMessage("⏳ Claiming reward...");
      
      const headers = {
        'X-Telegram-Id': String(telegramId),
        'X-Telegram': 'true',
      };
      
      if (telegramUsername) {
        headers['X-Telegram-Username'] = telegramUsername;
      }
      
      if (telegramPhotoUrl) {
        headers['X-Telegram-Photo-Url'] = telegramPhotoUrl;
      }

      const payload = {
        telegram_id: telegramId,
        telegram_username: telegramUsername,
        telegram_photo_url: telegramPhotoUrl,
      };

      const res = await axios.post(url, payload, { headers });
      const data = res.data;

      if (data?.status === "rewarded") {
        setTotalRewards(data.total_rewards ?? "0");
        setReferralBonus(data.referral_points ?? data.referral_bonus ?? referralBonus);
        setRewardCount(data.rewards_count ?? 0);
        setMessage(`🎉 ${data.message || "Reward claimed!"}`);

        // ریست و ریلود
        dataLoadedRef.current = false;
        isLoadingRef.current = false;
        
        setTimeout(() => {
          window.location.reload();
        }, 1000);
        return;
      }

      if (data?.status === "too_early") {
        const serverCooldown = data.cooldown_seconds ?? 60 * 60;
        const sec = Math.min(data.seconds_remaining || 0, serverCooldown);
        setCooldownSeconds(serverCooldown);
        remainingRef.current = sec;
        setRemaining(sec);
        setMessage(`⏳ Please wait ${Math.floor(sec / 60)} minutes ${sec % 60} seconds`);
        return;
      }

      setMessage("⚠️ " + (data?.message || data?.error || "Could not claim."));
    } catch (error) {
      console.error("[Timer] claimReward ERROR:", error);
      setMessage(`❌ ${error?.response?.data?.error || error?.response?.data?.message || "Error claiming reward."}`);
    }
  };

  // =========================================================
  // SAND PROGRESS
  // =========================================================
  const canClaim = remaining === 0 || remaining === null;
  const rewardCycleSeconds = cooldownSeconds || 60 * 60;
  const remainingRatio = remaining === null ? 1 : Math.min(1, Math.max(0, remaining / rewardCycleSeconds));
  const elapsedRatio = 1 - remainingRatio;
  const topSandHeight = 90 * remainingRatio;
  const bottomSandHeight = 90 * elapsedRatio;
  const progress = Math.round(elapsedRatio * 100);

  const hours = remaining == null ? "--" : String(Math.floor(remaining / 3600)).padStart(2, "0");
  const minutes = remaining == null ? "--" : String(Math.floor((remaining % 3600) / 60)).padStart(2, "0");
  const seconds = remaining == null ? "--" : String(Math.floor(remaining % 60)).padStart(2, "0");

  // =========================================================
  // REFERRAL INVITE
  // =========================================================
  const getOwnReferralCode = async () => {
    try {
      const walletCode = String(eplWallet?.referral_code || "").trim();
      if (walletCode) {
        localStorage.setItem(OWN_REFERRAL_CODE_KEY, walletCode);
        return walletCode;
      }

      const cachedCode = String(localStorage.getItem(OWN_REFERRAL_CODE_KEY) || "").trim();
      if (cachedCode) {
        return cachedCode;
      }

      const identity = readTelegramIdentity();
      if (!identity) {
        throw new Error("Telegram identity is not available.");
      }

      const headers = {
        'X-Telegram-Id': String(identity.telegram_id),
        'X-Telegram': 'true',
      };
      
      if (identity.telegram_username) {
        headers['X-Telegram-Username'] = identity.telegram_username;
      }

      const response = await axios.get(`${API}/referral_count/`, { headers });
      const code = String(response?.data?.referral_code || "").trim();
      
      if (!code) {
        throw new Error("Referral code was not returned by the server.");
      }

      localStorage.setItem(OWN_REFERRAL_CODE_KEY, code);
      return code;
    } catch (error) {
      console.error("[Timer] Error getting referral code:", error);
      throw error;
    }
  };

  const shareReferralOnTelegram = async () => {
    if (inviteLoading) return;
    setInviteLoading(true);
    setInviteMessage("");

    try {
      const code = await getOwnReferralCode();
      const referralLink = `https://t.me/${BOT_USERNAME}/app?startapp=ref_${encodeURIComponent(code)}`;
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent("Join AI POLIFY with my referral link")}`;

      const tg = window.Telegram?.WebApp;
      if (typeof tg?.openTelegramLink === "function") {
        tg.openTelegramLink(shareUrl);
      } else {
        window.open(shareUrl, "_blank", "noopener,noreferrer");
      }
      setInviteMessage("Referral link opened in Telegram.");
    } catch (error) {
      console.error("[Timer] Invite referral error:", error);
      setInviteMessage(error?.response?.data?.error || error?.response?.data?.detail || error?.message || "Could not open the referral link.");
    } finally {
      setInviteLoading(false);
    }
  };

  // =========================================================
  // EPL CALCULATIONS
  // =========================================================
  const eplReferralBalance = Number(eplWallet?.referral_bonus ?? referralBonus ?? 0);
  const eplHourlyBalance = Number(eplWallet?.hourly_reward_balance ?? totalRewards ?? 0);
  const eplHourlyClaims = Number(eplWallet?.hourly_claims ?? rewardCount ?? 0);
  const eplBalance = Number(eplWallet?.epl_balance ?? eplHourlyBalance + eplReferralBalance);

  // =========================================================
  // UI - بدون تغییر
  // =========================================================
  return (
    <div className="boost-page">
      {/* نمایش شمارنده رندر برای دیباگ - فقط در حالت دیباگ */}
      {process.env.NODE_ENV === 'development' && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: 0,
          background: renderCounter > 10 ? 'rgba(255,0,0,0.8)' : 'rgba(0,0,0,0.7)',
          color: 'white',
          padding: '4px 10px',
          fontSize: '12px',
          zIndex: 9999,
          borderRadius: '0 0 0 8px',
          fontFamily: 'monospace'
        }}>
          Renders: {renderCounter}
          {renderCounter > 10 && ' 🔴'}
        </div>
      )}

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
              <span />
              <span />
              <span />
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
                    <div className="drawer-brand">
                      <strong>AI POLIFY</strong>
                      <span>quick menu</span>
                    </div>
                    <button type="button" className="drawer-icon-btn" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
                      <span className="drawer-icon">×</span>
                    </button>
                  </div>
                  <div className="drawer-buttons">
                    <button type="button" className="drawer-main-btn drawer-main-btn-disabled" disabled>
                      <span className="drawer-btn-text">🛍️ Shopping</span>
                      <span className="drawer-coming-soon">Coming Soon</span>
                    </button>
                    <a
                      className="drawer-main-btn drawer-support-btn"
                      href="https://t.me/Ai_polyfi_support"
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setMenuOpen(false)}
                    >
                      <span className="drawer-btn-text">🎧 Support</span>
                      <span className="drawer-telegram">@Ai_polyfi_support</span>
                    </a>
                  </div>
                </aside>
              </>
            )}
          </div>
          <h1>AI POLIFY</h1>
          <img src={Logo} alt="AI POLIFY Logo" className="brand-logo" />
        </header>

        <section className="glass-card" style={{ marginTop: 14, padding: 14, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.12em", color: "#00d9ff", marginBottom: 5 }}>TELEGRAM ACCOUNT</div>
            <div style={{ fontSize: 15, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{telegramDisplayName}</div>
            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>Telegram ID: {telegramId || "Not detected"}</div>
          </div>
          {telegramPhotoUrl ? (
            <img src={telegramPhotoUrl} alt="Telegram profile" style={{ width: 46, height: 46, borderRadius: "50%", objectFit: "cover", border: "1px solid rgba(0,217,255,.55)" }} />
          ) : (
            <div aria-hidden="true" style={{ width: 46, height: 46, flex: "0 0 46px", borderRadius: "50%", display: "grid", placeItems: "center", background: "rgba(0,217,255,.10)", border: "1px solid rgba(0,217,255,.40)", fontSize: 20 }}>✈️</div>
          )}
        </section>

        <section className="miner-card" aria-label="EPL Miner">
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
            <image className="fan-blades" href={Blade} x="72" y="82" width="256" height="256" mask="url(#mask-blades)" />
            <circle cx="200" cy="210" r="62" fill="#06142d" stroke="#0ab9ff" strokeWidth="3" />
            <circle cx="200" cy="210" r="55" fill="none" stroke="rgba(72,207,255,.18)" strokeWidth="2" />
            <text x="200" y="198" textAnchor="middle" fill="white" fontSize="18" fontWeight="800">MINER</text>
            <path d="M177 211 H189 M189 211 Q192 202 195 211 T201 211 Q204 202 207 211 T213 211 H224" stroke="#ffffff" strokeWidth="2.6" fill="none" />
            <text x="200" y="232" textAnchor="middle" fill="white" fontSize="22" fontWeight="700">EPL</text>
          </svg>
          <span className="corner-dot dot-a" />
          <span className="corner-dot dot-b" />
          <span className="corner-dot dot-c" />
          <span className="corner-dot dot-d" />
          <span className="miner-foot foot-left" />
          <span className="miner-foot foot-right" />
        </section>

        <section className="countdown-zone">
          <CountdownHourglass remaining={remaining} topSandHeight={topSandHeight} bottomSandHeight={bottomSandHeight} />
          <p className="mining-caption">{remaining === 0 ? "Mining completed!" : "Mining in progress..."}</p>
          <div className="digital-countdown" aria-label={`${hours}:${minutes}:${seconds}`}>
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
            <span>Estimated Hourly Reward</span>
            <strong>100.0000 EPL</strong>
          </div>
          <div className="progress-track" aria-label={`Mining progress ${progress}%`}>
            <div className="progress-fill" style={{ width: `${progress}%` }}>
              <span>{progress}%</span>
            </div>
          </div>
          <div className="reward-stats">
            <div className="stat-item">
              <span className="stat-icon">▣</span>
              <span>Hourly Claims: <strong>{rewardCount}</strong></span>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <span className="stat-icon">♟</span>
              <span>Referral Bonus: <strong>{Number(referralBonus).toFixed(4)} EPL</strong></span>
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
            <p>{remaining === 0 ? "Claim your hourly reward now." : "Stay online to claim your reward."}</p>
          </div>
        </section>

        {telegramId && (
          <button
            className={`claim-btn ${!canClaim ? "claim-loading" : ""}`}
            onClick={canClaim ? claimReward : undefined}
            disabled={!canClaim}
          >
            {canClaim ? "Claim 100 EPL" : "Mining..."}
          </button>
        )}

        <section className="glass-card" style={{ marginTop: 18, padding: 16, borderRadius: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 14, color: "#00d9ff", letterSpacing: "0.08em" }}>👥 REFERRAL MINING</div>
          {[
            ["Username", "1000 EPL"],
            ["Username", "500 EPL"],
            ["Username", "500 EPL"],
            ["Username", "500 EPL"],
            ["Username", "500 EPL"],
          ].map(([name, reward], index) => (
            <div key={index} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 8px", borderBottom: index !== 4 ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 24, height: 24, borderRadius: "50%", border: "1px solid rgba(0,217,255,.5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#00d9ff" }}>{index + 1}</span>
                <span style={{ fontSize: 13, opacity: 0.8 }}>🏆 Level {index + 1}</span>
              </div>
              <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#00d9ff", fontWeight: 900 }}>
                +{reward.replace(" EPL", "")}
                <img src={eplLogo} alt="EPL" style={{ width: "18px", height: "18px", objectFit: "contain" }} />
              </span>
            </div>
          ))}
          <button
            type="button"
            onClick={shareReferralOnTelegram}
            disabled={inviteLoading}
            style={{ width: "100%", marginTop: 14, minHeight: 48, border: "1px solid rgba(0,217,255,.55)", borderRadius: 14, background: "linear-gradient(135deg, rgba(0,217,255,.22), rgba(30,104,255,.22))", color: "#ffffff", fontSize: 14, fontWeight: 900, letterSpacing: "0.03em", cursor: inviteLoading ? "wait" : "pointer", opacity: inviteLoading ? 0.7 : 1, boxShadow: "0 10px 30px rgba(0,145,255,.15)" }}
          >
            {inviteLoading ? "Opening Telegram..." : "Invite Me"}
          </button>
          {inviteMessage && (
            <div style={{ marginTop: 9, textAlign: "center", fontSize: 12, color: inviteMessage.startsWith("Referral link") ? "#66f5c7" : "#ff9a9a" }}>
              {inviteMessage}
            </div>
          )}
        </section>

        {telegramId && (
          <section className="glass-card" style={{ marginTop: 18, padding: 18, borderRadius: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.68, letterSpacing: "0.12em", fontWeight: 800 }}>EPL ACCOUNT</div>
                <div style={{ marginTop: 5, fontSize: 26, fontWeight: 900 }}>{eplBalance.toFixed(4)} EPL</div>
              </div>
              <span style={{ padding: "7px 10px", borderRadius: 999, fontSize: 11, fontWeight: 800, background: "rgba(35, 211, 238, 0.12)", border: "1px solid rgba(35, 211, 238, 0.28)" }}>
                {eplLoading ? "Updating..." : "EPL"}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: 10 }}>
              {[
                ["Hourly Reward Balance", `${eplHourlyBalance.toFixed(4)} EPL`],
                ["Referral Bonus Balance", `${eplReferralBalance.toFixed(4)} EPL`],
                ["Hourly Claims", String(eplHourlyClaims)],
              ].map(([label, value]) => (
                <div key={label} style={{ padding: 12, borderRadius: 14, background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ fontSize: 11, opacity: 0.62, marginBottom: 7 }}>{label}</div>
                  <strong style={{ fontSize: 14, lineHeight: 1.35 }}>{value}</strong>
                </div>
              ))}
            </div>
            <button type="button" disabled style={{ width: "100%", marginTop: 15, padding: "13px 14px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "inherit", cursor: "not-allowed", opacity: 0.72 }}>
              <span style={{ display: "block", fontWeight: 900, fontSize: 14 }}>Withdraw EPL</span>
              <span style={{ display: "block", marginTop: 3, fontSize: 11, opacity: 0.7 }}>Coming soon to withdraw</span>
            </button>
          </section>
        )}

        {message && <p className="server-message">{message}</p>}
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

        <section className="glass-card referral-ranking">
          <div className="referral-title">Referral Ranking</div>
          {[
            { rank: "Level 1", username: "", reward: "1000" },
            { rank: "Level 2", username: "", reward: "500" },
            { rank: "Level 3", username: "", reward: "300" },
            { rank: "Level 4", username: "", reward: "200" },
            { rank: "Level 5", username: "", reward: "100" },
          ].map((user) => (
            <div className="referral-item" key={user.rank}>
              <div className="rank-number">{user.rank}</div>
              <div className="person-icon">🏆</div>
              <div className="username">{user.username}</div>
              <div className="arrow">→</div>
              <div className="epl-value">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <img src="/epl-logo.png" alt="EPL" style={{ width: 18, height: 18, borderRadius: "50%" }} />
                  {user.reward}
                </span>
              </div>
            </div>
          ))}
        </section>
      </nav>
    </div>
  );
}