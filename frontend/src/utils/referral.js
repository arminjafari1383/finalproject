// frontend/src/utils/referral.js

const INVITER_CODE_KEY = "inviter_code";
const REFERRAL_DATA_KEY = "referral_data";

// ======================================================
// HELPERS
// ======================================================

function cleanReferralCode(value) {
  if (value === null || value === undefined) {
    return null;
  }

  let code = String(value).trim();

  if (!code) {
    return null;
  }

  // Decode URL encoded values when possible
  try {
    code = decodeURIComponent(code);
  } catch {
    // ignore invalid URI encoding
  }

  code = code.trim();

  // Remove known prefixes
  const prefixes = [
    "ref_",
    "r_",
    "invite_",
    "inv_",
    "referral_",
  ];

  for (const prefix of prefixes) {
    if (code.toLowerCase().startsWith(prefix)) {
      code = code.substring(prefix.length);
      break;
    }
  }

  // Only letters and numbers
  code = code.replace(/[^a-zA-Z0-9]/g, "");

  if (!code) {
    return null;
  }

  return code;
}

function saveReferralCode(code) {
  const cleanCode = cleanReferralCode(code);

  if (!cleanCode) {
    return null;
  }

  try {
    localStorage.setItem(INVITER_CODE_KEY, cleanCode);
    console.log("💾 [referral.js] Saved referral:", cleanCode);
    return cleanCode;
  } catch (error) {
    console.error("❌ [referral.js] Failed to save referral:", error);
    return cleanCode;
  }
}

// ======================================================
// CAPTURE FROM URL (LOCAL)
// ======================================================

function captureFromUrl() {
  try {
    if (typeof window === "undefined") {
      return null;
    }

    const url = new URL(window.location.href);

    console.log("🔍 [referral.js] URL:", window.location.href);
    console.log("🔍 [referral.js] Search:", window.location.search);

    const possibleParams = [
      "ref",
      "referral",
      "referral_code",
      "code",
      "inviter",
      "invite",
      "share",
      // برای سازگاری با تلگرام
      "startapp",
      "tgWebAppStartParam",
      "start_param",
    ];

    // --------------------------------------------------
    // 1. Known parameters
    // --------------------------------------------------

    for (const param of possibleParams) {
      const value = url.searchParams.get(param);

      if (value && value.trim()) {
        const cleanCode = cleanReferralCode(value);

        if (cleanCode) {
          console.log(`✅ [referral.js] Found "${param}":`, cleanCode);
          return saveReferralCode(cleanCode);
        }
      }
    }

    // --------------------------------------------------
    // 2. Search every URL parameter
    // --------------------------------------------------

    const allParams = Object.fromEntries(url.searchParams.entries());

    console.log("🔍 [referral.js] All URL params:", allParams);

    for (const [key, value] of url.searchParams.entries()) {
      if (!value || !value.trim()) {
        continue;
      }

      const lowerKey = key.toLowerCase();
      const lowerValue = value.toLowerCase();

      const looksLikeReferralValue =
        lowerValue.startsWith("ref_") ||
        lowerValue.startsWith("r_") ||
        lowerValue.startsWith("invite_") ||
        lowerValue.startsWith("inv_") ||
        lowerValue.startsWith("referral_");

      const looksLikeReferralKey =
        lowerKey.includes("ref") ||
        lowerKey.includes("invite") ||
        lowerKey.includes("referral") ||
        lowerKey.includes("share");

      if (looksLikeReferralValue || looksLikeReferralKey) {
        const cleanCode = cleanReferralCode(value);

        if (cleanCode) {
          console.log(`✅ [referral.js] Found referral in "${key}":`, cleanCode);
          return saveReferralCode(cleanCode);
        }
      }
    }

    return null;
  } catch (error) {
    console.error("❌ [referral.js] URL capture error:", error);
    return null;
  }
}

// ======================================================
// CAPTURE FROM HASH (LOCAL)
// ======================================================

