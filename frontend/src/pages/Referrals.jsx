// frontend/src/components/Referrals.jsx

import { useEffect, useMemo, useRef, useState } from "react";
import { useTonWallet } from "@tonconnect/ui-react";
import { api } from "../api";
import "./Referrals.css";
import {
  captureInviterCode,
  getInviterCode,
} from "../utils/referral";

// ======================================================
// Constants
// ======================================================

const USER_DATA_KEY = "my_app_user_data";
const BOT_USERNAME = "Aipolynetbot";

// ======================================================
// LocalStorage
// ======================================================

function loadUserDataFromStorage() {
  try {
    const data = localStorage.getItem(USER_DATA_KEY);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error("[STORAGE] Load error:", error);
    return null;
  }
}

function saveUserDataToStorage(newData) {
  try {
    const currentData = loadUserDataFromStorage() || {};

    const mergedData = {
      ...currentData,
      ...newData,
    };

    localStorage.setItem(
      USER_DATA_KEY,
      JSON.stringify(mergedData)
    );
  } catch (error) {
    console.error("[STORAGE] Save error:", error);
  }
}

// ======================================================
// Telegram SDK Loader
// ======================================================

function loadTelegramSDK() {
  return new Promise((resolve) => {
    // Already loaded
    if (
      window.Telegram &&
      window.Telegram.WebApp
    ) {
      resolve(window.Telegram.WebApp);
      return;
    }

    // Find existing script
    const existingScript = document.querySelector(
      'script[src="https://telegram.org/js/telegram-web-app.js"]'
    );

    if (existingScript) {
      let attempts = 0;

      const check = () => {
        if (
          window.Telegram &&
          window.Telegram.WebApp
        ) {
          resolve(window.Telegram.WebApp);
          return;
        }

        attempts++;

        if (attempts >= 100) {
          resolve(null);
          return;
        }

        setTimeout(check, 50);
      };

      check();
      return;
    }

    // Load SDK
    const script = document.createElement("script");

    script.src =
      "https://telegram.org/js/telegram-web-app.js";

    script.async = true;

    script.onload = () => {
      let attempts = 0;

      const check = () => {
        if (
          window.Telegram &&
          window.Telegram.WebApp
        ) {
          resolve(window.Telegram.WebApp);
          return;
        }

        attempts++;

        if (attempts >= 100) {
          resolve(null);
          return;
        }

        setTimeout(check, 50);
      };

      check();
    };

    script.onerror = () => {
      console.error(
        "[TELEGRAM] Failed to load Telegram WebApp SDK"
      );

      resolve(null);
    };

    document.head.appendChild(script);
  });
}

// ======================================================
// Telegram WebApp
// ======================================================

function getTelegramWebApp() {
  return (
    window.Telegram?.WebApp ||
    null
  );
}

// ======================================================
// Telegram Avatar
// ======================================================

function getTelegramAvatar(
  telegramId,
  username
) {
  if (
    username &&
    username !== "browser" &&
    !username.startsWith("browser_") &&
    username !== "null" &&
    username !== "undefined" &&
    username !== ""
  ) {
    return `https://t.me/i/userpic/320/${encodeURIComponent(
      username
    )}.jpg`;
  }

  if (
    telegramId &&
    telegramId !== "-" &&
    telegramId !== "browser" &&
    Number(telegramId) > 0
  ) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(
      String(telegramId)
    )}&background=random&size=64&rounded=true`;
  }

  return `https://ui-avatars.com/api/?name=User&background=random&size=64&rounded=true`;
}

// ======================================================
// Debug Panel
// ======================================================

