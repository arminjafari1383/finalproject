export function captureInviterCode() {
  const tg = window.Telegram?.WebApp;
  const startParam = tg?.initDataUnsafe?.start_param || null;

  // اگر start_param هست، همون رو ذخیره کن (حتی اگر قبلاً چیزی بوده)
  if (startParam) {
    localStorage.setItem("inviter_code", startParam);
    return startParam;
  }

  // وب: ?ref=
  const urlParams = new URLSearchParams(window.location.search);
  const ref = urlParams.get("ref") || null;
  if (ref) {
    localStorage.setItem("inviter_code", ref);
    return ref;
  }

  // در غیر اینصورت همون قبلی
  return localStorage.getItem("inviter_code");
}