function captureFromHash() {
  try {
    if (typeof window === "undefined") {
      return null;
    }

    const hash = window.location.hash;

    if (!hash) {
      return null;
    }

    console.log("🔍 [referral.js] Checking hash:", hash);

    // Support:
    // #ref=ABC
    // #startapp=ref_ABC
    // #ref_ABC

    const cleanHash = hash.startsWith("#") ? hash.substring(1) : hash;

    // Direct:
    // #ref_ABC123
    if (
      cleanHash.startsWith("ref_") ||
      cleanHash.startsWith("r_") ||
      cleanHash.startsWith("invite_")
    ) {
      const code = cleanReferralCode(cleanHash);

      if (code) {
        console.log("✅ [referral.js] Referral captured from hash:", code);
        return saveReferralCode(code);
      }
    }

    // Query-like hash
    const hashParams = new URLSearchParams(cleanHash.replace(/^.*?\?/, ""));

    const possibleParams = [
      "ref",
      "referral",
      "referral_code",
      "code",
      "inviter",
      "invite",
      "share",
    ];

    for (const param of possibleParams) {
      const value = hashParams.get(param);

      if (value) {
        const code = cleanReferralCode(value);

        if (code) {
          console.log(`✅ [referral.js] Referral captured from hash "${param}":`, code);
          return saveReferralCode(code);
        }
      }
    }

    return null;
  } catch (error) {
    console.error("❌ [referral.js] Hash capture error:", error);
    return null;
  }
}

// ======================================================
// CAPTURE FROM WINDOW.NAME (LOCAL)
// ======================================================

