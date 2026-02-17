import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export default function useTgStartRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    tg.ready();
    tg.expand();

    const raw = tg.initDataUnsafe?.start_param;
    if (!raw) return;

    let startParam = raw;
    try {
      startParam = decodeURIComponent(raw);
    } catch (e) {}

    // expected: p=referrals&ref=CODE
    const params = new URLSearchParams(startParam);
    const page = params.get("p");
    const ref = params.get("ref");

    if (ref) {
      localStorage.setItem("inviter_code", ref);
    }

    if (page === "referrals" && location.pathname !== "/referrals") {
      navigate("/referrals", { replace: true });
    }
  }, [navigate, location.pathname]);
}
