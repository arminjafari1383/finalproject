import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useTonWallet, TonConnectButton, useTonConnectUI, useTonAddress } from "@tonconnect/ui-react";
import axios from "axios";
import { api } from "../api";
import "./Wallet.css";
import {
  captureInviterCode,
  clearInviterCode,
} from "../utils/referral";

const USER_DATA_KEY = "my_app_user_data";
const INVITER_CODE_KEY = "inviter_code";
const ECG_PER_USDT = 312;

const ECG_CONTRACT_ADDRESS = "0x79b88B5298C6025b09d910428A30e960dcEeB282";

const ECG_CONTRACT_LINK =
  `https://bscscan.com/address/${ECG_CONTRACT_ADDRESS}`;


// ======================================================
// LOCAL STORAGE
// ======================================================

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


const removeStoredWalletOnly = () => {
  try {
    const current = loadUserDataFromStorage();
    if (!current) return;

    const { walletAddress, ...telegramData } = current;
    localStorage.setItem(USER_DATA_KEY, JSON.stringify(telegramData));
  } catch (error) {
    console.error("Could not remove stored wallet:", error);
  }
};


const shortenMiddle = (value, start = 6, end = 6) => {
  if (!value) return "-";
  if (value.length <= start + end + 3) {
    return value;
  }
  return `${value.slice(0, start)}...${value.slice(-end)}`;
};


const CopyIcon = ({ size = 22, className = "" }) => (
  <svg
    className={`copy-icon-svg ${className}`.trim()}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
  >
    {/* this code for icon copy */}
    <rect
      x="8.25"
      y="8.25"
      width="11"
      height="11"
      rx="2.15"
      stroke="currentColor"
      strokeWidth="1.75"
    />
    {/* this code about code for two page together */}
    <path
      d="M15.75 8.25V6.75C15.75 5.64543 14.8546 4.75 13.75 4.75H6.75C5.64543 4.75 4.75 5.64543 4.75 6.75V13.75C4.75 14.8546 5.64543 15.75 6.75 15.75H8.25"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);


// ======================================================
// COMPONENT
// ======================================================

