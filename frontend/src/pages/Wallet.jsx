import { useEffect, useMemo, useState } from "react";
import { useTonWallet, TonConnectButton } from "@tonconnect/ui-react";
import { api } from "../api";
import "./Wallet.css";
import {
  captureInviterCode,
  clearInviterCode,
} from "../utils/referral";

export default function Wallet() {
  const tonWallet = useTonWallet();

  const address = useMemo(
    () => tonWallet?.account?.address,
    [tonWallet]
  );

  const [wallet, setWallet] = useState(null);

  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [withdrawError, setWithdrawError] = useState("");
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const [debug, setDebug] = useState({
    tgStartParam: "",
    lsInviterCode: "",
    sentInviterCode: "",
    connectStatus: "",
    connectError: "",
  });

  // Capture referral when page opens
  useEffect(() => {
    const code = captureInviterCode();

    setDebug((d) => ({
      ...d,
      tgStartParam:
        window.Telegram?.WebApp?.initDataUnsafe?.start_param || "",
      lsInviterCode:
        localStorage.getItem("inviter_code") || "",
      sentInviterCode: code || "",
      connectStatus: "Wallet page loaded",
      connectError: "",
    }));
  }, []);

  // Connect wallet and load wallet information
  useEffect(() => {
    if (!address) {
      setWallet(null);

      setDebug((d) => ({
        ...d,
        connectStatus: "No wallet connected yet",
      }));

      return;
    }

    let cancelled = false;

    async function connectAndLoadWallet() {
      try {
        const tgStartParam =
          window.Telegram?.WebApp?.initDataUnsafe?.start_param || "";

        const lsInviterCode =
          localStorage.getItem("inviter_code") || "";

        const inviter_code = captureInviterCode();

        // ✅ دریافت Telegram ID
        const telegramId =
          window.Telegram?.WebApp?.initDataUnsafe?.user?.id || null;

        setDebug((d) => ({
          ...d,
          tgStartParam,
          lsInviterCode,
          sentInviterCode: inviter_code || "",
          connectStatus: "Sending /connect ...",
          connectError: "",
        }));

        // ✅ ارسال اطلاعات کامل به سرور
        await api.post("/connect/", {
          wallet_address: address,
          inviter_code: inviter_code || null,
          telegram_id: telegramId,
          is_telegram: true
        });

        if (cancelled) return;

        setDebug((d) => ({
          ...d,
          connectStatus: "connect OK ✅",
        }));

        const r = await api.get(`/wallet/${address}/`);

        if (!cancelled) {
          setWallet(r.data);
        }

      } catch (e) {
        if (cancelled) return;

        const errText =
          e?.response?.data?.error ||
          e?.response?.data?.detail ||
          JSON.stringify(e?.response?.data || {}) ||
          String(e);

        setDebug((d) => ({
          ...d,
          connectStatus: "connect FAILED ❌",
          connectError: errText,
        }));

        try {
          const r = await api.get(`/wallet/${address}/`);

          if (!cancelled) {
            setWallet(r.data);
          }
        } catch (e2) {
          const errText2 =
            e2?.response?.data?.error ||
            e2?.response?.data?.detail ||
            JSON.stringify(e2?.response?.data || {}) ||
            String(e2);

          setDebug((d) => ({
            ...d,
            connectStatus: "wallet load FAILED ❌",
            connectError: errText2,
          }));
        }
      }
    }

    connectAndLoadWallet();

    return () => {
      cancelled = true;
    };
  }, [address]);

  const resetReferral = () => {
    clearInviterCode();

    setDebug((d) => ({
      ...d,
      lsInviterCode: "",
      sentInviterCode: "",
      connectStatus: "Referral reset done",
      connectError: "",
    }));

    alert("inviter_code پاک شد");
  };

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
      return setWithdrawError("Invalid amount.");
    }

    if (n < 60) {
      return setWithdrawError("Minimum withdrawal is 60.");
    }

    if (!address) {
      return setWithdrawError(
        "Please connect your wallet first."
      );
    }

    try {
      setIsWithdrawing(true);

      await api.post("/withdraw/request/", {
        wallet_address: address,
        scope: "ALL_WITHDRAWABLE",
        amount: n,
      });

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

        <h1 className="wallet-title">
          Connect Wallet
        </h1>

        <div className="connect-button-wrapper">
          <TonConnectButton />
        </div>

        {/* Debug Box - کامنت شده */}
        {/* <div className="debug-box">
          <div className="debug-item">
            <span className="debug-label">TG start_param:</span>
            <span className="debug-value">{debug.tgStartParam || "-"}</span>
          </div>
          <div className="debug-item">
            <span className="debug-label">LS inviter_code:</span>
            <span className="debug-value">{debug.lsInviterCode || "-"}</span>
          </div>
          <div className="debug-item">
            <span className="debug-label">SENT inviter_code:</span>
            <span className="debug-value">{debug.sentInviterCode || "-"}</span>
          </div>
          <div className="debug-item">
            <span className="debug-label">Status:</span>
            <span className="debug-value status-value">{debug.connectStatus || "-"}</span>
          </div>
          {debug.connectError ? (
            <div className="debug-error">
              <span className="debug-label">Error:</span>
              <span className="debug-value error-value">{debug.connectError}</span>
            </div>
          ) : null}
          <div className="debug-reset">
            <button onClick={resetReferral} className="debug-reset-button">
              Reset Referral
            </button>
          </div>
        </div> */}

        {address && (
          <div className="wallet-content">

            {!wallet ? (
              <div className="loading-text">
                Loading...
              </div>
            ) : (
              <>
                <h3>Total Balance</h3>

                <div className="balance">
                  {wallet.withdrawable_total}
                </div>

                <button
                  className="withdraw-btn"
                  onClick={openWithdraw}
                >
                  Withdraw
                </button>
              </>
            )}

          </div>
        )}

      </div>

      {/* Withdraw Modal */}
      {isWithdrawOpen && (
        <div
          className="modal-backdrop"
          onClick={closeWithdraw}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>Withdraw ECG</h3>

              <button
                className="modal-close"
                onClick={closeWithdraw}
                disabled={isWithdrawing}
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              <label>
                Withdrawal Amount (ECG)
              </label>

              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) =>
                  setAmount(e.target.value)
                }
                placeholder="e.g. 60"
                min="0"
              />

              {withdrawError && (
                <div className="error-text">
                  {withdrawError}
                </div>
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
                {isWithdrawing
                  ? "Submitting..."
                  : "Confirm Withdrawal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}