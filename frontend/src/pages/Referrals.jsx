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

  // Tell Telegram WebApp we're ready (helps in some clients)
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg?.ready) tg.ready();
  }, []);

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

  // IMPORTANT: use https origin if possible
  const referralLink = myCode ? `${window.location.origin}/?ref=${myCode}` : "";

  function shareReferralLink() {
    if (!referralLink) return;

    // Keep the text simple (some Telegram clients are picky with newlines/long text)
    const text = `Join with my referral link: ${referralLink}`;

    // Telegram share URL
    const shareUrl =
      `https://t.me/share/url?` +
      `url=${encodeURIComponent(referralLink)}` +
      `&text=${encodeURIComponent(text)}`;

    const tg = window.Telegram?.WebApp;

    // ✅ Inside Telegram Mini App
    if (tg) {
      // 1) Best option for Telegram internal links
      if (typeof tg.openTelegramLink === "function") {
        try {
          tg.openTelegramLink(shareUrl);
          return;
        } catch (err) {
          // continue to fallback
        }
      }

      // 2) Fallback: openLink works in more clients
      if (typeof tg.openLink === "function") {
        try {
          tg.openLink(shareUrl);
          return;
        } catch (err) {
          // continue to fallback
        }
      }

      // 3) Last fallback inside Telegram
      window.location.href = shareUrl;
      return;
    }

    // ✅ Outside Telegram: Web Share API
    if (navigator.share) {
      navigator.share({ title: "Referral Link", text, url: referralLink }).catch(() => {});
      return;
    }

    // ✅ Final fallback: copy to clipboard
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(referralLink);
      alert("Link copied successfully.");
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
