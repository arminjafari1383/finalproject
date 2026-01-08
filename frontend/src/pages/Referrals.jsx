import { useEffect, useMemo, useState } from "react";
import { useTonWallet } from "@tonconnect/ui-react";
import { api } from "../api";
import "./Referrals.css";

export default function Referrals() {
  const tonWallet = useTonWallet();
  const address = useMemo(() => tonWallet?.account?.address, [tonWallet]);

  const [myCode, setMyCode] = useState(null);

  const [refCount, setRefCount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // وقتی ولت وصل شد: اتوماتیک کد رفرال و تعداد زیرمجموعه‌ها را بگیر
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

        const urlParams = new URLSearchParams(window.location.search);
        const inviterFromLink = urlParams.get("ref") || null;

        // گرفتن/ساخت یوزر و کد رفرال (اتوماتیک)
        const res = await api.post("/connect/", {
          wallet_address: address,
          inviter_code: inviterFromLink,
        });

        if (cancelled) return;

        const code = res.data?.user?.referral_code;
        setMyCode(code);

        // گرفتن تعداد زیرمجموعه‌ها
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
            "خطا در دریافت اطلاعات رفرال"
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

  const referralLink = myCode
    ? `${window.location.origin}/?ref=${myCode}`
    : "";

  function shareReferralLink() {
    if (!referralLink) return;

    const text = `لینک دعوت من:\n${referralLink}`;

    // داخل تلگرام (Telegram WebApp)
    const tg = window.Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      const url =
        "https://t.me/share/url?" +
        `url=${encodeURIComponent(referralLink)}` +
        `&text=${encodeURIComponent(text)}`;

      tg.openTelegramLink(url);
      return;
    }

    // خارج تلگرام: Web Share (روی موبایل/برخی مرورگرها)
    if (navigator.share) {
      navigator
        .share({ title: "Referral Link", text, url: referralLink })
        .catch(() => {});
      return;
    }

    // fallback نهایی: کپی در کلیپ‌بورد
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(referralLink);
      alert("لینک کپی شد");
    }
  }

  function copyReferralLink() {
    if (!referralLink) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(referralLink);
      alert("لینک کپی شد");
    }
  }

  if (!address) return <div>ابتدا ولت را وصل کنید.</div>;

  return (
    <div>
      <h2 className="ref-title">Referral Dashboard</h2>

      {loading && <div>در حال بارگذاری...</div>}
      {error && <div style={{ color: "red" }}>{error}</div>}

      {myCode && (
        <>
        <p className="referral-link"> 🔗 invite link</p>
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <input value={referralLink} readOnly className="linkreferral" />
            <button onClick={shareReferralLink} disabled={!referralLink} className="copy-button">
             Telegram
            </button>
            <button onClick={copyReferralLink} disabled={!referralLink} className="copy-button1">
             📋 copy
            </button>
          </div>

          <div className="wallet-box1">
            {refCount === null ? (
              <div>در حال دریافت تعداد زیرمجموعه‌ها...</div>
            ) : (
              <div>Number of people invited: {refCount}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}