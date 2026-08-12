import { useEffect, useMemo, useState } from "react";
import { useTonWallet, TonConnectButton } from "@tonconnect/ui-react";
import { api } from "../api";
import "./Wallet.css";
import {
  captureInviterCode,
  clearInviterCode,
} from "../utils/referral";
import { useUserData } from "../hooks/useUserData";

export default function Wallet() {
  const tonWallet = useTonWallet();
  const { userData, saveUserData, loadUserData } = useUserData();

  const address = useMemo(
    () => tonWallet?.account?.address,
    [tonWallet]
  );

  const [wallet, setWallet] = useState(null);
  const [walletLocked, setWalletLocked] = useState(false);
  const [connectError, setConnectError] = useState("");

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

  // ذخیره آدرس ولت در کوکی
  useEffect(() => {
    if (address) {
      const currentData = loadUserData() || {};
      saveUserData({
        ...currentData,
        walletAddress: address
      });
      console.log("💾 [Wallet] Wallet address saved to cookie:", address);
    }
  }, [address, saveUserData, loadUserData]);

  // Connect wallet and load wallet information
  useEffect(() => {
    console.log("🔍 [Wallet] useEffect - connectAndLoadWallet triggered");
    console.log("📊 [Wallet] address:", address);
    
    if (!address) {
      console.log("⚠️ [Wallet] No address, clearing wallet");
      setWallet(null);
      setWalletLocked(false);
      setConnectError("");

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
        setConnectError("");
        
        const tgStartParam =
          window.Telegram?.WebApp?.initDataUnsafe?.start_param || "";
        console.log("📊 [Wallet] tgStartParam:", tgStartParam);

        const lsInviterCode =
          localStorage.getItem("inviter_code") || "";
        console.log("📊 [Wallet] lsInviterCode:", lsInviterCode);

        const inviter_code = captureInviterCode();
        console.log("📊 [Wallet] inviter_code from capture:", inviter_code);

        // ✅ دریافت Telegram ID از کوکی یا تلگرام
        let telegramId = null;
        let telegramUsername = null;
        let isTelegram = false;

        // ابتدا از کوکی بخوان
        const savedData = loadUserData();
        console.log("📂 [Wallet] Saved data from cookie:", savedData);

        if (savedData?.telegramId && savedData.telegramId > 0) {
          // استفاده از اطلاعات ذخیره شده در کوکی
          telegramId = savedData.telegramId;
          telegramUsername = savedData.telegramUsername || null;
          isTelegram = savedData.isTelegram || false;
          console.log("📂 [Wallet] Using telegram_id from cookie:", telegramId);
        } else {
          // اگر در کوکی نبود، از تلگرام بگیر
          const tg = window.Telegram?.WebApp;
          if (tg?.initDataUnsafe?.user) {
            const user = tg.initDataUnsafe.user;
            telegramId = user.id;
            telegramUsername = user.username || null;
            isTelegram = true;
            console.log("✅ [Wallet] Using telegram_id from Telegram:", telegramId);
            
            // ذخیره در کوکی برای استفاده‌های بعدی
            saveUserData({
              telegramId: telegramId,
              telegramUsername: telegramUsername,
              isTelegram: true
            });
          } else {
            // اگر در مرورگر هستیم، از آدرس ولت یک ID بساز
            if (address) {
              let hash = 0;
              for (let i = 0; i < address.length; i++) {
                const char = address.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
              }
              telegramId = Math.abs(hash) + 1000000000000;
              telegramUsername = `browser_${address.slice(0, 8)}`;
              isTelegram = false;
              console.log("🌐 [Wallet] Generated browser telegram_id:", telegramId);
              
              // ذخیره در کوکی
              saveUserData({
                telegramId: telegramId,
                telegramUsername: telegramUsername,
                isTelegram: false,
                walletAddress: address
              });
            }
          }
        }

        console.log("📊 [Wallet] Final telegramId:", telegramId);
        console.log("📊 [Wallet] Final isTelegram:", isTelegram);

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
          telegram_username: telegramUsername,
          is_telegram: isTelegram
        };
        console.log("📤 [Wallet] Sending to /api/connect/:", payload);

        const response = await api.post("/connect/", payload);
        console.log("✅ [Wallet] /connect/ response:", response.data);
        console.log("✅ [Wallet] /connect/ status:", response.status);

        if (cancelled) {
          console.log("⚠️ [Wallet] Request cancelled");
          return;
        }

        // ✅ بررسی وضعیت قفل ولت
        if (response.data?.user?.wallet_locked) {
          setWalletLocked(true);
          console.log("🔒 [Wallet] Wallet is locked to this Telegram ID");
        }

        // به‌روزرسانی کوکی با اطلاعات برگشتی از سرور
        if (response.data?.user) {
          const user = response.data.user;
          saveUserData({
            telegramId: user.telegram_id || telegramId,
            telegramUsername: user.telegram_username || telegramUsername,
            isTelegram: user.is_telegram || isTelegram,
            walletAddress: address
          });
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

        // ✅ نمایش خطا به کاربر
        const errorMessage = e?.response?.data?.error ||
                            e?.response?.data?.detail ||
                            e?.message ||
                            "Failed to connect wallet. Please try again.";
        
        console.log("📊 [Wallet] Error text:", errorMessage);
        setConnectError(errorMessage);

        setDebug((d) => ({
          ...d,
          connectStatus: "connect FAILED ❌",
          connectError: errorMessage,
        }));

        // ✅ اگر خطای مربوط به قفل بودن ولت است، پیام خاص نمایش بده
        if (errorMessage.includes("already linked") || errorMessage.includes("locked")) {
          setConnectError("🔒 This wallet is already linked to another Telegram account. Please use your original wallet.");
        }

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
  }, [address, loadUserData, saveUserData]);

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
    walletLocked,
    connectError,
    isWithdrawOpen,
    amount,
    withdrawError,
    isWithdrawing,
    debug,
    userData
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

        {/* ========== نمایش خطای اتصال ========== */}
        {connectError && (
          <div className="wallet-error" style={{
            color: '#ff6b6b',
            background: 'rgba(255,0,0,0.1)',
            padding: '12px 16px',
            borderRadius: '8px',
            marginTop: '12px',
            border: '1px solid rgba(255,0,0,0.2)',
            fontSize: '14px',
            textAlign: 'center'
          }}>
            ⚠️ {connectError}
          </div>
        )}

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

                {/* ✅ نمایش وضعیت قفل ولت */}
                {walletLocked && (
                  <div className="wallet-locked-badge" style={{
                    fontSize: '12px',
                    color: '#4caf50',
                    marginTop: '8px',
                    padding: '4px 12px',
                    background: 'rgba(76, 175, 80, 0.15)',
                    borderRadius: '20px',
                    display: 'inline-block'
                  }}>
                    🔒 Wallet Locked
                  </div>
                )}

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