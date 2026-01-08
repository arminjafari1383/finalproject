import { useEffect, useMemo, useState } from "react";
import { useTonWallet, TonConnectButton } from "@tonconnect/ui-react";
import { api } from "../api";
import "./Wallet.css";

export default function Wallet() {
  const tonWallet = useTonWallet();
  const address = useMemo(() => tonWallet?.account?.address, [tonWallet]);
  const [wallet, setWallet] = useState(null);

  // modal states
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [withdrawError, setWithdrawError] = useState("");
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  // 1) ذخیره ref از لینک (اگر وجود داشت)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) localStorage.setItem("inviter_code", ref);
  }, []);

  // 2) وقتی address آمد: connect را بزن (با inviter_code اگر وجود داشت) + سپس wallet را بگیر
  useEffect(() => {
    if (!address) {
      setWallet(null);
      return;
    }

    let cancelled = false;

    async function connectAndLoadWallet() {
      try {
        const inviter_code = localStorage.getItem("inviter_code"); // ممکن است null باشد

        // ✅ اینجا زیرمجموعه ثبت می‌شود
        await api.post("/connect/", {
          wallet_address: address,
          inviter_code: inviter_code || null,
        });

        // اگر می‌خواهی فقط یکبار اعمال شود:
        // localStorage.removeItem("inviter_code");

        const r = await api.get(`/wallet/${address}/`);
        if (!cancelled) setWallet(r.data);
      } catch (e) {
        // اگر connect خطا بدهد هم بهتر است wallet را بگیریم
        try {
          const r = await api.get(`/wallet/${address}/`);
          if (!cancelled) setWallet(r.data);
        } catch {}
      }
    }

    connectAndLoadWallet();

    return () => {
      cancelled = true;
    };
  }, [address]);

  const openWithdraw = () => {
    setWithdrawError("");
    setAmount("");
    setIsWithdrawOpen(true);
  };

  const closeWithdraw = () => {
    if (isWithdrawing) return;
    setIsWithdrawOpen(false);
  };

  const onWithdraw = async () => {
    setWithdrawError("");

    const n = Number(amount);
    if (!Number.isFinite(n)) {
      setWithdrawError("مقدار نامعتبر است");
      return;
    }
    if (n < 60) {
      setWithdrawError("زیر 60 عدد مجاز نیست");
      return;
    }
    if (!address) {
      setWithdrawError("ابتدا کیف پول را متصل کنید");
      return;
    }

    try {
      setIsWithdrawing(true);

      // ⚠️ مسیر درست شما: /withdraw/request/
      // و پارامترهای درست: wallet_address, scope, destination_wallet, amount
      const res = await api.post(`/withdraw/request/`, {
        wallet_address: address,
        scope: "ALL_WITHDRAWABLE",
        destination_wallet: address, // یا یک input جدا برای مقصد بگذار
        amount: n,
      });

      // refresh wallet
      const r = await api.get(`/wallet/${address}/`);
      setWallet(r.data);

      setIsWithdrawOpen(false);
    } catch (e) {
      setWithdrawError(
        e?.response?.data?.error || e?.response?.data?.detail || "خطا در برداشت"
      );
    } finally {
      setIsWithdrawing(false);
    }
  };

  return (
    <div className="wallet-page-container">
      <div className="wallet-box">
        <h2>connect wallet</h2>
        <TonConnectButton />

        {address && (
          <>
            {!wallet ? (
              <div>در حال بارگذاری...</div>
            ) : (
              <>
                <h3>TotalBalance</h3>
                <div>{wallet.withdrawable_total}</div>

                <button className="withdraw-btn" onClick={openWithdraw}>
                  Withdraw
                </button>
              </>
            )}
          </>
        )}
      </div>

      {isWithdrawOpen && (
        <div className="modal-backdrop" onClick={closeWithdraw}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>برداشت ECG</h3>
              <button className="modal-close" onClick={closeWithdraw}>
                ×
              </button>
            </div>

            <div className="modal-body">
              <label>مقدار برداشت (ECG)</label>
              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="مثلا 60"
                min="0"
              />

              {withdrawError && (
                <div className="error-text">{withdrawError}</div>
              )}
            </div>

            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={closeWithdraw}
                disabled={isWithdrawing}
              >
                انصراف
              </button>
              <button
                className="btn-primary"
                onClick={onWithdraw}
                disabled={isWithdrawing}
              >
                {isWithdrawing ? "در حال ارسال..." : "تایید برداشت"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}