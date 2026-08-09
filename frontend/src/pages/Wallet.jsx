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
    console.log("🔍 [Wallet] useEffect - Capture referral");
    const code = captureInviterCode();
    console.log("📊 [Wallet] inviter_code from localStorage:", localStorage.getItem("inviter_code"));
    console.log("📊 [Wallet] captured code:", code);

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
    console.log("🔍 [Wallet] useEffect - connectAndLoadWallet triggered");
    console.log("📊 [Wallet] address:", address);
    
    if (!address) {
      console.log("⚠️ [Wallet] No address, clearing wallet");
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
        console.log("🔄 [Wallet] Starting connectAndLoadWallet...");
        
        const tgStartParam =
          window.Telegram?.WebApp?.initDataUnsafe?.start_param || "";
        console.log("📊 [Wallet] tgStartParam:", tgStartParam);

        const lsInviterCode =
          localStorage.getItem("inviter_code") || "";
        console.log("📊 [Wallet] lsInviterCode:", lsInviterCode);

        const inviter_code = captureInviterCode();
        console.log("📊 [Wallet] inviter_code from capture:", inviter_code);

        // ✅ دریافت Telegram ID
        const telegramId =
          window.Telegram?.WebApp?.initDataUnsafe?.user?.id || null;
        console.log("📊 [Wallet] telegramId:", telegramId);
        console.log("📊 [Wallet] window.Telegram?.WebApp:", window.Telegram?.WebApp);
        console.log("📊 [Wallet] initDataUnsafe:", window.Telegram?.WebApp?.initDataUnsafe);

        setDebug((d) => ({
          ...d,
          tgStartParam,
          lsInviterCode,
          sentInviterCode: inviter_code || "",
          connectStatus: "Sending /connect ...",
          connectError: "",
        }));

        // ✅ ارسال اطلاعات کامل به سرور
        const payload = {
          wallet_address: address,
          inviter_code: inviter_code || null,
          telegram_id: telegramId,
          is_telegram: true
        };
        console.log("📤 [Wallet] Sending to /api/connect/:", payload);

        const response = await api.post("/connect/", payload);
        console.log("✅ [Wallet] /connect/ response:", response.data);
        console.log("✅ [Wallet] /connect/ status:", response.status);

        if (cancelled) {
          console.log("⚠️ [Wallet] Request cancelled");
          return;
        }

        setDebug((d) => ({
          ...d,
          connectStatus: "connect OK ✅",
          connectError: "",
        }));

        console.log("🔄 [Wallet] Fetching wallet data...");
        const r = await api.get(`/wallet/${address}/`);
        console.log("✅ [Wallet] Wallet data:", r.data);

        if (!cancelled) {
          setWallet(r.data);
          console.log("✅ [Wallet] Wallet set successfully");
        }

      } catch (e) {
        console.log("❌ [Wallet] Error in connectAndLoadWallet:");
        console.log("❌ [Wallet] Error object:", e);
        console.log("❌ [Wallet] Error response:", e?.response);
        console.log("❌ [Wallet] Error data:", e?.response?.data);
        console.log("❌ [Wallet] Error status:", e?.response?.status);
        console.log("❌ [Wallet] Error message:", e?.message);
        
        if (cancelled) {
          console.log("⚠️ [Wallet] Request cancelled");
          return;
        }

        const errText =
          e?.response?.data?.error ||
          e?.response?.data?.detail ||
          JSON.stringify(e?.response?.data || {}) ||
          String(e);
        console.log("📊 [Wallet] Error text:", errText);

        setDebug((d) => ({
          ...d,
          connectStatus: "connect FAILED ❌",
          connectError: errText,
        }));

        try {
          console.log("🔄 [Wallet] Trying to fetch wallet data anyway...");
          const r = await api.get(`/wallet/${address}/`);
          console.log("✅ [Wallet] Wallet data (fallback):", r.data);

          if (!cancelled) {
            setWallet(r.data);
            console.log("✅ [Wallet] Wallet set successfully (fallback)");
          }
        } catch (e2) {
          console.log("❌ [Wallet] Fallback also failed:");
          console.log("❌ [Wallet] Error:", e2);
          console.log("❌ [Wallet] Error response:", e2?.response);
          console.log("❌ [Wallet] Error data:", e2?.response?.data);
          
          const errText2 =
            e2?.response?.data?.error ||
            e2?.response?.data?.detail ||
            JSON.stringify(e2?.response?.data || {}) ||
            String(e2);
          console.log("📊 [Wallet] Error text (fallback):", errText2);

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
      console.log("🔚 [Wallet] Cleanup: cancelling");
      cancelled = true;
    };
  }, [address]);

  const resetReferral = () => {
    console.log("🔄 [Wallet] resetReferral called");
    clearInviterCode();
    console.log("📊 [Wallet] inviter_code cleared from localStorage");

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
    console.log("🔍 [Wallet] openWithdraw called");
    setWithdrawError("");
    setAmount("");
    setIsWithdrawOpen(true);
  };

  const closeWithdraw = () => {
    console.log("🔍 [Wallet] closeWithdraw called");
    if (isWithdrawing) return;
    setIsWithdrawOpen(false);
  };

  const onWithdraw = async () => {
    console.log("🔍 [Wallet] onWithdraw called");
    setWithdrawError("");

    const n = Number(amount);
    console.log("📊 [Wallet] Withdraw amount:", n);

    if (!Number.isFinite(n)) {
      console.log("❌ [Wallet] Invalid amount");
      return setWithdrawError("Invalid amount.");
    }

    if (n < 60) {
      console.log("❌ [Wallet] Amount too small:", n);
      return setWithdrawError("Minimum withdrawal is 60.");
    }

    if (!address) {
      console.log("❌ [Wallet] No address");
      return setWithdrawError(
        "Please connect your wallet first."
      );
    }

    try {
      console.log("🔄 [Wallet] Sending withdraw request...");
      setIsWithdrawing(true);

      const payload = {
        wallet_address: address,
        scope: "ALL_WITHDRAWABLE",
        amount: n,
      };
      console.log("📤 [Wallet] Withdraw payload:", payload);

      await api.post("/withdraw/request/", payload);
      console.log("✅ [Wallet] Withdraw request successful");

      console.log("🔄 [Wallet] Fetching updated wallet...");
      const r = await api.get(`/wallet/${address}/`);
      console.log("✅ [Wallet] Updated wallet:", r.data);

      setWallet(r.data);
      setIsWithdrawOpen(false);
      console.log("✅ [Wallet] Withdraw completed");
    } catch (e) {
      console.log("❌ [Wallet] Withdraw failed:");
      console.log("❌ [Wallet] Error:", e);
      console.log("❌ [Wallet] Error response:", e?.response);
      console.log("❌ [Wallet] Error data:", e?.response?.data);
      
      setWithdrawError(
        e?.response?.data?.error ||
          e?.response?.data?.detail ||
          "Withdrawal failed."
      );
    } finally {
      setIsWithdrawing(false);
      console.log("✅ [Wallet] Withdraw finished");
    }
  };

  console.log("📊 [Wallet] Component state:", {
    address,
    wallet: wallet,
    isWithdrawOpen,
    amount,
    withdrawError,
    isWithdrawing,
    debug
  });

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