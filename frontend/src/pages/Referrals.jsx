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

  const BOT_USERNAME = "Aipolifybot";
  const APP_NAME = "openapp"; // ✅ short name Mini App

  /* ---------------- Telegram Ready ---------------- */
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }
  }, []);

  /* ----------- Get ref from start_param ------------ */
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    if (localStorage.getItem("inviter_code")) return;

    const raw = tg.initDataUnsafe?.start_param || "";
    if (!raw) return;

    let startParam = raw;
    try {
      startParam = decodeURIComponent(raw);
    } catch (e) {}

    const params = new URLSearchParams(startParam);
    const ref = params.get("ref");

    if (ref) {
      localStorage.setItem("inviter_code", ref);
    }
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

        const inviterCode = localStorage.getItem("inviter_code");

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

        // اگر فقط یک بار باید ثبت شود:
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

  /* ---------------- Correct Mini App Link ---------------- */
  const referralLink = myCode
    ? `https://t.me/${BOT_USERNAME}/${APP_NAME}?startapp=${encodeURIComponent(
        `p=referrals&ref=${myCode}`
      )}`
    : "";

  /* ---------------- Share inside Telegram ---------------- */
  function shareReferralLink() {
    if (!referralLink) return;

    const tg = window.Telegram?.WebApp;

    // بهترین و پایدارترین روش Share
    const text = `🚀 Join me on Aipolify\n\n${referralLink}`;
    const shareUrl = `https://t.me/share/url?text=${encodeURIComponent(text)}`;

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
