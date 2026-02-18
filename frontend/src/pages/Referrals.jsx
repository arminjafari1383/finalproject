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

  const SITE_URL = "https://cryptoocapitalhub.com"; // ✅ دامنه خودت

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }
  }, []);

  // اگر کسی با ?ref وارد وب شد، ذخیره کن
  useEffect(() => {
    captureInviterCode();
  }, []);

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

        // inviter_code ممکنه از وب ذخیره شده باشه
        const inviterCode = localStorage.getItem("inviter_code");

        // connect (برای ساخت user + اگر inviter_code هست اعمالش می‌کنه)
        const res = await api.post("/connect/", {
          wallet_address: address,
          inviter_code: inviterCode || null,
        });

        if (cancelled) return;

        setMyCode(res.data?.user?.referral_code || null);

        const countRes = await api.get("/referrals/count/", {
          params: { wallet_address: address },
        });

        if (cancelled) return;
        setRefCount(countRes.data?.count ?? 0);
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

  // ✅ لینک رفرال نهایی: روی سایت خودت
  const referralLink = myCode ? `${SITE_URL}/?ref=${encodeURIComponent(myCode)}` : "";

  function shareReferralLink() {
    if (!referralLink) return;

    const tg = window.Telegram?.WebApp;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(
      referralLink
    )}&text=${encodeURIComponent("🚀 Join me on Aipolify")}`;

    if (tg?.openTelegramLink) tg.openTelegramLink(shareUrl);
    else window.open(shareUrl, "_blank");
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

            <button onClick={shareReferralLink} className="copy-button">
              Share
            </button>

            <button onClick={copyReferralLink} className="copy-button1">
              📋 Copy
            </button>
          </div>

          <div className="wallet-box1" style={{ marginTop: 12 }}>
            {refCount === null ? (
              <div>Loading referral count...</div>
            ) : (
              <div>Number of people invited: {refCount}</div>
            )}
          </div>

          {/* توضیح کوتاه برای کاربران */}
          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.8 }}>
            If your friend opens this link in Telegram and presses <b>OPEN APP</b>,
            the referral will still work.
          </div>
        </>
      )}
    </div>
  );
}
