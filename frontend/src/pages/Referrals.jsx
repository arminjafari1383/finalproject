// frontend/src/components/Referrals.jsx

import {
  useEffect,
  useRef,
  useState,
} from "react";

import { api } from "../api";

import "./Referrals.css";

import {
  captureInviterCode,
  getInviterCode,
  setInviterCode,
  clearInviterCode,
  generateReferralLink,
} from "../utils/referral";

// ======================================================
// CONFIG
// ======================================================

const USER_DATA_KEY = "my_app_user_data";
const INVITER_CODE_KEY = "inviter_code";
const BOT_USERNAME = "Aipolynetbot"; // نام کاربری بات تلگرام

// ======================================================
// STORAGE
// ======================================================

function loadUserData() {
  try {
    const raw = localStorage.getItem(USER_DATA_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.error("❌ Failed to load user data:", error);
    return null;
  }
}

function saveUserData(data) {
  try {
    const current = loadUserData() || {};
    const merged = { ...current, ...data };
    localStorage.setItem(USER_DATA_KEY, JSON.stringify(merged));
    return merged;
  } catch (error) {
    console.error("❌ Failed to save user data:", error);
    return null;
  }
}

// ======================================================
// LOCAL REFERRAL HELPERS
// ======================================================

/**
 * دریافت کد ارجاع از localStorage
 */
function getLocalInviterCode() {
  try {
    return localStorage.getItem(INVITER_CODE_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * ذخیره کد ارجاع در localStorage
 */
function setLocalInviterCode(code) {
  try {
    if (code) {
      localStorage.setItem(INVITER_CODE_KEY, code);
    } else {
      localStorage.removeItem(INVITER_CODE_KEY);
    }
  } catch (error) {
    console.error("❌ Failed to save inviter code:", error);
  }
}

/**
 * خواندن کد ارجاع از URL (پارامتر ref)
 */
function getReferralCodeFromURL() {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref") || params.get("referral_code");
    if (ref) {
      return String(ref).trim() || null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * تابع اصلی برای دریافت کد ارجاع
 * اولویت: URL > localStorage > دستی
 */
function getInviterCodeLocal() {
  // 1. چک کردن URL
  const urlCode = getReferralCodeFromURL();
  if (urlCode) {
    setLocalInviterCode(urlCode);
    return urlCode;
  }

  // 2. چک کردن localStorage
  const storedCode = getLocalInviterCode();
  if (storedCode) {
    return storedCode;
  }

  // 3. چک کردن از طریق captureInviterCode (اگر از قبل وجود داشته باشد)
  try {
    const captured = captureInviterCode();
    if (captured) {
      setLocalInviterCode(captured);
      return captured;
    }
  } catch {
    // ignore
  }

  return null;
}

// ======================================================
// TELEGRAM HELPERS
// ======================================================

function getTelegramWebApp() {
  try {
    if (typeof window === "undefined") return null;
    return window.Telegram?.WebApp || null;
  } catch {
    return null;
  }
}

/**
 * باز کردن لینک در تلگرام
 */
function openTelegramLink(url) {
  const tg = getTelegramWebApp();
  if (tg && typeof tg.openTelegramLink === "function") {
    try {
      tg.openTelegramLink(url);
      return true;
    } catch {
      // fallback
    }
  }
  return false;
}

// ======================================================
// AVATAR
// ======================================================

function getTelegramAvatar(telegramId, username) {
  const cleanUsername = String(username || "")
    .trim()
    .replace(/^@/, "");

  if (
    cleanUsername &&
    cleanUsername !== "browser" &&
    !cleanUsername.startsWith("browser_")
  ) {
    return (
      `https://t.me/i/userpic/320/` +
      `${encodeURIComponent(cleanUsername)}.jpg`
    );
  }

  return (
    "https://ui-avatars.com/api/" +
    "?name=%F0%9F%91%A4" +
    "&background=273043" +
    "&color=ffffff" +
    "&size=64" +
    "&rounded=true"
  );
}

// ======================================================
// COMPONENT
// ======================================================

export default function Referrals() {
  // ====================================================
  // STATE
  // ====================================================

  const [myCode, setMyCode] = useState(null);
  const [refCount, setRefCount] = useState(null);
  const [levels, setLevels] = useState(null);
  const [totalReferrals, setTotalReferrals] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [telegramId, setTelegramId] = useState(null);
  const [telegramUsername, setTelegramUsername] = useState(null);
  const [telegramPhotoUrl, setTelegramPhotoUrl] = useState(null);
  const [inviterCode, setInviterCode] = useState(null);
  const [referralReady, setReferralReady] = useState(false);
  const [manualInviterCode, setManualInviterCode] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [isTelegramWebApp, setIsTelegramWebApp] = useState(false);

  const registerKeyRef = useRef(null);
  const [debugLogs, setDebugLogs] = useState([]);

  function addLog(message, data = null) {
    const item = {
      time: new Date().toLocaleTimeString(),
      message,
      data,
    };

    setDebugLogs((prev) => [...prev.slice(-40), item]);
    console.log("[REFERRAL DEBUG]", item);
  }

  // ====================================================
  // INITIALIZATION
  // ====================================================

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      addLog("INIT START");

      // بررسی محیط تلگرام
      const tg = getTelegramWebApp();
      if (tg) {
        setIsTelegramWebApp(true);
        addLog("TELEGRAM WEBAPP DETECTED");
      }

      // دریافت Telegram ID از localStorage (اگر موجود باشد)
      const saved = loadUserData() || {};
      const storedId = Number(
        saved.telegramId ||
        localStorage.getItem("telegram_id") ||
        0
      );

      let resolvedTelegramId = null;
      let resolvedUsername = null;
      let resolvedPhotoUrl = null;

      // اگر Telegram ID در localStorage وجود دارد، از آن استفاده کن
      if (Number.isInteger(storedId) && storedId > 0) {
        resolvedTelegramId = storedId;
        resolvedUsername = saved.telegramUsername || null;
        resolvedPhotoUrl = saved.telegramPhotoUrl || null;
        addLog("LOADED FROM STORAGE", { resolvedTelegramId });
      } else {
        // اگر کاربر قبلاً لاگین کرده، از user data استفاده کن
        const storedUser = loadUserData();
        if (storedUser?.telegramId) {
          resolvedTelegramId = Number(storedUser.telegramId);
          resolvedUsername = storedUser.telegramUsername || null;
          resolvedPhotoUrl = storedUser.telegramPhotoUrl || null;
        }
      }

      if (cancelled) return;

      setTelegramId(resolvedTelegramId);
      setTelegramUsername(resolvedUsername);
      setTelegramPhotoUrl(resolvedPhotoUrl);

      // دریافت کد ارجاع از URL یا localStorage
      let code = getInviterCodeLocal();
      addLog("GET INVITER CODE", code);

      // اگر کد در localStorage نبود، از URL بگیر
      if (!code) {
        const urlCode = getReferralCodeFromURL();
        if (urlCode) {
          code = urlCode;
          setLocalInviterCode(code);
          addLog("CODE FROM URL", code);
        }
      }

      if (code) {
        setLocalInviterCode(code);
      }

      setInviterCodeState(code);
      addLog("READY", {
        telegramId: resolvedTelegramId,
        inviterCode: code,
      });
      setReferralReady(true);
    }

    initialize();

    return () => {
      cancelled = true;
    };
  }, []);

  // ====================================================
  // REGISTER / LOAD USER
  // ====================================================

  useEffect(() => {
    let cancelled = false;

    async function registerUser() {
      addLog("REGISTER START", {
        referralReady,
        telegramId,
        inviterCode,
      });

      if (!referralReady) {
        return;
      }

      const finalTelegramId = Number(telegramId || 0);

      if (!Number.isInteger(finalTelegramId) || finalTelegramId <= 0) {
        setMyCode(null);
        setRefCount(null);
        setError(
          "Telegram ID not found. Please login first."
        );
        return;
      }

      let finalInviterCode = inviterCode || getLocalInviterCode();

      // اگر کد وجود نداشت، اجازه ورود دستی بدهیم
      if (!finalInviterCode && showManualInput && manualInviterCode) {
        finalInviterCode = manualInviterCode;
      }

      const currentRegisterKey = [
        finalTelegramId,
        telegramUsername || "",
        telegramPhotoUrl || "",
        finalInviterCode || "",
      ].join("|");

      if (
        registerKeyRef.current === currentRegisterKey &&
        myCode
      ) {
        return;
      }

      registerKeyRef.current = currentRegisterKey;

      const params = {
        telegram_id: finalTelegramId,
        telegram_username: telegramUsername || undefined,
        telegram_photo_url: telegramPhotoUrl || undefined,
        inviter_code: finalInviterCode || undefined,
        is_telegram: true,
      };

      try {
        setLoading(true);
        setError("");

        addLog("CALL COUNT API", params);

        const response = await api.get("/referrals/count/", {
          params,
        });

        if (cancelled) return;

        addLog("COUNT RESPONSE", response.data);

        setRefCount(response.data?.count ?? 0);

        const returnedCode =
          response.data?.referral_code ||
          response.data?.user?.referral_code ||
          null;

        setMyCode(returnedCode);

        // اگر کد ارجاع با موفقیت ثبت شد، آن را از localStorage پاک کن (یک بار مصرف)
        if (returnedCode && finalInviterCode) {
          setLocalInviterCode(null);
        }

        if (response.data?.telegram_id) {
          saveUserData({
            telegramId: Number(response.data.telegram_id),
            telegramUsername:
              response.data?.telegram_username ??
              telegramUsername ??
              null,
            telegramPhotoUrl:
              response.data?.telegram_photo_url ??
              telegramPhotoUrl ??
              null,
            isTelegram: true,
          });
        }
      } catch (err) {
        if (cancelled) return;

        addLog("COUNT ERROR", err?.response?.data || err.message);
        console.error("❌ REFERRAL LOAD ERROR:", err);

        // اگر خطا مربوط به کد ارجاع نامعتبر بود، اجازه ورود مجدد بدهیم
        if (err?.response?.status === 404 || err?.response?.status === 400) {
          setError(
            "Invalid referral code. Please check and try again."
          );
          setShowManualInput(true);
        } else {
          setError(
            err?.response?.data?.error ||
            err?.response?.data?.detail ||
            err?.message ||
            "Failed to load referral account."
          );
        }

        registerKeyRef.current = null;
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    registerUser();

    return () => {
      cancelled = true;
    };
  }, [
    referralReady,
    inviterCode,
    telegramId,
    telegramUsername,
    telegramPhotoUrl,
    manualInviterCode,
    showManualInput,
  ]);

  // ====================================================
  // LEVELS
  // ====================================================

  useEffect(() => {
    const finalTelegramId = Number(telegramId || 0);

    if (
      !referralReady ||
      !myCode ||
      !Number.isInteger(finalTelegramId) ||
      finalTelegramId <= 0
    ) {
      return undefined;
    }

    let cancelled = false;
    let requestRunning = false;

    async function fetchLevels() {
      if (requestRunning) return;
      requestRunning = true;

      try {
        const response = await api.get("/referral/levels/", {
          params: {
            telegram_id: finalTelegramId,
            telegram_username: telegramUsername || undefined,
            telegram_photo_url: telegramPhotoUrl || undefined,
            inviter_code: inviterCode || undefined,
            is_telegram: true,
          },
        });

        if (cancelled) return;

        const data = response.data;

        setLevels(data?.levels || {});
        setTotalReferrals(data?.total_referrals || 0);

        if (!myCode && data?.referral_code) {
          setMyCode(data.referral_code);
        }
      } catch (err) {
        console.error("❌ Referral levels error:", err);

        if (!cancelled) {
          setError(
            err?.response?.data?.error ||
            err?.response?.data?.detail ||
            "Failed to load referral levels."
          );
        }
      } finally {
        requestRunning = false;
      }
    }

    fetchLevels();

    const refreshOnFocus = () => fetchLevels();

    const refreshOnVisible = () => {
      if (document.visibilityState === "visible") {
        fetchLevels();
      }
    };

    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnVisible);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener(
        "visibilitychange",
        refreshOnVisible
      );
    };
  }, [
    referralReady,
    telegramId,
    telegramUsername,
    telegramPhotoUrl,
    inviterCode,
    myCode,
  ]);

  // ====================================================
  // REFERRAL LINK (Telegram Bot)
  // ====================================================

  /**
   * ساخت لینک رفرال برای بات تلگرام
   * فرمت: https://t.me/BOT_USERNAME/app?startapp=ref_CODE
   */
  const referralLink = myCode
    ? `https://t.me/${BOT_USERNAME}/app?startapp=ref_${encodeURIComponent(myCode)}`
    : "";

  /**
   * لینک جایگزین برای وب (بدون تلگرام)
   */
  const webReferralLink = myCode
    ? `${window.location.origin}?ref=${encodeURIComponent(myCode)}`
    : "";

  // ====================================================
  // OPEN REFERRAL LINK
  // ====================================================

  function openReferralLink() {
    if (!referralLink) return;

    // تلاش برای باز کردن در تلگرام
    const opened = openTelegramLink(referralLink);

    // اگر در تلگرام باز نشد، از لینک وب استفاده کن
    if (!opened) {
      window.open(webReferralLink, "_blank", "noopener,noreferrer");
    }
  }

  // ====================================================
  // SHARE
  // ====================================================

  function shareReferral() {
    if (!referralLink) return;

    const message =
      `🎯 Join me on AI PolyNet!\n\n` +
      `🚀 Open the Mini App using my referral link:\n\n` +
      `${referralLink}\n\n` +
      `💎 Don't miss out on the rewards!`;

    // اگر در تلگرام هستیم
    const tg = getTelegramWebApp();
    if (tg && typeof tg.openTelegramLink === "function") {
      const shareUrl =
        `https://t.me/share/url` +
        `?url=${encodeURIComponent(referralLink)}` +
        `&text=${encodeURIComponent(message)}`;
      try {
        tg.openTelegramLink(shareUrl);
        return;
      } catch {
        // fallback
      }
    }

    // استفاده از Web Share API
    if (navigator.share) {
      navigator.share({
        title: 'AI PolyNet Referral',
        text: message,
        url: referralLink,
      }).catch(() => {});
      return;
    }

    // Fallback: کپی در کلیپ‌بورد
    navigator.clipboard.writeText(message).then(() => {
      alert("✅ Referral link copied to clipboard!");
    }).catch(() => {
      window.open(referralLink, "_blank");
    });
  }

  // ====================================================
  // COPY
  // ====================================================

  async function copyReferralLink() {
    if (!referralLink) return;

    // ترجیحاً لینک تلگرام را کپی کن
    const linkToCopy = isTelegramWebApp ? referralLink : webReferralLink;

    try {
      await navigator.clipboard.writeText(linkToCopy);
      alert("✅ Referral link copied!");
    } catch (err) {
      console.error("Copy failed:", err);
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = linkToCopy;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      alert("✅ Referral link copied!");
    }
  }

  // ====================================================
  // HANDLE MANUAL INVITER CODE
  // ====================================================

  function handleApplyInviterCode() {
    if (!manualInviterCode.trim()) {
      setError("Please enter a referral code.");
      return;
    }

    const code = manualInviterCode.trim();
    setLocalInviterCode(code);
    setInviterCodeState(code);
    setShowManualInput(false);
    setError("");
    registerKeyRef.current = null;

    // Refresh the page to apply the new code
    window.location.reload();
  }

  function handleSkipInviterCode() {
    setShowManualInput(false);
    setInviterCodeState(null);
    setError("");
    registerKeyRef.current = null;
  }

  // ====================================================
  // SET INVITER CODE STATE
  // ====================================================

  function setInviterCodeState(code) {
    setInviterCode(code);
    if (code) {
      setLocalInviterCode(code);
    }
  }

  // ====================================================
  // TABLE
  // ====================================================

  function renderLevelTable(level, data) {
    const levelProfitMessage =
      level === 1
        ? "Direct referral: 1000 EPL join bonus + 5% stake profit (ECG)."
        : "Indirect referral: 500 EPL join bonus + 1% stake profit (ECG).";

    if (!data) {
      return (
        <div className="level-table">
          <div className="level-header">
            <h4>⭐ Level {level}</h4>
          </div>
          <p className={`level-profit-note ${level === 1 ? "level-profit-main" : ""}`}>
            {levelProfitMessage}
          </p>
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

        <p className={`level-profit-note ${level === 1 ? "level-profit-main" : ""}`}>
          {levelProfitMessage}
        </p>

        {level === 1 && (
          <div
            style={{
              marginBottom: "10px",
              fontSize: "12px",
              opacity: 0.8,
            }}
          >
            ✅ Direct join bonus is 1000 EPL. Indirect Levels 2–5 receive 500 EPL per new downline. Purchase profit is shown separately in ECG and USDT. Referral rewards are tracked in EPL, ECG and USDT.
          </div>
        )}

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>User</th>
                <th>Investment (TON)</th>
                <th>Referral Bonus (EPL)</th>
                <th>{level === 1 ? "5% Profit (ECG)" : "1% Profit (ECG)"}</th>
                <th>{level === 1 ? "5% Profit (USDT)" : "1% Profit (USDT)"}</th>
              </tr>
            </thead>

            <tbody>
              {displayUsers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="empty-message">
                    No users in this level
                  </td>
                </tr>
              ) : (
                displayUsers.map((user, index) => {
                  const isString = typeof user === "string";
                  const userTelegramId = isString ? null : user?.telegram_id;
                  const userTelegramUsername = isString ? null : user?.telegram_username;
                  const userWallet = isString ? user : user?.wallet || "-";
                  const investment = isString ? 0 : user?.investment || 0;

                  const legacyProfit = isString ? 0 : Number(user?.profit || 0);
                  const legacyProfitAsset = isString
                    ? "ECG"
                    : String(user?.profit_asset || "ECG").toUpperCase();

                  const profitECG = isString
                    ? 0
                    : Number(user?.profit_ecg ?? (legacyProfitAsset === "ECG" ? legacyProfit : 0));

                  const profitUSDT = isString
                    ? 0
                    : Number(user?.profit_usdt ?? (legacyProfitAsset === "USDT" ? legacyProfit : 0));

                  const referralJoinBonus = isString ? 0 : user?.referral_bonus || 0;

                  const cleanUsername = String(userTelegramUsername || "")
                    .trim()
                    .replace(/^@/, "");

                  const userTelegramPhotoUrl = isString
                    ? null
                    : user?.telegram_photo_url || user?.photo_url || null;

                  const avatarUrl =
                    userTelegramPhotoUrl ||
                    getTelegramAvatar(userTelegramId, cleanUsername);

                  const fallbackAvatar = getTelegramAvatar(null, null);

                  return (
                    <tr key={`${index}-${userTelegramId || userWallet}`}>
                      <td>{index + 1}</td>

                      <td className="user-cell">
                        <div className="referral-user-profile">
                          <div className="user-avatar-wrapper">
                            <img
                              src={avatarUrl}
                              alt={cleanUsername ? `@${cleanUsername}` : "Telegram avatar"}
                              className="user-avatar"
                              referrerPolicy="no-referrer"
                              onError={(event) => {
                                event.currentTarget.onerror = null;
                                event.currentTarget.src = fallbackAvatar;
                              }}
                            />
                          </div>
                          <span
                            className="referral-username"
                            title={cleanUsername ? `@${cleanUsername}` : "Telegram user"}
                          >
                            {cleanUsername ? `@${cleanUsername}` : "Telegram user"}
                          </span>
                        </div>
                      </td>

                      <td className="investment-cell">{investment}</td>
                      <td className="profit-cell">+ {Number(referralJoinBonus || 0).toFixed(4)} EPL</td>
                      <td className="profit-cell">+ {Number(profitECG || 0).toFixed(4)} ECG</td>
                      <td className="profit-cell">+ {Number(profitUSDT || 0).toFixed(4)} USDT</td>
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

  // ====================================================
  // TELEGRAM ID REQUIRED
  // ====================================================

  if (referralReady && !telegramId) {
    return (
      <div className="wallet-required">
        📱 Telegram ID not found. Please login first.
      </div>
    );
  }

  // ====================================================
  // RENDER
  // ====================================================

  return (
    <div className="referral-dashboard">
      <h2>🎯 Referral Dashboard</h2>

      {loading && <div className="loading-spinner">Loading...</div>}

      {error && <div className="error-message">❌ {error}</div>}

      {!referralReady && <div className="loading-spinner">📱 Preparing...</div>}

      {/* Manual inviter code input */}
      {showManualInput && (
        <div className="manual-inviter-section">
          <p>Please enter your referral code:</p>
          <div className="manual-input-row">
            <input
              type="text"
              value={manualInviterCode}
              onChange={(e) => setManualInviterCode(e.target.value)}
              placeholder="Enter referral code..."
              className="manual-input"
            />
            <button onClick={handleApplyInviterCode} className="btn-apply">
              Apply
            </button>
            <button onClick={handleSkipInviterCode} className="btn-skip">
              Skip
            </button>
          </div>
        </div>
      )}

      {myCode ? (
        <>
          <div className="referral-link-section">
            <p className="referral-link-label">
              {isTelegramWebApp ? "🔗 Telegram Mini App Invite Link" : "🔗 Your Referral Link"}
            </p>

            <div className="link-actions">
              <input 
                value={isTelegramWebApp ? referralLink : webReferralLink} 
                readOnly 
                className="link-input" 
              />

              <button onClick={copyReferralLink} disabled={!referralLink} className="btn-copy">
                📋 Copy
              </button>

              <button onClick={shareReferral} disabled={!referralLink} className="btn-share-telegram">
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

            {inviterCode && (
              <div className="info-note">
                🎁 Invited by: <b>{inviterCode}</b>
              </div>
            )}
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
          </div>
        </>
      ) : (
        <div className="loading-spinner">Loading referral data...</div>
      )}

      {/* Debug logs */}
      {debugLogs.length > 0 && (
        <div className="debug-logs">
          <details>
            <summary>🔍 Debug Logs ({debugLogs.length})</summary>
            <div className="logs-container">
              {debugLogs.map((log, i) => (
                <div key={i} className="log-item">
                  <span className="log-time">{log.time}</span>
                  <span className="log-message">{log.message}</span>
                  {log.data && (
                    <pre className="log-data">{JSON.stringify(log.data, null, 2)}</pre>
                  )}
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}