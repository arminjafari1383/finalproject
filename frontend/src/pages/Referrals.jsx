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
} from "../utils/referral";

// ======================================================
// CONFIG
// ======================================================

const USER_DATA_KEY = "my_app_user_data";


const BOT_USERNAME = "Aipolynetbot";

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
// TELEGRAM
// ======================================================

function getTelegramWebApp() {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp || null;
}

function getStartAppReferralCode() {
  try {
    const tg = window.Telegram?.WebApp;

    const startParam = tg?.initDataUnsafe?.start_param;

    if (startParam) {
      return String(startParam).startsWith("ref_")
        ? String(startParam).substring(4)
        : String(startParam);
    }

    const params = new URLSearchParams(window.location.search);
    const urlParam = params.get("startapp") || params.get("start_param");

    if (urlParam) {
      return String(urlParam).startsWith("ref_")
        ? String(urlParam).substring(4)
        : String(urlParam);
    }

    return localStorage.getItem("inviter_code") || null;
  } catch (error) {
    console.error("startapp parse error", error);
    return null;
  }
}

// ======================================================
// TELEGRAM USER
// ======================================================

function getTelegramUser(tg) {
  if (!tg) return null;
  const user = tg?.initDataUnsafe?.user;
  if (!user?.id) return null;
  return {
    id: Number(user.id),
    username: user.username || null,
    photoUrl: user.photo_url || null,
    firstName: user.first_name || null,
    lastName: user.last_name || null,
    language: user.language_code || null,
    isPremium: Boolean(user.is_premium),
  };
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
  const [isTelegramWebApp, setIsTelegramWebApp] = useState(false);
  const [inviterCode, setInviterCode] = useState(null);
  const [referralReady, setReferralReady] = useState(false);

  const registerKeyRef = useRef(null);

  // ====================================================
  // TELEGRAM INITIALIZATION
  // ====================================================

  useEffect(() => {
    let cancelled = false;

    async function initializeTelegram() {
      let tg = getTelegramWebApp();

      // Telegram WebApp can become available a little after first render.
      if (!tg) {
        for (let i = 0; i < 40; i++) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          tg = getTelegramWebApp();
          if (tg) break;
        }
      }

      if (cancelled) return;

      let resolvedTelegramId = null;
      let resolvedUsername = null;
      let resolvedPhotoUrl = null;
      let resolvedIsTelegram = false;

      if (tg) {
        try {
          tg.ready();
          if (typeof tg.expand === "function") {
            tg.expand();
          }
        } catch (err) {
          console.warn("Telegram ready error:", err);
        }

        const telegramUser = getTelegramUser(tg);

        if (telegramUser?.id) {
          resolvedTelegramId = Number(telegramUser.id);
          resolvedUsername = telegramUser.username || null;
          resolvedPhotoUrl = telegramUser.photoUrl || null;
          resolvedIsTelegram = true;
        }
      }

      // If Telegram object is temporarily unavailable after navigation/reload,
      // keep using the Telegram identity already captured for this Mini App user.
      if (!resolvedTelegramId) {
        const saved = loadUserData() || {};

        const storedId = Number(
          saved.telegramId ||
          localStorage.getItem("telegram_id") ||
          0
        );

        if (Number.isInteger(storedId) && storedId > 0) {
          resolvedTelegramId = storedId;
          resolvedUsername =
            saved.telegramUsername ||
            localStorage.getItem("telegram_username") ||
            null;
          resolvedPhotoUrl = saved.telegramPhotoUrl || null;
          resolvedIsTelegram = Boolean(saved.isTelegram);
        }
      }

      if (cancelled) return;

      setTelegramId(resolvedTelegramId);
      setTelegramUsername(resolvedUsername);
      setTelegramPhotoUrl(resolvedPhotoUrl);
      setIsTelegramWebApp(resolvedIsTelegram);

      if (resolvedTelegramId) {
        saveUserData({
          telegramId: resolvedTelegramId,
          telegramUsername: resolvedUsername,
          telegramPhotoUrl: resolvedPhotoUrl,
          isTelegram: resolvedIsTelegram,
        });

        localStorage.setItem(
          "telegram_id",
          String(resolvedTelegramId)
        );

        localStorage.setItem(
          "telegram_username",
          resolvedUsername || ""
        );
      }

      let code = getStartAppReferralCode();

      if (!code) {
        try {
          code = captureInviterCode() || null;
        } catch (captureError) {
          console.warn("Referral capture error:", captureError);
        }
      }

      if (!code) {
        try {
          code = getInviterCode() || null;
        } catch (storedError) {
          console.warn("Stored referral read error:", storedError);
        }
      }

      if (code) {
        localStorage.setItem("inviter_code", code);
      }

      setInviterCode(code);
      setReferralReady(true);
    }

    initializeTelegram();

    return () => {
      cancelled = true;
    };
  }, []);

  // ====================================================
  // REGISTER / LOAD TELEGRAM USER
  // ====================================================

  useEffect(() => {
    let cancelled = false;

    async function registerUser() {
      if (!referralReady) {
        return;
      }

      const finalTelegramId = Number(telegramId || 0);

      if (!Number.isInteger(finalTelegramId) || finalTelegramId <= 0) {
        setMyCode(null);
        setRefCount(null);
        setError(
          "Telegram ID not found. Please open this Mini App from Telegram."
        );
        return;
      }

      let finalInviterCode = inviterCode || null;

      if (!finalInviterCode) {
        try {
          finalInviterCode = getInviterCode() || null;
        } catch {
          // ignore
        }
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

        // This endpoint now creates/resolves the account by Telegram ID.
        // No TON wallet connection is required.
        const response = await api.get("/referrals/count/", {
          params,
        });

        if (cancelled) return;

        setRefCount(response.data?.count ?? 0);

        const returnedCode =
          response.data?.referral_code ||
          response.data?.user?.referral_code ||
          null;

        setMyCode(returnedCode);

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

        console.error("❌ TELEGRAM REFERRAL LOAD ERROR:", err);

        setError(
          err?.response?.data?.error ||
            err?.response?.data?.detail ||
            err?.message ||
            "Failed to load Telegram referral account."
        );

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
  ]);

  // ====================================================
  // LEVELS — TELEGRAM ID
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
        console.error("❌ Telegram referral levels error:", err);

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

    const intervalId = null;

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
      if (intervalId) {
        window.clearInterval(intervalId);
      }
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
  // REFERRAL LINK
  // ====================================================

  const referralLink = myCode
    ? `https://t.me/${BOT_USERNAME}/app?startapp=ref_${encodeURIComponent(myCode)}`
    : "";

  // ====================================================
  // OPEN REFERRAL LINK
  // ====================================================

  function openReferralLink() {
    if (!referralLink) return;
    const tg = getTelegramWebApp();
    if (tg && typeof tg.openTelegramLink === "function") {
      tg.openTelegramLink(referralLink);
    } else {
      window.open(referralLink, "_blank", "noopener,noreferrer");
    }
  }

  // ====================================================
  // SHARE
  // ====================================================

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
      } catch {
        window.open(shareUrl, "_blank", "noopener,noreferrer");
      }
    } else {
      window.open(shareUrl, "_blank", "noopener,noreferrer");
    }
  }

  // ====================================================
  // COPY
  // ====================================================

  async function copyReferralLink() {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      alert("✅ Referral link copied!");
    } catch (err) {
      console.error("Copy failed:", err);
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
        📱 Telegram ID not found. Please open this Mini App from Telegram.
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

      {!referralReady && <div className="loading-spinner">📱 Preparing Telegram...</div>}

      {myCode ? (
        <>
          <div className="referral-link-section">
            <p className="referral-link-label">🔗 Telegram Mini App Invite Link</p>

            <div className="link-actions">
              <input value={referralLink} readOnly className="link-input" />

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
    </div>
  );
}