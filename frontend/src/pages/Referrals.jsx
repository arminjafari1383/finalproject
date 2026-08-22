// frontend/src/components/Referrals.jsx

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useTonWallet } from "@tonconnect/ui-react";

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
    const raw =
      localStorage.getItem(
        USER_DATA_KEY
      );

    if (!raw) return null;

    return JSON.parse(raw);
  } catch (error) {
    console.error(
      "❌ Failed to load user data:",
      error
    );

    return null;
  }
}

function saveUserData(data) {
  try {
    const current =
      loadUserData() || {};

    const merged = {
      ...current,
      ...data,
    };

    localStorage.setItem(
      USER_DATA_KEY,
      JSON.stringify(merged)
    );

    return merged;
  } catch (error) {
    console.error(
      "❌ Failed to save user data:",
      error
    );

    return null;
  }
}

// ======================================================
// TELEGRAM
// ======================================================

function getTelegramWebApp() {
  if (
    typeof window ===
      "undefined"
  ) {
    return null;
  }

  return (
    window.Telegram?.WebApp ||
    null
  );
}

// ======================================================
// TELEGRAM USER
// ======================================================

function getTelegramUser(tg) {
  if (!tg) return null;

  const user =
    tg?.initDataUnsafe?.user;

  if (!user?.id) {
    return null;
  }

  return {
    id: Number(user.id),

    username:
      user.username || null,

    photoUrl: user.photo_url || null,

    firstName:
      user.first_name || null,

    lastName:
      user.last_name || null,

    language:
      user.language_code || null,

    isPremium:
      Boolean(user.is_premium),
  };
}

// ======================================================
// AVATAR
// ======================================================

