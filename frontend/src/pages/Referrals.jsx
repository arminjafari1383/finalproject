import { useEffect, useMemo, useState } from "react";
import { useTonWallet } from "@tonconnect/ui-react";
import { api } from "../api";
import "./Referrals.css";

import { useLocation, useNavigate } from "react-router-dom";

export default function Referrals() {
  const tonWallet = useTonWallet();
  const address = useMemo(() => tonWallet?.account?.address, [tonWallet]);

  const [myCode, setMyCode] = useState(null);
  const [refCount, setRefCount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const BOT_USERNAME = "Aipolifybot";

  const navigate = useNavigate();
  const location = useLocation();

  // Telegram ready
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }
  }, []);

  // ✅ وقتی از deep link میاد: برو /referrals و ref رو ذخیره کن
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    const startParam = tg?.initDataUnsafe?.start_param || "";
    if (!startParam) return;

    // startParam format: "p=referrals&ref=CODE"
    const params = new URLSearchParams(startParam);
    const page = params.get("p");
    const ref = params.get("ref");

    if (ref) localStorage.setItem("inviter_code", ref);

    // ✅ مقصد: /referrals
    if (page === "referrals" && location.pathname !== "/referrals") {
      navigate("/referrals", { replace: true });
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

        // inviter_code from localStorage (saved from deep link)
        const inviterCode = localStorage.getItem("inviter_code") || null;

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

  // ✅ لینک رفرال: مستقیم MiniApp رو باز کنه و مقصدش /referrals باشه
  // چون shortname نداری: https://t.me/BOT?startapp=...
  const referralLink = myCode
    ? `https://t.me/${BOT_USERNAME}?startapp=${encodeURIComponent(
        `p=referrals&ref=${myCode}`
      )}`
    : "";

  function shareReferralLink() {
    if (!referralLink) return;

    const tg = window.Telegram?.WebApp;
    const text = "Join via my referral link";

    const shareUrl =
      `https://t.me/share/url?` +
      `url=${encodeURIComponent(referralLink)}` +
      `&text=${encodeURIComponent(text)}`;

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

    if (navigator.share) {
      navigator.share({ title: "Referral Link", text, url: referralLink }).catch(() => {});
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
