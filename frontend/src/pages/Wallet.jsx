import {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
} from "react";

import {
  useTonWallet,
  TonConnectButton,
  useTonConnectUI,
} from "@tonconnect/ui-react";

import { api } from "../api";
import "./Wallet.css";

import {
  captureInviterCode,
  clearInviterCode,
} from "../utils/referral";


// ======================================================
// CONSTANTS
// ======================================================

const USER_DATA_KEY = "my_app_user_data";
const INVITER_CODE_KEY = "inviter_code";

const WITHDRAW_TARGET = 60;

const ECG_PER_USDT = 312;

const ECG_CONTRACT_ADDRESS =
  "0x1A2b7F3c9D8e4B2A";

const ECG_CONTRACT_LINK =
  `https://bscscan.com/address/${ECG_CONTRACT_ADDRESS}`;


// ======================================================
// STORAGE
// ======================================================

const loadUserDataFromStorage = () => {
  try {
    const data =
      localStorage.getItem(
        USER_DATA_KEY
      );

    return data
      ? JSON.parse(data)
      : null;
  } catch (error) {
    console.error(
      "Error parsing localStorage:",
      error
    );

    return null;
  }
};


const saveUserDataToStorage = (
  newData
) => {
  try {
    const currentData =
      loadUserDataFromStorage() ||
      {};

    localStorage.setItem(
      USER_DATA_KEY,
      JSON.stringify({
        ...currentData,
        ...newData,
      })
    );
  } catch (error) {
    console.error(
      "Error saving localStorage:",
      error
    );
  }
};


const removeStoredWalletOnly = () => {
  try {
    const current =
      loadUserDataFromStorage();

    if (!current) {
      return;
    }

    const {
      walletAddress,
      ...telegramData
    } = current;

    localStorage.setItem(
      USER_DATA_KEY,
      JSON.stringify(
        telegramData
      )
    );
  } catch (error) {
    console.error(
      "Could not remove stored wallet:",
      error
    );
  }
};


// ======================================================
// UTILS
// ======================================================

