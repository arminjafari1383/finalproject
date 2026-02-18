import { useEffect, useMemo, useState } from "react";
import { useTonWallet } from "@tonconnect/ui-react";
import { api } from "../api";
import "./Referrals.css";
import { captureInviterCode } from "../utils/referral";

export default function Referrals() {
  const tonWallet = useTonWallet();
  const address = useMemo(() => tonWallet?.account?.address, [tonWallet]);

  const [myCode, setMyCode] = useState(null);
  const [refCount, setRefCount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // بهتره از env بخونی، ولی فعلاً همون ثابت:
  const BOT_USERNAME = "Aipolifybot";

  /* ---------------- Telegram Ready ---------------- */
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }
  }, []);

  /* -------- Capture inviter code once (start_param or ?ref) -------- */
  useEffect(() => {
    // ✅ این تابع هم start_param تلگرام رو می‌گیره هم ?ref وب رو
    // و داخل localStorage ذخیره می‌کنه
    captureInviterCode();
  }, []);

  /* -------- Register user & fetch referrals -------- */
  useEffect(() => {
    if (!address) {
      setMyCode(null);
      setRefCount(null);
      setError("");
      return;
    }

    let cancelled = false;

    async function fetchData() {
      try {
        setLoading(true);
        setError("");

        // ✅ همیشه از یک منبع واحد بخون
        const inviterCode = localStorage.getItem("inviter_code");

        const res = await api.post("/connect/", {
          wallet_address: address,
          inviter_code: inviterCode || null,
        });

        if (cancelled) return;

        const code = res.data?.user?.referral_code || null;
        setMyCode(code);

        const countRes = await api.get("/referrals/count/", {
          params: { wallet_address: address },
        });

        if (cancelled) return;
        setRefCount(countRes.data?.count ?? 0);

        // اگر می‌خوای فقط یک بار اعمال بشه (پیشنهادی):
        // بعد از اینکه connect انجام شد و ثبت شد، پاکش کن
        // localStorage.removeItem("inviter_code");
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

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [address]);

  /* ---------------- Referral link (clean & stable) ---------------- */
  // ✅ ساده‌ترین payload: فقط خود کد رفرال
  // لینک: t.me/BOT?startapp=MYCODE
  const APP_SHORT_NAME = "openapp"; // دقیقا همونی که تو BotFather ست کردی
  const referralLink = myCode
  ? `https://t.me/${BOT_USERNAME}/${APP_SHORT_NAME}?startapp=${encodeURIComponent(myCode)}`
  : "";


  /* ---------------- Share inside Telegram ---------------- */
  function shareReferralLink() {
    if (!referralLink) return;

    const tg = window.Telegram?.WebApp;
    const text = `🚀 Join me on Aipolify\n\n${referralLink}`;

    // ✅ این لینک “به خود تلگرام” می‌گه Share UI رو باز کنه
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(
      referralLink
    )}&text=${encodeURIComponent("🚀 Join me on Aipolify")}`;

    if (tg?.openTelegramLink) {
      tg.openTelegramLink(shareUrl);
    } else {
      window.open(shareUrl, "_blank");
    }
  }

  function copyReferralLink() {
    if (!referralLink) return;
    navigator.clipboard?.writeText(referralLink);
    alert("Link copied successfully");
  }

  if (!address) {
    return <div>Please connect your wallet first.</div>;
  }

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
