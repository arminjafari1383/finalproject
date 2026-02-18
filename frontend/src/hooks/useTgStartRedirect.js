import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

export default function useTgStartRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    const startParam = tg.initDataUnsafe?.start_param || null;

    // ✅ اگر کاربر با لینک رفرال اومده
    if (startParam) {
      // کد رفرال رو ذخیره کن
      localStorage.setItem("inviter_code", startParam);

      // اگر الان روی Wallet نیست، بفرستش Wallet
      if (location.pathname !== "/") {
        navigate("/", { replace: true });
      }
    }
  }, [navigate, location.pathname]);
}
