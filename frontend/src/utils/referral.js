export function captureInviterCode() {
  const tg = window.Telegram?.WebApp;

  // تلگرام: start_param
  const startParam = tg?.initDataUnsafe?.start_param || null;
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

  return localStorage.getItem("inviter_code");
}