function getTelegramAvatar(
  telegramId,
  username
) {
  const cleanUsername = String(
    username || ""
  )
    .trim()
    .replace(/^@/, "");

  if (
    cleanUsername &&
    cleanUsername !== "browser" &&
    !cleanUsername.startsWith(
      "browser_"
    )
  ) {
    return (
      `https://t.me/i/userpic/320/` +
      `${encodeURIComponent(
        cleanUsername
      )}.jpg`
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
  const tonWallet =
    useTonWallet();

  const address =
    useMemo(
      () =>
        tonWallet?.account
          ?.address || null,
      [tonWallet]
    );

  // ====================================================
  // STATE
  // ====================================================

  const [
    myCode,
    setMyCode,
  ] = useState(null);

  const [
    refCount,
    setRefCount,
  ] = useState(null);

  const [
    levels,
    setLevels,
  ] = useState(null);

  const [
    totalReferrals,
    setTotalReferrals,
  ] = useState(0);

  const [
    showTestTable,
    setShowTestTable,
  ] = useState(false);

  const [
    testData,
    setTestData,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    telegramId,
    setTelegramId,
  ] = useState(null);

  const [
    telegramUsername,
    setTelegramUsername,
  ] = useState(null);

  const [
    isTelegramWebApp,
    setIsTelegramWebApp,
  ] = useState(false);

  const [
    inviterCode,
    setInviterCode,
  ] = useState(null);

  const [
    referralReady,
    setReferralReady,
  ] = useState(false);

  const addTrace = useCallback(
    (stage, details = {}) => {
      const item = {
        time: new Date().toISOString(),
        stage,
        details,
      };

      console.log(
        `[REF-TRACE] ${stage}`,
        details
      );

      setTraceLogs((prev) =>
        [...prev, item].slice(-80)
      );
    },
    []
  );

  const clearTrace = useCallback(
    () => setTraceLogs([]),
    []
  );

  useEffect(() => {
    const params =
      new URLSearchParams(
        window.location.search
      );

      console.log(
        "🔵 Telegram initialization"
      );

      console.log(
        "========================================="
      );

      let tg =
        getTelegramWebApp();

      // اگر SDK در index.html باشد معمولاً همینجا موجود است.
      // چند بار کوتاه هم بررسی می‌کنیم تا race condition نداشته باشیم.
      if (!tg) {
        for (
          let i = 0;
          i < 40;
          i++
        ) {
          await new Promise(
            (resolve) =>
              setTimeout(
                resolve,
                50
              )
          );

          tg =
            getTelegramWebApp();

          if (tg) break;
        }
      }

      if (cancelled) return;

      const hasTelegram =
        typeof window.Telegram !==
        "undefined";

      const hasWebApp =
        Boolean(tg);

      const platform =
        tg?.platform ||
        "Unknown";

      const pageParams =
        new URLSearchParams(
          window.location.search
        );

      const tgWebAppStartParam =
        pageParams.get(
          "tgWebAppStartParam"
        );

      console.log(
        "window.Telegram:",
        window.Telegram
      );

      console.log(
        "Telegram.WebApp:",
        tg
      );

      console.log(
        "Platform:",
        platform
      );

      // ================================================
      // BROWSER
      // ================================================

      if (!tg) {
        console.log(
          "🌐 Browser mode"
        );

        setIsTelegramWebApp(
          false
        );

        setTelegramId(
          null
        );

        setTelegramUsername(
          null
        );

        // اگر قبلاً ID ساختگی ذخیره شده،
        // آن را دیگر به عنوان Telegram ID قبول نکن.
        try {
          localStorage.removeItem(
            "telegram_id"
          );

          localStorage.removeItem(
            "telegram_username"
          );

          const saved =
            loadUserData();

          if (
            saved?.isTelegram
          ) {
            const cleaned = {
              ...saved,
              telegramId:
                null,
              telegramUsername:
                null,
              isTelegram:
                false,
            };

            localStorage.setItem(
              USER_DATA_KEY,
              JSON.stringify(
                cleaned
              )
            );
          }
        } catch {}

        let code = null;

        try {
          code =
            getInviterCode() ||
            captureInviterCode() ||
            null;
        } catch (err) {
          console.warn(
            "Referral capture error:",
            err
          );
        }

        setInviterCode(
          code
        );

        setReferralReady(
          true
        );

        return;
      }

      // ================================================
      // TELEGRAM
      // ================================================

      console.log(
        "✅ Telegram WebApp detected"
      );

      try {
        tg.ready();

        if (
          typeof tg.expand ===
          "function"
        ) {
          tg.expand();
        }
      } catch (err) {
        console.warn(
          "Telegram ready error:",
          err
        );
      }

      const unsafe =
        tg.initDataUnsafe ||
        {};

      const user =
        getTelegramUser(tg);

      console.log(
        "initDataUnsafe:",
        unsafe
      );

      console.log(
        "Telegram user:",
        user
      );

      setIsTelegramWebApp(
        true
      );

      // ================================================
      // USER
      // ================================================

      if (user) {
        console.log(
          "========================================="
        );

        console.log(
          "✅ REAL TELEGRAM USER"
        );

        console.log(
          "ID:",
          user.id
        );

        console.log(
          "Username:",
          user.username
        );

        console.log(
          "========================================="
        );

        setTelegramId(
          user.id
        );

        setTelegramUsername(
          user.username
        );

        // ذخیره فقط ID واقعی Telegram
        saveUserData({
          telegramId:
            user.id,

          telegramUsername:
            user.username,

          isTelegram:
            true,
        });

        localStorage.setItem(
          "telegram_id",
          String(user.id)
        );

        localStorage.setItem(
          "telegram_username",
          user.username || ""
        );
      } else {
        console.warn(
          "⚠️ Telegram WebApp exists but user is missing"
        );

        setTelegramId(
          null
        );

        setTelegramUsername(
          null
        );

        // WebApp داریم ولی user نداریم.
        // بنابراین ID قبلی را استفاده نمی‌کنیم.
        try {
          localStorage.removeItem(
            "telegram_id"
          );

          localStorage.removeItem(
            "telegram_username"
          );
        } catch {}
      }

      // ================================================
      // REFERRAL
      // ================================================

      let code = null;
      let referralSource = null;

      const startParam =
        unsafe.start_param ||
        null;

      if (startParam) {
        code =
          String(
            startParam
          ).startsWith("ref_")
            ? String(
                startParam
              ).substring(4)
            : String(
                startParam
              );
        referralSource =
          "initDataUnsafe.start_param";
      }

      if (!code && tgWebAppStartParam) {
        code =
          String(
            tgWebAppStartParam
          ).startsWith("ref_")
            ? String(
                tgWebAppStartParam
              ).substring(4)
            : String(
                tgWebAppStartParam
              );
        referralSource =
          "tgWebAppStartParam";
      }

      if (!code) {
        try {
          code =
            captureInviterCode() ||
            null;
          if (code) {
            referralSource =
              "captureInviterCode()";
          }
        } catch (captureError) {
        }
      }

      if (!code) {
        try {
          code =
            getInviterCode() ||
            null;
          if (code) {
            referralSource =
              "getInviterCode()";
          }
        } catch (storedError) {
        }
      }

      if (code) {
        localStorage.setItem(
          "inviter_code",
          code
        );
      }

      setInviterCode(
        code
      );

      setReferralReady(
        true
      );

      console.log(
        "✅ Telegram initialization complete"
      );
    }

    initializeTelegram();

    return () => {
      cancelled = true;
    };
  }, []);

  // ====================================================
  // SAVE WALLET
  // ====================================================

  useEffect(() => {
    if (!address) return;

    saveUserData({
      walletAddress:
        address,
    });
  }, [address]);

  // ====================================================
  // REGISTER USER
  // ====================================================

  useEffect(() => {
    let cancelled = false;

    async function registerUser() {

      console.log(
        "========================================="
      );

      console.log(
        "🔴 Register effect"
      );

      console.log(
        "========================================="
      );

      console.log(
        "Wallet:",
        address
      );

      console.log(
        "Telegram:",
        isTelegramWebApp
      );

      console.log(
        "Telegram ID:",
        telegramId
      );

      console.log(
        "Username:",
        telegramUsername
      );

      console.log(
        "Referral:",
        inviterCode
      );

      if (!address) {
        setMyCode(null);

        setRefCount(null);

        return;
      }

      if (!referralReady) {
        console.log(
          "⏳ Waiting for referral initialization"
        );

        return;
      }

      // ==================================================
      // IDENTITY
      // ==================================================

      let finalTelegramId =
        null;

      let finalTelegramUsername =
        null;

      let identitySource =
        "browser";

      // فقط Telegram state معتبر است.
      // localStorage دیگر برای تعیین هویت استفاده نمی‌شود.
      if (
        isTelegramWebApp &&
        telegramId &&
        Number(telegramId) > 0
      ) {
        finalTelegramId =
          Number(
            telegramId
          );

        finalTelegramUsername =
          telegramUsername ||
          null;

        identitySource =
          "telegram";

        console.log(
          "✅ Using REAL Telegram ID:",
          finalTelegramId
        );
      } else {
        console.log(
          "🌐 Browser mode - no Telegram ID"
        );
      }

      // ==================================================
      // REFERRAL
      // ==================================================

      let finalInviterCode =
        inviterCode ||
        null;

      if (!finalInviterCode) {
        try {
          finalInviterCode =
            getInviterCode() ||
            null;
        } catch {}
      }

      // ==================================================
      // REGISTER KEY
      // ==================================================

      const currentRegisterKey =
        [
          address,
          finalTelegramId ||
            "",
          finalTelegramUsername ||
            "",
          finalInviterCode ||
            "",
          identitySource,
        ].join("|");

      if (
        registerKeyRef.current ===
        currentRegisterKey
      ) {

        console.log(
          "⛔ Already registered with same key"
        );

        return;
      }

      registerKeyRef.current =
        currentRegisterKey;

      // ==================================================
      // PAYLOAD
      // ==================================================

      const telegramPhotoUrl =
  window.Telegram?.WebApp?.initDataUnsafe?.user?.photo_url || null;

      const payload = {
        wallet_address:
          address,
        
        telegram_photo_url: telegramPhotoUrl,

        inviter_code:
          finalInviterCode,

        telegram_id:
          finalTelegramId,

        telegram_username:
          finalTelegramUsername,

        is_telegram:
          identitySource ===
          "telegram",
      };

      console.log(
        "========================================="
      );

      console.log(
        "📤 FINAL /connect/ PAYLOAD"
      );

      console.log(
        JSON.stringify(
          payload,
          null,
          2
        )
      );

      console.log(
        "========================================="
      );

      try {
        setLoading(true);

        setError("");

        const response =
          await api.post(
            "/connect/",
            payload
          );

        if (cancelled)
          return;

        console.log(
          "✅ /connect:",
          response.status,
          response.data
        );

        if (
          response.data?.referral_debug
        ) {
        }

        const returnedCode =
          response.data?.user
            ?.referral_code ||
          response.data
            ?.referral_code ||
          null;

        setMyCode(
          returnedCode
        );

        // ==================================================
        // REFERRAL COUNT
        // ==================================================

        try {
          const countResponse =
            await api.get(
              "/referrals/count/",
              {
                params: {
                  wallet_address:
                    address,
                },
              }
            );

          if (!cancelled) {
            setRefCount(
              countResponse.data
                ?.count ?? 0
            );
          }
        } catch (countError) {
          console.error(
            "Referral count error:",
            countError
          );

          if (!cancelled) {
            setRefCount(0);
          }
        }
      } catch (err) {
        if (cancelled)
          return;

        console.error(
          "❌ CONNECT ERROR:",
          err
        );

        console.error(
          "Backend:",
          err?.response?.data
        );
        setError(
          err?.response?.data
            ?.error ||
            err?.response?.data
              ?.detail ||
            err?.message ||
            "Failed to connect user."
        );

        // اجازه retry
        registerKeyRef.current =
          null;
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
    address,
    referralReady,
    inviterCode,
    telegramId,
    telegramUsername,
    isTelegramWebApp,
  ]);

  // ====================================================
  // LEVELS
  // ====================================================

  useEffect(() => {
    if (!address)
      return;

    let cancelled = false;
    let requestRunning = false;

    async function fetchLevels() {
      if (requestRunning)
        return;

      requestRunning = true;

      try {
        const response =
          await api.get(
            "/referral/levels/",
            {
              params: {
                wallet_address:
                  address,
              },
            }
          );

        if (cancelled)
          return;

        const data =
          response.data;

        setLevels(
          data?.levels || {}
        );

        setTotalReferrals(
          data?.total_referrals ||
            0
        );

        const firstLevel =
          data?.levels
            ?.level_1;
      } catch (err) {
        console.error(
          "❌ Levels error:",
          err
        );
      } finally {
        requestRunning = false;
      }
    }

    // First load immediately.
    fetchLevels();

    // Keep the referral tree live so a new 5% bonus appears without refresh.
    const intervalId =
      window.setInterval(
        fetchLevels,
        5000
      );

    const refreshOnFocus = () => {
      fetchLevels();
    };

    const refreshOnVisible = () => {
      if (
        document.visibilityState ===
        "visible"
      ) {
        fetchLevels();
      }
    };

    window.addEventListener(
      "focus",
      refreshOnFocus
    );

    document.addEventListener(
      "visibilitychange",
      refreshOnVisible
    );

    return () => {
      cancelled = true;

      window.clearInterval(
        intervalId
      );

      window.removeEventListener(
        "focus",
        refreshOnFocus
      );

      document.removeEventListener(
        "visibilitychange",
        refreshOnVisible
      );
    };
  }, [address]);

  // ====================================================
  // TEST DATA
  // ====================================================

  async function fetchTestData() {
    if (!address)
      return;

    try {
      setLoading(true);

      const response =
        await api.get(
          "/referral/levels/",
          {
            params: {
              wallet_address:
                address,

              test: "true",
            },
          }
        );

      setTestData(
        response.data?.levels ||
          {}
      );

      setShowTestTable(
        true
      );
    } catch (err) {
      console.error(
        "❌ Test data error:",
        err
      );

      setError(
        err?.response?.data
          ?.error ||
          err?.message ||
          "Failed to load test data."
      );
    } finally {
      setLoading(false);
    }
  }

  // ====================================================
  // REFERRAL LINK
  // ====================================================

  const referralLink =
    myCode
      ? `https://t.me/${BOT_USERNAME}/app?startapp=ref_${encodeURIComponent(
          myCode
        )}`
      : "";

  useEffect(() => {
    if (!referralLink) return;
  }, [
    addTrace,
    myCode,
    referralLink,
  ]);

  // ====================================================
  // OPEN REFERRAL LINK
  // ====================================================

  function openReferralLink() {
    if (!referralLink)
      return;

    const tg =
      getTelegramWebApp();

    if (
      tg &&
      typeof tg.openTelegramLink ===
        "function"
    ) {
      tg.openTelegramLink(
        referralLink
      );
    } else {
      window.open(
        referralLink,
        "_blank",
        "noopener,noreferrer"
      );
    }
  }

  // ====================================================
  // SHARE
  // ====================================================

  function shareOnTelegram() {
    if (!referralLink)
      return;

    const message =
      `🎯 Join me on AI PolyNet!\n\n` +
      `🚀 Open the Mini App using my referral link:\n\n` +
      `${referralLink}\n\n` +
      `💎 Don't miss out on the rewards!`;

    const shareUrl =
      `https://t.me/share/url` +
      `?url=${encodeURIComponent(
        referralLink
      )}` +
      `&text=${encodeURIComponent(
        message
      )}`;

    const tg =
      getTelegramWebApp();

    if (
      tg &&
      typeof tg.openTelegramLink ===
        "function"
    ) {
      try {
        tg.openTelegramLink(
          shareUrl
        );
      } catch {
        window.open(
          shareUrl,
          "_blank",
          "noopener,noreferrer"
        );
      }
    } else {
      window.open(
        shareUrl,
        "_blank",
        "noopener,noreferrer"
      );
    }
  }

  // ====================================================
  // COPY
  // ====================================================

  async function copyReferralLink() {
    if (!referralLink)
      return;

    try {
      await navigator.clipboard.writeText(
        referralLink
      );

      alert(
        "✅ Referral link copied!"
      );
    } catch (err) {
      console.error(
        "Copy failed:",
        err
      );
    }
  }

  // ====================================================
  // TABLE
  // ====================================================

  function renderLevelTable(
    level,
    data
  ) {
    const levelProfitMessage =
      level === 1
        ? "Direct referral: 1000 EPL join bonus + 5% stake profit (ECG)."
        : "Indirect referral: 500 EPL join bonus + 1% stake profit (ECG).";

    if (!data) {
      return (
        <div className="level-table">
          <div className="level-header">
            <h4>
              ⭐ Level {level}
            </h4>
          </div>

          <p
            className={`level-profit-note ${
              level === 1
                ? "level-profit-main"
                : ""
            }`}
          >
            {levelProfitMessage}
          </p>

          <div className="empty-message">
            No data available
          </div>
        </div>
      );
    }

    const users =
      data.users || [];

    const count =
      data.count || 0;

    const displayUsers =
      users.slice(0, 10);

    return (
      <div className="level-table">
        <div className="level-header">
          <h4>
            ⭐ Level {level}
          </h4>

          <span className="level-count">
            Total: {count}
          </span>
        </div>

        <p
          className={`level-profit-note ${
            level === 1
              ? "level-profit-main"
              : ""
          }`}
        >
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
                <th>
                  Investment (TON)
                </th>
                <th>
                  Referral Bonus (EPL)
                </th>
                <th>
                  {level === 1
                    ? "5% Profit (ECG)"
                    : "1% Profit (ECG)"}
                </th>
                <th>
                  {level === 1
                    ? "5% Profit (USDT)"
                    : "1% Profit (USDT)"}
                </th>
              </tr>
            </thead>

            <tbody>
              {displayUsers.length ===
              0 ? (
                <tr>
                  <td
                    colSpan="6"
                    className="empty-message"
                  >
                    No users in this
                    level
                  </td>
                </tr>
              ) : (
                displayUsers.map(
                  (
                    user,
                    index
                  ) => {
                    const isString =
                      typeof user ===
                      "string";

                    const userTelegramId =
                      isString
                        ? null
                        : user?.telegram_id;

                    const userTelegramUsername =
                      isString
                        ? null
                        : user?.telegram_username;

                    const userWallet =
                      isString
                        ? user
                        : user?.wallet ||
                          "-";

                    const investment =
                      isString
                        ? 0
                        : user?.investment ||
                          0;

                    const legacyProfit =
                      isString
                        ? 0
                        : Number(
                            user?.profit ||
                              0
                          );

                    const legacyProfitAsset =
                      isString
                        ? "ECG"
                        : String(
                            user?.profit_asset ||
                              "ECG"
                          ).toUpperCase();

                    const profitECG =
                      isString
                        ? 0
                        : Number(
                            user?.profit_ecg ??
                              (legacyProfitAsset ===
                              "ECG"
                                ? legacyProfit
                                : 0)
                          );

                    const profitUSDT =
                      isString
                        ? 0
                        : Number(
                            user?.profit_usdt ??
                              (legacyProfitAsset ===
                              "USDT"
                                ? legacyProfit
                                : 0)
                          );

                    const referralJoinBonus =
                      isString
                        ? 0
                        : user?.referral_bonus ||
                          0;

                    const cleanUsername =
                      String(
                        userTelegramUsername ||
                          ""
                      )
                        .trim()
                        .replace(
                          /^@/,
                          ""
                        );

                    const userTelegramPhotoUrl =
                      isString
                        ? null
                        : user?.telegram_photo_url ||
                          user?.photo_url ||
                          null;

                    const avatarUrl =
                      userTelegramPhotoUrl ||
                      getTelegramAvatar(
                        userTelegramId,
                        cleanUsername
                      );

                    const fallbackAvatar =
                      getTelegramAvatar(
                        null,
                        null
                      );

                    return (
                      <tr
                        key={`${index}-${userTelegramId || userWallet}`}
                      >
                        <td>
                          {index + 1}
                        </td>

                        <td className="user-cell">
                          <div className="referral-user-profile">
                            <div className="user-avatar-wrapper">
                              <img
                                src={
                                  avatarUrl
                                }
                                alt={
                                  cleanUsername
                                    ? `@${cleanUsername}`
                                    : "Telegram avatar"
                                }
                                className="user-avatar"
                                referrerPolicy="no-referrer"
                                onError={(
                                  event
                                ) => {
                                  event.currentTarget.onerror =
                                    null;
                                  event.currentTarget.src =
                                    fallbackAvatar;
                                }}
                              />
                            </div>

                            <span
                              className="referral-username"
                              title={
                                cleanUsername
                                  ? `@${cleanUsername}`
                                  : "Telegram user"
                              }
                            >
                              {cleanUsername
                                ? `@${cleanUsername}`
                                : "Telegram user"}
                            </span>
                          </div>
                        </td>

                        <td className="investment-cell">
                          {
                            investment
                          }
                        </td>

                        <td className="profit-cell">
                          + {Number(
                            referralJoinBonus || 0
                          ).toFixed(4)} EPL
                        </td>

                        <td className="profit-cell">
                          + {Number(
                            profitECG || 0
                          ).toFixed(4)} ECG
                        </td>

                        <td className="profit-cell">
                          + {Number(
                            profitUSDT || 0
                          ).toFixed(4)} USDT
                        </td>
                      </tr>
                    );
                  }
                )
              )}
            </tbody>
          </table>
        </div>

        {users.length >
          10 && (
          <div className="show-more">
            +{" "}
            {users.length - 10}{" "}
            more users
          </div>
        )}
      </div>
    );
  }

  // ====================================================
  // NO WALLET
  // ====================================================

  if (!address) {
    return (
      <>

        <div className="wallet-required">
          🔌 Please connect your
          wallet first.
        </div>
      </>
    );
  }

  // ====================================================
  // RENDER
  // ====================================================

  return (
    <div className="referral-dashboard">


      <h2>
        🎯 Referral Dashboard
      </h2>

      {loading && (
        <div className="loading-spinner">
          Loading...
        </div>
      )}

      {error && (
        <div className="error-message">
          ❌ {error}
        </div>
      )}

      {!referralReady && (
        <div className="loading-spinner">
          📱 Preparing Telegram...
        </div>
      )}

      {myCode ? (
        <>
          <div className="referral-link-section">
            <p className="referral-link-label">
              🔗 Telegram Mini App
              Invite Link
            </p>

            <div className="link-actions">
              <input
                value={
                  referralLink
                }
                readOnly
                className="link-input"
              />

              <button
                onClick={
                  copyReferralLink
                }
                disabled={
                  !referralLink
                }
                className="btn-copy"
              >
                📋 Copy
              </button>

              <button
                onClick={
                  shareOnTelegram
                }
                disabled={
                  !referralLink
                }
                className="btn-share-telegram"
              >
                📤 Share on Telegram
              </button>
            </div>

            <div className="stats-box">
              <div className="stat-item">
                <span className="stat-label">
                  👥 Direct Invites
                </span>

                <span className="stat-value">
                  {refCount ===
                  null
                    ? "..."
                    : refCount}
                </span>
              </div>

              <div className="stat-item">
                <span className="stat-label">
                  🌳 Total Tree
                </span>

                <span className="stat-value">
                  {
                    totalReferrals
                  }
                </span>
              </div>
            </div>

            {inviterCode && (
              <div className="info-note">
                🎁 Invited by:{" "}
                <b>
                  {inviterCode}
                </b>
              </div>
            )}

          </div>

          <div className="levels-section">
            <h3>
              🔺 Referral Tree
              (5 Levels)
            </h3>

            <div className="levels-grid">
              {[1, 2, 3, 4, 5].map(
                (level) => (
                  <div
                    key={level}
                    className="level-card"
                  >
                    {renderLevelTable(
                      level,
                      levels?.[
                        `level_${level}`
                      ]
                    )}
                  </div>
                )
              )}
            </div>

            {false &&
              showTestTable &&
              testData && (
                <div className="test-table-section">
                  <div className="test-header">
                    <h3>
                      🧪 Test Data
                    </h3>

                    <button
                      onClick={() =>
                        setShowTestTable(
                          false
                        )
                      }
                      className="btn-close"
                    >
                      ✕ Close
                    </button>
                  </div>

                  <div className="levels-grid">
                    {[
                      1, 2, 3, 4, 5,
                    ].map(
                      (level) => (
                        <div
                          key={`test-${level}`}
                          className="level-card test-card"
                        >
                          {renderLevelTable(
                            level,
                            testData?.[
                              `level_${level}`
                            ]
                          )}
                        </div>
                      )
                    )}
                  </div>

                  <div className="test-note">
                    ⚡ This is test
                    data.
                  </div>
                </div>
              )}
          </div>
        </>
      ) : (
        <div className="loading-spinner">
          Loading referral data...
        </div>
      )}
    </div>
  );
