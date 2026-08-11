// frontend/src/utils/referral.js

const INVITER_CODE_KEY = "inviter_code";

/**
 * Capture referral code from:
 *
 * 1. Website:
 *    https://aipolynet.com/?ref=ABC123
 *
 * 2. Website (Telegram WebApp):
 *    https://aipolynet.com/?tgWebAppStartParam=ref_ABC123
 *
 * 3. Telegram Mini App:
 *    https://t.me/aipolynetbot/app?startapp=ref_ABC123
 *
 * Result:
 *    ABC123
 */
export function captureInviterCode() {
  try {
    console.log('🔍 [referral.js] captureInviterCode called');
    console.log('🔍 [referral.js] URL:', window.location.href);
    console.log('🔍 [referral.js] Search:', window.location.search);
    
    // ==========================================
    // 1) Website Query Parameters
    // ==========================================

    const url = new URL(window.location.href);
    
    // ✅ چک کردن همه پارامترهای ممکن
    const possibleParams = ['ref', 'startapp', 'tgWebAppStartParam', 'start_param'];
    let ref = null;
    
    for (const param of possibleParams) {
      const value = url.searchParams.get(param);
      if (value) {
        console.log(`🔍 [referral.js] Found param "${param}":`, value);
        ref = value;
        break;
      }
    }
    
    // اگر پارامتری پیدا نشد، همه پارامترها رو چک کن
    if (!ref) {
      console.log('🔍 [referral.js] Checking all URL params:', Object.fromEntries(url.searchParams));
      
      // چک کردن همه پارامترها برای پیدا کردن ref_ یا referral
      for (const [key, value] of url.searchParams) {
        if (value && (value.startsWith('ref_') || key.includes('ref'))) {
          console.log(`🔍 [referral.js] Found potential referral in "${key}":`, value);
          ref = value;
          break;
        }
      }
    }

    if (ref) {
      let cleanRef = ref.trim();
      
      // اگر با ref_ شروع شد، جدا کن
      if (cleanRef.startsWith('ref_')) {
        cleanRef = cleanRef.substring(4);
      }
      
      // اگر با r_ شروع شد (حالت دیگه)
      if (cleanRef.startsWith('r_')) {
        cleanRef = cleanRef.substring(2);
      }

      if (cleanRef) {
        localStorage.setItem(INVITER_CODE_KEY, cleanRef);
        console.log("✅ Referral captured from URL:", cleanRef);
        return cleanRef;
      }
    }

    // ==========================================
    // 2) Telegram Mini App
    // ==========================================

    const tg = window.Telegram?.WebApp;

    if (tg) {
      tg.ready();
      const startParam = tg.initDataUnsafe?.start_param || null;
      console.log("📱 Telegram start_param:", startParam);

      if (startParam) {
        let referralCode = startParam;

        if (referralCode.startsWith("ref_")) {
          referralCode = referralCode.substring(4);
        }
        
        if (referralCode.startsWith("r_")) {
          referralCode = referralCode.substring(2);
        }

        referralCode = referralCode.trim();

        if (referralCode) {
          localStorage.setItem(INVITER_CODE_KEY, referralCode);
          console.log("✅ Referral captured from Telegram:", referralCode);
          return referralCode;
        }
      }
    }

    // ==========================================
    // 3) Existing Saved Referral
    // ==========================================

    const storedReferral = localStorage.getItem(INVITER_CODE_KEY);

    if (storedReferral) {
      console.log("📂 Using stored referral:", storedReferral);
      return storedReferral;
    }

    // ==========================================
    // 4) Check URL hash (some apps use hash)
    // ==========================================
    
    const hash = window.location.hash;
    if (hash) {
      console.log("🔍 Checking URL hash:", hash);
      const hashParams = new URLSearchParams(hash.replace('#', '?'));
      const hashRef = hashParams.get('ref');
      if (hashRef) {
        let cleanRef = hashRef.trim();
        if (cleanRef.startsWith('ref_')) {
          cleanRef = cleanRef.substring(4);
        }
        if (cleanRef) {
          localStorage.setItem(INVITER_CODE_KEY, cleanRef);
          console.log("✅ Referral captured from hash:", cleanRef);
          return cleanRef;
        }
      }
    }

    // ==========================================
    // No Referral
    // ==========================================

    console.log("ℹ️ No referral code found");
    return null;
    
  } catch (error) {
    console.error("❌ Error capturing referral:", error);
    try {
      return localStorage.getItem(INVITER_CODE_KEY);
    } catch (storageError) {
      console.error("❌ LocalStorage error:", storageError);
      return null;
    }
  }
}

/**
 * Get stored referral code
 */
export function getStoredInviterCode() {
  try {
    return localStorage.getItem(INVITER_CODE_KEY);
  } catch (error) {
    console.error("❌ Error getting stored referral:", error);
    return null;
  }
}

/**
 * Alias
 */
export function getInviterCode() {
  return getStoredInviterCode();
}

/**
 * Clear referral code
 */
export function clearInviterCode() {
  try {
    localStorage.removeItem(INVITER_CODE_KEY);
    console.log("🗑️ Inviter code cleared");
  } catch (error) {
    console.error("❌ Error clearing inviter code:", error);
  }
}