const shortenMiddle = (
  value,
  start = 6,
  end = 6
) => {
  if (!value) {
    return "-";
  }

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

  // ====================================================
  // TON CONNECT
  // ====================================================

  const tonWallet =
    useTonWallet();

  const [
    tonConnectUI,
  ] = useTonConnectUI();


  const address =
    useMemo(
      () =>
        tonWallet
          ?.account
          ?.address,
      [tonWallet]
    );


  const hasConnected =
    useRef(false);


  // ====================================================
  // WALLET STATES
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


  // ====================================================
  // DEBUG
  // ====================================================

  const [
    withdrawDebugLogs,
    setWithdrawDebugLogs,
  ] = useState([]);


  const addWithdrawDebugLog =
    useCallback(
      (
        label,
        data = null
      ) => {
        const now =
          new Date();

        let details = "";

        if (
          data !== null &&
          data !== undefined
        ) {
          try {
            details =
              typeof data ===
              "string"
                ? data
                : JSON.stringify(
                    data,
                    null,
                    2
                  );
          } catch {
            details =
              String(data);
          }
        }

        setWithdrawDebugLogs(
          (prev) => [
            ...prev.slice(-79),

            {
              time:
                now.toLocaleTimeString(),

              isoTime:
                now.toISOString(),

              label,

              details,
            },
          ]
        );
      },
      []
    );


  // ====================================================
  // TON PRICE
  // ====================================================

  useEffect(() => {
    async function getTonPrice() {
      try {
        const response =
          await fetch(
            "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd"
          );

        const data =
          await response.json();

        setTonPrice(
          data?.[
            "the-open-network"
          ]?.usd ||
            null
        );
      } catch (error) {
        console.error(
          "TON price error:",
          error
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
        INVITER_CODE_KEY,
        inviterCode
      );
    }


    const tg =
      window.Telegram?.WebApp;


    const startParam =
      tg
        ?.initDataUnsafe
        ?.start_param;


    if (
      startParam &&
      startParam.startsWith(
        "ref_"
      )
    ) {
      const code =
        startParam.replace(
          "ref_",
          ""
        );

      localStorage.setItem(
        INVITER_CODE_KEY,
        code
      );
    }
  }, []);


  // ====================================================
  // SAVE ACTIVE WALLET LOCALLY
  // ====================================================

  useEffect(() => {
    if (!address) {
      return;
    }

    saveUserDataToStorage({
      walletAddress:
        address,
    });
  }, [address]);


  // ====================================================
  // CONNECT TELEGRAM USER + WALLET
  // ====================================================

  const connectAndLoadWallet =
    useCallback(
      async () => {
        if (
          !address ||
          hasConnected.current
        ) {
          return;
        }


        hasConnected.current =
          true;


        setConnectError("");
        setErrorType("none");


        // --------------------------------------------
        // INVITER
        // --------------------------------------------

        let inviter_code =
          localStorage.getItem(
            INVITER_CODE_KEY
          );


        if (!inviter_code) {
          inviter_code =
            captureInviterCode();

          if (inviter_code) {
            localStorage.setItem(
              INVITER_CODE_KEY,
              inviter_code
            );
          }
        }


        // --------------------------------------------
        // TELEGRAM USER DATA
        // --------------------------------------------

        let telegramId =
          null;

        let telegramUsername =
          null;

        let telegramPhotoUrl =
          null;

        let isTelegram =
          false;


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

          telegramPhotoUrl =
            savedData
              .telegramPhotoUrl ||
            null;

          isTelegram =
            Boolean(
              savedData
                .isTelegram
            );
        } else {

          const tg =
            window
              .Telegram
              ?.WebApp;


          const telegramUser =
            tg
              ?.initDataUnsafe
              ?.user;


          if (telegramUser) {

            telegramId =
              Number(
                telegramUser.id
              );

            telegramUsername =
              telegramUser
                .username ||
              null;

            telegramPhotoUrl =
              telegramUser
                .photo_url ||
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

          } else {

            // Browser fallback
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
            });
          }
        }


        // --------------------------------------------
        // LAST FALLBACK
        // --------------------------------------------

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


        // --------------------------------------------
        // BACKEND PAYLOAD
        // --------------------------------------------

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


        try {

          // ------------------------------------------
          // CONNECT
          // ------------------------------------------

          const response =
            await api.post(
              "/connect/",
              payload
            );


          const user =
            response
              ?.data
              ?.user;


          setWalletLocked(
            Boolean(
              user
                ?.wallet_locked
            )
          );


          if (user) {
            saveUserDataToStorage({
              telegramId:
                user.telegram_id ||
                telegramId,

              telegramUsername:
                user.telegram_username ||
                telegramUsername,

              telegramPhotoUrl:
                user.telegram_photo_url ||
                telegramPhotoUrl,

              isTelegram:
                user.is_telegram ??
                isTelegram,

              walletAddress:
                address,
            });
          }


          // ------------------------------------------
          // GET WALLET
          // ------------------------------------------

          const walletResponse =
            await api.get(
              `/wallet/${address}/`
            );


          setWallet(
            walletResponse.data
          );


          setConnectError("");
          setErrorType("none");

        } catch (error) {

          const errorData =
            error
              ?.response
              ?.data;


          const statusCode =
            error
              ?.response
              ?.status;


          const isNetworkError =
            error?.message ===
              "Network Error" ||
            error?.code ===
              "ERR_NETWORK" ||
            !error?.response;


          if (isNetworkError) {

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
              errorData?.error ||
              errorData?.detail ||
              "This wallet is already linked to another Telegram account."
            );

          } else if (
            statusCode ===
            400
          ) {

            setErrorType(
              "bad_request"
            );

            const message =
              errorData?.error ||
              errorData?.detail ||
              "Invalid wallet request.";

            setConnectError(
              `Bad Request: ${message}`
            );

          } else {

            setErrorType(
              "server_error"
            );

            const message =
              errorData?.error ||
              errorData?.detail ||
              error?.message ||
              "Server error.";

            setConnectError(
              `Server Error: ${message}`
            );
          }


          // ------------------------------------------
          // FALLBACK WALLET LOAD
          // ------------------------------------------

          if (
            statusCode !==
              400 &&
            !isNetworkError
          ) {
            try {
              const walletResponse =
                await api.get(
                  `/wallet/${address}/`
                );

              setWallet(
                walletResponse.data
              );
            } catch {
              // ignore
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
  // WHEN WALLET IS REMOVED
  // ====================================================

  useEffect(() => {
    if (!address) {
      hasConnected.current =
        false;
    }
  }, [address]);


  // ====================================================
  // FULL DISCONNECT
  // ====================================================

  const disconnectWallet =
    async () => {
      try {

        // ------------------------------------------
        // REAL TONCONNECT DISCONNECT
        // ------------------------------------------

        if (
          tonConnectUI
            ?.connected
        ) {
          await tonConnectUI.disconnect();
        }

      } catch (error) {
        console.error(
          "TonConnect disconnect error:",
          error
        );
      }


      // --------------------------------------------
      // CLEAR APP STORAGE
      // --------------------------------------------

      localStorage.removeItem(
        "telegram_id"
      );

      localStorage.removeItem(
        INVITER_CODE_KEY
      );

      clearInviterCode();

      localStorage.removeItem(
        USER_DATA_KEY
      );


      // --------------------------------------------
      // RESET UI
      // --------------------------------------------

      setWallet(null);

      setWalletLocked(
        false
      );

      setConnectError("");

      setErrorType("none");

      setWithdrawError("");

      setIsWithdrawOpen(
        false
      );

      hasConnected.current =
        false;


      window.location.reload();
    };


  // ====================================================
  // REPLACE WALLET
  //
  // TELEGRAM USER STAYS THE SAME
  // OLD TON WALLET SESSION IS DISCONNECTED
  // CONNECT MODAL OPENS FOR NEW WALLET
  // ====================================================

  const replaceWallet =
    async () => {

      if (
        isReplacingWallet ||
        isWithdrawing
      ) {
        return;
      }


      setIsReplacingWallet(
        true
      );

      setConnectError("");
      setErrorType("none");


      try {

        const oldAddress =
          address;


        console.log(
          "[REPLACE WALLET] Old wallet:",
          oldAddress
        );


        // ------------------------------------------
        // 1. DISCONNECT REAL TONCONNECT SESSION
        // ------------------------------------------

        if (
          tonConnectUI
            ?.connected
        ) {
          await tonConnectUI.disconnect();
        }


        console.log(
          "[REPLACE WALLET] TonConnect disconnected"
        );


        // ------------------------------------------
        // 2. PRESERVE TELEGRAM DATA
        //
        // فقط walletAddress محلی حذف می‌شود.
        // telegramId / username / inviter حفظ می‌شود.
        // ------------------------------------------

        removeStoredWalletOnly();


        // ------------------------------------------
        // 3. RESET CURRENT WALLET UI
        // ------------------------------------------

        setWallet(null);

        setWalletLocked(
          false
        );

        setWithdrawError("");

        setIsWithdrawOpen(
          false
        );

        hasConnected.current =
          false;


        // ------------------------------------------
        // 4. SMALL DELAY SO TONCONNECT STATE UPDATES
        // ------------------------------------------

        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              250
            )
        );


        // ------------------------------------------
        // 5. OPEN WALLET SELECTOR
        // ------------------------------------------

        await tonConnectUI.openModal();


        console.log(
          "[REPLACE WALLET] Wallet selection modal opened"
        );

      } catch (error) {

        console.error(
          "[REPLACE WALLET] Error:",
          error
        );


        setErrorType(
          "server_error"
        );


        setConnectError(
          error?.message ||
          "Could not open wallet replacement."
        );

      } finally {

        setIsReplacingWallet(
          false
        );
      }
    };


  // ====================================================
  // RETRY
  // ====================================================

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
      if (!value) {
        return;
      }

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


  // ====================================================
  // CONTRACT
  // ====================================================

  const openContractLink =
    () => {
      window.open(
        ECG_CONTRACT_LINK,
        "_blank",
        "noopener,noreferrer"
      );
    };


  // ====================================================
  // WITHDRAW MODAL
  // ====================================================

  const openWithdraw =
    () => {
      setWithdrawError("");

      setAmount("");

      setWithdrawAsset(
        "TON"
      );

      setDestinationWallet(
        ""
      );

      setWithdrawDebugLogs(
        []
      );

      setIsWithdrawOpen(
        true
      );
    };


  const closeWithdraw =
    () => {
      if (isWithdrawing) {
        return;
      }

      setIsWithdrawOpen(
        false
      );
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


  const totalBalance =
    useMemo(
      () =>
        Number(
          wallet
            ?.withdrawable_total ||
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
  // DEBUG HELPERS
  // ====================================================

  const sleep =
    (ms) =>
      new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            ms
          )
      );


  const safeHeaders =
    (headers) => {

      if (!headers) {
        return null;
      }


      try {

        const raw =
          typeof headers
            .toJSON ===
          "function"
            ? headers.toJSON()
            : {
                ...headers,
              };


        const cleaned = {
          ...raw,
        };


        delete cleaned.Authorization;
        delete cleaned.authorization;

        delete cleaned.Cookie;
        delete cleaned.cookie;

        delete cleaned[
          "X-Api-Key"
        ];

        delete cleaned[
          "x-api-key"
        ];


        return cleaned;

      } catch {

        return "[Could not serialize headers]";
      }
    };


  const serializeAxiosError =
    (error) => {

      let axiosJSON =
        null;


      try {

        axiosJSON =
          typeof error
            ?.toJSON ===
          "function"
            ? error.toJSON()
            : null;


        if (
          axiosJSON
            ?.config
            ?.headers
        ) {
          axiosJSON
            .config
            .headers =
            safeHeaders(
              axiosJSON
                .config
                .headers
            );
        }

      } catch {
        axiosJSON =
          null;
      }


      return {

        message:
          error?.message ||
          null,

        name:
          error?.name ||
          null,

        code:
          error?.code ||
          null,

        stack:
          error?.stack ||
          null,

        status:
          error
            ?.response
            ?.status ||
          null,

        statusText:
          error
            ?.response
            ?.statusText ||
          null,

        responseData:
          error
            ?.response
            ?.data ??
          null,

        responseHeaders:
          safeHeaders(
            error
              ?.response
              ?.headers
          ),

        request: {

          url:
            error
              ?.config
              ?.url ||
            null,

          method:
            error
              ?.config
              ?.method ||
            null,

          baseURL:
            error
              ?.config
              ?.baseURL ||
            api
              ?.defaults
              ?.baseURL ||
            null,

          timeout:
            error
              ?.config
              ?.timeout ??
            null,

          data:
            error
              ?.config
              ?.data ??
            null,

          headers:
            safeHeaders(
              error
                ?.config
                ?.headers
            ),
        },

        axiosJSON,
      };
    };


  // ====================================================
  // SAFE API HEALTH PROBE
  // ====================================================

  const probeWalletEndpoint =
    async (label) => {

      const startedAt =
        Date.now();


      addWithdrawDebugLog(
        `${label} START`,
        {
          endpoint:
            `/wallet/${address}/`,

          startedAt:
            new Date(
              startedAt
            ).toISOString(),

          browserOnline:
            navigator.onLine,

          apiBaseURL:
            api
              ?.defaults
              ?.baseURL ||
            null,
        }
      );


      try {

        const response =
          await api.get(
            `/wallet/${address}/`,
            {
              timeout:
                15000,
            }
          );


        const result = {

          ok:
            true,

          status:
            response
              ?.status ||
            null,

          durationMs:
            Date.now() -
            startedAt,

          responseHeaders:
            safeHeaders(
              response
                ?.headers
            ),

          withdrawableTotal:
            response
              ?.data
              ?.withdrawable_total ??
            null,

          data:
            response
              ?.data ??
            null,
        };


        addWithdrawDebugLog(
          `${label} OK`,
          result
        );


        return result;

      } catch (error) {

        const result = {

          ok:
            false,

          durationMs:
            Date.now() -
            startedAt,

          error:
            serializeAxiosError(
              error
            ),
        };


        addWithdrawDebugLog(
          `${label} FAILED`,
          result
        );


        return result;
      }
    };


  // ====================================================
  // AUTO DIAGNOSIS
  // ====================================================

  const diagnoseWithdrawFailure =
    ({
      error,
      preProbe,
      postProbeImmediate,
      postProbeDelayed,
    }) => {

      const status =
        error
          ?.response
          ?.status ||
        null;


      const data =
        error
          ?.response
          ?.data ||
        {};


      const headers =
        error
          ?.response
          ?.headers;


      const cfRay =
        data?.ray_id ||
        headers?.[
          "cf-ray"
        ] ||
        headers?.[
          "CF-Ray"
        ] ||
        null;


      const retryAfter =
        data
          ?.retry_after ||
        headers?.[
          "retry-after"
        ] ||
        null;


      const cloudflare =
        Boolean(
          data
            ?.cloudflare_error ||
          cfRay
        );


      let diagnosis =
        "Unknown failure.";

      let likelyLayer =
        "unknown";


      if (
        !navigator.onLine
      ) {

        diagnosis =
          "Browser is offline.";

        likelyLayer =
          "client/network";

      } else if (
        !error
          ?.response
      ) {

        diagnosis =
          "No HTTP response received. Possible DNS, TLS, CORS, network or proxy failure.";

        likelyLayer =
          "network/proxy";

      } else if (
        status >= 400 &&
        status < 500
      ) {

        diagnosis =
          "Backend returned a normal 4xx response. Check request validation or permissions.";

        likelyLayer =
          "application/request";

      } else if (
        status === 500
      ) {

        diagnosis =
          "Backend returned HTTP 500. Check backend traceback.";

        likelyLayer =
          "backend application";

      } else if (
        [
          502,
          503,
          504,
          520,
          521,
          522,
          523,
          524,
        ].includes(
          status
        )
      ) {

        likelyLayer =
          cloudflare
            ? "cloudflare/origin"
            : "reverse-proxy/origin";


        if (
          preProbe?.ok &&
          postProbeImmediate?.ok &&
          postProbeDelayed?.ok
        ) {

          diagnosis =
            "Normal wallet API is healthy before and after failure. Problem is specific to /withdraw/request/ or an upstream TON service used by withdrawal.";

        } else if (
          preProbe?.ok &&
          !postProbeImmediate?.ok &&
          !postProbeDelayed?.ok
        ) {

          diagnosis =
            "API was healthy before withdrawal but unavailable afterwards. Withdrawal may be crashing/restarting the backend worker.";

        } else if (
          preProbe?.ok &&
          !postProbeImmediate?.ok &&
          postProbeDelayed?.ok
        ) {

          diagnosis =
            "Backend became unavailable immediately after withdrawal and recovered. Possible worker crash/restart.";

        } else if (
          preProbe &&
          !preProbe.ok
        ) {

          diagnosis =
            "Backend was already unhealthy before withdrawal.";

        } else {

          diagnosis =
            "Gateway/origin failure detected.";
        }
      }


      return {

        diagnosis,

        likelyLayer,

        httpStatus:
          status,

        cloudflare,

        cloudflareRayId:
          cfRay,

        retryAfterSeconds:
          retryAfter,

        cloudflareErrorName:
          data
            ?.error_name ||
          null,

        cloudflareErrorCategory:
          data
            ?.error_category ||
          null,

        cloudflareInstance:
          data
            ?.instance ||
          null,

        preProbeOk:
          preProbe
            ?.ok ??
          null,

        postProbeImmediateOk:
          postProbeImmediate
            ?.ok ??
          null,

        postProbeDelayedOk:
          postProbeDelayed
            ?.ok ??
          null,
      };
    };


  // ====================================================
  // WITHDRAW
  // ====================================================

  const onWithdraw =
    async () => {

      setWithdrawError(
        ""
      );


      const n =
        Number(amount);


      const withdrawStartedAt =
        Date.now();


      const ecg =
        Number(
          wallet
            ?.withdrawable_total ||
            0
        );


      const calculatedTon =
        tonPrice &&
        ecg
          ? ecg /
            (
              tonPrice *
              ECG_PER_USDT
            )
          : null;


      // --------------------------------------------
      // START LOG
      // --------------------------------------------

      addWithdrawDebugLog(
        "WITHDRAW CLICK",
        {

          clickedAt:
            new Date(
              withdrawStartedAt
            ).toISOString(),

          asset:
            withdrawAsset,

          rawAmount:
            amount,

          parsedAmount:
            n,

          connectedWallet:
            address ||
            null,

          destinationInput:
            destinationWallet ||
            null,

          withdrawableECG:
            ecg,

          calculatedWithdrawableTON:
            calculatedTon ===
              null
              ? null
              : calculatedTon
                  .toFixed(
                    8
                  ),

          tonPrice,

          ecgPerUsdt:
            ECG_PER_USDT,
        }
      );


      addWithdrawDebugLog(
        "CLIENT ENVIRONMENT",
        {

          timestamp:
            new Date()
              .toISOString(),

          browserOnline:
            navigator.onLine,

          userAgent:
            navigator.userAgent,

          language:
            navigator.language,

          pageOrigin:
            window
              .location
              .origin,

          pagePath:
            window
              .location
              .pathname,

          apiBaseURL:
            api
              ?.defaults
              ?.baseURL ||
            null,

          axiosTimeout:
            api
              ?.defaults
              ?.timeout ??
            null,

          telegramWebApp:
            Boolean(
              window
                .Telegram
                ?.WebApp
            ),

          walletLocked,
        }
      );


      // --------------------------------------------
      // VALIDATION
      // --------------------------------------------

      if (
        !Number.isFinite(
          n
        ) ||
        n <= 0
      ) {

        const message =
          "Invalid amount.";

        addWithdrawDebugLog(
          "VALIDATION ERROR",
          {
            message,
            amount,
          }
        );

        setWithdrawError(
          message
        );

        return;
      }


      if (!address) {

        const message =
          "Please connect your wallet first.";

        addWithdrawDebugLog(
          "VALIDATION ERROR",
          message
        );

        setWithdrawError(
          message
        );

        return;
      }


      if (
        withdrawAsset ===
          "TON" &&
        n < 1
      ) {

        const message =
          "Minimum automatic TON withdrawal is 1 TON.";

        addWithdrawDebugLog(
          "VALIDATION ERROR",
          {
            message,
            requested:
              n,
          }
        );

        setWithdrawError(
          message
        );

        return;
      }


      if (
        withdrawAsset ===
        "ECG"
      ) {

        if (
          n < 60
        ) {

          const message =
            "Minimum withdrawal is 60 ECG.";

          addWithdrawDebugLog(
            "VALIDATION ERROR",
            {
              message,
            }
          );

          setWithdrawError(
            message
          );

          return;
        }


        if (
          !destinationWallet.trim()
        ) {

          const message =
            "Please enter the destination ECG wallet address.";

          addWithdrawDebugLog(
            "VALIDATION ERROR",
            message
          );

          setWithdrawError(
            message
          );

          return;
        }
      }


      let preProbe =
        null;


      try {

        setIsWithdrawing(
          true
        );


        // ------------------------------------------
        // PRE CHECK
        // ------------------------------------------

        preProbe =
          await probeWalletEndpoint(
            "PRE-PROBE /wallet"
          );


        // ------------------------------------------
        // PAYLOAD
        // ------------------------------------------

        const payload = {

          wallet_address:
            address,

          destination_wallet:
            withdrawAsset ===
              "TON"
              ? address
              : destinationWallet.trim(),

          asset:
            withdrawAsset,

          scope:
            "ALL_WITHDRAWABLE",

          amount:
            n,
        };


        const requestStartedAt =
          Date.now();


        addWithdrawDebugLog(
          "POST /withdraw/request/ START",
          {
            requestStartedAt:
              new Date(
                requestStartedAt
              ).toISOString(),

            endpoint:
              "/withdraw/request/",

            apiBaseURL:
              api
                ?.defaults
                ?.baseURL ||
              null,

            payload,
          }
        );


        // ------------------------------------------
        // WITHDRAW REQUEST
        // ------------------------------------------

        const withdrawResponse =
          await api.post(
            "/withdraw/request/",
            payload
          );


        addWithdrawDebugLog(
          "WITHDRAW RESPONSE",
          {

            requestDurationMs:
              Date.now() -
              requestStartedAt,

            status:
              withdrawResponse
                ?.status,

            statusText:
              withdrawResponse
                ?.statusText,

            headers:
              safeHeaders(
                withdrawResponse
                  ?.headers
              ),

            data:
              withdrawResponse
                ?.data,
          }
        );


        // ------------------------------------------
        // REFRESH WALLET
        // ------------------------------------------

        const refreshStartedAt =
          Date.now();


        const walletResponse =
          await api.get(
            `/wallet/${address}/`
          );


        addWithdrawDebugLog(
          "WALLET REFRESH RESPONSE",
          {

            durationMs:
              Date.now() -
              refreshStartedAt,

            status:
              walletResponse
                ?.status,

            data:
              walletResponse
                ?.data,
          }
        );


        setWallet(
          walletResponse.data
        );


        addWithdrawDebugLog(
          "AUTO DIAGNOSIS",
          {

            result:
              "Withdrawal endpoint returned successful HTTP response.",

            totalDurationMs:
              Date.now() -
              withdrawStartedAt,
          }
        );


        setAmount("");

        setDestinationWallet(
          ""
        );


        setIsWithdrawOpen(
          false
        );

      } catch (error) {

        // ------------------------------------------
        // ERROR
        // ------------------------------------------

        const serializedError =
          serializeAxiosError(
            error
          );


        addWithdrawDebugLog(
          "WITHDRAW ERROR",
          {

            failedAt:
              new Date()
                .toISOString(),

            totalDurationSinceClickMs:
              Date.now() -
              withdrawStartedAt,

            ...serializedError,
          }
        );


        const responseData =
          error
            ?.response
            ?.data ||
          {};


        const cfHeaders =
          error
            ?.response
            ?.headers;


        if (
          responseData
            ?.cloudflare_error ||
          cfHeaders?.[
            "cf-ray"
          ]
        ) {

          addWithdrawDebugLog(
            "CLOUDFLARE DETAILS",
            {

              status:
                error
                  ?.response
                  ?.status ||
                null,

              errorName:
                responseData
                  ?.error_name ||
                null,

              errorCategory:
                responseData
                  ?.error_category ||
                null,

              detail:
                responseData
                  ?.detail ||
                null,

              rayId:
                responseData
                  ?.ray_id ||
                cfHeaders?.[
                  "cf-ray"
                ] ||
                null,

              timestamp:
                responseData
                  ?.timestamp ||
                null,

              retryAfter:
                responseData
                  ?.retry_after ||
                cfHeaders?.[
                  "retry-after"
                ] ||
                null,
            }
          );
        }


        // ------------------------------------------
        // NEVER RETRY POST AUTOMATICALLY
        // ------------------------------------------

        addWithdrawDebugLog(
          "POST-FAILURE HEALTH CHECK",
          {
            important:
              "Withdrawal POST is NOT automatically retried.",
          }
        );


        const postProbeImmediate =
          await probeWalletEndpoint(
            "POST-PROBE #1 /wallet"
          );


        await sleep(
          2000
        );


        const postProbeDelayed =
          await probeWalletEndpoint(
            "POST-PROBE #2 /wallet"
          );


        const diagnosis =
          diagnoseWithdrawFailure({
            error,

            preProbe,

            postProbeImmediate,

            postProbeDelayed,
          });


        addWithdrawDebugLog(
          "AUTO DIAGNOSIS",
          {

            ...diagnosis,

            totalDurationMs:
              Date.now() -
              withdrawStartedAt,
          }
        );


        const backendMessage =
          error
            ?.response
            ?.data
            ?.error ||
          error
            ?.response
            ?.data
            ?.detail ||
          error
            ?.response
            ?.data
            ?.message ||
          error
            ?.message ||
          "Withdrawal failed.";


        setWithdrawError(
          backendMessage
        );

      } finally {

        setIsWithdrawing(
          false
        );


        addWithdrawDebugLog(
          "WITHDRAW FINISHED",
          {

            finishedAt:
              new Date()
                .toISOString(),

            browserOnline:
              navigator.onLine,

            totalDurationMs:
              Date.now() -
              withdrawStartedAt,
          }
        );
      }
    };


  // ====================================================
  // DEBUG COPY
  // ====================================================

  const withdrawDebugText =
    useMemo(
      () =>
        withdrawDebugLogs
          .map(
            (log) =>
              `[${log.time}] ${log.label}${
                log.isoTime
                  ? `\nISO: ${log.isoTime}`
                  : ""
              }${
                log.details
                  ? `\n${log.details}`
                  : ""
              }`
          )
          .join(
            "\n\n"
          ),
      [
        withdrawDebugLogs,
      ]
    );


  // ====================================================
  // RENDER
  // ====================================================

  return (

    <div className="wallet-page-container">

      <div className="wallet-box wallet-box--redesigned">


        {/* ================================================= */}
        {/* HEADER */}
        {/* ================================================= */}

        <div className="wallet-header-block">

          <h1 className="wallet-title">
            Wallet
          </h1>

          <p className="wallet-subtitle">
            Connect your wallet and manage your ECG balance
          </p>

        </div>


        {/* ================================================= */}
        {/* NOT CONNECTED */}
        {/* ================================================= */}

        {!address ? (

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

          <>

            {/* ============================================= */}
            {/* CONNECTED WALLET */}
            {/* ============================================= */}

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

                  <div className="wallet-avatar-badge">
                    👛
                  </div>

                  <div className="wallet-address-main">
                    {shortenMiddle(
                      address,
                      4,
                      4
                    )}
                  </div>

                </div>


                <button
                  type="button"
                  className="icon-action-btn"
                  onClick={() =>
                    copyText(
                      "Wallet address",
                      address
                    )
                  }
                >
                  ⧉
                </button>

              </div>

            </div>


            {/* ============================================= */}
            {/* CONTRACT */}
            {/* ============================================= */}

            <div className="contract-card">

              <div className="contract-left">

                <div className="contract-icon">
                  📄
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


            {/* ============================================= */}
            {/* TOAST */}
            {/* ============================================= */}

            {copiedText && (

              <div className="wallet-toast">
                {copiedText}
              </div>

            )}


            {/* ============================================= */}
            {/* CONNECTION ERROR */}
            {/* ============================================= */}

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


                <div className="wallet-error-actions">

                  {errorType ===
                    "locked" && (

                    <button
                      className="wallet-inline-btn danger"
                      onClick={
                        replaceWallet
                      }
                      disabled={
                        isReplacingWallet
                      }
                    >
                      {isReplacingWallet
                        ? "Opening Wallets..."
                        : "Choose Another Wallet"}
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

              </div>

            )}


            {/* ============================================= */}
            {/* LOADING */}
            {/* ============================================= */}

            {!wallet ? (

              <div className="wallet-loading-card">
                Loading wallet data...
              </div>

            ) : (

              <>

                {/* ========================================= */}
                {/* BALANCE */}
                {/* ========================================= */}

                <div className="wallet-balance-card">

                  <div className="balance-label">
                    TOTAL BALANCE
                  </div>


                  <div className="wallet-balance-row">

                    <div className="balance-number">

                      {Number(
                        totalBalance
                      ).toFixed(0)}

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


                {/* ========================================= */}
                {/* WITHDRAW GOAL */}
                {/* ========================================= */}

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
                      ).toFixed(0)}
                      {" / "}
                      {WITHDRAW_TARGET}
                      {" ECG"}
                    </span>


                    <span>
                      {Number(
                        remainingToUnlock
                      ).toFixed(0)}
                      {" ECG to go"}
                    </span>

                  </div>

                </div>


                {/* ========================================= */}
                {/* WITHDRAW */}
                {/* ========================================= */}

                <button
                  className={`wallet-main-action ${
                    canWithdraw
                      ? ""
                      : "disabled"
                  }`}
                  onClick={
                    openWithdraw
                  }
                  disabled={
                    !canWithdraw ||
                    isReplacingWallet
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


                {/* ========================================= */}
                {/* REPLACE WALLET */}
                {/* ========================================= */}

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


                {/* ========================================= */}
                {/* DISCONNECT */}
                {/* ========================================= */}

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


                {/* ========================================= */}
                {/* STATS */}
                {/* ========================================= */}

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
                        totalBalance
                      ).toFixed(0)}
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
                      🏆
                    </div>

                    <div className="stat-title">
                      Your Rank
                    </div>

                    <div className="stat-value">
                      --
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
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            {/* =========================================== */}
            {/* MODAL HEADER */}
            {/* =========================================== */}

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


            {/* =========================================== */}
            {/* MODAL BODY */}
            {/* =========================================== */}

            <div className="modal-body">

              <label>
                Withdrawal Method
              </label>


              {/* ========================================= */}
              {/* ASSET */}
              {/* ========================================= */}

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
                  Withdraw with TON (Auto)
                </button>

              </div>


              {/* ========================================= */}
              {/* DESTINATION */}
              {/* ========================================= */}

              {withdrawAsset ===
              "ECG" ? (

                <>

                  <label htmlFor="withdraw-destination">
                    ECG Wallet Address
                  </label>


                  <input
                    id="withdraw-destination"
                    type="text"
                    value={
                      destinationWallet
                    }
                    onChange={(event) =>
                      setDestinationWallet(
                        event
                          .target
                          .value
                      )
                    }
                    placeholder="Enter destination ECG wallet address"
                    disabled={
                      isWithdrawing
                    }
                    autoComplete="off"
                  />

                </>

              ) : (

                <div className="ton-info">

                  <div>
                    Automatic destination:{" "}

                    <b>
                      {shortenMiddle(
                        address,
                        8,
                        8
                      )}
                    </b>
                  </div>


                  <div>
                    TON will be sent automatically to your connected wallet.
                  </div>

                </div>

              )}


              {/* ========================================= */}
              {/* AMOUNT */}
              {/* ========================================= */}

              <label htmlFor="withdraw-amount">

                {withdrawAsset ===
                "TON"
                  ? "TON Amount"
                  : "Withdrawable Amount (ECG)"}

              </label>


              <div className="amount-wrapper">

                <input
                  id="withdraw-amount"
                  type="number"
                  inputMode="decimal"
                  value={
                    amount
                  }
                  onChange={(event) =>
                    setAmount(
                      event
                        .target
                        .value
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


              {/* ========================================= */}
              {/* INFO */}
              {/* ========================================= */}

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


              {/* ========================================= */}
              {/* ERROR */}
              {/* ========================================= */}

              {withdrawError && (

                <div className="error-text">
                  {withdrawError}
                </div>

              )}


              {/* ========================================= */}
              {/* DEBUG */}
              {/* ========================================= */}

              <div
                style={{
                  marginTop:
                    16,

                  border:
                    "1px solid rgba(255,255,255,0.18)",

                  borderRadius:
                    10,

                  background:
                    "#080b10",

                  overflow:
                    "hidden",
                }}
              >

                <div
                  style={{
                    display:
                      "flex",

                    alignItems:
                      "center",

                    justifyContent:
                      "space-between",

                    gap:
                      8,

                    padding:
                      "10px 12px",

                    borderBottom:
                      "1px solid rgba(255,255,255,0.12)",
                  }}
                >

                  <b
                    style={{
                      fontSize:
                        12,
                    }}
                  >
                    Withdrawal Deep Debug
                  </b>


                  <div
                    style={{
                      display:
                        "flex",

                      gap:
                        6,
                    }}
                  >

                    <button
                      type="button"
                      className="small-outline-btn"
                      onClick={() =>
                        copyText(
                          "Debug log",
                          withdrawDebugText
                        )
                      }
                      disabled={
                        !withdrawDebugLogs.length
                      }
                    >
                      Copy
                    </button>


                    <button
                      type="button"
                      className="small-outline-btn"
                      onClick={() =>
                        setWithdrawDebugLogs(
                          []
                        )
                      }
                      disabled={
                        !withdrawDebugLogs.length ||
                        isWithdrawing
                      }
                    >
                      Clear
                    </button>

                  </div>

                </div>


                <div
                  style={{
                    maxHeight:
                      420,

                    overflow:
                      "auto",

                    padding:
                      10,

                    fontFamily:
                      "monospace",

                    fontSize:
                      11,

                    lineHeight:
                      1.5,

                    whiteSpace:
                      "pre-wrap",

                    wordBreak:
                      "break-word",

                    textAlign:
                      "left",
                  }}
                >

                  {!withdrawDebugLogs.length ? (

                    <div
                      style={{
                        opacity:
                          0.6,
                      }}
                    >
                      Press withdrawal. Deep request,
                      Cloudflare and API diagnosis logs
                      will appear here.
                    </div>

                  ) : (

                    withdrawDebugLogs.map(
                      (
                        log,
                        index
                      ) => (

                        <div
                          key={`${log.isoTime}-${index}`}
                          style={{
                            paddingBottom:
                              9,

                            marginBottom:
                              9,

                            borderBottom:
                              index ===
                              withdrawDebugLogs.length -
                                1
                                ? "none"
                                : "1px dashed rgba(255,255,255,0.10)",
                          }}
                        >

                          <div>

                            [
                            {log.time}
                            ]{" "}

                            <b>
                              {log.label}
                            </b>

                          </div>


                          {log.isoTime && (

                            <div
                              style={{
                                opacity:
                                  0.5,

                                marginBottom:
                                  3,
                              }}
                            >
                              ISO: {log.isoTime}
                            </div>

                          )}


                          {log.details && (

                            <div>
                              {log.details}
                            </div>

                          )}

                        </div>

                      )
                    )

                  )}

                </div>

              </div>

            </div>


            {/* =========================================== */}
            {/* MODAL FOOTER */}
            {/* =========================================== */}

            <div className="modal-footer">

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
                  ? "Sending / Diagnosing..."
                  : withdrawAsset ===
                    "TON"
                  ? "Send TON Automatically"
                  : "Confirm Withdrawal"}

              </button>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}