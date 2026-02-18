import { useEffect, useMemo, useState } from "react";
import { useTonWallet, TonConnectButton } from "@tonconnect/ui-react";
import { api } from "../api";
import "./Wallet.css";
import { captureInviterCode } from "../utils/referral";


export default function Wallet() {
  const tonWallet = useTonWallet();
  const address = useMemo(() => tonWallet?.account?.address, [tonWallet]);
  const [wallet, setWallet] = useState(null);

  // modal states
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [withdrawError, setWithdrawError] = useState("");
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  // 1) Save ref from URL (if exists)
 useEffect(() => {
  // ✅ start_param تلگرام یا ref وب را ذخیره می‌کند
  captureInviterCode();
 }, []);


  // 2) When address is available: call connect (with inviter_code if exists) then load wallet
  useEffect(() => {
    if (!address) {
      setWallet(null);
      return;
    }

    let cancelled = false;

    async function connectAndLoadWallet() {
      try {
        const inviter_code = captureInviterCode(); // ✅ از تلگرام/وب می‌گیرد و ذخیره می‌کند
        await api.post("/connect/", {
        wallet_address: address,
        inviter_code: inviter_code || null,
       });

        // If you want it to apply only once:
        // localStorage.removeItem("inviter_code");

        const r = await api.get(`/wallet/${address}/`);
        if (!cancelled) setWallet(r.data);
      } catch (e) {
        // Even if connect fails, try to load wallet
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
      setWithdrawError("Invalid amount.");
      return;
    }
    if (n < 60) {
      setWithdrawError("Minimum withdrawal is 60.");
      return;
    }
    if (!address) {
      setWithdrawError("Please connect your wallet first.");
      return;
    }

    try {
      setIsWithdrawing(true);

      await api.post(`/withdraw/request/`, {
        wallet_address: address,
        scope: "ALL_WITHDRAWABLE",
        amount: n,
      });

      // refresh wallet
      const r = await api.get(`/wallet/${address}/`);
      setWallet(r.data);

      setIsWithdrawOpen(false);
    } catch (e) {
      setWithdrawError(
        e?.response?.data?.error ||
          e?.response?.data?.detail ||
          "Withdrawal failed."
      );
    } finally {
      setIsWithdrawing(false);
    }
  };

  return (
    <div className="wallet-page-container">
      <div className="wallet-box">
        <h2>Connect Wallet</h2>
        <TonConnectButton />

        {address && (
          <>
            {!wallet ? (
              <div>Loading...</div>
            ) : (
              <>
                <h3>Total Balance</h3>
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
              <h3>Withdraw ECG</h3>
              <button className="modal-close" onClick={closeWithdraw}>
                ×
              </button>
            </div>

            <div className="modal-body">
              <label>Withdrawal Amount (ECG)</label>
              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 60"
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
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={onWithdraw}
                disabled={isWithdrawing}
              >
                {isWithdrawing ? "Submitting..." : "Confirm Withdrawal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
