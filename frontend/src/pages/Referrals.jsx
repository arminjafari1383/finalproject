import { useEffect, useMemo, useState } from "react";
import { useTonWallet } from "@tonconnect/ui-react";
import { api } from "../api";
import "./Referrals.css";

// ✅ اگر React Router داری، این دو خط رو نگه دار
import { useLocation, useNavigate } from "react-router-dom";

export default function Referrals() {
  const tonWallet = useTonWallet();
  const address = useMemo(() => tonWallet?.account?.address, [tonWallet]);

  const [myCode, setMyCode] = useState(null);
  const [refCount, setRefCount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const BOT_USERNAME = "Aipolifybot";
  const MINIAPP_NAME = "openapp";

  // ✅ اگر Router داری
  const navigate = useNavigate();
  const location = useLocation();

  // Tell Telegram Mini App we are ready
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }
  }, []);

  // ✅ وقتی MiniApp با لینک referral باز شد -> مستقیم برو صفحه /ref
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    const startParam = tg?.initDataUnsafe?.start_param || "";

    // payload ما: ref_<code>
    if (startParam.startsWith("ref_")) {
      const code = startParam.slice(4);
      localStorage.setItem("inviter_code", code);

      // اگر الان توی /ref نیستیم، هدایت کنیم
      if (location.pathname !== "/ref") {
        navigate("/ref", { replace: true });
      }
    }
  }, [navigate, location.pathname]);

  // Auto connect & fetch referral data
  useEffect(() => {
    if (!address) {
      setMyCode(null);
      setRefCount(null);
      setError("");
      return;
    }

    let cancelled = false;

    async function autoRegisterAndFetch() {
      try {
        setLoading(true);
        setError("");

        const tg = window.Telegram?.WebApp;
        const startParam = tg?.initDataUnsafe?.start_param || "";

        // ✅ inviter_code فقط اگر payload referral بود
        let inviterCode = null;

        if (startParam.startsWith("ref_")) {
          inviterCode = startParam.slice(4);
        } else {
          // fallback اگر از قبل ذخیره شده بود
          inviterCode = localStorage.getItem("inviter_code") || null;
        }

        const res = await api.post("/connect/", {
          wallet_address: address,
          inviter_code: inviterCode,
        });

        if (cancelled) return;

        const code = res.data?.user?.referral_code;
        setMyCode(code);

        const countRes = await api.get(`/referrals/count/`, {
          params: { wallet_address: address },
        });

        if (cancelled) return;
        setRefCount(countRes.data.count);
      } catch (e) {
        if (cancelled) return;
        setError(
          e?.response?.data?.error ||
            e?.response?.data?.detail ||
            "Failed to fetch referral information."
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    autoRegisterAndFetch();

    return () => {
      cancelled = true;
    };
  }, [address]);

  // ✅ لینک درست Mini App که مستقیم referral رو باز می‌کنه
  // startapp=ref_<MYCODE>
  const referralLink = myCode
    ? `https://t.me/${BOT_USERNAME}/${MINIAPP_NAME}?startapp=${encodeURIComponent(
        `ref_${myCode}`
      )}`
    : "";

  function shareReferralLink() {
    if (!referralLink) return;

    const tg = window.Telegram?.WebApp;

    // متن کوتاه (سازگارتر با کلاینت‌ها)
    const text = `Join via my referral link`;

    // صفحه share تلگرام
    const shareUrl =
      `https://t.me/share/url?` +
      `url=${encodeURIComponent(referralLink)}` +
      `&text=${encodeURIComponent(text)}`;

    // داخل تلگرام
    if (tg) {
      try {
        tg.openTelegramLink?.(shareUrl);
        return;
      } catch (e) {}

      try {
        tg.openLink?.(shareUrl);
        return;
      } catch (e) {}

      window.location.href = shareUrl;
      return;
    }

    // خارج از تلگرام
    if (navigator.share) {
      navigator
        .share({ title: "Referral Link", text, url: referralLink })
        .catch(() => {});
    } else {
      window.open(shareUrl, "_blank");
    }
  }

  function copyReferralLink() {
    if (!referralLink) return;

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(referralLink);
      alert("Link copied successfully.");
    }
  }

  if (!address) return <div>Please connect your wallet first.</div>;

  return (
    <div>
      <h2 className="ref-title">Referral Dashboard</h2>

      {loading && <div>Loading...</div>}
      {error && <div style={{ color: "red" }}>{error}</div>}

      {myCode && (
        <>
          <p className="referral-link">🔗 Invite Link</p>

          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <input value={referralLink} readOnly className="linkreferral" />

            <button
              onClick={shareReferralLink}
              disabled={!referralLink}
              className="copy-button"
            >
              Share
            </button>

            <button
              onClick={copyReferralLink}
              disabled={!referralLink}
              className="copy-button1"
            >
              📋 Copy
            </button>
          </div>

          <div className="wallet-box1">
            {refCount === null ? (
              <div>Loading referral count...</div>
            ) : (
              <div>Number of people invited: {refCount}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
