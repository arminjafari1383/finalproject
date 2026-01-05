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

  useEffect(() => {
    if (!address) {
      setWallet(null);
      return;
    }
    api.get(`/wallet/${address}/`).then((r) => setWallet(r.data));
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

    // شرط شما: کمتر از 60 پیام بده
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

      // این API باید در بک‌اند شما پیاده‌سازی شود
      // بک‌اند با کیف پول شما (Sender) امضا می‌کند و به address کاربر می‌فرستد
      const res = await api.post(`/withdraw/`, {
        to_address: address,   // آدرس کاربر
        amount: n,             // مقدار ECG
      });

      // می‌توانید tx hash / boc / ... را از بک‌اند بگیرید
      // مثلا:
      // res.data = { ok: true, tx_hash: "..." }

      // رفرش اطلاعات کیف پول کاربر
      const r = await api.get(`/wallet/${address}/`);
      setWallet(r.data);

      setIsWithdrawOpen(false);
    } catch (e) {
      setWithdrawError(
        e?.response?.data?.detail || "خطا در برداشت. دوباره تلاش کنید."
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

      {/* Modal */}
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