function DebugPanel({ data }) {
  const [isOpen, setIsOpen] = useState(true);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          zIndex: 999999,
          padding: "10px 16px",
          background: "#dc3545",
          color: "#fff",
          border: "none",
          borderRadius: "8px",
          fontWeight: "bold",
        }}
      >
        🐛 Show Debug
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: "10px",
        right: "10px",
        zIndex: 999999,
        width: "min(480px, calc(100vw - 20px))",
        maxHeight: "80vh",
        overflow: "auto",
        background: "#1a1a2e",
        color: "#e0e0e0",
        borderRadius: "12px",
        padding: "16px",
        boxShadow: "0 8px 32px rgba(0,0,0,.9)",
        fontFamily: "monospace",
        fontSize: "12px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
          borderBottom: "1px solid #333",
          paddingBottom: "8px",
        }}
      >
        <strong style={{ color: "#4CAF50" }}>
          🐛 Telegram Debug
        </strong>

        <button
          onClick={() => setIsOpen(false)}
          style={{
            background: "transparent",
            color: "#888",
            border: "none",
            fontSize: "18px",
          }}
        >
          ✕
        </button>
      </div>

      <DebugRow
        title="window.Telegram"
        value={
          data?.hasTelegram
            ? "✅ Yes"
            : "❌ No"
        }
      />

      <DebugRow
        title="WebApp"
        value={
          data?.hasWebApp
            ? "✅ Yes"
            : "❌ No"
        }
      />

      <DebugRow
        title="Platform"
        value={data?.platform || "Unknown"}
      />

      <DebugRow
        title="Telegram ID"
        value={
          data?.telegramId ||
          "❌ Not found"
        }
      />

      <DebugRow
        title="Username"
        value={
          data?.telegramUsername ||
          "❌ Not found"
        }
      />

      <DebugRow
        title="First Name"
        value={
          data?.firstName ||
          "❌ Not found"
        }
      />

      <DebugRow
        title="Last Name"
        value={
          data?.lastName ||
          "❌ Not found"
        }
      />

      <DebugRow
        title="Language"
        value={
          data?.language ||
          "❌ Not found"
        }
      />

      <DebugRow
        title="Premium"
        value={
          data?.isPremium
            ? "✅ Yes"
            : "❌ No"
        }
      />

      <DebugRow
        title="Telegram Mode"
        value={
          data?.isTelegramWebApp
            ? "✅ Telegram"
            : "🌐 Browser"
        }
      />

      <div
        style={{
          borderTop: "1px solid #333",
          marginTop: "10px",
          paddingTop: "10px",
        }}
      >
        <div
          style={{
            color: "#9C27B0",
            marginBottom: "5px",
          }}
        >
          📦 initDataUnsafe
        </div>

        <pre
          style={{
            background: "#0d0d1a",
            padding: "8px",
            borderRadius: "5px",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: "160px",
            overflow: "auto",
            fontSize: "9px",
          }}
        >
          {JSON.stringify(
            data?.initDataUnsafe || {},
            null,
            2
          )}
        </pre>
      </div>

      <div
        style={{
          borderTop: "1px solid #333",
          marginTop: "10px",
          paddingTop: "10px",
        }}
      >
        <div
          style={{
            color: "#2196F3",
            marginBottom: "5px",
          }}
        >
          📤 Payload
        </div>

        <pre
          style={{
            background: "#0d0d1a",
            padding: "8px",
            borderRadius: "5px",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: "180px",
            overflow: "auto",
            fontSize: "9px",
          }}
        >
          {JSON.stringify(
            data?.payload || {},
            null,
            2
          )}
        </pre>
      </div>

      <div
        style={{
          borderTop: "1px solid #333",
          marginTop: "10px",
          paddingTop: "10px",
        }}
      >
        <div
          style={{
            color: "#00BCD4",
            marginBottom: "5px",
          }}
        >
          📥 Backend Response
        </div>

        <pre
          style={{
            background: "#0d0d1a",
            padding: "8px",
            borderRadius: "5px",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: "180px",
            overflow: "auto",
            fontSize: "9px",
          }}
        >
          {JSON.stringify(
            data?.backendResponse || {},
            null,
            2
          )}
        </pre>
      </div>

      <div
        style={{
          borderTop: "1px solid #333",
          marginTop: "10px",
          paddingTop: "10px",
          color: "#aaa",
        }}
      >
        <div>
          inviter_code:{" "}
          {localStorage.getItem(
            "inviter_code"
          ) || "null"}
        </div>

        <div>
          telegram_username:{" "}
          {localStorage.getItem(
            "telegram_username"
          ) || "null"}
        </div>

        <div>
          telegram_id:{" "}
          {localStorage.getItem(
            "telegram_id"
          ) || "null"}
        </div>
      </div>
    </div>
  );
}

