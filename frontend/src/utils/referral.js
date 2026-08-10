// frontend/src/utils/referral.js

const INVITER_CODE_KEY = "inviter_code";

/**
 * Capture referral code from:
 *
 * 1. Website:
 *    https://aipolynet.com/?ref=ABC123
 *
 * 2. Telegram Mini App:
 *    https://t.me/aipolynetbot/app?startapp=ref_ABC123
 *
 * Result:
 *    ABC123
 */
export function captureInviterCode() {
  try {
    // ==========================================
    // 1) Website Query Parameter
    // ==========================================

    const url = new URL(
      window.location.href
    );

    const ref =
      url.searchParams.get("ref");

    if (ref) {
      const cleanRef =
        ref.trim();

      if (cleanRef) {
        localStorage.setItem(
          INVITER_CODE_KEY,
          cleanRef
        );

        console.log(
          "✅ Referral captured from URL:",
          cleanRef
        );

        return cleanRef;
      }
    }

    // ==========================================
    // 2) Telegram Mini App
    // ==========================================

    const tg =
      window.Telegram?.WebApp;

    if (tg) {
      // Tell Telegram that the Mini App is ready
      tg.ready();

      const startParam =
        tg.initDataUnsafe?.start_param ||
        null;

      console.log(
        "📱 Telegram start_param:",
        startParam
      );

      if (startParam) {
        let referralCode = startParam;

        // ------------------------------------------
        // If Telegram sends:
        // ref_ABC123
        //
        // save only:
        // ABC123
        // ------------------------------------------

        if (
          referralCode.startsWith("ref_")
        ) {
          referralCode =
            referralCode.substring(4);
        }

        referralCode =
          referralCode.trim();

        if (referralCode) {
          localStorage.setItem(
            INVITER_CODE_KEY,
            referralCode
          );

          console.log(
            "✅ Referral captured from Telegram:",
            referralCode
          );

          return referralCode;
        }
      }
    }

    // ==========================================
    // 3) Existing Saved Referral
    // ==========================================

    const storedReferral =
      localStorage.getItem(
        INVITER_CODE_KEY
      );

    if (storedReferral) {
      console.log(
        "📂 Using stored referral:",
        storedReferral
      );

      return storedReferral;
    }

    // ==========================================
    // No Referral
    // ==========================================

    console.log(
      "ℹ️ No referral code found"
    );

    return null;
  } catch (error) {
    console.error(
      "❌ Error capturing referral:",
      error
    );

    // Never delete an existing referral
    try {
      return localStorage.getItem(
        INVITER_CODE_KEY
      );
    } catch (storageError) {
      console.error(
        "❌ LocalStorage error:",
        storageError
      );

      return null;
    }
  }
}

/**
 * Get stored referral code
 */
export function getStoredInviterCode() {
  try {
    return localStorage.getItem(
      INVITER_CODE_KEY
    );
  } catch (error) {
    console.error(
      "❌ Error getting stored referral:",
      error
    );

    return null;
  }
}

/**
 * Alias
 *
 * اگر در فایل‌های دیگر پروژه از
 * getInviterCode()
 * استفاده کرده‌ای، این هم کار می‌کند.
 */
export function getInviterCode() {
  return getStoredInviterCode();
}

/**
 * Clear referral code
 *
 * فقط برای تست یا reset کردن referral استفاده کن.
 */
export function clearInviterCode() {
  try {
    localStorage.removeItem(
      INVITER_CODE_KEY
    );

    console.log(
      "🗑️ Inviter code cleared"
    );
  } catch (error) {
    console.error(
      "❌ Error clearing inviter code:",
      error
    );
  }
}

