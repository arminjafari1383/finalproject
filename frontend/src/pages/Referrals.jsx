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

  /* ---------------- Telegram Ready ---------------- */
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }
  }, []);

  /* -------- Capture inviter code once (from ?ref or start_param) -------- */
  useEffect(() => {
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

  /* ---------------- Referral link (WEBSITE ONLY) ---------------- */
  const referralLink = myCode
    ? `${SITE_URL}/?ref=${encodeURIComponent(myCode)}`
    : "";

  /* ---------------- Open website link (NO Telegram share url) ---------------- */
  function openReferralLink() {
    if (!referralLink) return;

    // اگر داخل تلگرام باشیم، لینک وب را داخل تلگرام باز می‌کند
    const tg = window.Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(referralLink);
    } else {
      // خارج از تلگرام
      window.open(referralLink, "_blank");
    }
  }

  function copyReferralLink() {
    if (!referralLink) return;
    navigator.clipboard?.writeText(referralLink);
    alert("Website referral link copied");
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
          <p className="referral-link">🔗 Website Invite Link</p>

          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <input value={referralLink} readOnly className="linkreferral" />

            <button
              onClick={openReferralLink}
              disabled={!referralLink}
              className="copy-button"
            >
              Open Link
            </button>

            <button
              onClick={copyReferralLink}
              disabled={!referralLink}
              className="copy-button1"
            >
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

          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.8 }}>
            This link is a <b>website</b> link. Your friend can open it and then
            press <b>OPEN APP</b> in Telegram.
          </div>
        </>
      )}
    </div>
  );
}