function DebugRow({ title, value }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "10px",
        padding: "3px 0",
        borderBottom: "1px solid rgba(255,255,255,.04)",
      }}
    >
      <span style={{ color: "#888" }}>
        {title}
      </span>

      <span
        style={{
          color: "#4CAF50",
          textAlign: "right",
          wordBreak: "break-word",
        }}
      >
        {String(value)}
      </span>
    </div>
  );
}

// ======================================================
// Component
// ======================================================

export default function Referrals() {
  const tonWallet = useTonWallet();

  const address = useMemo(
    () =>
      tonWallet?.account?.address ||
      null,
    [tonWallet]
  );

  // ====================================================
  // State
  // ====================================================

  const [
    telegramReady,
    setTelegramReady,
  ] = useState(false);

  const [
    isTelegramWebApp,
    setIsTelegramWebApp,
  ] = useState(false);

  const [
    telegramId,
    setTelegramId,
  ] = useState(null);

  const [
    telegramUsername,
    setTelegramUsername,
  ] = useState(null);

  const [
    inviterCode,
    setInviterCode,
  ] = useState(null);

  const [
    referralReady,
    setReferralReady,
  ] = useState(false);

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
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    showTestTable,
    setShowTestTable,
  ] = useState(false);

  const [
    testData,
    setTestData,
  ] = useState(null);

  const [
    backendResponse,
    setBackendResponse,
  ] = useState(null);

  const [
    debugData,
    setDebugData,
  ] = useState({});

  const registerKey = useRef(null);

  // ====================================================
  // Browser ID
  // ====================================================

  const browserTelegramId = useMemo(() => {
    if (!address) {
      return (
        Math.floor(
          Date.now() / 1000
        ) + 2000000000000
      );
    }

    let hash = 0;

    for (
      let i = 0;
      i < address.length;
      i++
    ) {
      hash =
        (hash << 5) -
        hash +
        address.charCodeAt(i);

      hash |= 0;
    }

    return (
      Math.abs(hash) +
      1000000000000
    );
  }, [address]);

  // ====================================================
  // Telegram Initialization
  // ====================================================

  useEffect(() => {
    let cancelled = false;

    async function initializeTelegram() {
      console.log(
        "===================================="
      );

      console.log(
        "🔵 Telegram initialization started"
      );

      console.log(
        "===================================="
      );

      const tg =
        await loadTelegramSDK();

      if (cancelled) return;

      const hasTelegram =
        typeof window.Telegram !==
        "undefined";

      const hasWebApp =
        !!tg;

      console.log(
        "window.Telegram:",
        window.Telegram
      );

      console.log(
        "Telegram.WebApp:",
        tg
      );

      setDebugData((prev) => ({
        ...prev,
        hasTelegram,
        hasWebApp,
        platform:
          tg?.platform ||
          "Unknown",
      }));

      // ==================================================
      // Browser
      // ==================================================

      if (!tg) {
        console.log(
          "🌐 Browser mode"
        );

        setIsTelegramWebApp(false);

        const savedReferral =
          getInviterCode();

        setInviterCode(
          savedReferral || null
        );

        setTelegramReady(true);
        setReferralReady(true);

        setDebugData((prev) => ({
          ...prev,
          isTelegramWebApp: false,
          telegramId: null,
          telegramUsername: null,
        }));

        return;
      }

      // ==================================================
      // Telegram
      // ==================================================

      try {
        tg.ready();
        tg.expand();

        if (
          typeof tg.setHeaderColor ===
          "function"
        ) {
          try {
            tg.setHeaderColor(
              "#ffffff"
            );
          } catch {}
        }
      } catch (err) {
        console.warn(
          "Telegram ready/expand error:",
          err
        );
      }

      const initDataUnsafe =
        tg.initDataUnsafe || {};

      const user =
        initDataUnsafe.user ||
        null;

      console.log(
        "Telegram initDataUnsafe:",
        initDataUnsafe
      );

      console.log(
        "Telegram user:",
        user
      );

      setDebugData((prev) => ({
        ...prev,
        hasTelegram: true,
        hasWebApp: true,
        platform:
          tg.platform ||
          "Unknown",
        initDataUnsafe,
        initData:
          tg.initData || "",
      }));

      // ==================================================
      // User
      // ==================================================

      if (user?.id) {
        const realTelegramId =
          Number(user.id);

        const realUsername =
          user.username ||
          null;

        const firstName =
          user.first_name ||
          null;

        const lastName =
          user.last_name ||
          null;

        const language =
          user.language_code ||
          null;

        const premium =
          Boolean(
            user.is_premium
          );

        console.log(
          "===================================="
        );

        console.log(
          "✅ REAL TELEGRAM USER"
        );

        console.log(
          "ID:",
          realTelegramId
        );

        console.log(
          "Username:",
          realUsername
        );

        console.log(
          "First name:",
          firstName
        );

        console.log(
          "Last name:",
          lastName
        );

        console.log(
          "Language:",
          language
        );

        console.log(
          "Premium:",
          premium
        );

        console.log(
          "===================================="
        );

        setTelegramId(
          realTelegramId
        );

        setTelegramUsername(
          realUsername
        );

        setIsTelegramWebApp(
          true
        );

        saveUserDataToStorage({
          telegramId:
            realTelegramId,

          telegramUsername:
            realUsername,

          isTelegram: true,
        });

        // Also save separately
        try {
          localStorage.setItem(
            "telegram_id",
            String(realTelegramId)
          );

          localStorage.setItem(
            "telegram_username",
            realUsername || ""
          );
        } catch {}

        setDebugData((prev) => ({
          ...prev,
          telegramId:
            realTelegramId,

          telegramUsername:
            realUsername,

          firstName,

          lastName,

          language,

          isPremium:
            premium,

          isTelegramWebApp:
            true,

          user,
        }));
      } else {
        console.warn(
          "⚠️ Telegram WebApp exists but user is missing"
        );

        setIsTelegramWebApp(
          true
        );

        setDebugData((prev) => ({
          ...prev,
          isTelegramWebApp: true,
          error:
            "Telegram WebApp exists but initDataUnsafe.user is missing",
        }));
      }

      // ==================================================
      // Referral
      // ==================================================

      const startParam =
        initDataUnsafe.start_param ||
        null;

      let referral =
        startParam;

      // If Telegram has start_param
      if (
        referral &&
        referral.startsWith(
          "ref_"
        )
      ) {
        referral =
          referral.substring(4);
      }

      // Existing helper
      if (!referral) {
        try {
          referral =
            captureInviterCode() ||
            null;
        } catch (err) {
          console.warn(
            "captureInviterCode error:",
            err
          );
        }
      }

      if (!referral) {
        try {
          referral =
            getInviterCode() ||
            null;
        } catch (err) {
          console.warn(
            "getInviterCode error:",
            err
          );
        }
      }

      if (referral) {
        console.log(
          "🎯 Referral code:",
          referral
        );

        setInviterCode(
          referral
        );

        try {
          localStorage.setItem(
            "inviter_code",
            referral
          );
        } catch {}
      } else {
        setInviterCode(null);
      }

      setTelegramReady(true);
      setReferralReady(true);

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
  // Save wallet
  // ====================================================

  useEffect(() => {
    if (!address) return;

    saveUserDataToStorage({
      walletAddress: address,
    });
  }, [address]);

  // ====================================================
  // Register
  // ====================================================

  useEffect(() => {
    if (!address) {
      setMyCode(null);
      setRefCount(null);
      return;
    }

    if (!telegramReady) {
      console.log(
        "⏳ Waiting for Telegram initialization..."
      );
      return;
    }

    if (!referralReady) {
      console.log(
        "⏳ Waiting for referral initialization..."
      );
      return;
    }

    // ==================================================
    // Determine Telegram data
    // ==================================================

    let finalTelegramId;
    let finalTelegramUsername;
    let source;

    if (
      isTelegramWebApp &&
      telegramId &&
      Number(telegramId) > 0
    ) {
      // REAL TELEGRAM USER
      finalTelegramId =
        Number(telegramId);

      finalTelegramUsername =
        telegramUsername ||
        null;

      source = "telegram";

      console.log(
        "✅ Using REAL Telegram ID:",
        finalTelegramId
      );

      console.log(
        "✅ Using REAL Telegram username:",
        finalTelegramUsername
      );
    } else {
      // Browser fallback
      finalTelegramId =
        browserTelegramId;

      finalTelegramUsername =
        `user_${address.slice(
          0,
          8
        )}`;

      source = "browser";

      console.log(
        "🌐 Using browser fallback ID:",
        finalTelegramId
      );
    }

    const finalInviterCode =
      inviterCode ||
      getInviterCode() ||
      null;

    const registerKey = [
      address,
      finalTelegramId,
      finalInviterCode || "",
    ].join("|");

    if (
      registerKey.current ===
      registerKey
    ) {
      return;
    }

    registerKey.current =
      registerKey;

    let cancelled = false;

    async function registerUser() {
      try {
        setLoading(true);
        setError("");

        const payload = {
          wallet_address:
            address,

          inviter_code:
            finalInviterCode,

          telegram_id:
            finalTelegramId,

          telegram_username:
            finalTelegramUsername,

          is_telegram:
            source === "telegram",
        };

        console.log(
          "===================================="
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
          "===================================="
        );

        setDebugData((prev) => ({
          ...prev,

          finalTelegramId,

          finalTelegramUsername,

          source,

          payload,
        }));

        const response =
          await api.post(
            "/connect/",
            payload
          );

        if (cancelled) return;

        console.log(
          "✅ /connect/ response:",
          response.data
        );

        setBackendResponse(
          response.data
        );

        setDebugData((prev) => ({
          ...prev,
          backendResponse:
            response.data,
        }));

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
        // Referral count
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

          if (cancelled) return;

          setRefCount(
            countResponse.data
              ?.count ?? 0
          );
        } catch (countError) {
          console.error(
            "Referral count error:",
            countError
          );

          setRefCount(0);
        }
      } catch (err) {
        if (cancelled) return;

        console.error(
          "===================================="
        );

        console.error(
          "❌ REGISTER ERROR"
        );

        console.error(
          "Status:",
          err?.response?.status
        );

        console.error(
          "Backend:",
          err?.response?.data
        );

        console.error(
          "Message:",
          err?.message
        );

        console.error(
          "===================================="
        );

        setError(
          err?.response?.data
            ?.error ||
            err?.response?.data
              ?.detail ||
            err?.message ||
            "Failed to register user."
        );

        // Allow retry
        registerKey.current =
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
    telegramReady,
    referralReady,
    telegramId,
    telegramUsername,
    isTelegramWebApp,
    inviterCode,
    browserTelegramId,
  ]);

  // ====================================================
  // Referral Levels
  // ====================================================

  useEffect(() => {
    if (!address) return;

    let cancelled = false;

    async function fetchLevels() {
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

        if (cancelled) return;

        const returnedLevels =
          response.data?.levels ||
          {};

        setLevels(
          returnedLevels
        );

        setTotalReferrals(
          response.data
            ?.total_referrals || 0
        );

        const firstLevel =
          returnedLevels.level_1;

        if (
          firstLevel?.users?.length
        ) {
          setDebugData((prev) => ({
            ...prev,
            firstLevelUser:
              firstLevel.users[0],
          }));
        }
      } catch (err) {
        console.error(
          "❌ Levels error:",
          err?.response?.data ||
            err
        );
      }
    }

    fetchLevels();

    return () => {
      cancelled = true;
    };
  }, [address]);

  // ====================================================
  // Test data
  // ====================================================

  async function fetchTestData() {
    if (!address) return;

    try {
      setLoading(true);
      setError("");

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

      setShowTestTable(true);
    } catch (err) {
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
  // Referral link
  // ====================================================

  const referralLink = useMemo(() => {
    if (!myCode) return "";

    return (
      `https://t.me/${BOT_USERNAME}` +
      `/app?startapp=ref_` +
      encodeURIComponent(
        myCode
      )
    );
  }, [myCode]);

  // ====================================================
  // Open referral
  // ====================================================

  function openReferralLink() {
    if (!referralLink) return;

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
  // Share Telegram
  // ====================================================

  function shareOnTelegram() {
    if (!referralLink) return;

    const text =
      `🎯 Join me on AI PolyNet!\n\n` +
      `🚀 Open the Mini App using my referral link:\n\n` +
      `${referralLink}\n\n` +
      `💎 Don't miss out on the rewards!`;

    const shareUrl =
      "https://t.me/share/url" +
      `?url=${encodeURIComponent(
        referralLink
      )}` +
      `&text=${encodeURIComponent(
        text
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
  // Copy
  // ====================================================

  async function copyReferralLink() {
    if (!referralLink) return;

    try {
      await navigator.clipboard.writeText(
        referralLink
      );

      alert(
        "✅ Telegram referral link copied!"
      );
    } catch (err) {
      console.error(
        "Copy failed:",
        err
      );
    }
  }

  // ====================================================
  // Level table
  // ====================================================

  function renderLevelTable(
    level,
    data
  ) {
    if (!data) {
      return (
        <div className="level-table">
          <div className="level-header">
            <h4>
              ⭐ Level {level}
            </h4>
          </div>

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

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>User</th>
                <th>
                  Investment (TON)
                </th>
                <th>Profit</th>
              </tr>
            </thead>

            <tbody>
              {displayUsers.length ===
              0 ? (
                <tr>
                  <td
                    colSpan="4"
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
                        : user.telegram_id;

                    const userTelegramUsername =
                      isString
                        ? null
                        : user.telegram_username;

                    const userWallet =
                      isString
                        ? user
                        : user.wallet ||
                          "-";

                    const investment =
                      isString
                        ? 0
                        : user.investment ||
                          0;

                    const profit =
                      isString
                        ? 0
                        : user.profit ||
                          0;

                    let displayName =
                      "Anonymous User";

                    let displayUsername =
                      null;

                    if (
                      userTelegramUsername &&
                      userTelegramUsername !==
                        "browser" &&
                      !userTelegramUsername.startsWith(
                        "browser_"
                      )
                    ) {
                      displayName =
                        userTelegramUsername;

                      displayUsername =
                        `@${userTelegramUsername}`;
                    } else if (
                      userTelegramId &&
                      Number(
                        userTelegramId
                      ) > 0
                    ) {
                      displayName =
                        String(
                          userTelegramId
                        );
                    } else if (
                      userWallet &&
                      userWallet !== "-"
                    ) {
                      if (
                        userWallet.startsWith(
                          "user_"
                        )
                      ) {
                        displayName =
                          userWallet.replace(
                            "user_",
                            "User "
                          );
                      } else if (
                        userWallet.length >
                        10
                      ) {
                        displayName =
                          `${userWallet.slice(
                            0,
                            6
                          )}...${userWallet.slice(
                            -4
                          )}`;
                      } else {
                        displayName =
                          userWallet;
                      }
                    }

                    const avatarUrl =
                      getTelegramAvatar(
                        userTelegramId,
                        userTelegramUsername
                      );

                    return (
                      <tr
                        key={`${index}-${userTelegramId || userWallet}`}
                      >
                        <td>
                          {index + 1}
                        </td>

                        <td className="user-cell">
                          <div className="user-avatar-wrapper">
                            <img
                              src={
                                avatarUrl
                              }
                              alt={
                                displayName
                              }
                              className="user-avatar"
                              onError={(
                                e
                              ) => {
                                e.currentTarget.src =
                                  `https://ui-avatars.com/api/?name=${encodeURIComponent(
                                    displayName
                                  )}&background=random&size=64&rounded=true`;
                              }}
                            />

                            <div className="user-info">
                              <span className="user-name">
                                {
                                  displayName
                                }
                              </span>

                              {displayUsername && (
                                <span className="user-username">
                                  {
                                    displayUsername
                                  }
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="investment-cell">
                          {
                            investment
                          }
                        </td>

                        <td className="profit-cell">
                          + {profit}
                        </td>
                      </tr>
                    );
                  }
                )
              )}
            </tbody>
          </table>
        </div>

        {users.length > 10 && (
          <div className="show-more">
            + {users.length - 10} more
            users
          </div>
        )}
      </div>
    );
  }

  // ====================================================
  // Wallet required
  // ====================================================

  if (!address) {
    return (
      <div className="wallet-required">
        🔌 Please connect your wallet
        first.
      </div>
    );
  }

  // ====================================================
  // Render
  // ====================================================

  return (
    <div className="referral-dashboard">
      <DebugPanel
        data={debugData}
      />

      <h2>
        🎯 Referral Dashboard
      </h2>

      {!telegramReady && (
        <div className="loading-spinner">
          📱 Detecting Telegram...
        </div>
      )}

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
          🔗 Preparing referral...
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
                value={referralLink}
                readOnly
                className="link-input"
              />

              <button
                onClick={
                  openReferralLink
                }
                disabled={
                  !referralLink
                }
                className="btn-open"
              >
                🚀 Open Mini App
              </button>

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
                  {refCount === null
                    ? "..."
                    : refCount}
                </span>
              </div>

              <div className="stat-item">
                <span className="stat-label">
                  🌳 Total Tree
                </span>

                <span className="stat-value">
                  {totalReferrals}
                </span>
              </div>
            </div>

            <div className="telegram-status">
              {isTelegramWebApp &&
              telegramId ? (
                <span className="status-active">
                  ✅ Connected to
                  Telegram
                </span>
              ) : (
                <span className="status-inactive">
                  🌐 Browser Mode
                </span>
              )}
            </div>

            {telegramId &&
              isTelegramWebApp && (
                <div className="info-note">
                  👤 Telegram ID:{" "}
                  <b>
                    {telegramId}
                  </b>

                  {telegramUsername && (
                    <>
                      {" "}
                      · @{telegramUsername}
                    </>
                  )}
                </div>
              )}

            {inviterCode && (
              <div className="info-note">
                🎁 Invited by:{" "}
                <b>
                  {inviterCode}
                </b>
              </div>
            )}

            <div className="info-note">
              💡 This link opens the
              Telegram Mini App and
              keeps the referral code.
            </div>
          </div>

          <div className="levels-section">
            <h3>
              🔺 Referral Tree (5
              Levels)
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

            <div className="test-actions">
              <button
                onClick={
                  fetchTestData
                }
                className="btn-test"
                disabled={loading}
              >
                🧪 Show Test Table
              </button>
            </div>

            {showTestTable &&
              testData && (
                <div className="test-table-section">
                  <div className="test-header">
                    <h3>
                      🧪 Test Data (5
                      Levels)
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
                    data showing
                    how the referral
                    tree will look
                    with sample
                    users.
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
}