export default function Wallet() {
  // this function get ton wallet situation 
  const tonWallet = useTonWallet();
  // this variable include open wallet list and disconnect wallet
  const [tonConnectUI] = useTonConnectUI();
  // get address wallet from wallet 
  const address = useMemo(
    () => tonWallet?.account?.address,
    [tonWallet]
  );
  // show address wallet in ui
  const displayAddress = useTonAddress();
  // ignore all request in moment, send for connect wallet
  const hasConnected = useRef(false);


  // ====================================================
  // STATES
  // ====================================================

  // this state save all information wallet
  const [wallet, setWallet] = useState(null);

  // this state realize wallet lock or not
  const [walletLocked, setWalletLocked] = useState(false);

  // this state keep all word error about situation wallet realtionship and get note for example("none","network","locked","bad_request","server_error")
  const [connectError, setConnectError] = useState("");

  // this state keep all typr error about situation wallet realtionship and get note for example("none","network","locked","bad_request","server_error")
  const [errorType, setErrorType] = useState("none");

  // this state use for copy note when you click at copy button show toast for users in ui
  const [copiedText, setCopiedText] = useState("");

  // this state show users change wallet or not
  const [isReplacingWallet, setIsReplacingWallet] = useState(false);

  const [debugInfo, setDebugInfo] = useState({});


  // ====================================================
  // WITHDRAW STATES
  // ====================================================

  // show users want to withdraw or not if usestate == flase means users didn't want to withdraw of usestate == true means users want to withdraw
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);

  // this state keep withdraw amount (this state keep variable by string not Number)

  const [amount, setAmount] = useState("");
  
  // this state keep live ton price
  const [tonPrice, setTonPrice] = useState(null);

  // this state set final assets for withdraw (this state means that users want to what coin want to withdraw for example ecg or ton)

  const [withdrawAsset, setWithdrawAsset] = useState("ECG");

  // this state say where is money (for example : first inventory == usdt convert to end inventory == ton)

  const [withdrawSource, setWithdrawSource] = useState("ECG");

  // this state it truns out what profit 
  const [withdrawBucket, setWithdrawBucket] = useState("ECG_SELF");

  // this state about destination address wallet
  const [destinationWallet, setDestinationWallet] = useState("");

  // this state about wallet note for example("invalid amount", "please connect your wallet first")

  const [withdrawError, setWithdrawError] = useState("");

  // this state about is it withdraw request sending (it is important for ignore double click)
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  // history list withdraw
  const [withdrawHistory, setWithdrawHistory] = useState([]);

  // it truns out loading history
  const [withdrawHistoryLoading, setWithdrawHistoryLoading] = useState(false);

  // this state for stituation withdraw message
  const [withdrawNotice, setWithdrawNotice] = useState("");

  // this state save levels inforamtion referral
  const [referralLevels, setReferralLevels] = useState({});

  // this state save loads information 
  const [referralLevelsLoading, setReferralLevelsLoading] = useState(false);

  // ====================================================
  // TON PRICE
  // ====================================================


  
  useEffect(() => {

    // use async function beacuse i want send request internet 
    async function getTonPrice() {
      try {
        //this variable get ton price by api for COINGECKO website
        const res = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd"
        );
        // this variable convert json string to object
        const data = await res.json();
        // this state for save ton price 
        setTonPrice(data?.["the-open-network"]?.usd || null);
      } catch (err) { // error handling
        console.log("TON price error", err);
      }
    }
    // calls get tonprice
    getTonPrice();
  }, []);



  // ====================================================
  // REFERRAL
  // ====================================================


  useEffect(() => {
    // this variable save ref code that captureinvitercode discover
    const inviterCode = captureInviterCode();
    // if inviter code exists save at localstorage
    // this condition needs if users change pages the ref code save at local storage 
    if (inviterCode) {
      localStorage.setItem("inviter_code", inviterCode);
    }
    // this variable check enter from telegram app
    // check the user enter from telegram or not if not the app doesn't crash
    const tg = window.Telegram?.WebApp;
    // check telegram has start param send or not 
    if (tg?.initDataUnsafe?.start_param) {
      // save start param on startparamvalue 
      const startParamValue = tg.initDataUnsafe.start_param;
      // if start param start with ref this condition work
      if (startParamValue && startParamValue.startsWith("ref_")) {
        // this variable save referral code without ref_
        const refCode = startParamValue.replace("ref_", "");
        // this variable save referral code without ref_
        localStorage.setItem("inviter_code", refCode);
      }
    }
  }, []);


  // ====================================================
  // SAVE WALLET ADDRESS
  // ====================================================
  
  useEffect(() => {
    // if wallet connect and address exsits , continue
    if (address) {
      // load users information from localstorage 
      const currentData = loadUserDataFromStorage() || {};
      // add new address to information that load for localstorage
      saveUserDataToStorage({
        ...currentData,
        walletAddress: address,
      });
    }
  }, [address]);// this part very important (when this effect change it is run)


  // ====================================================
  // CONNECT + LOAD WALLET
  // ====================================================

  const connectAndLoadWallet = useCallback(
    async () => {
      // this condition has it because 1 - if wallet connected , function didn't run again  2 - if wallet didn't exists go out
      if (hasConnected.current || !address) {
        return;
      }
      // when function run , ignore request repeat
      hasConnected.current = true;

      // clear last notice , before new attempt 
      setConnectError("");
      setErrorType("none");
      

      // get last referral code for localstorage
      let inviter_code = localStorage.getItem("inviter_code");

      
      // if localstorage hasn't referral code , attempt again to get url . this trick has benfiet beacuse maybe after wallet connect enter user. 
 
      if (!inviter_code) {
        inviter_code = captureInviterCode();
        if (inviter_code) {
          localStorage.setItem("inviter_code", inviter_code);
        }
      } 

      // after this line get information from telegram if absence use wallet information
      let telegramId = null;// get id telegram
      let telegramUsername = null;// get usernametelegram
      let isTelegram = false;//is true from telegram?
      let telegramPhotoUrl = null;// get photo from telegram

      const savedData = loadUserDataFromStorage();// load localstorage 

      // first condition means that telegram exists second condition means that trust about id is integer third means that number is positive
      if (savedData?.telegramId && Number.isInteger(Number(savedData.telegramId)) && Number(savedData.telegramId) > 0) {
        //get information from localstorage and use it 
        telegramId = Number(savedData.telegramId);
        telegramUsername = savedData.telegramUsername || null;
        isTelegram = savedData.isTelegram || false;
        // this part want get information from wallet and telegram
      } else {
        // get information telegram user
        const tg = window.Telegram?.WebApp;
        // if telegram get information user means that user is it in telegram
        if (tg?.initDataUnsafe?.user) {
          const user = tg.initDataUnsafe.user;
          telegramId = Number(user.id);
          telegramUsername = user.username || null;
          telegramPhotoUrl = user.photo_url || null;
          isTelegram = true;
          // save this informatio because didn't user everywhere get information telegram from telegram
          saveUserDataToStorage({
            telegramId,
            telegramUsername,
            telegramPhotoUrl,
            isTelegram: true,
          });
        // if user enter from browser and have only address wallet
        } else if (address) {
          // first create a new variable named hash
          let hash = 0;
          // review all character wallet address
          for (let i = 0; i < address.length; i++) {
            // each character convert to unicode/ascii
            const char = address.charCodeAt(i);
            // each charcter shift  bit to left
            hash = (hash << 5) - hash + char;
            // this line doesn't allow the length bigger
            hash = hash & hash;
          }
          // maybe hash is negative convert to positive
          telegramId = Number(Math.abs(hash) + 1000000000000);
          // create telegram username fake
          telegramUsername = `browser_${address.slice(0, 8)}`;
          // it truns out user didn't enter from telegram
          isTelegram = false;
          // save information from localstorage
          saveUserDataToStorage({
            telegramId,
            telegramUsername,
            isTelegram: false,
            walletAddress: address,
          });
        }
      }


      // despite all ways create random telegram id
      if (!telegramId) {
        telegramId = Number(Math.floor(Math.random() * 1000000000) + 100000000);
      }

      // this payload send to bakend
      const payload = {
        wallet_address: address,
        inviter_code: inviter_code || null,
        telegram_id: telegramId,
        telegram_username: telegramUsername,
        telegram_photo_url: telegramPhotoUrl,
        is_telegram: isTelegram,
      };

      // show payload on console web
      console.log("[CONNECT PAYLOAD]", payload);


      try {
        const response = await api.post("/connect/", payload);

        setWalletLocked(Boolean(response.data?.user?.wallet_locked));

        if (response.data?.user) {
          const user = response.data.user;
          saveUserDataToStorage({
            telegramId: user.telegram_id ?? telegramId,
            telegramUsername: user.telegram_username ?? telegramUsername,
            isTelegram: user.is_telegram ?? isTelegram,
            walletAddress: address,
          });
        }

        const walletResponse = await api.get(
          `/wallet/${address}/`
        );

        setWallet(walletResponse.data);

        setErrorType("none");
      } catch (e) {
        const errorData = e?.response?.data;
        const statusCode = e?.response?.status;
        const isNetworkError = e.message === "Network Error" || e.code === "ERR_NETWORK" || !e.response;

        if (isNetworkError) {
          setErrorType("network_error");
          setConnectError("Network Error! Please check your internet connection.");
        } else if (errorData?.error?.includes("already linked") || errorData?.error?.includes("locked") || errorData?.detail?.includes("already linked")) {
          setErrorType("locked");
          setConnectError("This wallet is already linked to another Telegram account.");
        } else if (statusCode === 400) {
          setErrorType("bad_request");
          const msg = errorData?.error || errorData?.detail || "Invalid wallet address format.";
          setConnectError(`Bad Request: ${msg}`);
        } else {
          setErrorType("server_error");
          const errorMessage = errorData?.error || errorData?.detail || e?.message || "Server error.";
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
    },
    [address]
  );


  useEffect(() => {
    connectAndLoadWallet();
  }, [connectAndLoadWallet]);


  // ====================================================
  // LIVE WALLET VALUES
  // ====================================================

  const refreshWalletValues = useCallback(async () => {
    if (!address) {
      return;
    }

    try {
      const response = await api.get(`/wallet/${address}/`);
      setWallet(response.data);
    } catch (error) {
      console.error("[WALLET VALUES] refresh error", error);
    }
  }, [address]);


  useEffect(() => {
    if (!address) {
      return undefined;
    }

    refreshWalletValues();

    const timer = window.setInterval(refreshWalletValues, 15000);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refreshWalletValues();
      }
    };

    const onFocus = () => {
      refreshWalletValues();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [address, refreshWalletValues]);


  // ====================================================
  // DISCONNECT / REPLACE WALLET
  // ====================================================

  const disconnectWallet = async () => {
    try {
      await tonConnectUI.disconnect();
    } catch (error) {
      console.error("TonConnect disconnect error:", error);
    }

    localStorage.removeItem("telegram_id");
    localStorage.removeItem("inviter_code");
    localStorage.removeItem(INVITER_CODE_KEY);
    clearInviterCode();
    localStorage.removeItem(USER_DATA_KEY);

    setWallet(null);
    setWalletLocked(false);
    setConnectError("");
    setErrorType("none");
    setWithdrawError("");
    setIsWithdrawOpen(false);

    hasConnected.current = false;

    window.location.reload();
  };


  const replaceWallet = async () => {
    if (isReplacingWallet || isWithdrawing || !address) {
      return;
    }

    setIsReplacingWallet(true);
    setConnectError("");
    setErrorType("none");

    try {
      console.log("[WALLET_CHANGE] disconnecting current wallet", address);
      await tonConnectUI.disconnect();
      removeStoredWalletOnly();
      setWallet(null);
      setWalletLocked(false);
      setWithdrawError("");
      setIsWithdrawOpen(false);
      hasConnected.current = false;

      await new Promise((resolve) => setTimeout(resolve, 300));
      await tonConnectUI.openModal();
    } catch (error) {
      console.error("[WALLET_REPLACE] error", error);
      setConnectError(error?.message || "Could not replace wallet.");
      setErrorType("server_error");
    } finally {
      setIsReplacingWallet(false);
    }
  };

  const handleRetry = () => {
    setConnectError("");
    setErrorType("none");
    hasConnected.current = false;
    window.location.reload();
  };


  // ====================================================
  // COPY
  // ====================================================

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


  // ====================================================
  // OPEN / CLOSE WITHDRAW
  // ====================================================

  const openWithdraw = (bucket = "ALL") => {
    setWithdrawError("");
    setWithdrawNotice("");
    setAmount("");
    setWithdrawSource("ECG");
    setWithdrawBucket(bucket);
    setWithdrawAsset("TON");
    setDestinationWallet("");
    setIsWithdrawOpen(true);
  };

  const openUsdtWithdraw = (bucket = "ALL") => {
    setWithdrawError("");
    setWithdrawNotice("");
    setAmount("");
    setWithdrawSource("USDT");
    setWithdrawBucket(bucket);
    setWithdrawAsset("TON");
    setDestinationWallet("");
    setIsWithdrawOpen(true);
  };

  const closeWithdraw = () => {
    if (isWithdrawing) return;
    setIsWithdrawOpen(false);
  };


  // ====================================================
  // WITHDRAW HISTORY
  // ====================================================

  const loadWithdrawHistory = useCallback(async () => {
    if (!address) {
      setWithdrawHistory([]);
      return;
    }

    try {
      setWithdrawHistoryLoading(true);
      const response = await api.get("/withdraw/history/", {
        params: { wallet_address: address },
      });
      setWithdrawHistory(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("[WITHDRAW HISTORY] load error", error);
    } finally {
      setWithdrawHistoryLoading(false);
    }
  }, [address]);


  useEffect(() => {
    if (!address) return undefined;

    loadWithdrawHistory();

    const timer = window.setInterval(loadWithdrawHistory, 10000);

    return () => window.clearInterval(timer);
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

    if (withdrawSource === "USDT" && !tonPrice) {
      setWithdrawError("TON price is not available yet.");
      return;
    }

    if (!destinationWallet.trim()) {
      setWithdrawError(
        `Please enter the destination ${withdrawSource === "USDT" ? "TON" : withdrawAsset} wallet address.`
      );
      return;
    }

    const payload = {
      wallet_address: address,
      destination_wallet: destinationWallet.trim(),
      source_asset: withdrawSource,
      asset: withdrawSource === "USDT" ? "TON" : withdrawAsset,
      scope: withdrawSource === "USDT" ? "USDT_PROFIT_ONLY" : "ALL_WITHDRAWABLE",
      withdraw_bucket: withdrawBucket,
      amount: n,
    };

    try {
      setIsWithdrawing(true);

      setDebugInfo({
            step: "BEFORE WITHDRAW",
            amount,
            withdrawSource,
            withdrawBucket,
            withdrawAsset,
            wallet,
            payload,
          });

      const withdrawResponse = await api.post("/withdraw/request/", payload);

      setDebugInfo((prev) => ({
          ...prev,
          step: "AFTER WITHDRAW POST",
          withdrawResponse: withdrawResponse?.data,
        }));

       setWallet((prev) => {
            if (!prev) return prev;

            // =========================
            // ECG - OWN
            // =========================
            if (
              withdrawSource === "ECG" &&
              withdrawBucket === "SELF"
            ) {
              const current =
                Number(
                  prev.purchase_profit_ecg_unlocked ??
                  prev.ecg_self_unlocked ??
                  0
                );

              const nextValue = Math.max(0, current - value);

              return {
                ...prev,

                purchase_profit_ecg_unlocked: nextValue,
                ecg_self_unlocked: nextValue,

                withdrawable_ecg_profit: Math.max(
                  0,
                  Number(prev.withdrawable_ecg_profit || 0) - value
                ),
              };
            }

            // =========================
            // ECG - REFERRAL
            // =========================
            if (
              withdrawSource === "ECG" &&
              withdrawBucket === "REFERRAL"
            ) {
              const current =
                Number(
                  prev.referral_profit_ecg_unlocked ??
                  prev.referral_available_ecg ??
                  prev.available_referral_ecg ??
                  prev.ecg_referral_profit ??
                  0
                );

              const nextValue = Math.max(0, current - value);

              return {
                ...prev,

                referral_profit_ecg_unlocked: nextValue,
                referral_available_ecg: nextValue,
                available_referral_ecg: nextValue,
                ecg_referral_profit: nextValue,

                withdrawable_ecg_profit: Math.max(
                  0,
                  Number(prev.withdrawable_ecg_profit || 0) - value
                ),
              };
            }

            // =========================
            // USDT - OWN
            // =========================
            if (
              withdrawSource === "USDT" &&
              withdrawBucket === "SELF"
            ) {
              const current =
                Number(prev.self_profit_usdt_unlocked || 0);

              const nextValue = Math.max(0, current - value);

              return {
                ...prev,

                self_profit_usdt_unlocked: nextValue,

                withdrawable_usdt_profit: Math.max(
                  0,
                  Number(prev.withdrawable_usdt_profit || 0) - value
                ),
              };
            }

            // =========================
            // USDT - REFERRAL
            // =========================
            if (
              withdrawSource === "USDT" &&
              withdrawBucket === "REFERRAL"
            ) {
              const current =
                Number(prev.referral_profit_usdt_unlocked || 0);

              const nextValue = Math.max(0, current - value);

              return {
                ...prev,

                referral_profit_usdt_unlocked: nextValue,

                withdrawable_usdt_profit: Math.max(
                  0,
                  Number(prev.withdrawable_usdt_profit || 0) - value
                ),
              };
            }

            return prev;
            });

      // const walletResponse = await api.get(`/wallet/${address}/`);
      // setWallet(walletResponse.data);

      const createdRequest = withdrawResponse?.data || {};

      setWithdrawNotice(
        withdrawSource === "USDT"
          ? `USDT → TON request #${createdRequest.id || ""} submitted. Please wait for admin approval.`
          : `Withdrawal request #${createdRequest.id || ""} submitted. Please wait for admin approval.`
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
  // UNI-LEVEL REFERRAL VALUES (ECG)
  // ====================================================

  const loadReferralLevels = useCallback(async () => {
    if (!address) {
      setReferralLevels({});
      return;
    }

    setReferralLevelsLoading(true);

    try {
      const response = await axios.get("/api/referral/levels/", {
        params: { wallet_address: address },
      });
      setReferralLevels(response?.data?.levels || {});
    } catch (error) {
      console.error("[Wallet] referral levels load error:", error);
    } finally {
      setReferralLevelsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (!address) {
      setReferralLevels({});
      return undefined;
    }

    loadReferralLevels();

    const timer = window.setInterval(loadReferralLevels, 15000);

    return () => window.clearInterval(timer);
  }, [address, loadReferralLevels]);


  // ====================================================
  // CALCULATIONS
  // ====================================================

  const ecgAsset = wallet?.assets?.ECG || wallet?.balances?.ECG || {};
  const usdtAsset = wallet?.assets?.USDT || wallet?.balances?.USDT || {};

  const referralProfitEcgUnlocked = Number(
    wallet?.referral_profit_ecg_unlocked ??
    wallet?.referral_available_ecg ??
    wallet?.available_referral_ecg ??
    wallet?.ecg_referral_profit ??
    0
  );

  const referralAvailableEcg = referralProfitEcgUnlocked;

  const purchaseProfitLocked = Number(
    wallet?.purchase_profit_ecg_locked ??
    wallet?.self_profit_locked ??
    0
  );

  const selfProfitUnlocked = Number(
    wallet?.purchase_profit_ecg_unlocked ??
    wallet?.ecg_self_unlocked ??
    0
  );

  const purchaseProfitBalance = useMemo(
    () =>
      Number(
        wallet?.total_ecg_profit ??
        (Number(wallet?.self_profit_locked || 0) +
        Number(wallet?.ecg_self_unlocked || 0) +
        Number(wallet?.ecg_referral_profit || 0))
      ),
    [wallet]
  );

  const withdrawableBalance = Number(
    wallet?.withdrawable_ecg_profit ??
    (selfProfitUnlocked + referralProfitEcgUnlocked)
  );

  const purchaseProfitUsdt = Number(
    wallet?.purchase_profit_usdt ??
    usdtAsset.available ??
    0
  );

  const purchaseProfitUsdtLocked = Number(
    wallet?.purchase_profit_usdt_locked ?? 0
  );

  const withdrawableUsdt = Number(
    wallet?.withdrawable_usdt_profit ??
    wallet?.purchase_profit_usdt_unlocked ??
    0
  );

  const selfProfitUsdtUnlocked = Number(
    wallet?.self_profit_usdt_unlocked ?? 0
  );

  const referralProfitUsdtUnlocked = Number(
    wallet?.referral_profit_usdt_unlocked ??
    Math.max(withdrawableUsdt - selfProfitUsdtUnlocked, 0)
  );

  const ownEcgProfitTotal = purchaseProfitLocked + selfProfitUnlocked;
  const ownUsdtProfitTotal = purchaseProfitUsdtLocked + selfProfitUsdtUnlocked;

  const selectedEcgAvailable =
    withdrawBucket === "SELF"
      ? selfProfitUnlocked
      : withdrawBucket === "REFERRAL"
        ? referralProfitEcgUnlocked
        : withdrawableBalance;

  const selectedUsdtAvailable =
    withdrawBucket === "SELF"
      ? selfProfitUsdtUnlocked
      : withdrawBucket === "REFERRAL"
        ? referralProfitUsdtUnlocked
        : withdrawableUsdt;

  const withdrawableTon = useMemo(() => {
    const ecg = selectedEcgAvailable;
    if (!tonPrice || !ecg) {
      return "0.0000";
    }
    return (ecg / (tonPrice * ECG_PER_USDT)).toFixed(4);
  }, [selectedEcgAvailable, tonPrice]);

  const withdrawableUsdtTon = useMemo(() => {
    if (!tonPrice || !selectedUsdtAvailable) {
      return "0.0000";
    }
    return (selectedUsdtAvailable / tonPrice).toFixed(4);
  }, [selectedUsdtAvailable, tonPrice]);

  const sumReferralProfit = (users = [], asset = "ECG") =>
    users.reduce((sum, user) => {
      if (asset === "USDT") {
        return sum + Number(user?.profit_usdt || 0);
      }
      return sum + Number(user?.profit_ecg ?? user?.profit ?? 0);
    }, 0);

  const uniLevelFivePercentEcg = sumReferralProfit(
    referralLevels?.level_1?.users || [],
    "ECG"
  );
  const uniLevelFivePercentUsdt = sumReferralProfit(
    referralLevels?.level_1?.users || [],
    "USDT"
  );

  const uniLevelOnePercentEcg = [2, 3, 4, 5].reduce(
    (sum, level) =>
      sum + sumReferralProfit(referralLevels?.[`level_${level}`]?.users || [], "ECG"),
    0
  );
  const uniLevelOnePercentUsdt = [2, 3, 4, 5].reduce(
    (sum, level) =>
      sum + sumReferralProfit(referralLevels?.[`level_${level}`]?.users || [], "USDT"),
    0
  );

  const referralLevel1FivePercentEcg = Number(
    wallet?.referral_level1_profit_ecg ?? uniLevelFivePercentEcg ?? 0
  );

  const referralLevels2To5OnePercentEcg = Number(
    wallet?.referral_levels2_5_profit_ecg ?? uniLevelOnePercentEcg ?? 0
  );

  const referralLevel1FivePercentUsdt = Number(
    wallet?.referral_level1_profit_usdt ?? uniLevelFivePercentUsdt ?? 0
  );

  const referralLevels2To5OnePercentUsdt = Number(
    wallet?.referral_levels2_5_profit_usdt ?? uniLevelOnePercentUsdt ?? 0
  );

  const totalWithdrawEcg = useMemo(
    () => Number(wallet?.total_withdrawn ?? 0),
    [wallet]
  );

  const canWithdrawEcgSelf = selfProfitUnlocked > 0;
  const canWithdrawEcgReferral = referralProfitEcgUnlocked > 0;
  const canWithdrawUsdtSelf = selfProfitUsdtUnlocked > 0;
  const canWithdrawUsdtReferral = referralProfitUsdtUnlocked > 0;

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
            Purchase profit balance in ECG
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
                    {shortenMiddle(displayAddress || address, 6, 6)}
                  </div>

                </div>


                <button
                  type="button"
                  className="icon-action-btn"
                  onClick={() => copyText("Wallet address", displayAddress || address)}
                  aria-label="Copy wallet address"
                  title="Copy wallet address"
                >
                  <CopyIcon size={22} />
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
                    {shortenMiddle(ECG_CONTRACT_ADDRESS, 6, 8)}
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
                  onClick={() => copyText("Contract address", ECG_CONTRACT_ADDRESS)}
                >
                  <CopyIcon size={18} />
                  <span>Copy</span>
                </button>


                <button
                  type="button"
                  className="small-outline-btn"
                  onClick={openContractLink}
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

                  {errorType === "locked" ? "🔒" : "⚠️"}

                </div>


                <div className="error-title">

                  {errorType === "locked"
                    ? "Wallet already linked"
                    : "Connection issue"}

                </div>


                <div className="error-desc">
                  {connectError}
                </div>


                {(errorType === "locked" || errorType === "network_error") && (

                  <div className="wallet-error-actions">

                    {errorType === "locked" && (

                      <button
                        className="wallet-inline-btn danger"
                        onClick={disconnectWallet}
                      >
                        Disconnect & Try Again
                      </button>

                    )}


                    {errorType === "network_error" && (

                      <button
                        className="wallet-inline-btn"
                        onClick={handleRetry}
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

                {/* FOUR PROFIT WITHDRAW BOXES */}

                <section
                  className="wallet-profit-withdraw-card"
                  style={{
                    maxHeight: "520px",
                    overflowY: "auto",
                    paddingRight: "6px",
                    marginTop: 14,
                    padding: 16,
                    borderRadius: 18,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.035)",
                  }}
                >
                  <div style={{ marginBottom: 12 }}>
                    <div
                      style={{
                        fontSize: 11,
                        opacity: 0.65,
                        letterSpacing: "0.10em",
                        fontWeight: 800,
                      }}
                    >
                      PROFIT WITHDRAW
                    </div>
                    <strong
                      style={{
                        display: "block",
                        marginTop: 4,
                        fontSize: 18,
                      }}
                    >
                      ECG & Tether Profit
                    </strong>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
                      gap: 10,
                    }}
                  >
                    {/* ECG OWN 5% */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        minHeight: 158,
                        padding: 12,
                        borderRadius: 12,
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <div style={{ fontSize: 11, opacity: 0.62 }}>
                        ECG • Own 5% Profit
                      </div>
                      <strong style={{ marginTop: 5, fontSize: 16 }}>
                        {ownEcgProfitTotal.toFixed(4)} ECG
                      </strong>
                      <div style={{ fontSize: 10, opacity: 0.58, marginTop: 6, lineHeight: 1.5 }}>
                        Available: {selfProfitUnlocked.toFixed(4)} ECG
                        <br />
                        Locked 30d: {purchaseProfitLocked.toFixed(4)} ECG
                      </div>
                      <button
                        type="button"
                        onClick={() => openWithdraw("SELF")}
                        disabled={!canWithdrawEcgSelf}
                        style={{
                          marginTop: "auto",
                          alignSelf: "flex-start",
                          padding: "6px 11px",
                          borderRadius: 8,
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: canWithdrawEcgSelf ? "rgba(35,211,238,0.12)" : "rgba(255,255,255,0.04)",
                          color: "inherit",
                          fontSize: 10,
                          fontWeight: 800,
                          cursor: canWithdrawEcgSelf ? "pointer" : "not-allowed",
                          opacity: canWithdrawEcgSelf ? 1 : 0.55,
                        }}
                      >
                        {canWithdrawEcgSelf ? "Withdraw" : "🔒 Locked 30d"}
                      </button>
                    </div>

                    {/* ECG REFERRAL */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        minHeight: 158,
                        padding: 12,
                        borderRadius: 12,
                        background: "rgba(35,211,238,0.06)",
                        border: "1px solid rgba(35,211,238,0.14)",
                      }}
                    >
                      <div style={{ fontSize: 11, opacity: 0.62 }}>
                        ECG • Referral Profit
                      </div>
                      <strong style={{ marginTop: 5, fontSize: 16 }}>
                        {referralAvailableEcg.toFixed(4)} ECG
                      </strong>
                      <div style={{ fontSize: 10, opacity: 0.68, marginTop: 6, lineHeight: 1.55 }}>
                        Level 1 • 5%: {referralLevel1FivePercentEcg.toFixed(4)} ECG
                        <br />
                        Levels 2–5 • 1% each: {referralLevels2To5OnePercentEcg.toFixed(4)} ECG
                        <br />
                        Available instantly
                      </div>
                      <button
                        type="button"
                        onClick={() => openWithdraw("REFERRAL")}
                        disabled={!canWithdrawEcgReferral}
                        style={{
                          marginTop: "auto",
                          alignSelf: "flex-start",
                          padding: "6px 11px",
                          borderRadius: 8,
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: canWithdrawEcgReferral ? "rgba(35,211,238,0.12)" : "rgba(255,255,255,0.04)",
                          color: "inherit",
                          fontSize: 10,
                          fontWeight: 800,
                          cursor: canWithdrawEcgReferral ? "pointer" : "not-allowed",
                          opacity: canWithdrawEcgReferral ? 1 : 0.55,
                        }}
                      >
                        {canWithdrawEcgReferral ? "Withdraw" : "No balance"}
                      </button>
                    </div>

                    {/* USDT OWN 5% */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        minHeight: 158,
                        padding: 12,
                        borderRadius: 12,
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <div style={{ fontSize: 11, opacity: 0.62 }}>
                        Tether • Own 5% Profit
                      </div>
                      <strong style={{ marginTop: 5, fontSize: 16 }}>
                        {ownUsdtProfitTotal.toFixed(4)} USDT
                      </strong>
                      <div style={{ fontSize: 10, opacity: 0.58, marginTop: 6, lineHeight: 1.5 }}>
                        Available: {selfProfitUsdtUnlocked.toFixed(4)} USDT
                        <br />
                        Locked 30d: {purchaseProfitUsdtLocked.toFixed(4)} USDT
                      </div>
                      <button
                        type="button"
                        onClick={() => openUsdtWithdraw("SELF")}
                        disabled={!canWithdrawUsdtSelf}
                        style={{
                          marginTop: "auto",
                          alignSelf: "flex-start",
                          padding: "6px 11px",
                          borderRadius: 8,
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: canWithdrawUsdtSelf ? "rgba(35,211,238,0.12)" : "rgba(255,255,255,0.04)",
                          color: "inherit",
                          fontSize: 10,
                          fontWeight: 800,
                          cursor: canWithdrawUsdtSelf ? "pointer" : "not-allowed",
                          opacity: canWithdrawUsdtSelf ? 1 : 0.55,
                        }}
                      >
                        {canWithdrawUsdtSelf ? "Withdraw" : "🔒 Locked 30d"}
                      </button>
                    </div>

                    {/* USDT REFERRAL */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        minHeight: 158,
                        padding: 12,
                        borderRadius: 12,
                        background: "rgba(35,211,238,0.06)",
                        border: "1px solid rgba(35,211,238,0.14)",
                      }}
                    >
                      <div style={{ fontSize: 11, opacity: 0.62 }}>
                        Tether • Referral Profit
                      </div>
                      <strong style={{ marginTop: 5, fontSize: 16 }}>
                        {referralProfitUsdtUnlocked.toFixed(4)} USDT
                      </strong>
                      <div style={{ fontSize: 10, opacity: 0.68, marginTop: 6, lineHeight: 1.55 }}>
                        Level 1 • 5%: {referralLevel1FivePercentUsdt.toFixed(4)} USDT
                        <br />
                        Levels 2–5 • 1% each: {referralLevels2To5OnePercentUsdt.toFixed(4)} USDT
                        <br />
                        Available instantly • converts to TON
                      </div>
                      <button
                        type="button"
                        onClick={() => openUsdtWithdraw("REFERRAL")}
                        disabled={!canWithdrawUsdtReferral}
                        style={{
                          marginTop: "auto",
                          alignSelf: "flex-start",
                          padding: "6px 11px",
                          borderRadius: 8,
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: canWithdrawUsdtReferral ? "rgba(35,211,238,0.12)" : "rgba(255,255,255,0.04)",
                          color: "inherit",
                          fontSize: 10,
                          fontWeight: 800,
                          cursor: canWithdrawUsdtReferral ? "pointer" : "not-allowed",
                          opacity: canWithdrawUsdtReferral ? 1 : 0.55,
                        }}
                      >
                        {canWithdrawUsdtReferral ? "Withdraw" : "No balance"}
                      </button>
                    </div>
                  </div>
                </section>


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
                <div
                    style={{
                      marginTop: 16,
                      padding: 12,
                      border: "1px solid #555",
                      borderRadius: 10,
                      background: "#111",
                      color: "#00ff88",
                      fontSize: 11,
                      overflowX: "auto",
                      maxHeight: 350,
                      overflowY: "auto",
                    }}
                  >
                    <div style={{ marginBottom: 8, fontWeight: 800 }}>
                      DEBUG INFO
                    </div>

                    <pre
                      style={{
                        margin: 0,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {JSON.stringify(debugInfo, null, 2)}
                    </pre>
                  </div>


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
                        const rawStatus = String(item.display_status || item.status || "").toUpperCase();

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

                        const isTon = String(item.raw_asset || item.asset || "").toUpperCase() === "TON";
                        const sourceAsset = String(item.source_asset || "ECG").toUpperCase();

                        const requestedValue = isTon
                          ? `${Number(
                                      item.ton_amount ??
                                      item.ton_received ??
                                      item.converted_amount ??
                                      item.output_amount ??
                                      0
                                    ).toLocaleString(undefined, {
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
                                  <span className="withdraw-history-label">
                                    {sourceAsset === "USDT" ? "USDT reserved" : "ECG reserved"}
                                  </span>
                                  <span className="withdraw-history-value">
                                    {sourceAsset === "USDT"
                                      ? `${Number(item.usdt_debited || item.amount || 0).toLocaleString(undefined, {
                                          maximumFractionDigits: 6,
                                        })} USDT`
                                      : `${Number(item.ecg_debited || item.amount || 0).toLocaleString(undefined, {
                                          maximumFractionDigits: 6,
                                        })} ECG`}
                                  </span>
                                </div>
                              )}

                              <div className="withdraw-history-detail-row">
                                <span className="withdraw-history-label">Requested</span>
                                <span className="withdraw-history-value">
                                  {item.created_at ? new Date(item.created_at).toLocaleString() : "—"}
                                </span>
                              </div>

                              {statusText === "Complete" && (
                                <>
                                  <div className="withdraw-history-detail-row">
                                    <span className="withdraw-history-label">Completed</span>
                                    <span className="withdraw-history-value">
                                      {item.completed_at ? new Date(item.completed_at).toLocaleString() : "—"}
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
                                        <CopyIcon size={16} />
                                        <span>Copy</span>
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


                {/* ================================================= */}
                {/* TEST BUTTON - REMOVE AFTER TESTING */}
                {/* ================================================= */}

                <button
                  className="wallet-disconnect-btn"
                  onClick={() => {
                    setWithdrawError("");
                    setWithdrawNotice("");
                    setAmount("0.5");
                    setWithdrawSource("ECG");
                    setWithdrawBucket("SELF");
                    setWithdrawAsset("TON");
                    setDestinationWallet("UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
                    setIsWithdrawOpen(true);
                  }}
                  style={{
                    borderColor: "rgba(255, 200, 50, 0.5)",
                    color: "#ffd700",
                    marginBottom: "10px",
                    background: "rgba(255, 200, 50, 0.08)",
                    borderWidth: "2px",
                  }}
                >
                  🧪 Test Withdraw Modal (No Balance Required)
                </button>


                {/* REPLACE WALLET */}

                <button
                  className="wallet-disconnect-btn"
                  onClick={replaceWallet}
                  disabled={isReplacingWallet || isWithdrawing}
                >
                  {isReplacingWallet ? "Opening Wallet Selector..." : "🔄 Replace Wallet"}
                </button>


                {/* DISCONNECT */}

                <button
                  className="wallet-disconnect-btn"
                  onClick={disconnectWallet}
                  disabled={isReplacingWallet || isWithdrawing}
                >
                  Disconnect Wallet
                </button>

              </>

            )}

          </>

        )}

      </div>


      {/* ================================================= */}
      {/* WITHDRAW MODAL */}
      {/* ================================================= */}

      {isWithdrawOpen && wallet && (

        <div
          className="modal-backdrop"
          onClick={closeWithdraw}
        >

          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >

            {/* HEADER */}

            <div className="modal-header">

              <h3>
                {withdrawBucket === "SELF"
                  ? `Withdraw Own ${withdrawSource} Profit`
                  : withdrawBucket === "REFERRAL"
                    ? `Withdraw Referral ${withdrawSource} Profit`
                    : "Withdraw"}
              </h3>

              <button
                className="modal-close"
                onClick={closeWithdraw}
                disabled={isWithdrawing}
              >
                ×
              </button>

            </div>

            {/* BODY */}

            <div className="modal-body">

              <label>
                Withdrawal Method
              </label>

              {withdrawSource === "USDT" ? (
                <div className="asset-picker">
                  <button
                    type="button"
                    className="selected"
                    disabled
                  >
                    Convert USDT → TON
                  </button>
                </div>
              ) : (
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
                    Withdraw with TON
                  </button>
                </div>
              )}

              <label htmlFor="withdraw-destination">
                {withdrawSource === "USDT"
                  ? "TON Wallet Address"
                  : `${withdrawAsset} Wallet Address`}
              </label>

              <input
                id="withdraw-destination"
                type="text"
                value={destinationWallet}
                onChange={(e) => setDestinationWallet(e.target.value)}
                placeholder={
                  withdrawSource === "USDT"
                    ? "Enter destination TON wallet address"
                    : `Enter destination ${withdrawAsset} wallet address`
                }
                disabled={isWithdrawing}
                autoComplete="off"
              />

              <div className="ton-info">
                {withdrawSource === "USDT"
                  ? "Your unlocked Tether profit will be reserved and converted to TON. The request stays Pending until admin pays the TON destination and marks it Complete."
                  : `This ${withdrawAsset} request will stay Pending until an admin pays the destination wallet and marks it Complete.`}
              </div>

              <label htmlFor="withdraw-amount">
                {withdrawSource === "USDT"
                  ? "USDT Amount to Convert"
                  : withdrawAsset === "TON"
                    ? "TON Amount"
                    : "Withdrawable Amount (ECG)"}
              </label>

              <div className="amount-wrapper">
                <input
                  id="withdraw-amount"
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={
                    withdrawSource === "USDT"
                      ? "Enter unlocked USDT amount"
                      : withdrawAsset === "TON"
                        ? "Enter TON amount"
                        : "Enter ECG amount"
                  }
                  min="0.000001"
                  disabled={isWithdrawing}
                />

                <button
                  type="button"
                  className="max-btn"
                  onClick={() =>
                    setAmount(
                      withdrawSource === "USDT"
                        ? selectedUsdtAvailable
                        : withdrawAsset === "TON"
                          ? withdrawableTon
                          : selectedEcgAvailable
                    )
                  }
                  disabled={isWithdrawing}
                >
                  MAX
                </button>
              </div>

              {withdrawSource === "USDT" ? (
                <div className="ton-info">
                  <div>
                    Available selected Tether profit:{" "}
                    <b>{selectedUsdtAvailable.toFixed(4)} USDT</b>
                  </div>
                  <div>
                    Estimated TON:{" "}
                    <b>
                      {tonPrice && Number(amount) > 0
                        ? (Number(amount) / Number(tonPrice)).toFixed(4)
                        : "0.0000"}
                      {" TON"}
                    </b>
                  </div>
                  <div>
                    MAX output: <b>{withdrawableUsdtTon} TON</b>
                  </div>
                </div>
              ) : withdrawAsset === "ECG" ? (
                <div className="max-balance-info">
                  <div>
                    Available selected profit:{" "}
                    <b>{selectedEcgAvailable.toFixed(4)} ECG</b>
                  </div>
                  <div>
                    Referral profit (instant):{" "}
                    <b>{referralProfitEcgUnlocked.toFixed(4)} ECG</b>
                  </div>
                  <div>
                    Own matured profit:{" "}
                    <b>{selfProfitUnlocked.toFixed(4)} ECG</b>
                  </div>
                </div>
              ) : (
                <div className="ton-info">
                  <div>
                    Withdrawable TON: <b>{withdrawableTon} TON</b>
                  </div>
                  <div>
                    Based on selected unlocked ECG profit:{" "}
                    <b>{selectedEcgAvailable.toFixed(2)} ECG</b>
                  </div>
                  <div>
                    Referral profit is available instantly; own 5% profit unlocks after 30 days.
                  </div>
                </div>
              )}

              {withdrawError && (
                <div className="error-text">
                  {withdrawError}
                </div>
              )}

            </div>

            {/* FOOTER */}

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
                  ? "Submitting Request..."
                  : withdrawSource === "USDT"
                    ? "Convert USDT to TON"
                    : withdrawAsset === "TON"
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