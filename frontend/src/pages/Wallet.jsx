import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useTonWallet, TonConnectButton } from "@tonconnect/ui-react";
import { api } from "../api";
import "./Wallet.css";
import {
  captureInviterCode,
  clearInviterCode,
} from "../utils/referral";
// import { useUserData } from "../hooks/useUserData"; // حذف شد چون با localStorage کار می‌کنیم

// توابع کمکی برای کار با localStorage
const USER_DATA_KEY = "my_app_user_data";

const loadUserDataFromStorage = () => {
  try {
    const data = localStorage.getItem(USER_DATA_KEY);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error("Error parsing localStorage data:", e);
    return null;
  }
};

const saveUserDataToStorage = (newData) => {
  try {
    const currentData = loadUserDataFromStorage() || {};
    const mergedData = { ...currentData, ...newData };
    localStorage.setItem(USER_DATA_KEY, JSON.stringify(mergedData));
  } catch (e) {
    console.error("Error saving to localStorage:", e);
  }
};

export default function Wallet() {
  const tonWallet = useTonWallet();
  
  // استفاده از useMemo برای آدرس
  const address = useMemo(
    () => tonWallet?.account?.address,
    [tonWallet]
  );

  // ✅ قفل استفاده شده تا درخواست فقط یک بار ارسال شود
  const hasConnected = useRef(false);

  const [wallet, setWallet] = useState(null);
  const [walletLocked, setWalletLocked] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [walletLinkedError, setWalletLinkedError] = useState(false);

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

  // ✅ ذخیره آدرس ولت در localStorage (به جای کوکی)
  // این useEffect هیچ رندر مجددی ایجاد نمی‌کند
  useEffect(() => {
    if (address) {
      const currentData = loadUserDataFromStorage() || {};
      saveUserDataToStorage({
        ...currentData,
        walletAddress: address
      });
      console.log("💾 [Wallet] Wallet address saved to localStorage:", address);
    }
  }, [address]);

  // ✅ تابعی که فقط یک بار و به شرط وجود آدرس اجرا می‌شود
  const connectAndLoadWallet = useCallback(async () => {
    // اگر قبلاً متصل شده‌ایم یا آدرس نداریم، خارج شو
    if (hasConnected.current || !address) {
        console.log("⛔️ [Wallet] Already connected or no address, skipping connect.");
        return;
    }

    console.log("🔄 [Wallet] Starting connectAndLoadWallet...");
    hasConnected.current = true; // ✅ قفل را بزن تا دیگر تکرار نشود
    setConnectError("");
    setWalletLinkedError(false);
    
    const tgStartParam =
      window.Telegram?.WebApp?.initDataUnsafe?.start_param || "";
    console.log("📊 [Wallet] tgStartParam:", tgStartParam);

    const lsInviterCode =
      localStorage.getItem("inviter_code") || "";
    console.log("📊 [Wallet] lsInviterCode:", lsInviterCode);

    const inviter_code = captureInviterCode();
    console.log("📊 [Wallet] inviter_code from capture:", inviter_code);

    // ✅ دریافت Telegram ID از localStorage (به جای کوکی)
    let telegramId = null;
    let telegramUsername = null;
    let isTelegram = false;

    const savedData = loadUserDataFromStorage();
    console.log("📂 [Wallet] Saved data from localStorage:", savedData);

    if (savedData?.telegramId && Number.isInteger(Number(savedData.telegramId)) && Number(savedData.telegramId) > 0) {
      telegramId = Number(savedData.telegramId);
      telegramUsername = savedData.telegramUsername || null;
      isTelegram = savedData.isTelegram || false;
      console.log("📂 [Wallet] Using telegram_id from localStorage:", telegramId);
    } else {
      const tg = window.Telegram?.WebApp;
      if (tg?.initDataUnsafe?.user) {
        const user = tg.initDataUnsafe.user;
        telegramId = Number(user.id);
        telegramUsername = user.username || null;
        isTelegram = true;
        console.log("✅ [Wallet] Using telegram_id from Telegram:", telegramId);
        
        // ذخیره در localStorage
        saveUserDataToStorage({
          telegramId: telegramId,
          telegramUsername: telegramUsername,
          isTelegram: true
        });
      } else {
        if (address) {
          let hash = 0;
          for (let i = 0; i < address.length; i++) {
            const char = address.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
          }
          telegramId = Number(Math.abs(hash) + 1000000000000);
          telegramUsername = `browser_${address.slice(0, 8)}`;
          isTelegram = false;
          console.log("🌐 [Wallet] Generated browser telegram_id:", telegramId);
          
          saveUserDataToStorage({
            telegramId: telegramId,
            telegramUsername: telegramUsername,
            isTelegram: false,
            walletAddress: address
          });
        }
      }
    }

    if (!telegramId) {
      telegramId = Number(Math.floor(Math.random() * 1000000000) + 100000000);
      console.log("⚠️ [Wallet] Generated fallback telegram_id:", telegramId);
    }

    setDebug((d) => ({
      ...d,
      tgStartParam,
      lsInviterCode,
      sentInviterCode: inviter_code || "",
      connectStatus: "Sending /connect ...",
      connectError: "",
    }));

    const payload = {
      wallet_address: address,
      inviter_code: inviter_code || null,
      is_telegram: isTelegram
    };

    if (telegramId && Number.isInteger(telegramId) && telegramId > 0) {
      payload.telegram_id = telegramId;
      payload.telegram_username = telegramUsername || null;
    }

    console.log("📤 [Wallet] Sending to /api/connect/:");
    console.log("📤 [Wallet] Payload:", JSON.stringify(payload, null, 2));

    try {
      const response = await api.post("/connect/", payload);
      console.log("✅ [Wallet] /connect/ response:", response.data);

      if (response.data?.user?.wallet_locked) {
        setWalletLocked(true);
        console.log("🔒 [Wallet] Wallet is locked to this Telegram ID");
      }

      if (response.data?.user) {
        const user = response.data.user;
        saveUserDataToStorage({
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

      setWallet(r.data);

    } catch (e) {
      console.log("❌ [Wallet] Error in connectAndLoadWallet:");
      
      const errorData = e?.response?.data;
      const isWalletLocked = errorData?.error?.includes("already linked") || 
                            errorData?.error?.includes("locked") ||
                            errorData?.detail?.includes("already linked");

      if (isWalletLocked) {
        setWalletLinkedError(true);
        setConnectError("🔒 This wallet is already linked to another Telegram account.");
        console.log("🔒 [Wallet] Wallet linked to another account");
      } else {
        const errorMessage = errorData?.error ||
                            errorData?.detail ||
                            e?.message ||
                            "Failed to connect wallet. Please try again.";
        setConnectError(errorMessage);
      }

      setDebug((d) => ({
        ...d,
        connectStatus: "connect FAILED ❌",
        connectError: errorData?.error || errorData?.detail || "",
      }));

      // تلاش برای دریافت اطلاعات ولت به هر حال
      try {
        console.log("🔄 [Wallet] Trying to fetch wallet data anyway...");
        const r = await api.get(`/wallet/${address}/`);
        console.log("✅ [Wallet] Wallet data (fallback):", r.data);
        setWallet(r.data);
      } catch (e2) {
        console.log("❌ [Wallet] Fallback also failed:", e2);
      }
    }
  }, [address]);

  // ✅ این useEffect تمیز است و فقط یک بار اجرا می‌شود
  useEffect(() => {
    console.log("🔍 [Wallet] useEffect triggered (address changed)");
    connectAndLoadWallet();
  }, [connectAndLoadWallet]);

  // تابع برای قطع ارتباط ولت
  const disconnectWallet = () => {
    // پاک کردن localStorage
    localStorage.removeItem('telegram_id'); // اگر جداگانه ذخیره شده
    localStorage.removeItem('inviter_code');
    clearInviterCode();
    localStorage.removeItem(USER_DATA_KEY); // پاک کردن کل دیتای کاربر
    
    setWallet(null);
    setWalletLocked(false);
    setConnectError("");
    setWalletLinkedError(false);
    
    // ✅ ریست کردن قفل اتصال
    hasConnected.current = false;
    
    // رفرش صفحه برای قطع ارتباط با ولت
    window.location.reload();
  };

  const resetReferral = () => {
    console.log("🔄 [Wallet] resetReferral called");
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
    walletLinkedError,
    isWithdrawOpen,
    amount,
    withdrawError,
    isWithdrawing,
    debug,
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
            color: walletLinkedError ? '#ff6b6b' : '#ff6b6b',
            background: walletLinkedError ? 'rgba(255,0,0,0.15)' : 'rgba(255,0,0,0.1)',
            padding: '16px 20px',
            borderRadius: '8px',
            marginTop: '12px',
            border: walletLinkedError ? '2px solid rgba(255,0,0,0.3)' : '1px solid rgba(255,0,0,0.2)',
            fontSize: '14px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '20px', marginBottom: '8px' }}>
              {walletLinkedError ? '🔒' : '⚠️'}
            </div>
            <div>{connectError}</div>
            
            {walletLinkedError && (
              <div style={{ marginTop: '12px' }}>
                <p style={{ fontSize: '13px', color: '#666', marginBottom: '10px' }}>
                  This wallet is connected to another Telegram account. 
                  Please use the wallet that is linked to your current Telegram account.
                </p>
                <button
                  onClick={disconnectWallet}
                  style={{
                    padding: '8px 20px',
                    background: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '600'
                  }}
                >
                  🔄 Disconnect & Try Again
                </button>
              </div>
            )}
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
                  disabled={walletLocked}
                >
                  Withdraw
                </button>

                {/* دکمه قطع ارتباط */}
                <button
                  onClick={disconnectWallet}
                  style={{
                    marginTop: '12px',
                    padding: '6px 16px',
                    background: 'transparent',
                    color: '#999',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Disconnect Wallet
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