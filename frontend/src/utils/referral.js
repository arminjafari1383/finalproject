// frontend/src/utils/referral.js

export function captureInviterCode() {
  // 1) از Query وب بخون: ?ref=xxxx
  try {
    const url = new URL(window.location.href);
    const ref = url.searchParams.get("ref");
    if (ref) {
      localStorage.setItem("inviter_code", ref);
      return ref;
    }
  } catch (e) {}

  // 2) از تلگرام start_param بخون (اگر یک روزی کار کرد)
  const tg = window.Telegram?.WebApp;
  const startParam = tg?.initDataUnsafe?.start_param || null;
  if (startParam) {
    localStorage.setItem("inviter_code", startParam);
    return startParam;
  }

  // 3) اگر هیچکدوم نبود، مقدار ذخیره‌شده رو برگردون (پاک نکن)
  return localStorage.getItem("inviter_code");
}

export function getStoredInviterCode() {
  return localStorage.getItem("inviter_code");
}

export function clearInviterCode() {
  localStorage.removeItem("inviter_code");
}
