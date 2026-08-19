import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useTonWallet, TonConnectButton, useTonConnectUI, useTonAddress } from "@tonconnect/ui-react";
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

const ECG_CONTRACT_ADDRESS = "0x79b88B5298C6025b09d910428A30e960dcEeB282";

const ECG_CONTRACT_LINK =
  `https://bscscan.com/address/${ECG_CONTRACT_ADDRESS}`;


// ======================================================
// LOCAL STORAGE
// ======================================================

const loadUserDataFromStorage = () => {
  try {
    const data =
      localStorage.getItem(USER_DATA_KEY);

    return data
      ? JSON.parse(data)
      : null;
  } catch (e) {
    console.error(
      "Error parsing localStorage data:",
      e
    );

    return null;
  }
};


const saveUserDataToStorage = (newData) => {
  try {
    const currentData =
      loadUserDataFromStorage() || {};

    const mergedData = {
      ...currentData,
      ...newData,
    };

    localStorage.setItem(
      USER_DATA_KEY,
      JSON.stringify(mergedData)
    );
  } catch (e) {
    console.error(
      "Error saving to localStorage:",
      e
    );
  }
};


const removeStoredWalletOnly = () => {
  try {
    const current =
      loadUserDataFromStorage();

    if (!current) return;

    const {
      walletAddress,
      ...telegramData
    } = current;

    localStorage.setItem(
      USER_DATA_KEY,
      JSON.stringify(telegramData)
    );
  } catch (error) {
    console.error(
      "Could not remove stored wallet:",
      error
    );
  }
};


const shortenMiddle = (
  value,
  start = 6,
  end = 6
) => {
  if (!value) return "-";

  if (
    value.length <=
    start + end + 3
  ) {
    return value;
  }

  return `${value.slice(
    0,
    start
  )}...${value.slice(-end)}`;
};


// ======================================================
// COMPONENT
// ======================================================

