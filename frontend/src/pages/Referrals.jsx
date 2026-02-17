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

  // Tell Telegram Mini App we are ready
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }
  }, []);

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

        const urlParams = new URLSearchParams(window.location.search);
        const inviterFromLink = urlParams.get("ref") || null;

        const res = await api.post("/connect/", {
          wallet_address: address,
          inviter_code: inviterFromLink,
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

  // 👇 بهترین لینک برای تلگرام (مستقیم به ربات با start)
  const referralLink = myCode
    ? `https://t.me/@pooooooooooobot?start=${myCode}`
    : "";

  function shareReferralLink() {
    if (!referralLink) return;

    const tg = window.Telegram?.WebApp;

    const text = `Join with my referral link: ${referralLink}`;

    const shareUrl =
      `https://t.me/share/url?` +
      `url=${encodeURIComponent(referralLink)}` +
      `&text=${encodeURIComponent(text)}`;

    // ✅ داخل تلگرام
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

    // ✅ خارج از تلگرام
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