function captureFromWindowName() {
  try {
    if (typeof window === "undefined") {
      return null;
    }

    const name = window.name;

    if (!name) {
      return null;
    }

    if (
      name.includes("ref_") ||
      name.includes("invite_") ||
      name.includes("r_")
    ) {
      const code = cleanReferralCode(name);

      if (code) {
        console.log("✅ [referral.js] Referral captured from window.name:", code);
        return saveReferralCode(code);
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ======================================================
// TELEGRAM (اختیاری - برای سازگاری عقب‌مانده)
// ======================================================

function getTelegramWebApp() {
  try {
    if (typeof window === "undefined") {
      return null;
    }
    return window.Telegram?.WebApp || null;
  } catch {
    return null;
  }
}

function isRealTelegramContext(tg) {
  if (!tg) return false;

  const hasInitData = typeof tg.initData === "string" && tg.initData.length > 0;
  const hasUser = !!tg.initDataUnsafe?.user?.id;
  const hasStartParam = !!tg.initDataUnsafe?.start_param;

  return hasInitData || hasUser || hasStartParam;
}

function captureFromTelegram() {
  try {
    const tg = getTelegramWebApp();

    if (!tg) {
      console.log("ℹ️ [referral.js] Telegram SDK not available");
      return null;
    }

    console.log("📱 [referral.js] Telegram.WebApp exists");

    try {
      if (typeof tg.ready === "function") {
        tg.ready();
      }
    } catch (error) {
      console.warn("⚠️ [referral.js] tg.ready() failed:", error);
    }

    const unsafe = tg.initDataUnsafe || {};

    console.log("📱 [referral.js] initData:", tg.initData || "(empty)");
    console.log("📱 [referral.js] initDataUnsafe:", unsafe);

    const realTelegramContext = isRealTelegramContext(tg);

    console.log("📱 [referral.js] Real Telegram context:", realTelegramContext);

    // start_param
    const startParam = unsafe.start_param || null;

    if (startParam) {
      console.log("📱 [referral.js] start_param:", startParam);

      const code = cleanReferralCode(startParam);

      if (code) {
        console.log("✅ [referral.js] Referral captured from Telegram:", code);
        return saveReferralCode(code);
      }
    }

    // tgWebAppStartParam from URL
    if (typeof window !== "undefined") {
      try {
        const url = new URL(window.location.href);
        const telegramStartParam = url.searchParams.get("tgWebAppStartParam");

        if (telegramStartParam) {
          const code = cleanReferralCode(telegramStartParam);

          if (code) {
            console.log("✅ [referral.js] Referral captured from tgWebAppStartParam:", code);
            return saveReferralCode(code);
          }
        }
      } catch {
        // ignore
      }
    }

    if (realTelegramContext) {
      console.log("📱 [referral.js] Telegram context exists, but no referral start_param was provided");
    } else {
      console.log("🌐 [referral.js] WebApp SDK exists, but no real Telegram context");
    }

    return null;
  } catch (error) {
    console.error("❌ [referral.js] Telegram capture error:", error);
    return null;
  }
}

// ======================================================
// MAIN CAPTURE FUNCTION (LOCAL)
// ======================================================

export function captureInviterCode() {
  try {
    console.log("=========================================");
    console.log("🔍 [referral.js] captureInviterCode()");
    console.log("=========================================");

    // --------------------------------------------------
    // Priority 1: URL referral
    // --------------------------------------------------

    const urlReferral = captureFromUrl();

    if (urlReferral) {
      return urlReferral;
    }

    // --------------------------------------------------
    // Priority 2: Hash
    // --------------------------------------------------

    const hashReferral = captureFromHash();

    if (hashReferral) {
      return hashReferral;
    }

    // --------------------------------------------------
    // Priority 3: window.name
    // --------------------------------------------------

    const windowReferral = captureFromWindowName();

    if (windowReferral) {
      return windowReferral;
    }

    // --------------------------------------------------
    // Priority 4: Existing saved referral
    // --------------------------------------------------

    const stored = getStoredInviterCode();

    if (stored) {
      console.log("📂 [referral.js] Using stored referral:", stored);
      return stored;
    }

    // --------------------------------------------------
    // Priority 5: Telegram (برای سازگاری)
    // --------------------------------------------------

    const telegramReferral = captureFromTelegram();

    if (telegramReferral) {
      return telegramReferral;
    }

    console.log("ℹ️ [referral.js] No referral code found");

    return null;
  } catch (error) {
    console.error("❌ [referral.js] Error capturing referral:", error);
    return getStoredInviterCode();
  }
}

// ======================================================
// GET STORED
// ======================================================

export function getStoredInviterCode() {
  try {
    return localStorage.getItem(INVITER_CODE_KEY);
  } catch (error) {
    console.error("❌ [referral.js] Error getting stored referral:", error);
    return null;
  }
}

// ======================================================
// ALIAS
// ======================================================

export function getInviterCode() {
  return getStoredInviterCode();
}

// ======================================================
// CLEAR
// ======================================================

export function clearInviterCode() {
  try {
    localStorage.removeItem(INVITER_CODE_KEY);
    console.log("🗑️ [referral.js] Inviter code cleared");
  } catch (error) {
    console.error("❌ [referral.js] Error clearing referral:", error);
  }
}

// ======================================================
// EXISTS
// ======================================================

export function hasInviterCode() {
  return Boolean(getStoredInviterCode());
}

// ======================================================
// VALIDATE
// ======================================================

export function validateAndGetInviterCode() {
  const code = getStoredInviterCode();

  if (code && code.length >= 1 && code.length <= 64) {
    return code;
  }

  if (code) {
    console.warn("⚠️ [referral.js] Invalid referral code:", code);
  }

  return null;
}

// ======================================================
// FORCE SET
// ======================================================

export function setInviterCode(code) {
  const cleanCode = cleanReferralCode(code);

  if (!cleanCode) {
    console.warn("⚠️ [referral.js] Cannot set empty referral code");
    return null;
  }

  return saveReferralCode(cleanCode);
}

// ======================================================
// GENERATE REFERRAL LINK
// ======================================================

export function generateReferralLink(referralCode, baseUrl) {
  if (!referralCode) return null;

  const url = baseUrl || (typeof window !== "undefined" ? window.location.origin : "");

  if (!url) return null;

  return `${url}?ref=${encodeURIComponent(referralCode)}`;
}

// ======================================================
// SAVE REFERRAL DATA (اطلاعات اضافی)
// ======================================================

export function saveReferralData(data) {
  try {
    localStorage.setItem(REFERRAL_DATA_KEY, JSON.stringify(data));
    return data;
  } catch {
    return null;
  }
}

export function getReferralData() {
  try {
    const raw = localStorage.getItem(REFERRAL_DATA_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearReferralData() {
  try {
    localStorage.removeItem(REFERRAL_DATA_KEY);
  } catch {
    // ignore
  }
}