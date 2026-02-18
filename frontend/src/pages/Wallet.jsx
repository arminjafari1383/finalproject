import { useEffect, useMemo, useState } from "react";
import { useTonWallet, TonConnectButton } from "@tonconnect/ui-react";
import { api } from "../api";
import "./Wallet.css";
import { captureInviterCode, clearInviterCode } from "../utils/referral";

export default function Wallet() {
  const tonWallet = useTonWallet();
  const address = useMemo(() => tonWallet?.account?.address, [tonWallet]);
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

  // وقتی صفحه باز شد (وب یا تلگرام)، ref رو ذخیره کن
  useEffect(() => {
    const code = captureInviterCode();
    setDebug((d) => ({
      ...d,
      tgStartParam: window.Telegram?.WebApp?.initDataUnsafe?.start_param || "",
      lsInviterCode: localStorage.getItem("inviter_code") || "",
      sentInviterCode: code || "",
      connectStatus: "Wallet page loaded",
      connectError: "",
    }));
  }, []);

  useEffect(() => {
    if (!address) {
      setWallet(null);
      setDebug((d) => ({ ...d, connectStatus: "No wallet connected yet" }));
      return;
    }

    let cancelled = false;

    async function connectAndLoadWallet() {
      try {
        const tgStartParam =
          window.Telegram?.WebApp?.initDataUnsafe?.start_param || "";
        const lsInviterCode = localStorage.getItem("inviter_code") || "";

        // مهم: اینجا ref از localStorage گرفته می‌شه
        const inviter_code = captureInviterCode();

        setDebug((d) => ({
          ...d,
          tgStartParam,
          lsInviterCode,
          sentInviterCode: inviter_code || "",
          connectStatus: "Sending /connect ...",
          connectError: "",
        }));

        await api.post("/connect/", {
          wallet_address: address,
          inviter_code: inviter_code || null,
        });

        if (cancelled) return;

        setDebug((d) => ({
          ...d,
          connectStatus: "connect OK ✅",
        }));

        const r = await api.get(`/wallet/${address}/`);
        if (!cancelled) setWallet(r.data);

        // ✅ اگر می‌خوای “یک بار مصرف” باشه، این رو فعال کن:
        // clearInviterCode();

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
          if (!cancelled) setWallet(r.data);
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
    if (!Number.isFinite(n)) return setWithdrawError("Invalid amount.");
    if (n < 60) return setWithdrawError("Minimum withdrawal is 60.");
    if (!address) return setWithdrawError("Please connect your wallet first.");

    try {
      setIsWithdrawing(true);

      await api.post(`/withdraw/request/`, {
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
        <h2>Connect Wallet</h2>
        <TonConnectButton />

        {/* Debug Box */}
        <div
          style={{
            marginTop: 12,
            padding: 10,
            border: "1px solid #444",
            borderRadius: 8,
            fontSize: 12,
            direction: "ltr",
            wordBreak: "break-all",
          }}
        >
          <div>
            <b>TG start_param:</b> {debug.tgStartParam || "-"}
          </div>
          <div>
            <b>LS inviter_code:</b> {debug.lsInviterCode || "-"}
          </div>
          <div>
            <b>SENT inviter_code:</b> {debug.sentInviterCode || "-"}
          </div>
          <div>
            <b>Status:</b> {debug.connectStatus || "-"}
          </div>
          {debug.connectError ? (
            <div style={{ color: "red" }}>
              <b>Error:</b> {debug.connectError}
            </div>
          ) : null}

          <div style={{ marginTop: 8 }}>
            <button onClick={resetReferral} style={{ padding: "6px 10px" }}>
              Reset Referral
            </button>
          </div>
        </div>

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
              {withdrawError && <div className="error-text">{withdrawError}</div>}
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
