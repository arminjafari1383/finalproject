import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useTonWallet, TonConnectButton } from "@tonconnect/ui-react";
import { api } from "../api";
import "./Wallet.css";
import {
  captureInviterCode,
  clearInviterCode,
} from "../utils/referral";

const USER_DATA_KEY = "my_app_user_data";
const INVITER_CODE_KEY = "inviter_code";
const WITHDRAW_TARGET = 60;
const ECG_PER_USDT = 312;
const ECG_CONTRACT_ADDRESS = "0x1A2b7F3c9D8e4B2A";
const ECG_CONTRACT_LINK = `https://bscscan.com/address/${ECG_CONTRACT_ADDRESS}`;

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

const shortenMiddle = (value, start = 6, end = 6) => {
  if (!value) return "-";
  if (value.length <= start + end + 3) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
};

export default function Wallet() {
  const tonWallet = useTonWallet();
  const address = useMemo(() => tonWallet?.account?.address, [tonWallet]);
  const hasConnected = useRef(false);

  const [wallet, setWallet] = useState(null);
  const [walletLocked, setWalletLocked] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [errorType, setErrorType] = useState("none");
  const [copiedText, setCopiedText] = useState("");

  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [tonPrice, setTonPrice] = useState(null);
  const [withdrawAsset, setWithdrawAsset] = useState("ECG");
  const [destinationWallet, setDestinationWallet] = useState("");
  const [withdrawError, setWithdrawError] = useState("");
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  useEffect(() => {
    async function getTonPrice() {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd"
        );
        const data = await res.json();
        setTonPrice(data?.["the-open-network"]?.usd || null);
      } catch (err) {
        console.log("TON price error", err);
      }
    }

    getTonPrice();
  }, []);

  useEffect(() => {
    const inviterCode = captureInviterCode();

    if (inviterCode) {
      localStorage.setItem("inviter_code", inviterCode);
    }

    const tg = window.Telegram?.WebApp;
    if (tg?.initDataUnsafe?.start_param) {
      const startParamValue = tg.initDataUnsafe.start_param;
      if (startParamValue && startParamValue.startsWith("ref_")) {
        const refCode = startParamValue.replace("ref_", "");
        localStorage.setItem("inviter_code", refCode);
      }
    }
  }, []);

  useEffect(() => {
    if (address) {
      const currentData = loadUserDataFromStorage() || {};
      saveUserDataToStorage({
        ...currentData,
        walletAddress: address,
      });
    }
  }, [address]);

  const connectAndLoadWallet = useCallback(async () => {
    if (hasConnected.current || !address) return;

    hasConnected.current = true;
    setConnectError("");
    setErrorType("none");

    let inviter_code = localStorage.getItem("inviter_code");
    if (!inviter_code) {
      inviter_code = captureInviterCode();
      if (inviter_code) {
        localStorage.setItem("inviter_code", inviter_code);
      }
    }

    let telegramId = null;
    let telegramUsername = null;
    let isTelegram = false;
    let telegramPhotoUrl = null;

    const savedData = loadUserDataFromStorage();

    if (
      savedData?.telegramId &&
      Number.isInteger(Number(savedData.telegramId)) &&
      Number(savedData.telegramId) > 0
    ) {
      telegramId = Number(savedData.telegramId);
      telegramUsername = savedData.telegramUsername || null;
      isTelegram = savedData.isTelegram || false;
    } else {
      const tg = window.Telegram?.WebApp;
      if (tg?.initDataUnsafe?.user) {
        const user = tg.initDataUnsafe.user;
        telegramId = Number(user.id);
        telegramUsername = user.username || null;
        telegramPhotoUrl = user.photo_url || null;
        isTelegram = true;

        saveUserDataToStorage({
          telegramId,
          telegramUsername,
          telegramPhotoUrl,
          isTelegram: true,
        });
      } else if (address) {
        let hash = 0;
        for (let i = 0; i < address.length; i++) {
          const char = address.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash;
        }
        telegramId = Number(Math.abs(hash) + 1000000000000);
        telegramUsername = `browser_${address.slice(0, 8)}`;
        isTelegram = false;

        saveUserDataToStorage({
          telegramId,
          telegramUsername,
          isTelegram: false,
          walletAddress: address,
        });
      }
    }

    if (!telegramId) {
      telegramId = Number(Math.floor(Math.random() * 1000000000) + 100000000);
    }

    const payload = {
      wallet_address: address,
      inviter_code: inviter_code || null,
      telegram_id: telegramId,
      telegram_username: telegramUsername,
      telegram_photo_url: telegramPhotoUrl,
      is_telegram: isTelegram,
    };

    try {
      const response = await api.post("/connect/", payload);

      if (response.data?.user?.wallet_locked) {
        setWalletLocked(true);
      }

      if (response.data?.user) {
        const user = response.data.user;
        saveUserDataToStorage({
          telegramId: user.telegram_id || telegramId,
          telegramUsername: user.telegram_username || telegramUsername,
          isTelegram: user.is_telegram || isTelegram,
          walletAddress: address,
        });
      }

      const r = await api.get(`/wallet/${address}/`);
      setWallet(r.data);
      setErrorType("none");
    } catch (e) {
      const errorData = e?.response?.data;
      const statusCode = e?.response?.status;
      const isNetworkError =
        e.message === "Network Error" ||
        e.code === "ERR_NETWORK" ||
        !e.response;

      if (isNetworkError) {
        setErrorType("network_error");
        setConnectError("Network Error! Please check your internet connection.");
      } else if (
        errorData?.error?.includes("already linked") ||
        errorData?.error?.includes("locked") ||
        errorData?.detail?.includes("already linked")
      ) {
        setErrorType("locked");
        setConnectError("This wallet is already linked to another Telegram account.");
      } else if (statusCode === 400) {
        setErrorType("bad_request");
        const msg = errorData?.error || errorData?.detail || "Invalid wallet address format.";
        setConnectError(`Bad Request: ${msg}`);
      } else {
        setErrorType("server_error");
        const errorMessage =
          errorData?.error || errorData?.detail || e?.message || "Server error.";
        setConnectError(`Server Error: ${errorMessage}`);
      }

      if (statusCode !== 400 && !isNetworkError) {
        try {
          const r = await api.get(`/wallet/${address}/`);
          setWallet(r.data);
        } catch {
          // ignore fallback error
        }
      }
    }
  }, [address]);

  useEffect(() => {
    connectAndLoadWallet();
  }, [connectAndLoadWallet]);

  const disconnectWallet = () => {
    localStorage.removeItem("telegram_id");
    localStorage.removeItem("inviter_code");
    localStorage.removeItem(INVITER_CODE_KEY);
    clearInviterCode();
    localStorage.removeItem(USER_DATA_KEY);

    setWallet(null);
    setWalletLocked(false);
    setConnectError("");
    setErrorType("none");
    hasConnected.current = false;
    window.location.reload();
  };

  const handleRetry = () => {
    setConnectError("");
    setErrorType("none");
    hasConnected.current = false;
    window.location.reload();
  };

  const copyText = async (label, value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(String(value));
      setCopiedText(`${label} copied`);
      window.setTimeout(() => setCopiedText(""), 1800);
    } catch {
      setCopiedText(`Could not copy ${label.toLowerCase()}`);
      window.setTimeout(() => setCopiedText(""), 1800);
    }
  };

  const openContractLink = () => {
    window.open(ECG_CONTRACT_LINK, "_blank", "noopener,noreferrer");
  };

  const openWithdraw = () => {
    setWithdrawError("");
    setAmount("");
    setWithdrawAsset("TON");
    setDestinationWallet("");
    setIsWithdrawOpen(true);
  };

  const closeWithdraw = () => {
    if (isWithdrawing) return;
    setIsWithdrawOpen(false);
  };

  const onWithdraw = async () => {
    setWithdrawError("");

    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      return setWithdrawError("Invalid amount.");
    }

    if (!address) {
      return setWithdrawError("Please connect your wallet first.");
    }

    if (withdrawAsset === "TON" && n < 1) {
      return setWithdrawError("Minimum automatic TON withdrawal is 1 TON.");
    }

    if (withdrawAsset === "ECG") {
      if (n < 60) {
        return setWithdrawError("Minimum withdrawal is 60 ECG.");
      }
      if (!destinationWallet.trim()) {
        return setWithdrawError("Please enter the destination ECG wallet address.");
      }
    }

    try {
      setIsWithdrawing(true);

      const payload = {
        wallet_address: address,
        // TON is always sent back to the currently connected TON wallet.
        destination_wallet:
          withdrawAsset === "TON" ? address : destinationWallet.trim(),
        asset: withdrawAsset,
        scope: "ALL_WITHDRAWABLE",
        // For TON this is the requested TON amount. Backend converts the
        // required ECG balance automatically and sends exactly this TON amount.
        amount: n,
      };

      await api.post("/withdraw/request/", payload);

      const r = await api.get(`/wallet/${address}/`);
      setWallet(r.data);
      setIsWithdrawOpen(false);
      setAmount("");
      setDestinationWallet("");
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

  const withdrawableTon = useMemo(() => {
    const ecg = Number(wallet?.withdrawable_total || 0);
    if (!tonPrice || !ecg) return "0.0000";
    return (ecg / (tonPrice * ECG_PER_USDT)).toFixed(4);
  }, [wallet, tonPrice]);

  const totalBalance = useMemo(() => Number(wallet?.withdrawable_total || 0), [wallet]);
  const progressPercent = Math.min((totalBalance / WITHDRAW_TARGET) * 100, 100);
  const remainingToUnlock = Math.max(WITHDRAW_TARGET - totalBalance, 0);
  const canWithdraw = totalBalance >= WITHDRAW_TARGET;

  return (
    <div className="wallet-page-container">
      <div className="wallet-box wallet-box--redesigned">
        <div className="wallet-header-block">
          <h1 className="wallet-title">Wallet</h1>
          <p className="wallet-subtitle">Connect your wallet and manage your ECG balance</p>
        </div>

        {!address ? (
          <div className="wallet-connect-state">
            <div className="connect-button-wrapper">
              <TonConnectButton />
            </div>
            <p className="wallet-connect-hint">Connect your TON wallet to see your balance, lock status and withdrawal progress.</p>
          </div>
        ) : (
          <>
            <div className="wallet-connected-panel">
              <div className="wallet-panel-title-row">
                <div className="wallet-panel-icon">🔗</div>
                <div>
                  <h3 className="panel-title">Connected Wallet</h3>
                </div>
              </div>

              <div className="wallet-address-card">
                <div className="wallet-address-left">
                  <div className="wallet-avatar-badge">👛</div>
                  <div className="wallet-address-main">{shortenMiddle(address, 4, 4)}</div>
                </div>
                <button
                  type="button"
                  className="icon-action-btn"
                  onClick={() => copyText("Wallet address", address)}
                  aria-label="Copy wallet address"
                >
                  ⧉
                </button>
              </div>
            </div>

            <div className="contract-card">
              <div className="contract-left">
                <div className="contract-icon">📄</div>
                <div>
                  <div className="contract-title">ECG Token Contract</div>
                  <div className="contract-address">{shortenMiddle(ECG_CONTRACT_ADDRESS, 6, 8)}</div>
                  <div className="contract-note">✓ Official ECG Token Contract</div>
                </div>
              </div>

              <div className="contract-actions">
                <button type="button" className="small-outline-btn" onClick={() => copyText("Contract address", ECG_CONTRACT_ADDRESS)}>
                  Copy
                </button>
                <button type="button" className="small-outline-btn" onClick={openContractLink}>
                  View
                </button>
              </div>
            </div>

            {copiedText && <div className="wallet-toast">{copiedText}</div>}

            {connectError && (
              <div className="wallet-error">
                <div className="error-icon">{errorType === "locked" ? "🔒" : "⚠️"}</div>
                <div className="error-title">
                  {errorType === "locked" ? "Wallet already linked" : "Connection issue"}
                </div>
                <div className="error-desc">{connectError}</div>
                {(errorType === "locked" || errorType === "network_error") && (
                  <div className="wallet-error-actions">
                    {errorType === "locked" && (
                      <button className="wallet-inline-btn danger" onClick={disconnectWallet}>
                        Disconnect & Try Again
                      </button>
                    )}
                    {errorType === "network_error" && (
                      <button className="wallet-inline-btn" onClick={handleRetry}>
                        Retry Connection
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {!wallet ? (
              <div className="wallet-loading-card">Loading wallet data...</div>
            ) : (
              <>
                <div className="wallet-balance-card">
                  <div className="balance-label">TOTAL BALANCE</div>
                  <div className="wallet-balance-row">
                    <div className="balance-number">{Number(totalBalance).toFixed(0)}</div>
                    <div className="balance-token-pill">ECG</div>
                  </div>
                  {walletLocked && <div className="wallet-locked-pill">🔒 Wallet Locked</div>}
                </div>

                <div className="withdraw-goal-card">
                  <div className="goal-top-row">
                    <div>
                      <div className="goal-title">Withdrawal Goal</div>
                      <div className="goal-subtitle">Reach 60 ECG to unlock withdrawal</div>
                    </div>
                    <div className="goal-percent-badge">{progressPercent.toFixed(1)}%</div>
                  </div>

                  <div className="goal-progress-track">
                    <div
                      className="goal-progress-fill"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  <div className="goal-bottom-row">
                    <span>{Number(totalBalance).toFixed(0)} / {WITHDRAW_TARGET} ECG</span>
                    <span>{Number(remainingToUnlock).toFixed(0)} ECG to go</span>
                  </div>
                </div>

                <button
                  className={`wallet-main-action ${canWithdraw ? "" : "disabled"}`}
                  onClick={openWithdraw}
                  disabled={!canWithdraw}
                >
                  <span className="wallet-main-action-title">
                    {canWithdraw ? "Withdraw" : "Withdraw 🔒"}
                  </span>
                  <span className="wallet-main-action-subtitle">
                    {canWithdraw ? "Your withdrawal is unlocked" : "Available at 60 ECG"}
                  </span>
                </button>

                <button className="wallet-disconnect-btn" onClick={disconnectWallet}>
                  Disconnect Wallet
                </button>

                <div className="wallet-stats-grid">
                  <div className="wallet-stat-card">
                    <div className="stat-icon">⛏️</div>
                    <div className="stat-title">Mining</div>
                    <div className="stat-accent online">● Active</div>
                  </div>

                  <div className="wallet-stat-card">
                    <div className="stat-icon">🪙</div>
                    <div className="stat-title">Total Mined</div>
                    <div className="stat-value">{Number(totalBalance).toFixed(0)} ECG</div>
                  </div>

                  <div className="wallet-stat-card">
                    <div className="stat-icon">🚀</div>
                    <div className="stat-title">Next Target</div>
                    <div className="stat-value">{WITHDRAW_TARGET} ECG</div>
                  </div>

                  <div className="wallet-stat-card">
                    <div className="stat-icon">🏆</div>
                    <div className="stat-title">Your Rank</div>
                    <div className="stat-value">--</div>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {isWithdrawOpen && wallet && (
        <div className="modal-backdrop" onClick={closeWithdraw}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Withdraw</h3>
              <button className="modal-close" onClick={closeWithdraw} disabled={isWithdrawing}>×</button>
            </div>
            <div className="modal-body">
              <label>Withdrawal Method</label>
              <div className="asset-picker">
                <button
                  type="button"
                  className={withdrawAsset === "ECG" ? "selected" : ""}
                  onClick={() => {
                    setWithdrawAsset("ECG");
                    setDestinationWallet("");
                    setAmount("");
                    setWithdrawError("");
                  }}
                  disabled={isWithdrawing}
                >
                  Withdraw with ECG
                </button>
                <button
                  type="button"
                  className={withdrawAsset === "TON" ? "selected" : ""}
                  onClick={() => {
                    setWithdrawAsset("TON");
                    setDestinationWallet("");
                    setAmount("");
                    setWithdrawError("");
                  }}
                  disabled={isWithdrawing}
                >
                  Withdraw with TON (Auto)
                </button>
              </div>

              {withdrawAsset === "ECG" ? (
                <>
                  <label htmlFor="withdraw-destination">ECG Wallet Address</label>
                  <input
                    id="withdraw-destination"
                    type="text"
                    value={destinationWallet}
                    onChange={(e) => setDestinationWallet(e.target.value)}
                    placeholder="Enter destination ECG wallet address"
                    disabled={isWithdrawing}
                    autoComplete="off"
                  />
                </>
              ) : (
                <div className="ton-info">
                  <div>
                    Automatic destination: <b>{shortenMiddle(address, 8, 8)}</b>
                  </div>
                  <div>TON will be sent automatically to your connected wallet.</div>
                </div>
              )}

              <label htmlFor="withdraw-amount">
                {withdrawAsset === "TON" ? "TON Amount" : "Withdrawable Amount (ECG)"}
              </label>

              <div className="amount-wrapper">
                <input
                  id="withdraw-amount"
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={withdrawAsset === "TON" ? "Minimum 1 TON" : "Minimum 60 ECG"}
                  min={withdrawAsset === "TON" ? "1" : "60"}
                  disabled={isWithdrawing}
                />

                {withdrawAsset === "TON" && (
                  <button type="button" className="max-btn" onClick={() => setAmount(withdrawableTon)} disabled={isWithdrawing}>
                    MAX
                  </button>
                )}

                {withdrawAsset === "ECG" && (
                  <button
                    type="button"
                    className="max-btn"
                    onClick={() => setAmount(Number(wallet?.withdrawable_total || 0))}
                    disabled={isWithdrawing}
                  >
                    MAX
                  </button>
                )}
              </div>

              {withdrawAsset === "ECG" && (
                <div className="max-balance-info">
                  Available: <b>{Number(wallet?.withdrawable_total || 0).toFixed(4)} ECG</b>
                </div>
              )}

              {withdrawAsset === "TON" && (
                <div className="ton-info">
                  <div>
                    Withdrawable TON: <b>{withdrawableTon} TON</b>
                  </div>
                  <div>
                    Based on: <b>{Number(wallet?.withdrawable_total || 0).toFixed(2)} ECG</b>
                  </div>
                  <div>
                    Minimum withdrawal: <b>1 TON</b>
                  </div>
                </div>
              )}

              {withdrawError && <div className="error-text">{withdrawError}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={closeWithdraw} disabled={isWithdrawing}>
                Cancel
              </button>
              <button className="btn-primary" onClick={onWithdraw} disabled={isWithdrawing}>
                {isWithdrawing ? "Sending..." : withdrawAsset === "TON" ? "Send TON Automatically" : "Confirm Withdrawal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
