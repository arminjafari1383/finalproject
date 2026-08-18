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

const ECG_CONTRACT_ADDRESS = "0x1A2b7F3c9D8e4B2A";

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
  // DEBUG STATE
  // ====================================================

  const [
    withdrawDebugLogs,
    setWithdrawDebugLogs,
  ] = useState([]);


  // ====================================================
  // DEBUG LOGGER
  // ====================================================

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

      setWithdrawDebugLogs(
        []
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


  // ====================================================
  // REMOVE SECRET HEADERS FROM DEBUG
  // ====================================================

  const safeHeaders =
    (headers) => {
      if (!headers) {
        return null;
      }

      try {
        const raw =
          typeof headers.toJSON ===
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


  // ====================================================
  // FULL AXIOS ERROR SERIALIZER
  // ====================================================

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
          axiosJSON.config.headers =
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
          error?.response
            ?.status ||
          null,

        statusText:
          error?.response
            ?.statusText ||
          null,

        responseData:
          error?.response
            ?.data ??
          null,

        responseHeaders:
          safeHeaders(
            error?.response
              ?.headers
          ),

        request: {
          url:
            error?.config
              ?.url ||
            null,

          method:
            error?.config
              ?.method ||
            null,

          baseURL:
            error?.config
              ?.baseURL ||
            api?.defaults
              ?.baseURL ||
            null,

          timeout:
            error?.config
              ?.timeout ??
            null,

          data:
            error?.config
              ?.data ??
            null,

          headers:
            safeHeaders(
              error?.config
                ?.headers
            ),
        },

        axiosJSON,
      };
    };


  // ====================================================
  // SAFE API HEALTH CHECK
  //
  // این تابع فقط GET می‌زند.
  // هیچ برداشت دوباره‌ای انجام نمی‌دهد.
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
            api?.defaults
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


        const durationMs =
          Date.now() -
          startedAt;


        const result = {
          ok: true,

          status:
            response
              ?.status ||
            null,

          durationMs,

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
        const durationMs =
          Date.now() -
          startedAt;


        const result = {
          ok: false,

          durationMs,

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
        error?.response
          ?.status ||
        null;


      const data =
        error?.response
          ?.data ||
        {};


      const headers =
        error?.response
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
        headers?.[
          "Retry-After"
        ] ||
        null;


      const cloudflare =
        Boolean(
          data
            ?.cloudflare_error ||
          cfRay
        );


      let diagnosis =
        "Unknown failure. Check detailed logs.";

      let likelyLayer =
        "unknown";


      // ------------------------------------------
      // CLIENT OFFLINE
      // ------------------------------------------

      if (
        !navigator.onLine
      ) {
        diagnosis =
          "Browser reports OFFLINE. Request may be failing before reaching the API.";

        likelyLayer =
          "client/network";
      }

      // ------------------------------------------
      // NO HTTP RESPONSE
      // ------------------------------------------

      else if (
        !error?.response
      ) {
        diagnosis =
          "Axios received no HTTP response. Possible DNS, TLS, CORS, client network, proxy, or origin connection failure.";

        likelyLayer =
          "network/proxy";
      }

      // ------------------------------------------
      // 4XX
      // ------------------------------------------

      else if (
        status >= 400 &&
        status < 500
      ) {
        diagnosis =
          "Server returned a normal 4xx response. Check validation, authentication, permission, wallet address, amount, or payload.";

        likelyLayer =
          "application/request";
      }

      // ------------------------------------------
      // 500
      // ------------------------------------------

      else if (
        status === 500
      ) {
        diagnosis =
          "Backend itself returned HTTP 500. Origin was reachable. Check backend traceback inside withdrawal handler.";

        likelyLayer =
          "backend application";
      }

      // ------------------------------------------
      // GATEWAY / CLOUDFLARE
      // ------------------------------------------

      else if (
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


        // API healthy before + after.
        if (
          preProbe?.ok &&
          postProbeImmediate?.ok &&
          postProbeDelayed?.ok
        ) {
          diagnosis =
            "The normal /wallet endpoint was healthy before and after the failed withdrawal. The problem is very likely specific to /withdraw/request/ or an upstream service used only during withdrawal, such as TON RPC, transaction sender, hot-wallet service, blockchain provider, or a dedicated withdrawal worker.";
        }

        // API healthy before, dead after.
        else if (
          preProbe?.ok &&
          !postProbeImmediate?.ok &&
          !postProbeDelayed?.ok
        ) {
          diagnosis =
            "API was healthy before withdrawal, but the normal /wallet endpoint also became unavailable after withdrawal. The withdrawal request may be crashing the backend worker, restarting the application, exhausting resources, or killing the origin process.";
        }

        // API temporarily dead then recovers.
        else if (
          preProbe?.ok &&
          !postProbeImmediate?.ok &&
          postProbeDelayed?.ok
        ) {
          diagnosis =
            "API was healthy before withdrawal, became unavailable immediately after the withdrawal attempt, then recovered. Strong sign of a worker crash/restart, temporary origin failure, upstream timeout, or withdrawal process killing/restarting the worker.";
        }

        // Server broken before withdrawal.
        else if (
          preProbe &&
          !preProbe.ok
        ) {
          diagnosis =
            "The normal /wallet endpoint was already unhealthy before the withdrawal POST. This indicates a broader backend/origin availability problem, not just the withdrawal payload.";
        }

        else {
          diagnosis =
            "Gateway/origin failure detected. Compare PRE-PROBE and POST-PROBE results and inspect origin logs using the Cloudflare Ray ID.";
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

  const onWithdraw =
    async () => {
      setWithdrawError(
        ""
      );


      const n =
        Number(amount);


      const withdrawStartedAt =
        Date.now();


      // Calculate separately for logging.
      const calculatedTon =
        (() => {
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
            return null;
          }

          return (
            ecg /
            (
              tonPrice *
              ECG_PER_USDT
            )
          );
        })();


      // =================================================
      // CLICK LOG
      // =================================================

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
            Number(
              wallet
                ?.withdrawable_total ||
                0
            ),

          calculatedWithdrawableTON:
            calculatedTon ===
            null
              ? null
              : calculatedTon.toFixed(
                  8
                ),

          tonPrice,

          ecgPerUsdt:
            ECG_PER_USDT,

          formula:
            "ECG / (TON_USD_PRICE * ECG_PER_USDT)",
        }
      );


      // =================================================
      // CLIENT ENVIRONMENT
      // =================================================

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
            window.location
              .origin,

          pagePath:
            window.location
              .pathname,

          apiBaseURL:
            api?.defaults
              ?.baseURL ||
            null,

          axiosTimeout:
            api?.defaults
              ?.timeout ??
            null,

          telegramWebApp:
            Boolean(
              window
                .Telegram
                ?.WebApp
            ),

          telegramUserExists:
            Boolean(
              window
                .Telegram
                ?.WebApp
                ?.initDataUnsafe
                ?.user
            ),

          walletLocked,
        }
      );


      // =================================================
      // VALIDATION
      // =================================================

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

            rawAmount:
              amount,

            parsedAmount:
              n,
          }
        );

        return setWithdrawError(
          message
        );
      }


      if (!address) {
        const message =
          "Please connect your wallet first.";

        addWithdrawDebugLog(
          "VALIDATION ERROR",
          message
        );

        return setWithdrawError(
          message
        );
      }


      if (
        withdrawAsset ===
          "TON" &&
        n < 1
      ) {
        const message =
          "Minimum TON withdrawal is 1 TON.";

        addWithdrawDebugLog(
          "VALIDATION ERROR",
          {
            message,

            requested:
              n,

            minimum:
              1,
          }
        );

        return setWithdrawError(
          message
        );
      }


      if (
        withdrawAsset ===
        "ECG" &&
        n < 60
      ) {
        const message =
          "Minimum withdrawal is 60 ECG.";

        addWithdrawDebugLog(
          "VALIDATION ERROR",
          {
            message,
            requested: n,
            minimum: 60,
          }
        );

        return setWithdrawError(
          message
        );
      }


      // ECG and TON use exactly the same manual request flow:
      // user enters the destination address + amount for both assets.
      if (!destinationWallet.trim()) {
        const message =
          `Please enter the destination ${withdrawAsset} wallet address.`;

        addWithdrawDebugLog(
          "VALIDATION ERROR",
          message
        );

        return setWithdrawError(
          message
        );
      }


      // This stores API state BEFORE POST.
      let preProbe =
        null;


      try {
        setIsWithdrawing(
          true
        );


        // ===============================================
        // TEST API BEFORE WITHDRAW
        // ===============================================

        addWithdrawDebugLog(
          "PRE-WITHDRAW HEALTH CHECK",
          {
            reason:
              "Testing the normal /wallet endpoint immediately before withdrawal so we know whether the origin was healthy before POST.",
          }
        );


        preProbe =
          await probeWalletEndpoint(
            "PRE-PROBE /wallet"
          );


        // ===============================================
        // PAYLOAD
        // ===============================================

        const payload = {
          wallet_address:
            address,

          destination_wallet:
            destinationWallet.trim(),

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
              api?.defaults
                ?.baseURL ||
              null,

            browserOnline:
              navigator.onLine,

            payload,
          }
        );


        console.log(
          "[WITHDRAW] payload",
          payload
        );


        // ===============================================
        // ACTUAL WITHDRAW REQUEST
        // ===============================================

        const withdrawResponse =
          await api.post(
            "/withdraw/request/",
            payload
          );


        const requestDurationMs =
          Date.now() -
          requestStartedAt;


        // ===============================================
        // SUCCESS RESPONSE
        // ===============================================

        addWithdrawDebugLog(
          "WITHDRAW RESPONSE",
          {
            requestDurationMs,

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


        console.log(
          "[WITHDRAW] response",
          withdrawResponse
        );


        // ===============================================
        // REFRESH WALLET
        // ===============================================

        addWithdrawDebugLog(
          "REFRESH WALLET START",
          {
            endpoint:
              `/wallet/${address}/`,
          }
        );


        const refreshStartedAt =
          Date.now();


        const r =
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
              r?.status,

            headers:
              safeHeaders(
                r?.headers
              ),

            data:
              r?.data,
          }
        );


        setWallet(
          r.data
        );


        const createdRequest =
          withdrawResponse?.data || {};

        setWithdrawNotice(
          `Withdrawal request #${createdRequest.id || ""} submitted. Please wait for admin approval.`
        );

        await loadWithdrawHistory();


        // ===============================================
        // SUCCESS DIAGNOSIS
        // ===============================================

        addWithdrawDebugLog(
          "AUTO DIAGNOSIS",
          {
            result:
              "Withdrawal endpoint returned a successful HTTP response.",

            likelyLayer:
              "none",

            totalDurationMs:
              Date.now() -
              withdrawStartedAt,
          }
        );


        setIsWithdrawOpen(
          false
        );

        setAmount("");

        setDestinationWallet(
          ""
        );
      } catch (error) {
        // ===============================================
        // EXACT TIME OF FAILURE
        // ===============================================

        const requestFailureAt =
          Date.now();


        const serializedError =
          serializeAxiosError(
            error
          );


        addWithdrawDebugLog(
          "WITHDRAW ERROR",
          {
            failedAt:
              new Date(
                requestFailureAt
              ).toISOString(),

            totalDurationSinceClickMs:
              requestFailureAt -
              withdrawStartedAt,

            ...serializedError,
          }
        );


        console.error(
          "[WITHDRAW] ERROR",
          error
        );


        // ===============================================
        // CLOUDFLARE INFORMATION
        // ===============================================

        const responseData =
          error?.response
            ?.data ||
          {};


        const cfHeaders =
          error?.response
            ?.headers;


        if (
          responseData
            ?.cloudflare_error ||
          cfHeaders?.[
            "cf-ray"
          ] ||
          cfHeaders?.[
            "CF-Ray"
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
                cfHeaders?.[
                  "CF-Ray"
                ] ||
                null,

              instance:
                responseData
                  ?.instance ||
                null,

              timestamp:
                responseData
                  ?.timestamp ||
                null,

              retryable:
                responseData
                  ?.retryable ??
                null,

              retryAfter:
                responseData
                  ?.retry_after ||
                cfHeaders?.[
                  "retry-after"
                ] ||
                null,

              ownerActionRequired:
                responseData
                  ?.owner_action_required ??
                null,

              whatYouShouldDo:
                responseData
                  ?.what_you_should_do ||
                null,
            }
          );
        }


        // ===============================================
        // IMPORTANT:
        // WE DO NOT RETRY THE WITHDRAWAL POST.
        //
        // ممکنه تراکنش در سرور انجام شده باشد
        // ولی پاسخ HTTP به Cloudflare نرسیده باشد.
        // ===============================================

        addWithdrawDebugLog(
          "POST-FAILURE HEALTH CHECK",
          {
            reason:
              "Withdrawal failed. Testing normal /wallet endpoint to see whether only withdrawal failed or the whole backend/origin became unavailable.",

            important:
              "Withdrawal POST will NOT be retried automatically.",
          }
        );


        // ===============================================
        // FIRST PROBE AFTER FAILURE
        // ===============================================

        const postProbeImmediate =
          await probeWalletEndpoint(
            "POST-PROBE #1 /wallet"
          );


        // ===============================================
        // WAIT 2 SECONDS
        // ===============================================

        addWithdrawDebugLog(
          "SHORT RECOVERY WAIT",
          {
            delayMs:
              2000,

            note:
              "No withdrawal retry. Only waiting before another safe GET health probe.",
          }
        );


        await sleep(
          2000
        );


        // ===============================================
        // SECOND PROBE
        // ===============================================

        const postProbeDelayed =
          await probeWalletEndpoint(
            "POST-PROBE #2 /wallet"
          );


        // ===============================================
        // AUTOMATIC DIAGNOSIS
        // ===============================================

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

            important:
              "The client does NOT automatically retry withdrawal POST, preventing accidental duplicate withdrawals.",
          }
        );


        // ===============================================
        // USER-FACING ERROR
        // ===============================================

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
  // DEBUG COPY TEXT
  // ====================================================

  const withdrawDebugText =
    useMemo(() => {
      return withdrawDebugLogs
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
        );
    }, [
      withdrawDebugLogs,
    ]);


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

                  <div className="wallet-avatar-badge">
                    👛
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


                {/* WITHDRAW */}

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

                <div
                  style={{
                    marginTop: 18,
                    padding: 14,
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      marginBottom: 12,
                    }}
                  >
                    <b>Withdrawal History</b>

                    <button
                      type="button"
                      className="small-outline-btn"
                      onClick={loadWithdrawHistory}
                      disabled={withdrawHistoryLoading}
                    >
                      {withdrawHistoryLoading ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>

                  {!withdrawHistory.length ? (
                    <div style={{ opacity: 0.65 }}>
                      No withdrawal requests yet.
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "grid",
                        gap: 10,
                      }}
                    >
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

                        const isTon =
                          String(item.raw_asset || item.asset || "").toUpperCase() === "TON";

                        const requestedValue = isTon
                          ? `${Number(item.ton_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 9 })} TON`
                          : `${Number(item.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 6 })} ECG`;

                        return (
                          <div
                            key={item.id}
                            style={{
                              padding: 12,
                              border: "1px solid rgba(255,255,255,0.10)",
                              borderRadius: 10,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 10,
                                marginBottom: 8,
                              }}
                            >
                              <b>#{item.id} · {requestedValue}</b>
                              <b>{statusText}</b>
                            </div>

                            <div style={{ fontSize: 12, opacity: 0.8, wordBreak: "break-all" }}>
                              Destination: {item.destination_wallet || "—"}
                            </div>

                            {isTon && (
                              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                                ECG reserved: {Number(item.ecg_debited || item.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 6 })} ECG
                              </div>
                            )}

                            <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4 }}>
                              Requested: {item.created_at ? new Date(item.created_at).toLocaleString() : "—"}
                            </div>

                            {statusText === "Complete" && (
                              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4, wordBreak: "break-all" }}>
                                Completed: {item.completed_at ? new Date(item.completed_at).toLocaleString() : "—"}
                                {item.tx_hash ? ` · TX: ${item.tx_hash}` : ""}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>


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


              {/* ================================================= */}
              {/* DEEP DEBUG LOG */}
              {/* ================================================= */}

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

                {/* DEBUG HEADER */}

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

                    {/* COPY */}

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


                    {/* CLEAR */}

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


                {/* DEBUG BODY */}

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
                      Cloudflare, API health and automatic
                      diagnosis logs will appear here.
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


            {/* FOOTER */}

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