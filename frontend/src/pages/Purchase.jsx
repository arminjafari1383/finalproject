import { useEffect, useMemo, useRef, useState } from "react";
import { useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { api } from "../api";
import "./Purchase.css";
import ecgLogo from "../assets/ecg-logo.png";
import usdtLogo from "../assets/usdt-logo.png";

export default function Purchase() {
  const tonWallet = useTonWallet();

  // آدرس ولت خود کاربر
  const walletAddress = useMemo(
    () => tonWallet?.account?.address,
    [tonWallet]
  );

  const [tonConnectUI] = useTonConnectUI();

  const [tonAmount, setTonAmount] = useState("0");
  const [selectedOutput, setSelectedOutput] = useState("ECG");
  const [invoices, setInvoices] = useState([]);
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [tonPrice, setTonPrice] = useState(null);
  const [priceError, setPriceError] = useState("");

  // GRAM transaction data returned by Backend.
  // این دو مقدار فقط از Backend می‌آیند
  const [gramAddress, setGramAddress] = useState("");
  const [gramAmount, setGramAmount] = useState("");

  // فاکتور موقت بلافاصله بعد از موفقیت Wallet نمایش داده می‌شود.
  // فاکتور واقعی فقط بعد از تایید on-chain از Backend می‌آید.
  const [pendingInvoice, setPendingInvoice] = useState(null);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const confirmationRunningRef = useRef(false);

  const ECG_PER_USDT = 312;
  const PENDING_PAYMENT_PREFIX = "gram_pending_payment:";

  // Payment debug panel was intentionally removed.
  // Keep calls harmless without accumulating logs in React state.
  function addDebug() {}

  function getErrorDetails(error) {
    return {
      message:
        error?.message ||
        String(error),

      name:
        error?.name,

      code:
        error?.code,

      status:
        error?.response?.status,

      responseData:
        error?.response?.data,

      requestUrl:
        error?.config?.url,

      requestMethod:
        error?.config?.method,

      stack:
        error?.stack,
    };
  }

  function showSuccess(msg) {
    setSuccessMessage(msg);

    setTimeout(() => {
      setSuccessMessage("");
    }, 4000);
  }

  // =========================
  // TON PRICE
  // =========================

  useEffect(() => {
    let cancelled = false;

    async function fetchPrices() {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd"
        );

        const data = await res.json();

        if (!cancelled) {
          setTonPrice(
            data?.["the-open-network"]?.usd ?? null
          );
        }
      } catch (error) {
        if (!cancelled) {
          setPriceError(
            "Failed to fetch TON price."
          );
        }
      }
    }

    fetchPrices();

    return () => {
      cancelled = true;
    };
  }, []);

  // =========================
  // LOAD INVOICES
  // =========================

  async function loadInvoices() {
    if (!walletAddress) {
      return;
    }

    try {
      setLoading(true);

      const res = await api.get(
        `/purchase/list/?wallet=${walletAddress}`
      );

      setInvoices(res.data || []);
    } catch (error) {
      console.error(
        "load invoices error",
        error
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInvoices();
  }, [walletAddress]);

  // =========================
  // CALCULATIONS
  // =========================

  const outputValue = useMemo(() => {
    const amt = Number(tonAmount);

    if (
      !tonPrice ||
      !amt ||
      amt <= 0
    ) {
      return "0.00";
    }

    const usdValue =
      amt * tonPrice;

    const ecgValue =
      usdValue * ECG_PER_USDT;

    if (
      selectedOutput === "ECG"
    ) {
      return ecgValue.toFixed(2);
    }

    return usdValue.toFixed(2);
  }, [
    tonAmount,
    tonPrice,
    selectedOutput,
  ]);

  const ecgProfit = useMemo(() => {
    const amt =
      Number(tonAmount);

    if (
      !tonPrice ||
      !amt ||
      amt <= 0
    ) {
      return "0.00";
    }

    const usdValue =
      amt * tonPrice;

    const ecgValue =
      usdValue * ECG_PER_USDT;

    return (
      ecgValue * 0.05
    ).toFixed(2);
  }, [
    tonAmount,
    tonPrice,
  ]);

  const usdtProfit = useMemo(() => {
    const amt =
      Number(tonAmount);

    if (
      !tonPrice ||
      !amt ||
      amt <= 0
    ) {
      return "0.00";
    }

    const usdValue =
      amt * tonPrice;

    return (
      usdValue * 0.05
    ).toFixed(2);
  }, [
    tonAmount,
    tonPrice,
  ]);

  const usdValue = useMemo(() => {
    const amt =
      Number(tonAmount);

    if (
      !tonPrice ||
      !amt ||
      amt <= 0
    ) {
      return "0.00";
    }

    return (
      amt * tonPrice
    ).toFixed(2);
  }, [
    tonAmount,
    tonPrice,
  ]);

  const outputLabel =
    selectedOutput === "ECG"
      ? "ECG"
      : "USDT";

  // =========================
  // PAYMENT
  // =========================

  function pendingPaymentKey(address) {
    return `${PENDING_PAYMENT_PREFIX}${address || "unknown"}`;
  }

  function readPendingPayment() {
    if (!walletAddress) return null;

    try {
      const raw = localStorage.getItem(
        pendingPaymentKey(walletAddress)
      );
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function savePendingPayment(payment) {
    if (!payment?.wallet_address) return;

    try {
      localStorage.setItem(
        pendingPaymentKey(payment.wallet_address),
        JSON.stringify(payment)
      );
    } catch (error) {
      addDebug(
        "⚠️ Could not save pending payment",
        error?.message || String(error)
      );
    }
  }

  function clearPendingPayment(address = walletAddress) {
    if (!address) return;

    try {
      localStorage.removeItem(
        pendingPaymentKey(address)
      );
    } catch {
      // ignore localStorage cleanup error
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  function makePendingInvoice(payment) {
    const amount = Number(
      payment?.ton_amount || 0
    );

    const savedTonPrice = Number(
      payment?.ton_price || 0
    );

    const usd =
      amount > 0 && savedTonPrice > 0
        ? amount * savedTonPrice
        : 0;

    const ecg =
      usd * ECG_PER_USDT;

    const profit =
      payment?.output_asset === "USDT"
        ? usd * 0.05
        : ecg * 0.05;

    const createdAt =
      Number(payment?.created_at) ||
      Date.now();

    return {
      id: `pending-${createdAt}`,
      invoice_no: `PENDING-${String(createdAt).slice(-8)}`,
      ton_amount: String(payment?.ton_amount || "0"),
      ecg_value: ecg ? ecg.toFixed(2) : "-",
      self_profit_5: profit ? profit.toFixed(2) : "-",
      output_asset: payment?.output_asset || "ECG",
      profit_asset: payment?.output_asset || "ECG",
      created_at: new Date(createdAt).toISOString(),
      lock_period_days: 365,
      principal_unlock_at: "Waiting for blockchain confirmation",
      self_profit_unlock_at: "Waiting for blockchain confirmation",
      ton_tx_hash: "",
      currency: "TON",
      __pending: true,
      __status: "CONFIRMING",
      __message_hash: String(payment?.message_hash || ""),
    };
  }

  async function confirmPendingPayment(
    initialPayment,
    { resumed = false } = {}
  ) {
    if (
      !initialPayment?.wallet_address ||
      !initialPayment?.boc
    ) {
      return null;
    }

    if (confirmationRunningRef.current) {
      addDebug(
        "ℹ️ Confirmation is already running"
      );
      return null;
    }

    confirmationRunningRef.current = true;
    setConfirmingPayment(true);

    let payment = {
      ...initialPayment,
    };

    let messageHash = String(
      payment?.message_hash || ""
    );

    try {
      addDebug(
        resumed
          ? "🔄 RESUMING SAVED PAYMENT CONFIRMATION"
          : "💾 START IMMEDIATE BACKEND REGISTRATION"
      );

      // حدود 30 دقیقه روی همین صفحه تلاش می‌کند.
      // اگر صفحه بسته/رفرش شود، localStorage باعث ادامه در لود بعدی می‌شود.
      const maxAttempts = 360;

      for (
        let attempt = 1;
        attempt <= maxAttempts;
        attempt += 1
      ) {
        const confirmPayload = {
          wallet_address:
            payment.wallet_address,

          output_asset:
            payment.output_asset || "ECG",

          network:
            payment.network || "-239",

          expected_gram_amount:
            String(payment.gram_amount || ""),

          boc:
            messageHash
              ? ""
              : payment.boc,

          message_hash:
            messageHash,
        };

        addDebug(
          `Confirmation attempt ${attempt}/${maxAttempts}`,
          {
            ...confirmPayload,
            boc:
              confirmPayload.boc
                ? `<BOC ${confirmPayload.boc.length} chars>`
                : "",
          }
        );

        try {
          const response =
            await api.post(
              "/purchase/create/",
              confirmPayload
            );

          const data =
            response?.data || {};

          addDebug(
            "Confirmation HTTP STATUS",
            response?.status
          );

          addDebug(
            "Confirmation FULL RESPONSE",
            data
          );

          if (data?.message_hash) {
            messageHash =
              String(data.message_hash);

            payment = {
              ...payment,
              message_hash:
                messageHash,
            };

            if (payment.pending_invoice) {
              payment.pending_invoice = {
                ...payment.pending_invoice,
                __message_hash:
                  messageHash,
              };
            }

            savePendingPayment(
              payment
            );

            setPendingInvoice(
              (prev) =>
                prev
                  ? {
                      ...prev,
                      __message_hash:
                        messageHash,
                    }
                  : prev
            );
          }

          if (
            data?.status ===
            "confirmed"
          ) {
            const txHash =
              String(
                data?.ton_tx_hash ||
                ""
              );

            if (!txHash) {
              throw new Error(
                "Backend confirmed payment but did not return ton_tx_hash"
              );
            }

            addDebug(
              "✅ WALLET RECEIPT HASH",
              txHash
            );

            addDebug(
              "✅ REAL INVOICE CREATED",
              data?.invoice
            );

            clearPendingPayment(
              payment.wallet_address
            );

            setPendingInvoice(
              null
            );

            await loadInvoices();

            addDebug(
              "✅ WALLET CONFIRMED + INVOICE SAVED + LOADED"
            );

            showSuccess(
              `✅ Wallet confirmed. Invoice saved immediately! Receipt: ${txHash.slice(0, 12)}...`
            );

            return data;
          }

          if (
            data?.status !==
            "pending"
          ) {
            throw new Error(
              "Unexpected blockchain confirmation response"
            );
          }

          addDebug(
            "⏳ Payment is sent. Invoice remains CONFIRMING."
          );
        } catch (error) {
          const statusCode =
            error?.response?.status;

          const retryable =
            !error?.response ||
            statusCode === 202 ||
            statusCode === 408 ||
            statusCode === 425 ||
            statusCode === 429 ||
            statusCode === 500 ||
            statusCode === 502 ||
            statusCode === 503 ||
            statusCode === 504;

          if (!retryable) {
            addDebug(
              "❌ NON-RETRYABLE CONFIRMATION ERROR",
              getErrorDetails(error)
            );
            throw error;
          }

          addDebug(
            "⚠️ Temporary confirmation/provider error; retrying",
            getErrorDetails(error)
          );
        }

        const waitMs =
          attempt <= 20
            ? 2500
            : attempt <= 80
              ? 5000
              : 8000;

        await sleep(
          waitMs
        );
      }

      addDebug(
        "⏳ Confirmation is taking longer. Payment is saved and will resume automatically."
      );

      return null;
    } finally {
      confirmationRunningRef.current =
        false;

      setConfirmingPayment(
        false
      );
    }
  }

  // بعد از Refresh/باز کردن دوباره صفحه، پرداخت قبلی را ادامه بده.
  useEffect(() => {
    if (!walletAddress) {
      return;
    }

    const saved =
      readPendingPayment();

    if (
      !saved ||
      saved.wallet_address !==
        walletAddress
    ) {
      return;
    }

    const localInvoice =
      saved.pending_invoice ||
      makePendingInvoice(saved);

    setPendingInvoice(
      localInvoice
    );

    setGramAddress(
      String(
        saved.gram_address ||
        ""
      )
    );

    setGramAmount(
      String(
        saved.gram_amount ||
        ""
      )
    );

    addDebug(
      "🧾 Previous sent payment restored; invoice is visible as CONFIRMING."
    );

    confirmPendingPayment(
      {
        ...saved,
        pending_invoice:
          localInvoice,
      },
      {
        resumed: true,
      }
    ).catch((error) => {
      addDebug(
        "❌ Resume confirmation error",
        getErrorDetails(error)
      );
    });
  }, [walletAddress]);

  async function payAndRegister() {
    addDebug(
      "===================================="
    );

    addDebug(
      "🚀 PAYMENT STARTED"
    );

    addDebug(
      "===================================="
    );

    if (!walletAddress) {
      alert(
        "Wallet is not connected."
      );
      return;
    }

    // اگر پرداخت قبلی هنوز تایید نشده، پرداخت جدید را مسدود کن.
    const previousPending =
      readPendingPayment();

    if (previousPending) {
      const localInvoice =
        previousPending.pending_invoice ||
        makePendingInvoice(
          previousPending
        );

      setPendingInvoice(
        localInvoice
      );

      showSuccess(
        "⏳ Previous payment is still confirming. Do not pay again."
      );

      addDebug(
        "⚠️ New payment blocked because previous payment is still confirming."
      );

      confirmPendingPayment(
        {
          ...previousPending,
          pending_invoice:
            localInvoice,
        },
        {
          resumed: true,
        }
      ).catch((error) => {
        addDebug(
          "❌ Resume error",
          getErrorDetails(error)
        );
      });

      return;
    }

    setGramAddress("");
    setGramAmount("");
    setLoading(true);

    try {
      const amount =
        Number(tonAmount);

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        throw new Error(
          "Invalid TON amount."
        );
      }

      const walletNetwork =
        String(
          tonWallet?.account?.chain ||
          "-239"
        );

      const nano =
        BigInt(
          Math.floor(
            amount * 1e9
          )
        );

      const createTxPayload = {
        amount:
          nano.toString(),

        wallet_address:
          walletAddress,

        network:
          walletNetwork,
      };

      addDebug(
        "POST /purchase/create-transaction/",
        createTxPayload
      );

      const txResponse =
        await api.post(
          "/purchase/create-transaction/",
          createTxPayload
        );

      const backendData =
        txResponse?.data || {};

      const backendGramAddress =
        String(
          backendData?.gram_address ||
          ""
        );

      const backendGramAmount =
        String(
          backendData?.gram_amount ??
          ""
        );

      const transaction =
        backendData?.transaction;

      addDebug(
        "create-transaction FULL RESPONSE",
        backendData
      );

      if (
        !backendGramAddress
      ) {
        throw new Error(
          "Backend did not return gram_address"
        );
      }

      if (
        !backendGramAmount
      ) {
        throw new Error(
          "Backend did not return gram_amount"
        );
      }

      if (
        !transaction ||
        !Array.isArray(
          transaction?.messages
        ) ||
        transaction.messages
          .length === 0
      ) {
        throw new Error(
          "Backend returned invalid transaction"
        );
      }

      const firstMessage =
        transaction.messages[0];

      if (
        String(
          firstMessage?.address ||
          ""
        ) !==
        backendGramAddress
      ) {
        throw new Error(
          "GRAM address mismatch in transaction"
        );
      }

      if (
        String(
          firstMessage?.amount ||
          ""
        ) !==
        backendGramAmount
      ) {
        throw new Error(
          "GRAM amount mismatch in transaction"
        );
      }

      setGramAddress(
        backendGramAddress
      );

      setGramAmount(
        backendGramAmount
      );

      addDebug(
        "✅ GRAM address verified",
        backendGramAddress
      );

      addDebug(
        "✅ GRAM amount verified",
        backendGramAmount
      );

      addDebug(
        "🚀 Calling tonConnectUI.sendTransaction",
        transaction
      );

      const sendResult =
        await tonConnectUI
          .sendTransaction(
            transaction
          );

      addDebug(
        "✅ sendTransaction SUCCESS",
        sendResult
      );

      const boc =
        String(
          sendResult?.boc ||
          ""
        );

      if (!boc) {
        throw new Error(
          "Wallet did not return transaction BOC"
        );
      }

      // ===================================================
      // بلافاصله بعد از موفقیت Wallet فاکتور CONFIRMING بساز
      // ===================================================
      const paymentContext = {
        wallet_address:
          walletAddress,

        network:
          walletNetwork,

        output_asset:
          selectedOutput,

        gram_address:
          backendGramAddress,

        gram_amount:
          backendGramAmount,

        ton_amount:
          String(amount),

        ton_price:
          tonPrice,

        boc,

        message_hash: "",

        created_at:
          Date.now(),
      };

      const localInvoice =
        makePendingInvoice(
          paymentContext
        );

      const pendingPayment = {
        ...paymentContext,
        pending_invoice:
          localInvoice,
      };

      savePendingPayment(
        pendingPayment
      );

      setPendingInvoice(
        localInvoice
      );

      addDebug(
        "🧾 INVOICE DISPLAYED IMMEDIATELY",
        localInvoice
      );

      addDebug(
        "💾 Payment saved to localStorage. Refresh will resume confirmation."
      );

      showSuccess(
        "✅ Payment sent successfully. Invoice is visible below as CONFIRMING."
      );

      // Wallet already accepted the transaction. Register the real invoice
      // in Django immediately; backend no longer waits for chain indexing.
      addDebug(
        "💾 Saving wallet-confirmed payment to backend immediately"
      );

      const savedPurchase =
        await confirmPendingPayment(
          pendingPayment
        );

      if (!savedPurchase) {
        throw new Error(
          "Wallet accepted payment but backend did not save the invoice"
        );
      }

      addDebug(
        "✅ WALLET-CONFIRMED PAYMENT SAVED IN DATABASE",
        savedPurchase
      );
    } catch (error) {
      console.error(
        "Payment error:",
        error
      );

      addDebug(
        "❌ PAYMENT ERROR",
        getErrorDetails(error)
      );

      alert(
        `❌ Payment failed: ${
          error?.response
            ?.data?.error ||
          error?.response
            ?.data?.detail ||
          error?.message ||
          "Unknown error"
        }`
      );
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // INVOICES
  // =========================

  const allInvoices =
    useMemo(() => {
      const confirmed =
        invoices.map(
          (invoice) => ({
            ...invoice,
            currency: "TON",
            __pending: false,
          })
        );

      if (!pendingInvoice) {
        return confirmed;
      }

      return [
        pendingInvoice,
        ...confirmed,
      ];
    }, [
      invoices,
      pendingInvoice,
    ]);

  function formatInvoiceDate(value) {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleString();
  }

  async function copyTxHash(value) {
    const hash = String(value || "").trim();

    if (!hash || hash === "-") {
      return;
    }

    try {
      await navigator.clipboard.writeText(hash);
      showSuccess("✅ TX Hash copied");
    } catch (error) {
      console.error("Could not copy TX Hash:", error);
      showSuccess("❌ Could not copy TX Hash");
    }
  }


  function InvestmentCountdown({ unlockAt, createdAt, fallbackDays = 365, completedLabel = "Mining Completed" }) {
    const getTargetTime = () => {
      const direct = new Date(unlockAt).getTime();
      if (Number.isFinite(direct)) return direct;

      const start = new Date(createdAt).getTime();
      if (Number.isFinite(start)) {
        return start + fallbackDays * 24 * 60 * 60 * 1000;
      }

      return null;
    };

    const targetTime = getTargetTime();
    const [remainingMs, setRemainingMs] = useState(() =>
      targetTime ? Math.max(0, targetTime - Date.now()) : 0
    );

    useEffect(() => {
      if (!targetTime) {
        setRemainingMs(0);
        return;
      }

      const updateCountdown = () => {
        setRemainingMs(Math.max(0, targetTime - Date.now()));
      };

      updateCountdown();
      const timer = setInterval(updateCountdown, 1000);

      return () => clearInterval(timer);
    }, [targetTime]);

    if (!targetTime) {
      return <span>Waiting...</span>;
    }

    const addMonthsClamped = (date, monthsToAdd) => {
      const result = new Date(date.getTime());
      const originalDay = result.getUTCDate();

      result.setUTCDate(1);
      result.setUTCMonth(result.getUTCMonth() + monthsToAdd);

      const lastDayOfTargetMonth = new Date(
        Date.UTC(
          result.getUTCFullYear(),
          result.getUTCMonth() + 1,
          0
        )
      ).getUTCDate();

      result.setUTCDate(
        Math.min(originalDay, lastDayOfTargetMonth)
      );

      return result;
    };

    const getCalendarParts = () => {
      if (remainingMs <= 0) {
        return {
          months: 0,
          days: 0,
          hours: 0,
          minutes: 0,
          seconds: 0,
        };
      }

      const now = new Date();
      const target = new Date(targetTime);

      let months =
        (target.getUTCFullYear() - now.getUTCFullYear()) * 12 +
        (target.getUTCMonth() - now.getUTCMonth());

      let monthCursor = addMonthsClamped(now, months);

      if (monthCursor.getTime() > target.getTime()) {
        months -= 1;
        monthCursor = addMonthsClamped(now, months);
      }

      const restSeconds = Math.max(
        0,
        Math.floor((target.getTime() - monthCursor.getTime()) / 1000)
      );

      const days = Math.floor(restSeconds / 86400);
      const hours = Math.floor((restSeconds % 86400) / 3600);
      const minutes = Math.floor((restSeconds % 3600) / 60);
      const seconds = restSeconds % 60;

      return {
        months: Math.max(0, months),
        days,
        hours,
        minutes,
        seconds,
      };
    };

    const { months, days, hours, minutes, seconds } =
      getCalendarParts();

    const pad = (value) => String(value).padStart(2, "0");

    const timeParts = [
      { value: months, label: "MONTHS" },
      { value: days, label: "DAYS" },
      { value: hours, label: "HOURS" },
      { value: minutes, label: "MINUTES" },
      { value: seconds, label: "SECONDS" },
    ];

    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 6,
          flexWrap: "wrap",
          fontVariantNumeric: "tabular-nums",
          color: remainingMs > 0 ? "#00b7ff" : "#36d399",
          fontWeight: 800,
        }}
        title={
          remainingMs > 0
            ? `Unlocks at ${new Date(targetTime).toLocaleString()}`
            : completedLabel
        }
      >
        {timeParts.map((part, index) => (
          <div
            key={part.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                minWidth: part.label === "SECONDS" ? 48 : 42,
                lineHeight: 1.05,
              }}
            >
              <span
                style={{
                  fontSize: 18,
                  letterSpacing: "0.5px",
                }}
              >
                {pad(part.value)}
              </span>

              <span
                style={{
                  marginTop: 4,
                  fontSize: 8,
                  fontWeight: 600,
                  letterSpacing: "0.6px",
                  color: "#a9bdd3",
                }}
              >
                {part.label}
              </span>
            </div>

            {index < timeParts.length - 1 && (
              <span
                style={{
                  fontSize: 16,
                  marginTop: -8,
                }}
              >
                :
              </span>
            )}
          </div>
        ))}
      </div>
    );
  }

  function Row({
    label,
    value,
  }) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          gap: 12,
          paddingBottom: 8,
          borderBottom:
            "1px dashed #222",
        }}
      >
        <div
          style={{
            opacity: 0.75,
          }}
        >
          {label}
        </div>

        <div
          style={{
            fontWeight: 700,
          }}
        >
          {value ?? "-"}
        </div>
      </div>
    );
  }

  // =========================
  // UI
  // =========================

  return (
    <div className="dark-wrapper">
      {!walletAddress ? (
        <div className="center-box">
          <h3>
            Connect your wallet first
          </h3>

          <p>
            Please connect your TON wallet
            to continue.
          </p>
        </div>
      ) : (
        <>
          <div className="page-container dark-card">
            <h2 className="title">
              Stake
            </h2>

            {successMessage && (
              <div className="success-box">
                {successMessage}
              </div>
            )}

            {(loading || confirmingPayment) && (
              <div className="loading-text">
                {loading
                  ? "Processing..."
                  : "Payment sent — confirming invoice on blockchain..."}
              </div>
            )}

            {/* =========================
                CHART
            ========================= */}

            <div className="live-chart-box">
              <div className="live-chart-header">
                <div>
                  <span
                    className="live-dot"
                    aria-hidden="true"
                  />

                  <span className="live-chart-title">
                    USDT / USD
                  </span>
                </div>

                <span className="live-chart-badge">
                  LIVE
                </span>
              </div>

              <iframe
                className="live-chart-frame"
                title="Live USDT to USD chart"
                src="https://s.tradingview.com/widgetembed/?frameElementId=tradingview_usdt&symbol=COINBASE%3AUSDTUSD&interval=15&hidesidetoolbar=1&symboledit=0&saveimage=0&toolbarbg=0f1d3b&studies=%5B%5D&theme=dark&style=1&timezone=Etc%2FUTC&withdateranges=1&hideideas=1&locale=en"
                loading="lazy"
                allowFullScreen
              />

              <div className="chart-source">
                Live market chart by
                TradingView
              </div>
            </div>

            {/* =========================
                PRICE
            ========================= */}

            {tonPrice && (
              <div className="price-box dark-subcard">
                TON Price:{" "}
                <b>
                  ${tonPrice}
                </b>{" "}
                USD
              </div>
            )}

            {priceError && (
              <div className="error-text">
                {priceError}
              </div>
            )}

            {/* =========================
                INPUT
            ========================= */}

            <p className="label-text">
              You Pay (TON)
            </p>

            <input
              className="input-box dark-input"
              type="number"
              value={tonAmount}
              onChange={(e) =>
                setTonAmount(
                  e.target.value
                )
              }
              min="0"
              step="0.1"
              disabled={
                loading
              }
            />

            {/* =========================
                OUTPUT SELECTOR
            ========================= */}

            <div className="output-selector">
              <p className="output-label">
                💰 Select Output
                Currency:
              </p>

              <div className="output-buttons">
                <button
                  className={`output-btn ${
                    selectedOutput ===
                    "ECG"
                      ? "active-ecg"
                      : ""
                  }`}
                  onClick={() =>
                    setSelectedOutput(
                      "ECG"
                    )
                  }
                  disabled={
                    loading
                  }
                >
                  <img
                    src={ecgLogo}
                    alt=""
                    aria-hidden="true"
                    className="output-token-logo"
                  />
                  <span>ECG</span>
                </button>

                <button
                  className={`output-btn ${
                    selectedOutput ===
                    "USDT"
                      ? "active-usdt"
                      : ""
                  }`}
                  onClick={() =>
                    setSelectedOutput(
                      "USDT"
                    )
                  }
                  disabled={
                    loading
                  }
                >
                  <img
                    src={usdtLogo}
                    alt=""
                    aria-hidden="true"
                    className="output-token-logo"
                  />
                  <span>USDT</span>
                </button>
              </div>
            </div>

            {/* =========================
                OUTPUT BOXES
            ========================= */}

            <div className="output-boxes">
              {/* ECG */}

              <div
                className={`output-box ecg-box ${
                  selectedOutput ===
                  "ECG"
                    ? "box-active"
                    : "box-inactive"
                }`}
              >
                <div className="box-header">
                  <span className="box-icon box-icon--ecg">
                    <img
                      src={ecgLogo}
                      alt="ECG"
                      className="box-token-logo"
                    />
                  </span>

                  <div>
                    <span className="box-title">
                      ECG
                    </span>

                    <span className="box-subtitle">
                      You Receive
                    </span>
                  </div>
                </div>

                <div className="box-content">
                  <div className="box-row">
                    <span className="box-label">
                      Amount:
                    </span>

                    <span className="box-value">
                      {(
                        Number(
                          tonAmount
                        ) *
                        Number(
                          tonPrice
                        ) *
                        ECG_PER_USDT
                      ).toFixed(
                        2
                      )}{" "}
                      ECG
                    </span>
                  </div>

                  <div className="box-row">
                    <span className="box-label">
                      ≈ USD:
                    </span>

                    <span className="box-value">
                      ${usdValue}
                    </span>
                  </div>

                  <div className="box-row">
                    <span className="box-label">
                      5% Profit:
                    </span>

                    <span className="box-value">
                      {ecgProfit}{" "}
                      ECG
                    </span>
                  </div>
                </div>
              </div>

              {/* USDT */}

              <div
                className={`output-box usdt-box ${
                  selectedOutput ===
                  "USDT"
                    ? "box-active"
                    : "box-inactive"
                }`}
              >
                <div className="box-header">
                  <span className="box-icon box-icon--usdt">
                    <img
                      src={usdtLogo}
                      alt="USDT"
                      className="box-token-logo"
                    />
                  </span>

                  <div>
                    <span className="box-title">
                      USDT
                    </span>

                    <span className="box-subtitle">
                      You Receive
                    </span>
                  </div>
                </div>

                <div className="box-content">
                  <div className="box-row">
                    <span className="box-label">
                      Amount:
                    </span>

                    <span className="box-value">
                      {(
                        Number(
                          tonAmount
                        ) *
                        Number(
                          tonPrice
                        )
                      ).toFixed(
                        2
                      )}{" "}
                      USDT
                    </span>
                  </div>

                  <div className="box-row">
                    <span className="box-label">
                      ≈ USD:
                    </span>

                    <span className="box-value">
                      ${usdValue}
                    </span>
                  </div>

                  <div className="box-row">
                    <span className="box-label">
                      5% Profit:
                    </span>

                    <span className="box-value">
                      {usdtProfit}{" "}
                      USDT
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* =========================
                PAYMENT BUTTON
            ========================= */}

            <button
              onClick={
                payAndRegister
              }
              className="convert-btn"
              disabled={
                loading ||
                confirmingPayment
              }
            >
              {loading
                ? "Processing..."
                : confirmingPayment
                  ? "Confirming Previous Payment..."
                  : `Stake TON → ${outputLabel}`}
            </button>
          </div>

          {/* =========================
              INVOICES
          ========================= */}

          <div className="invoices-section">
            <div className="invoices-header">
              <h3 className="invoices-title">
                My Invoices
              </h3>

              <div className="invoices-total">
                Total:{" "}
                <b>
                  {
                    allInvoices.length
                  }
                </b>
              </div>
            </div>

            <div className="invoices-grid">
              {allInvoices.map(
                (item) => {
                  const isPending =
                    item.__pending === true;

                  const isTest =
                    !isPending &&
                    item.ton_tx_hash?.startsWith(
                      "TEST_"
                    );

                  const currency =
                    item.currency ||
                    "TON";

                  const amount =
                    item.ton_amount ||
                    "-";

                  const txHash =
                    item.ton_tx_hash ||
                    "-";

                  return (
                    <div
                      key={
                        item.id
                      }
                      className="invoice-card currency-ton"
                    >
                      <div className="invoice-header">
                        <div className="invoice-number">
                          <span className="invoice-label">
                            Invoice{" "}
                            {
                              currency
                            }
                          </span>

                          <span className="invoice-id">
                            #
                            {
                              item.invoice_no
                            }
                          </span>
                        </div>

                        <div
                          className={`invoice-status ${
                            isPending
                              ? "status-test"
                              : isTest
                                ? "status-test"
                                : "status-paid"
                          }`}
                        >
                          <span className="dot" />

                          {isPending
                            ? "CONFIRMING"
                            : isTest
                              ? "TEST"
                              : "PAID"}
                        </div>
                      </div>

                      <div className="invoice-body">
                        <Row
                          label="Invoice Date"
                          value={formatInvoiceDate(
                            item.created_at
                          )}
                        />

                        <Row
                          label="TON Amount"
                          value={
                            amount
                          }
                        />

                        <Row
                          label="ECG Value"
                          value={
                            item.ecg_value
                          }
                        />

                        <Row
                          label="USDT Value"
                          value={(
                            Number(
                              item.ecg_value
                            ) /
                            ECG_PER_USDT
                          ).toFixed(
                            2
                          )}
                        />

                        <Row
                          label="5% Profit"
                          value={`${
                            item.self_profit_5 ?? "-"
                          } ${
                            item.profit_asset ||
                            item.output_asset ||
                            "ECG"
                          }`}
                        />

                        <Row
                          label="Investment Lock"
                          value={
                            <InvestmentCountdown
                              unlockAt={item.principal_unlock_at}
                              createdAt={item.created_at}
                            />
                          }
                        />

                        <Row
                          label="Principal Unlock"
                          value={formatInvoiceDate(
                            item.principal_unlock_at
                          )}
                        />

                        <Row
                          label="Profit Unlock"
                          value={
                            <InvestmentCountdown
                              unlockAt={item.self_profit_unlock_at}
                              createdAt={item.created_at}
                              fallbackDays={30}
                              completedLabel="Profit Unlocked"
                            />
                          }
                        />
                      </div>

                      <div
                        className="invoice-tx"
                        title={txHash}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        <span>
                          TX:{" "}
                          <b>
                            {isPending
                              ? item.__message_hash
                                ? `${item.__message_hash.slice(
                                    0,
                                    12
                                  )}... (message)`
                                : "Waiting for TX hash..."
                              : typeof txHash === "string"
                                ? `${txHash.slice(0, 12)}...`
                                : "-"}
                          </b>
                        </span>

                        {!isPending && txHash !== "-" && (
                          <button
                            type="button"
                            onClick={() => copyTxHash(txHash)}
                            title="Copy full TX Hash"
                            style={{
                              cursor: "pointer",
                              padding: "6px 10px",
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                          >
                            Copy TX Hash
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}