export default function Wallet() {
  const tonWallet =
    useTonWallet();

  const [tonConnectUI] =
    useTonConnectUI();

  const address =
    useMemo(
      () =>
        tonWallet
          ?.account
          ?.address,
      [tonWallet]
    );

  // TON Connect account.address is raw (0:...).
  // useTonAddress() returns the user-friendly wallet address (UQ... / 0Q...)
  // that matches what users normally see inside their TON wallet.
  const displayAddress =
    useTonAddress();

  const hasConnected =
    useRef(false);


  // ====================================================
  // STATES
  // ====================================================

  const [
    wallet,
    setWallet,
  ] = useState(null);

  const [
    walletLocked,
    setWalletLocked,
  ] = useState(false);

  const [
    connectError,
    setConnectError,
  ] = useState("");

  const [
    errorType,
    setErrorType,
  ] = useState("none");

  const [
    copiedText,
    setCopiedText,
  ] = useState("");

  const [
    isReplacingWallet,
    setIsReplacingWallet,
  ] = useState(false);


  // ====================================================
  // WITHDRAW STATES
  // ====================================================

  const [
    isWithdrawOpen,
    setIsWithdrawOpen,
  ] = useState(false);

  const [
    amount,
    setAmount,
  ] = useState("");

  const [
    tonPrice,
    setTonPrice,
  ] = useState(null);

  const [
    withdrawAsset,
    setWithdrawAsset,
  ] = useState("ECG");

  const [
    destinationWallet,
    setDestinationWallet,
  ] = useState("");

  const [
    withdrawError,
    setWithdrawError,
  ] = useState("");

  const [
    isWithdrawing,
    setIsWithdrawing,
  ] = useState(false);


  const [
    withdrawHistory,
    setWithdrawHistory,
  ] = useState([]);

  const [
    withdrawHistoryLoading,
    setWithdrawHistoryLoading,
  ] = useState(false);

  const [
    withdrawNotice,
    setWithdrawNotice,
  ] = useState("");

  // ====================================================
  // TON PRICE
  // ====================================================

  useEffect(() => {
    async function getTonPrice() {
      try {
        const res =
          await fetch(
            "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd"
          );

        const data =
          await res.json();

        setTonPrice(
          data?.[
            "the-open-network"
          ]?.usd || null
        );
      } catch (err) {
        console.log(
          "TON price error",
          err
        );
      }
    }

    getTonPrice();
  }, []);


  // ====================================================
  // REFERRAL
  // ====================================================

  useEffect(() => {
    const inviterCode =
      captureInviterCode();

    if (inviterCode) {
      localStorage.setItem(
        "inviter_code",
        inviterCode
      );
    }

    const tg =
      window.Telegram?.WebApp;

    if (
      tg
        ?.initDataUnsafe
        ?.start_param
    ) {
      const startParamValue =
        tg.initDataUnsafe
          .start_param;

      if (
        startParamValue &&
        startParamValue.startsWith(
          "ref_"
        )
      ) {
        const refCode =
          startParamValue.replace(
            "ref_",
            ""
          );

        localStorage.setItem(
          "inviter_code",
          refCode
        );
      }
    }
  }, []);


  // ====================================================
  // SAVE WALLET ADDRESS
  // ====================================================

  useEffect(() => {
    if (address) {
      const currentData =
        loadUserDataFromStorage() ||
        {};

      saveUserDataToStorage({
        ...currentData,
        walletAddress:
          address,
      });
    }
  }, [address]);


  // ====================================================
  // CONNECT + LOAD WALLET
  // ====================================================

  const connectAndLoadWallet =
    useCallback(
      async () => {
        if (
          hasConnected.current ||
          !address
        ) {
          return;
        }

        hasConnected.current =
          true;

        setConnectError("");
        setErrorType("none");

        let inviter_code =
          localStorage.getItem(
            "inviter_code"
          );

        if (!inviter_code) {
          inviter_code =
            captureInviterCode();

          if (inviter_code) {
            localStorage.setItem(
              "inviter_code",
              inviter_code
            );
          }
        }


        let telegramId =
          null;

        let telegramUsername =
          null;

        let isTelegram =
          false;

        let telegramPhotoUrl =
          null;


        const savedData =
          loadUserDataFromStorage();


        if (
          savedData
            ?.telegramId &&
          Number.isInteger(
            Number(
              savedData.telegramId
            )
          ) &&
          Number(
            savedData.telegramId
          ) > 0
        ) {
          telegramId =
            Number(
              savedData.telegramId
            );

          telegramUsername =
            savedData
              .telegramUsername ||
            null;

          isTelegram =
            savedData
              .isTelegram ||
            false;
        } else {
          const tg =
            window.Telegram
              ?.WebApp;

          if (
            tg
              ?.initDataUnsafe
              ?.user
          ) {
            const user =
              tg.initDataUnsafe
                .user;

            telegramId =
              Number(user.id);

            telegramUsername =
              user.username ||
              null;

            telegramPhotoUrl =
              user.photo_url ||
              null;

            isTelegram =
              true;

            saveUserDataToStorage({
              telegramId,

              telegramUsername,

              telegramPhotoUrl,

              isTelegram:
                true,
            });
          } else if (
            address
          ) {
            let hash = 0;

            for (
              let i = 0;
              i <
              address.length;
              i++
            ) {
              const char =
                address.charCodeAt(
                  i
                );

              hash =
                (
                  hash <<
                  5
                ) -
                hash +
                char;

              hash =
                hash &
                hash;
            }

            telegramId =
              Number(
                Math.abs(
                  hash
                ) +
                  1000000000000
              );

            telegramUsername =
              `browser_${address.slice(
                0,
                8
              )}`;

            isTelegram =
              false;

            saveUserDataToStorage({
              telegramId,

              telegramUsername,

              isTelegram:
                false,

              walletAddress:
                address,
            });
          }
        }


        if (!telegramId) {
          telegramId =
            Number(
              Math.floor(
                Math.random() *
                  1000000000
              ) +
                100000000
            );
        }

        const payload = {
          wallet_address:
            address,

          inviter_code:
            inviter_code ||
            null,

          telegram_id:
            telegramId,

          telegram_username:
            telegramUsername,

          telegram_photo_url:
            telegramPhotoUrl,

          is_telegram:
            isTelegram,
        };

        console.log(
          "[CONNECT PAYLOAD]",
          payload
        );


        try {
          const response =
            await api.post(
              "/connect/",
              payload
            );


          setWalletLocked(
            Boolean(response.data?.user?.wallet_locked)
          );


          if (
            response.data
              ?.user
          ) {
            const user =
              response.data
                .user;

            saveUserDataToStorage({
              telegramId:
                user.telegram_id ||
                telegramId,

              telegramUsername:
                user.telegram_username ||
                telegramUsername,

              isTelegram:
                user.is_telegram ||
                isTelegram,

              walletAddress:
                address,
            });
          }


          const r =
            await api.get(
              `/wallet/${address}/`
            );

          setWallet(
            r.data
          );

          setErrorType(
            "none"
          );
        } catch (e) {
          const errorData =
            e?.response
              ?.data;

          const statusCode =
            e?.response
              ?.status;

          const isNetworkError =
            e.message ===
              "Network Error" ||
            e.code ===
              "ERR_NETWORK" ||
            !e.response;


          if (
            isNetworkError
          ) {
            setErrorType(
              "network_error"
            );

            setConnectError(
              "Network Error! Please check your internet connection."
            );
          } else if (
            errorData
              ?.error
              ?.includes(
                "already linked"
              ) ||
            errorData
              ?.error
              ?.includes(
                "locked"
              ) ||
            errorData
              ?.detail
              ?.includes(
                "already linked"
              )
          ) {
            setErrorType(
              "locked"
            );

            setConnectError(
              "This wallet is already linked to another Telegram account."
            );
          } else if (
            statusCode ===
            400
          ) {
            setErrorType(
              "bad_request"
            );

            const msg =
              errorData
                ?.error ||
              errorData
                ?.detail ||
              "Invalid wallet address format.";

            setConnectError(
              `Bad Request: ${msg}`
            );
          } else {
            setErrorType(
              "server_error"
            );

            const errorMessage =
              errorData
                ?.error ||
              errorData
                ?.detail ||
              e?.message ||
              "Server error.";

            setConnectError(
              `Server Error: ${errorMessage}`
            );
          }


          if (
            statusCode !==
              400 &&
            !isNetworkError
          ) {
            try {
              const r =
                await api.get(
                  `/wallet/${address}/`
                );

              setWallet(
                r.data
              );
            } catch {
              // ignore fallback error
            }
          }
        }
      },
      [address]
    );


  useEffect(() => {
    connectAndLoadWallet();
  }, [
    connectAndLoadWallet,
  ]);


  // ====================================================
  // LIVE WALLET VALUES
  // ====================================================

  const refreshWalletValues =
    useCallback(async () => {
      if (!address) {
        return;
      }

      try {
        const response =
          await api.get(
            `/wallet/${address}/`
          );

        setWallet(
          response.data
        );
      } catch (error) {
        console.error(
          "[WALLET VALUES] refresh error",
          error
        );
      }
    }, [address]);


  useEffect(() => {
    if (!address) {
      return undefined;
    }

    // Refresh immediately when this page is mounted.
    refreshWalletValues();

    // Keep values fresh while the user stays on Wallet.
    const timer =
      window.setInterval(
        refreshWalletValues,
        15000
      );

    const onVisible = () => {
      if (
        document.visibilityState ===
        "visible"
      ) {
        refreshWalletValues();
      }
    };

    const onFocus = () => {
      refreshWalletValues();
    };

    document.addEventListener(
      "visibilitychange",
      onVisible
    );

    window.addEventListener(
      "focus",
      onFocus
    );

    return () => {
      window.clearInterval(timer);

      document.removeEventListener(
        "visibilitychange",
        onVisible
      );

      window.removeEventListener(
        "focus",
        onFocus
      );
    };
  }, [
    address,
    refreshWalletValues,
  ]);


  // ====================================================
  // DISCONNECT / REPLACE WALLET
  // ====================================================

  const disconnectWallet =
    async () => {
      try {
        await tonConnectUI.disconnect();
      } catch (error) {
        console.error(
          "TonConnect disconnect error:",
          error
        );
      }

      localStorage.removeItem(
        "telegram_id"
      );

      localStorage.removeItem(
        "inviter_code"
      );

      localStorage.removeItem(
        INVITER_CODE_KEY
      );

      clearInviterCode();

      localStorage.removeItem(
        USER_DATA_KEY
      );

      setWallet(null);
      setWalletLocked(false);
      setConnectError("");
      setErrorType("none");
      setWithdrawError("");
      setIsWithdrawOpen(false);

      hasConnected.current = false;

      window.location.reload();
    };


  const replaceWallet =
    async () => {
      if (
        isReplacingWallet ||
        isWithdrawing ||
        !address
      ) {
        return;
      }

      setIsReplacingWallet(true);
      setConnectError("");
      setErrorType("none");

      try {

        console.log(
          "[WALLET_CHANGE] disconnecting current wallet",
          address
        );

        await tonConnectUI.disconnect();

        // Preserve Telegram identity/referral information locally.
        removeStoredWalletOnly();

        setWallet(null);
        setWalletLocked(false);
        setWithdrawError("");
        setIsWithdrawOpen(false);

        hasConnected.current = false;

        await new Promise(
          (resolve) => setTimeout(resolve, 300)
        );

        await tonConnectUI.openModal();
      } catch (error) {
        console.error(
          "[WALLET_REPLACE] error",
          error
        );

        setConnectError(
          error?.message ||
          "Could not replace wallet."
        );

        setErrorType(
          "server_error"
        );
      } finally {
        setIsReplacingWallet(false);
      }
    };

  const handleRetry =
    () => {
      setConnectError("");

      setErrorType("none");

      hasConnected.current =
        false;

      window.location.reload();
    };


  // ====================================================
  // COPY
  // ====================================================

  const copyText =
    async (
      label,
      value
    ) => {
      if (!value) return;

      try {
        await navigator
          .clipboard
          .writeText(
            String(value)
          );

        setCopiedText(
          `${label} copied`
        );

        window.setTimeout(
          () =>
            setCopiedText(
              ""
            ),
          1800
        );
      } catch {
        setCopiedText(
          `Could not copy ${label.toLowerCase()}`
        );

        window.setTimeout(
          () =>
            setCopiedText(
              ""
            ),
          1800
        );
      }
    };


  const openContractLink =
    () => {
      window.open(
        ECG_CONTRACT_LINK,
        "_blank",
        "noopener,noreferrer"
      );
    };


  // ====================================================
  // OPEN / CLOSE WITHDRAW
  // ====================================================

  const openWithdraw =
    () => {
      setWithdrawError(
        ""
      );

      setAmount("");

      setWithdrawAsset(
        "TON"
      );

      setDestinationWallet(
        ""
      );

      setIsWithdrawOpen(
        true
      );
    };


  const closeWithdraw =
    () => {
      if (
        isWithdrawing
      ) {
        return;
      }

      setIsWithdrawOpen(
        false
      );
    };

  // ====================================================
  // WITHDRAW HISTORY
  // ====================================================

  const loadWithdrawHistory =
    useCallback(async () => {
      if (!address) {
        setWithdrawHistory([]);
        return;
      }

      try {
        setWithdrawHistoryLoading(true);

        const response = await api.get(
          "/withdraw/history/",
          {
            params: {
              wallet_address: address,
            },
          }
        );

        setWithdrawHistory(
          Array.isArray(response.data)
            ? response.data
            : []
        );
      } catch (error) {
        console.error(
          "[WITHDRAW HISTORY] load error",
          error
        );
      } finally {
        setWithdrawHistoryLoading(false);
      }
    }, [address]);


  useEffect(() => {
    if (!address) return undefined;

    loadWithdrawHistory();

    // Keep Pending -> Complete in sync while the user stays on this page.
    const timer = window.setInterval(
      loadWithdrawHistory,
      10000
    );

    return () =>
      window.clearInterval(timer);
  }, [address, loadWithdrawHistory]);

  // ====================================================
  // WITHDRAW
  // ====================================================

  const onWithdraw = async () => {
    setWithdrawError("");
    setWithdrawNotice("");

    const n = Number(amount);

    if (!Number.isFinite(n) || n <= 0) {
      setWithdrawError("Invalid amount.");
      return;
    }

    if (!address) {
      setWithdrawError("Please connect your wallet first.");
      return;
    }

    if (withdrawAsset === "TON" && n < 1) {
      setWithdrawError("Minimum TON withdrawal is 1 TON.");
      return;
    }

    if (withdrawAsset === "ECG" && n < 60) {
      setWithdrawError("Minimum withdrawal is 60 ECG.");
      return;
    }

    // ECG and TON use the same manual request flow:
    // the user enters both the amount and destination wallet.
    if (!destinationWallet.trim()) {
      setWithdrawError(
        `Please enter the destination ${withdrawAsset} wallet address.`
      );
      return;
    }

    const payload = {
      wallet_address: address,
      destination_wallet: destinationWallet.trim(),
      asset: withdrawAsset,
      scope: "ALL_WITHDRAWABLE",
      amount: n,
    };

    try {
      setIsWithdrawing(true);

      const withdrawResponse = await api.post(
        "/withdraw/request/",
        payload
      );

      // Refresh wallet balance after the request is reserved as Pending.
      const walletResponse = await api.get(
        `/wallet/${address}/`
      );

      setWallet(walletResponse.data);

      const createdRequest = withdrawResponse?.data || {};

      setWithdrawNotice(
        `Withdrawal request #${createdRequest.id || ""} submitted. Please wait for admin approval.`
      );

      await loadWithdrawHistory();

      setIsWithdrawOpen(false);
      setAmount("");
      setDestinationWallet("");
    } catch (error) {
      console.error("[WITHDRAW] request error", error);

      const backendMessage =
        error?.response?.data?.error ||
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        error?.message ||
        "Withdrawal failed.";

      setWithdrawError(backendMessage);
    } finally {
      setIsWithdrawing(false);
    }
  };


  // ====================================================
  // CALCULATIONS
  // ====================================================

  const withdrawableTon =
    useMemo(() => {
      const ecg =
        Number(
          wallet
            ?.withdrawable_total ||
            0
        );

      if (
        !tonPrice ||
        !ecg
      ) {
        return "0.0000";
      }

      return (
        ecg /
        (
          tonPrice *
          ECG_PER_USDT
        )
      ).toFixed(4);
    }, [
      wallet,
      tonPrice,
    ]);


  // Current amount that can actually be withdrawn.
  const totalBalance =
    useMemo(
      () =>
        Number(
          wallet
            ?.available_balance ??
          wallet
            ?.withdrawable_total ??
          0
        ),
      [wallet]
    );


  // Total completed withdrawals.
  // Backend updates wallet.total_withdrawn only when admin marks
  // a withdrawal Complete/Success, so Pending requests are not counted.
  const totalMined =
    useMemo(
      () =>
        Number(
          wallet
            ?.total_withdrawn ??
          0
        ),
      [wallet]
    );


  const referralBonus =
    useMemo(
      () =>
        Number(
          wallet
            ?.referral_bonus_total ??
          wallet
            ?.referral_bonus ??
          0
        ),
      [wallet]
    );


  const miningDays =
    useMemo(
      () =>
        Number(
          wallet
            ?.mining_days ??
          0
        ),
      [wallet]
    );


  const progressPercent =
    Math.min(
      (
        totalBalance /
        WITHDRAW_TARGET
      ) * 100,
      100
    );


  const remainingToUnlock =
    Math.max(
      WITHDRAW_TARGET -
        totalBalance,
      0
    );


  const canWithdraw =
    totalBalance >=
    WITHDRAW_TARGET;

  // ====================================================
  // UI
  // ====================================================

  return (
    <div className="wallet-page-container">

      <div className="wallet-box wallet-box--redesigned">

        {/* HEADER */}

        <div className="wallet-header-block">

          <h1 className="wallet-title">
            Wallet
          </h1>

          <p className="wallet-subtitle">
            Connect your wallet and manage your ECG balance
          </p>

        </div>


        {!address ? (

          // =================================================
          // NOT CONNECTED
          // =================================================

          <div className="wallet-connect-state">

            <div className="connect-button-wrapper">
              <TonConnectButton />
            </div>

            <p className="wallet-connect-hint">
              Connect your TON wallet to see your balance,
              lock status and withdrawal progress.
            </p>

          </div>

        ) : (

          // =================================================
          // CONNECTED
          // =================================================

          <>

            {/* CONNECTED WALLET */}

            <div className="wallet-connected-panel">

              <div className="wallet-panel-title-row">

                <div className="wallet-panel-icon">
                  🔗
                </div>

                <div>

                  <h3 className="panel-title">
                    Connected Wallet
                  </h3>

                </div>

              </div>


              <div className="wallet-address-card">

                <div className="wallet-address-left">

                  <div className="wallet-avatar-badge" aria-hidden="true">
                    <svg
                      className="wallet-avatar-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M5.25 6.75H16.5C18.1569 6.75 19.5 8.09315 19.5 9.75V17.25H6.75C5.50736 17.25 4.5 16.2426 4.5 15V7.5C4.5 7.08579 4.83579 6.75 5.25 6.75Z"
                        fill="currentColor"
                      />
                      <path
                        d="M6.25 6.75V5.75C6.25 5.19772 6.69772 4.75 7.25 4.75H15.5"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                      <path
                        d="M15.25 10.25H20V14.25H15.25C14.1454 14.25 13.25 13.3546 13.25 12.25C13.25 11.1454 14.1454 10.25 15.25 10.25Z"
                        fill="#6C5CFF"
                        stroke="white"
                        strokeWidth="1.25"
                      />
                      <circle cx="16.2" cy="12.25" r="0.8" fill="white" />
                    </svg>
                  </div>

                  <div className="wallet-address-main">
                    {shortenMiddle(
                      displayAddress || address,
                      6,
                      6
                    )}
                  </div>

                </div>


                <button
                  type="button"
                  className="icon-action-btn"
                  onClick={() =>
                    copyText(
                      "Wallet address",
                      displayAddress || address
                    )
                  }
                  aria-label="Copy wallet address"
                >
                  ⧉
                </button>

              </div>

            </div>


            {/* CONTRACT */}

            <div className="contract-card">

              <div className="contract-left">

                <div className="contract-icon" aria-hidden="true">
                  <svg
                    className="contract-icon-svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M6.5 3.75H13.75L17.5 7.5V14.25"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M13.5 3.9V7.75H17.35"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M6.5 3.75V18.25H12.25"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M8.75 10H14"
                      stroke="currentColor"
                      strokeWidth="1.65"
                      strokeLinecap="round"
                    />
                    <path
                      d="M8.75 13H12.5"
                      stroke="currentColor"
                      strokeWidth="1.65"
                      strokeLinecap="round"
                    />
                    <circle
                      cx="17"
                      cy="17"
                      r="4.15"
                      fill="#33E59B"
                      stroke="#071B22"
                      strokeWidth="1.35"
                    />
                    <path
                      d="M15.25 17.1L16.45 18.25L18.85 15.75"
                      stroke="#071B22"
                      strokeWidth="1.65"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>

                <div>

                  <div className="contract-title">
                    ECG Token Contract
                  </div>

                  <div className="contract-address">
                    {shortenMiddle(
                      ECG_CONTRACT_ADDRESS,
                      6,
                      8
                    )}
                  </div>

                  <div className="contract-note">
                    ✓ Official ECG Token Contract
                  </div>

                </div>

              </div>


              <div className="contract-actions">

                <button
                  type="button"
                  className="small-outline-btn"
                  onClick={() =>
                    copyText(
                      "Contract address",
                      ECG_CONTRACT_ADDRESS
                    )
                  }
                >
                  Copy
                </button>


                <button
                  type="button"
                  className="small-outline-btn"
                  onClick={
                    openContractLink
                  }
                >
                  View
                </button>

              </div>

            </div>


            {/* COPY TOAST */}

            {copiedText && (

              <div className="wallet-toast">
                {copiedText}
              </div>

            )}


            {/* CONNECTION ERROR */}

            {connectError && (

              <div className="wallet-error">

                <div className="error-icon">

                  {errorType ===
                  "locked"
                    ? "🔒"
                    : "⚠️"}

                </div>


                <div className="error-title">

                  {errorType ===
                  "locked"
                    ? "Wallet already linked"
                    : "Connection issue"}

                </div>


                <div className="error-desc">
                  {connectError}
                </div>


                {(errorType ===
                  "locked" ||
                  errorType ===
                    "network_error") && (

                  <div className="wallet-error-actions">

                    {errorType ===
                      "locked" && (

                      <button
                        className="wallet-inline-btn danger"
                        onClick={
                          disconnectWallet
                        }
                      >
                        Disconnect & Try Again
                      </button>

                    )}


                    {errorType ===
                      "network_error" && (

                      <button
                        className="wallet-inline-btn"
                        onClick={
                          handleRetry
                        }
                      >
                        Retry Connection
                      </button>

                    )}

                  </div>

                )}

              </div>

            )}


            {!wallet ? (

              <div className="wallet-loading-card">
                Loading wallet data...
              </div>

            ) : (

              <>

                {/* BALANCE */}

                <div className="wallet-balance-card">

                  <div className="balance-label">
                    AVAILABLE BALANCE
                  </div>


                  <div className="wallet-balance-row">

                    <div className="balance-number">
                      {Number(
                        totalBalance
                      ).toFixed(4)}
                    </div>

                    <div className="balance-token-pill">
                      ECG
                    </div>

                  </div>


                  {walletLocked && (

                    <div className="wallet-locked-pill">
                      🔒 Wallet Locked
                    </div>

                  )}

                </div>


                {/* WITHDRAW GOAL */}

                <div className="withdraw-goal-card">

                  <div className="goal-top-row">

                    <div>

                      <div className="goal-title">
                        Withdrawal Goal
                      </div>

                      <div className="goal-subtitle">
                        Reach 60 ECG to unlock withdrawal
                      </div>

                    </div>


                    <div className="goal-percent-badge">

                      {progressPercent.toFixed(
                        1
                      )}
                      %

                    </div>

                  </div>


                  <div className="goal-progress-track">

                    <div
                      className="goal-progress-fill"
                      style={{
                        width:
                          `${progressPercent}%`,
                      }}
                    />

                  </div>


                  <div className="goal-bottom-row">

                    <span>

                      {Number(
                        totalBalance
                      ).toFixed(2)}

                      {" / "}

                      {WITHDRAW_TARGET}

                      {" ECG"}

                    </span>


                    <span>

                      {Number(
                        remainingToUnlock
                      ).toFixed(2)}

                      {" ECG to go"}

                    </span>

                  </div>

                </div>


                {/* WITHDRAW */}

                <button
                  style={{ marginBottom: 8 }}
                  className={`wallet-main-action ${
                    canWithdraw
                      ? ""
                      : "disabled"
                  }`}
                  onClick={
                    openWithdraw
                  }
                  disabled={
                    !canWithdraw
                  }
                >

                  <span className="wallet-main-action-title">

                    {canWithdraw
                      ? "Withdraw"
                      : "Withdraw 🔒"}

                  </span>


                  <span className="wallet-main-action-subtitle">

                    {canWithdraw
                      ? "Your withdrawal is unlocked"
                      : "Available at 60 ECG"}

                  </span>

                </button>


                {withdrawNotice && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 12,
                      border: "1px solid rgba(255,255,255,0.18)",
                      borderRadius: 10,
                      lineHeight: 1.6,
                    }}
                  >
                    ⏳ {withdrawNotice}
                  </div>
                )}


                {/* WITHDRAW HISTORY */}

                <section className="withdraw-history-card">
                  <div className="withdraw-history-header">
                    <div>
                      <div className="withdraw-history-eyebrow">TRANSACTIONS</div>
                      <h3 className="withdraw-history-title">Withdrawal History</h3>
                      <p className="withdraw-history-subtitle">
                        Track your withdrawal requests and transaction receipts.
                      </p>
                    </div>

                    <button
                      type="button"
                      className="withdraw-history-refresh"
                      onClick={loadWithdrawHistory}
                      disabled={withdrawHistoryLoading}
                    >
                      <span className={withdrawHistoryLoading ? "withdraw-refresh-icon spinning" : "withdraw-refresh-icon"}>
                        ↻
                      </span>
                      {withdrawHistoryLoading ? "Refreshing" : "Refresh"}
                    </button>
                  </div>

                  {!withdrawHistory.length ? (
                    <div className="withdraw-history-empty">
                      <div className="withdraw-history-empty-icon">↗</div>
                      <div>
                        <strong>No withdrawal requests yet</strong>
                        <span>Your withdrawal requests will appear here.</span>
                      </div>
                    </div>
                  ) : (
                    <div className="withdraw-history-list">
                      {withdrawHistory.map((item) => {
                        const rawStatus = String(
                          item.display_status || item.status || ""
                        ).toUpperCase();

                        const statusText =
                          ["SUCCESS", "COMPLETE", "COMPLETED"].includes(rawStatus)
                            ? "Complete"
                            : rawStatus === "PENDING"
                            ? "Pending"
                            : rawStatus === "FAILED"
                            ? "Failed"
                            : rawStatus || "—";

                        const statusClass =
                          statusText === "Complete"
                            ? "complete"
                            : statusText === "Pending"
                            ? "pending"
                            : statusText === "Failed"
                            ? "failed"
                            : "default";

                        const isTon =
                          String(item.raw_asset || item.asset || "").toUpperCase() === "TON";

                        const requestedValue = isTon
                          ? `${Number(item.ton_amount || 0).toLocaleString(undefined, {
                              maximumFractionDigits: 9,
                            })} TON`
                          : `${Number(item.amount || 0).toLocaleString(undefined, {
                              maximumFractionDigits: 6,
                            })} ECG`;

                        return (
                          <article
                            key={item.id}
                            className="withdraw-history-item"
                          >
                            <div className="withdraw-history-item-top">
                              <div className="withdraw-history-amount-wrap">
                                <div className="withdraw-history-coin">
                                  {isTon ? "T" : "E"}
                                </div>

                                <div>
                                  <div className="withdraw-history-amount">
                                    {requestedValue}
                                  </div>
                                  <div className="withdraw-history-id">
                                    Request #{item.id}
                                  </div>
                                </div>
                              </div>

                              <span className={`withdraw-status-badge ${statusClass}`}>
                                <span className="withdraw-status-dot" />
                                {statusText}
                              </span>
                            </div>

                            <div className="withdraw-history-details">
                              <div className="withdraw-history-detail-row">
                                <span className="withdraw-history-label">Destination</span>
                                <span
                                  className="withdraw-history-value withdraw-history-address"
                                  title={item.destination_wallet || ""}
                                >
                                  {item.destination_wallet
                                    ? shortenMiddle(item.destination_wallet, 8, 8)
                                    : "—"}
                                </span>
                              </div>

                              {isTon && (
                                <div className="withdraw-history-detail-row">
                                  <span className="withdraw-history-label">ECG reserved</span>
                                  <span className="withdraw-history-value">
                                    {Number(
                                      item.ecg_debited || item.amount || 0
                                    ).toLocaleString(undefined, {
                                      maximumFractionDigits: 6,
                                    })} ECG
                                  </span>
                                </div>
                              )}

                              <div className="withdraw-history-detail-row">
                                <span className="withdraw-history-label">Requested</span>
                                <span className="withdraw-history-value">
                                  {item.created_at
                                    ? new Date(item.created_at).toLocaleString()
                                    : "—"}
                                </span>
                              </div>

                              {statusText === "Complete" && (
                                <>
                                  <div className="withdraw-history-detail-row">
                                    <span className="withdraw-history-label">Completed</span>
                                    <span className="withdraw-history-value">
                                      {item.completed_at
                                        ? new Date(item.completed_at).toLocaleString()
                                        : "—"}
                                    </span>
                                  </div>

                                  {item.tx_hash && (
                                    <div className="withdraw-history-tx-box">
                                      <div className="withdraw-history-tx-main">
                                        <span className="withdraw-history-label">TX Hash</span>
                                        <span
                                          className="withdraw-history-tx-value"
                                          title={item.tx_hash}
                                        >
                                          {shortenMiddle(item.tx_hash, 12, 10)}
                                        </span>
                                      </div>

                                      <button
                                        type="button"
                                        className="withdraw-history-copy-btn"
                                        onClick={() => copyText("TX Hash", item.tx_hash)}
                                      >
                                        <span>⧉</span>
                                        Copy
                                      </button>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>


                {/* REPLACE WALLET */}

                <button
                  className="wallet-disconnect-btn"
                  onClick={
                    replaceWallet
                  }
                  disabled={
                    isReplacingWallet ||
                    isWithdrawing
                  }
                >
                  {isReplacingWallet
                    ? "Opening Wallet Selector..."
                    : "🔄 Replace Wallet"}
                </button>


                {/* DISCONNECT */}

                <button
                  className="wallet-disconnect-btn"
                  onClick={
                    disconnectWallet
                  }
                  disabled={
                    isReplacingWallet ||
                    isWithdrawing
                  }
                >
                  Disconnect Wallet
                </button>


                {/* STATS */}

                <div className="wallet-stats-grid">

                  <div className="wallet-stat-card">

                    <div className="stat-icon">
                      ⛏️
                    </div>

                    <div className="stat-title">
                      Mining
                    </div>

                    <div className="stat-accent online">
                      ● Active
                    </div>

                  </div>


                  <div className="wallet-stat-card">

                    <div className="stat-icon">
                      🪙
                    </div>

                    <div className="stat-title">
                      Total Mined
                    </div>

                    <div className="stat-value">

                      {Number(
                        totalMined
                      ).toFixed(4)}

                      {" ECG"}

                    </div>

                  </div>


                  <div className="wallet-stat-card">

                    <div className="stat-icon">
                      🚀
                    </div>

                    <div className="stat-title">
                      Next Target
                    </div>

                    <div className="stat-value">

                      {WITHDRAW_TARGET}

                      {" ECG"}

                    </div>

                  </div>


                  <div className="wallet-stat-card">

                    <div className="stat-icon">
                      🎁
                    </div>

                    <div className="stat-title">
                      Referral Bonus
                    </div>

                    <div className="stat-value">
                      {referralBonus.toFixed(4)}
                      {" ECG"}
                    </div>

                  </div>


                  <div className="wallet-stat-card">

                    <div className="stat-icon">
                      📅
                    </div>

                    <div className="stat-title">
                      Days Mined
                    </div>

                    <div className="stat-value">
                      {miningDays}
                    </div>

                  </div>

                </div>

              </>

            )}

          </>

        )}

      </div>


      {/* ================================================= */}
      {/* WITHDRAW MODAL */}
      {/* ================================================= */}

      {isWithdrawOpen &&
        wallet && (

        <div
          className="modal-backdrop"
          onClick={
            closeWithdraw
          }
        >

          <div
            className="modal"
            onClick={(e) =>
              e.stopPropagation()
            }
          >

            {/* HEADER */}

            <div className="modal-header">

              <h3>
                Withdraw
              </h3>

              <button
                className="modal-close"
                onClick={
                  closeWithdraw
                }
                disabled={
                  isWithdrawing
                }
              >
                ×
              </button>

            </div>


            {/* BODY */}

            <div className="modal-body">

              <label>
                Withdrawal Method
              </label>


              {/* ASSET PICKER */}

              <div className="asset-picker">

                <button
                  type="button"
                  className={
                    withdrawAsset ===
                    "ECG"
                      ? "selected"
                      : ""
                  }
                  onClick={() => {
                    setWithdrawAsset(
                      "ECG"
                    );

                    setDestinationWallet(
                      ""
                    );

                    setAmount("");

                    setWithdrawError(
                      ""
                    );
                  }}
                  disabled={
                    isWithdrawing
                  }
                >
                  Withdraw with ECG
                </button>


                <button
                  type="button"
                  className={
                    withdrawAsset ===
                    "TON"
                      ? "selected"
                      : ""
                  }
                  onClick={() => {
                    setWithdrawAsset(
                      "TON"
                    );

                    setDestinationWallet(
                      ""
                    );

                    setAmount("");

                    setWithdrawError(
                      ""
                    );
                  }}
                  disabled={
                    isWithdrawing
                  }
                >
                  Withdraw with TON
                </button>

              </div>


              {/* DESTINATION - SAME FLOW FOR ECG AND TON */}

              <label htmlFor="withdraw-destination">
                {withdrawAsset} Wallet Address
              </label>


              <input
                id="withdraw-destination"
                type="text"
                value={destinationWallet}
                onChange={(e) =>
                  setDestinationWallet(
                    e.target.value
                  )
                }
                placeholder={`Enter destination ${withdrawAsset} wallet address`}
                disabled={isWithdrawing}
                autoComplete="off"
              />


              <div className="ton-info">
                This {withdrawAsset} request will stay Pending until an admin pays the destination wallet and marks it Complete.
              </div>


              {/* AMOUNT LABEL */}

              <label htmlFor="withdraw-amount">

                {withdrawAsset ===
                "TON"
                  ? "TON Amount"
                  : "Withdrawable Amount (ECG)"}

              </label>


              {/* AMOUNT */}

              <div className="amount-wrapper">

                <input
                  id="withdraw-amount"
                  type="number"
                  inputMode="decimal"
                  value={
                    amount
                  }
                  onChange={(e) =>
                    setAmount(
                      e.target.value
                    )
                  }
                  placeholder={
                    withdrawAsset ===
                    "TON"
                      ? "Minimum 1 TON"
                      : "Minimum 60 ECG"
                  }
                  min={
                    withdrawAsset ===
                    "TON"
                      ? "1"
                      : "60"
                  }
                  disabled={
                    isWithdrawing
                  }
                />


                {/* TON MAX */}

                {withdrawAsset ===
                  "TON" && (

                  <button
                    type="button"
                    className="max-btn"
                    onClick={() =>
                      setAmount(
                        withdrawableTon
                      )
                    }
                    disabled={
                      isWithdrawing
                    }
                  >
                    MAX
                  </button>

                )}


                {/* ECG MAX */}

                {withdrawAsset ===
                  "ECG" && (

                  <button
                    type="button"
                    className="max-btn"
                    onClick={() =>
                      setAmount(
                        Number(
                          wallet
                            ?.withdrawable_total ||
                            0
                        )
                      )
                    }
                    disabled={
                      isWithdrawing
                    }
                  >
                    MAX
                  </button>

                )}

              </div>


              {/* ECG INFO */}

              {withdrawAsset ===
                "ECG" && (

                <div className="max-balance-info">

                  Available:{" "}

                  <b>

                    {Number(
                      wallet
                        ?.withdrawable_total ||
                        0
                    ).toFixed(4)}

                    {" ECG"}

                  </b>

                </div>

              )}


              {/* TON INFO */}

              {withdrawAsset ===
                "TON" && (

                <div className="ton-info">

                  <div>

                    Withdrawable TON:{" "}

                    <b>
                      {withdrawableTon}
                      {" TON"}
                    </b>

                  </div>


                  <div>

                    Based on:{" "}

                    <b>

                      {Number(
                        wallet
                          ?.withdrawable_total ||
                          0
                      ).toFixed(2)}

                      {" ECG"}

                    </b>

                  </div>


                  <div>

                    Minimum withdrawal:{" "}

                    <b>
                      1 TON
                    </b>

                  </div>

                </div>

              )}


              {/* WITHDRAW ERROR */}

              {withdrawError && (

                <div className="error-text">
                  {withdrawError}
                </div>

              )}

            </div>


            {/* FOOTER */}

            <div
              className="modal-footer"
              style={{
                paddingTop: 18,
                paddingBottom: 18,
              }}
            >

              <button
                className="btn-secondary"
                onClick={
                  closeWithdraw
                }
                disabled={
                  isWithdrawing
                }
              >
                Cancel
              </button>


              <button
                className="btn-primary"
                onClick={
                  onWithdraw
                }
                disabled={
                  isWithdrawing
                }
              >

                {isWithdrawing
                  ? "Submitting Request..."
                  : withdrawAsset ===
                    "TON"
                  ? "Request TON Withdrawal"
                  : "Request ECG Withdrawal"}

              </button>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}