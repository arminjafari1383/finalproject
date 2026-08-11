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
 * 4. Any parameter with ref_ or referral
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
    
    // ✅ همه پارامترهای ممکن برای رفرال
    const possibleParams = [
      'ref',           // normal ref
      'startapp',      // Telegram Mini App
      'tgWebAppStartParam',  // Telegram WebApp
      'start_param',   // another Telegram format
      'referral',      // generic
      'referral_code', // generic
      'code',          // generic
      'inviter',       // inviter code
      'invite',        // invite code
      'share'          // share code
    ];
    
    let ref = null;
    let foundParam = null;
    
    // 1. چک کردن پارامترهای خاص
    for (const param of possibleParams) {
      const value = url.searchParams.get(param);
      if (value && value.trim()) {
        console.log(`🔍 [referral.js] Found param "${param}":`, value);
        ref = value;
        foundParam = param;
        break;
      }
    }
    
    // 2. اگر پیدا نشد، همه پارامترها رو چک کن
    if (!ref) {
      console.log('🔍 [referral.js] Checking all URL params:', Object.fromEntries(url.searchParams));
      
      for (const [key, value] of url.searchParams) {
        // چک کردن هر مقدار که با ref_ یا r_ شروع میشه
        if (value && (value.startsWith('ref_') || value.startsWith('r_') || value.startsWith('invite_'))) {
          console.log(`🔍 [referral.js] Found potential referral in "${key}":`, value);
          ref = value;
          foundParam = key;
          break;
        }
        // چک کردن کلیدهایی که شامل ref یا invite هستن
        if (key && (key.toLowerCase().includes('ref') || 
                    key.toLowerCase().includes('invite') || 
                    key.toLowerCase().includes('referral') ||
                    key.toLowerCase().includes('share'))) {
          console.log(`🔍 [referral.js] Found referral key "${key}":`, value);
          ref = value;
          foundParam = key;
          break;
        }
      }
    }

    // 3. پاکسازی و استخراج کد
    if (ref) {
      let cleanRef = ref.trim();
      
      // حذف پیشوندهای مختلف
      if (cleanRef.startsWith('ref_')) {
        cleanRef = cleanRef.substring(4);
      }
      if (cleanRef.startsWith('r_')) {
        cleanRef = cleanRef.substring(2);
      }
      if (cleanRef.startsWith('invite_')) {
        cleanRef = cleanRef.substring(7);
      }
      if (cleanRef.startsWith('inv_')) {
        cleanRef = cleanRef.substring(4);
      }
      
      // فقط حروف و اعداد رو نگه دار
      cleanRef = cleanRef.replace(/[^a-zA-Z0-9]/g, '');

      if (cleanRef && cleanRef.length > 0) {
        localStorage.setItem(INVITER_CODE_KEY, cleanRef);
        console.log(`✅ [referral.js] Referral captured from "${foundParam}":`, cleanRef);
        console.log(`💾 [referral.js] Saved to localStorage:`, cleanRef);
        return cleanRef;
      }
    }

    // ==========================================
    // 2) Telegram Mini App
    // ==========================================

    const tg = window.Telegram?.WebApp;
    if (tg) {
      console.log('📱 [referral.js] Telegram WebApp detected');
      tg.ready();
      
      const startParam = tg.initDataUnsafe?.start_param || null;
      console.log("📱 [referral.js] Telegram start_param:", startParam);

      if (startParam) {
        let referralCode = startParam;
        
        // حذف پیشوندها
        if (referralCode.startsWith("ref_")) {
          referralCode = referralCode.substring(4);
        }
        if (referralCode.startsWith("r_")) {
          referralCode = referralCode.substring(2);
        }
        if (referralCode.startsWith("invite_")) {
          referralCode = referralCode.substring(7);
        }
        
        referralCode = referralCode.trim().replace(/[^a-zA-Z0-9]/g, '');

        if (referralCode && referralCode.length > 0) {
          localStorage.setItem(INVITER_CODE_KEY, referralCode);
          console.log("✅ [referral.js] Referral captured from Telegram:", referralCode);
          console.log(`💾 [referral.js] Saved to localStorage:`, referralCode);
          return referralCode;
        }
      }
    }

    // ==========================================
    // 3) Existing Saved Referral
    // ==========================================

    const storedReferral = localStorage.getItem(INVITER_CODE_KEY);
    if (storedReferral) {
      console.log("📂 [referral.js] Using stored referral:", storedReferral);
      return storedReferral;
    }

    // ==========================================
    // 4) Check URL hash
    // ==========================================
    
    const hash = window.location.hash;
    if (hash) {
      console.log("🔍 [referral.js] Checking URL hash:", hash);
      const hashParams = new URLSearchParams(hash.replace('#', '?'));
      
      // چک کردن همه پارامترهای ممکن در هش
      for (const param of possibleParams) {
        const hashRef = hashParams.get(param);
        if (hashRef) {
          let cleanRef = hashRef.trim();
          if (cleanRef.startsWith('ref_')) {
            cleanRef = cleanRef.substring(4);
          }
          if (cleanRef.startsWith('r_')) {
            cleanRef = cleanRef.substring(2);
          }
          cleanRef = cleanRef.replace(/[^a-zA-Z0-9]/g, '');
          if (cleanRef && cleanRef.length > 0) {
            localStorage.setItem(INVITER_CODE_KEY, cleanRef);
            console.log("✅ [referral.js] Referral captured from hash:", cleanRef);
            console.log(`💾 [referral.js] Saved to localStorage:`, cleanRef);
            return cleanRef;
          }
        }
      }
    }

    // ==========================================
    // 5) Check window.name (some apps use this)
    // ==========================================
    
    try {
      const windowName = window.name;
      if (windowName && (windowName.startsWith('ref_') || windowName.includes('ref_'))) {
        let cleanRef = windowName;
        if (cleanRef.startsWith('ref_')) {
          cleanRef = cleanRef.substring(4);
        }
        cleanRef = cleanRef.replace(/[^a-zA-Z0-9]/g, '');
        if (cleanRef && cleanRef.length > 0) {
          localStorage.setItem(INVITER_CODE_KEY, cleanRef);
          console.log("✅ [referral.js] Referral captured from window.name:", cleanRef);
          console.log(`💾 [referral.js] Saved to localStorage:`, cleanRef);
          return cleanRef;
        }
      }
    } catch (e) {
      // ignore
    }

    // ==========================================
    // No Referral
    // ==========================================

    console.log("ℹ️ [referral.js] No referral code found");
    return null;
    
  } catch (error) {
    console.error("❌ [referral.js] Error capturing referral:", error);
    try {
      return localStorage.getItem(INVITER_CODE_KEY);
    } catch (storageError) {
      console.error("❌ [referral.js] LocalStorage error:", storageError);
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
    console.error("❌ [referral.js] Error getting stored referral:", error);
    return null;
  }
}

/**
 * Alias for getStoredInviterCode
 */
export function getInviterCode() {
  return getStoredInviterCode();
}

/**
 * Clear referral code from localStorage
 */
export function clearInviterCode() {
  try {
    localStorage.removeItem(INVITER_CODE_KEY);
    console.log("🗑️ [referral.js] Inviter code cleared");
  } catch (error) {
    console.error("❌ [referral.js] Error clearing inviter code:", error);
  }
}

/**
 * Check if a referral code exists
 */
export function hasInviterCode() {
  return !!getInviterCode();
}

/**
 * Get referral code with validation
 */
export function validateAndGetInviterCode() {
  const code = getInviterCode();
  if (code && code.length >= 8 && code.length <= 20) {
    return code;
  }
  console.warn("⚠️ [referral.js] Invalid referral code format:", code);
  return null;
}

/**
 * Force set referral code (for testing)
 */
export function setInviterCode(code) {
  if (code && code.trim()) {
    const cleanCode = code.trim().replace(/[^a-zA-Z0-9]/g, '');
    if (cleanCode) {
      localStorage.setItem(INVITER_CODE_KEY, cleanCode);
      console.log("🔧 [referral.js] Force set inviter code:", cleanCode);
      return cleanCode;
    }
  }
  return null;
}