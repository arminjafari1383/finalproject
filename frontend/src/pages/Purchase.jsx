import { useEffect, useMemo, useState } from "react";
import { useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { api } from "../api";
import "./Purchase.css";

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

  // =========================
  // GRAM DEBUG
  // =========================

  const [debugLogs, setDebugLogs] = useState([]);

  // این دو مقدار فقط از Backend می‌آیند
  const [gramAddress, setGramAddress] = useState("");
  const [gramAmount, setGramAmount] = useState("");

  const ECG_PER_USDT = 312;

  // =========================
  // DEBUG HELPERS
  // =========================

  function safeStringify(value) {
    try {
      return JSON.stringify(
        value,
        (_, v) => {
          if (typeof v === "bigint") {
            return v.toString();
          }

          return v;
        },
        2
      );
    } catch (error) {
      return String(value);
    }
  }

  function addDebug(label, value = "") {
    const time = new Date().toLocaleTimeString();

    const text =
      value === ""
        ? label
        : `${label}: ${safeStringify(value)}`;

    setDebugLogs((prev) => [
      ...prev,
      `[${time}] ${text}`,
    ]);
  }

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

  async function payAndRegister() {
    // هر پرداخت جدید، لاگ قبلی پاک شود
    setDebugLogs([]);
    setGramAddress("");
    setGramAmount("");

    addDebug("====================================");
    addDebug("🚀 PAYMENT STARTED");
    addDebug("====================================");

    const walletNetwork = String(
      tonWallet?.account?.chain || "-239"
    );

    addDebug(
      "API baseURL",
      api?.defaults?.baseURL || "relative/default"
    );

    addDebug(
      "Connected USER wallet",
      walletAddress || "NOT CONNECTED"
    );

    addDebug(
      "Wallet chain",
      walletNetwork
    );

    addDebug(
      "TON amount input",
      tonAmount
    );

    addDebug(
      "Selected output",
      selectedOutput
    );

    if (!walletAddress) {
      addDebug(
        "❌ STOP",
        "Wallet is not connected"
      );

      alert(
        "Wallet is not connected."
      );

      return;
    }

    setLoading(true);

    let walletBroadcastSucceeded =
      false;

    try {
      // =========================
      // CHECK AMOUNT
      // =========================

      const amount = Number(
        tonAmount
      );

      addDebug(
        "Parsed TON amount",
        amount
      );

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        addDebug(
          "❌ STOP",
          "Invalid TON amount"
        );

        alert(
          "Invalid TON amount."
        );

        return;
      }

      // =========================
      // TON -> nanoGRAM
      // =========================

      const nano = BigInt(
        Math.floor(
          amount * 1e9
        )
      );

      addDebug(
        "Amount in nanoGRAM",
        nano.toString()
      );

      // =========================
      // REQUEST TRANSACTION
      // =========================

      addDebug(
        "------------------------------------"
      );

      addDebug(
        "📡 REQUESTING GRAM TRANSACTION"
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

      addDebug(
        "create-transaction HTTP STATUS",
        txResponse?.status
      );

      addDebug(
        "create-transaction FULL RESPONSE",
        txResponse?.data
      );

      // =========================
      // BACKEND DATA
      // =========================

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

      addDebug(
        "GRAM address returned by BACKEND",
        backendGramAddress
      );

      addDebug(
        "GRAM amount returned by BACKEND",
        backendGramAmount
      );

      if (!backendGramAddress) {
        throw new Error(
          "Backend did not return gram_address"
        );
      }

      if (!backendGramAmount) {
        throw new Error(
          "Backend did not return gram_amount"
        );
      }

      setGramAddress(
        backendGramAddress
      );

      setGramAmount(
        backendGramAmount
      );

      addDebug(
        "✅ GRAM Merchant Address",
        backendGramAddress
      );

      addDebug(
        "GRAM amount nanoGRAM",
        backendGramAmount
      );

      addDebug(
        "GRAM amount GRAM",
        Number(
          backendGramAmount
        ) / 1e9
      );

      // =========================
      // GET TRANSACTION
      // =========================

      const transaction =
        backendData?.transaction;

      if (!transaction) {
        throw new Error(
          "Backend did not return transaction"
        );
      }

      addDebug(
        "Transaction object",
        transaction
      );

      if (
        !Array.isArray(
          transaction?.messages
        ) ||
        transaction.messages.length === 0
      ) {
        throw new Error(
          "Backend transaction.messages is empty or invalid"
        );
      }

      addDebug(
        "Transaction validUntil",
        transaction?.validUntil
      );

      addDebug(
        "Transaction network",
        transaction?.network
      );

      addDebug(
        "Transaction from",
        transaction?.from
      );

      addDebug(
        "Transaction messages count",
        transaction.messages.length
      );

      transaction.messages.forEach(
        (message, index) => {
          addDebug(
            `Message ${index + 1} FULL`,
            message
          );

          addDebug(
            `Message ${index + 1} destination`,
            message?.address
          );

          addDebug(
            `Message ${index + 1} amount`,
            message?.amount
          );
        }
      );

      // =========================
      // VERIFY BACKEND PAYLOAD
      // =========================

      const firstMessageAddress =
        String(
          transaction
            ?.messages?.[0]
            ?.address || ""
        );

      const firstMessageAmount =
        String(
          transaction
            ?.messages?.[0]
            ?.amount || ""
        );

      if (!firstMessageAddress) {
        throw new Error(
          "Transaction message does not contain address"
        );
      }

      if (
        firstMessageAddress !==
        backendGramAddress
      ) {
        addDebug(
          "❌ GRAM ADDRESS MISMATCH",
          {
            gram_address:
              backendGramAddress,

            transaction_address:
              firstMessageAddress,
          }
        );

        throw new Error(
          "gram_address does not match transaction.messages[0].address"
        );
      }

      if (
        firstMessageAmount !==
        backendGramAmount
      ) {
        addDebug(
          "❌ GRAM AMOUNT MISMATCH",
          {
            gram_amount:
              backendGramAmount,

            transaction_amount:
              firstMessageAmount,
          }
        );

        throw new Error(
          "gram_amount does not match transaction.messages[0].amount"
        );
      }

      addDebug(
        "✅ GRAM address verification PASSED"
      );

      addDebug(
        "✅ GRAM amount verification PASSED"
      );

      // =========================
      // SEND TO WALLET
      // =========================

      addDebug(
        "------------------------------------"
      );

      addDebug(
        "🚀 Calling tonConnectUI.sendTransaction"
      );

      addDebug(
        "Transaction being sent to wallet",
        transaction
      );

      const sendResult =
        await tonConnectUI
          .sendTransaction(
            transaction
          );

      addDebug(
        "✅ sendTransaction SUCCESS"
      );

      addDebug(
        "TON Connect FULL RESULT",
        sendResult
      );

      // TON Connect returns the signed external-message BOC.
      // It does NOT require the user to type the blockchain TX hash.
      const boc = String(
        sendResult?.boc || ""
      );

      if (!boc) {
        throw new Error(
          "Wallet did not return transaction BOC"
        );
      }

      walletBroadcastSucceeded =
        true;

      addDebug(
        "✅ Wallet returned BOC"
      );

      addDebug(
        "Returned BOC length",
        boc.length
      );

      // =========================
      // AUTOMATIC ON-CHAIN CONFIRMATION
      // =========================

      addDebug(
        "------------------------------------"
      );

      addDebug(
        "🔎 START AUTOMATIC BLOCKCHAIN CONFIRMATION"
      );

      let messageHash = "";
      let confirmedData = null;

      // حدود 75 ثانیه برای index شدن تراکنش
      const maxAttempts = 30;

      for (
        let attempt = 1;
        attempt <= maxAttempts;
        attempt += 1
      ) {
        addDebug(
          `Confirmation attempt ${attempt}/${maxAttempts}`
        );

        const confirmPayload = {
          wallet_address:
            walletAddress,

          output_asset:
            selectedOutput,

          network:
            walletNetwork,

          // فقط بار اول BOC لازم است.
          // بعد از دریافت message_hash همان hash را poll می‌کنیم.
          boc:
            messageHash
              ? ""
              : boc,

          message_hash:
            messageHash,
        };

        addDebug(
          "POST /purchase/create/ confirmation payload",
          {
            ...confirmPayload,
            // BOC خیلی بزرگ است؛ در لاگ فقط طول آن نمایش داده شود.
            boc:
              confirmPayload.boc
                ? `<BOC ${confirmPayload.boc.length} chars>`
                : "",
          }
        );

        const confirmResponse =
          await api.post(
            "/purchase/create/",
            confirmPayload
          );

        addDebug(
          "Confirmation HTTP STATUS",
          confirmResponse?.status
        );

        addDebug(
          "Confirmation FULL RESPONSE",
          confirmResponse?.data
        );

        const responseData =
          confirmResponse?.data || {};

        if (
          responseData?.message_hash
        ) {
          messageHash = String(
            responseData.message_hash
          );

          addDebug(
            "Blockchain message hash",
            messageHash
          );
        }

        if (
          responseData?.status ===
          "confirmed"
        ) {
          confirmedData =
            responseData;

          break;
        }

        if (
          responseData?.status !==
          "pending"
        ) {
          throw new Error(
            "Unexpected blockchain confirmation response"
          );
        }

        addDebug(
          "⏳ Payment sent; waiting for TON blockchain indexing..."
        );

        if (
          attempt <
          maxAttempts
        ) {
          await new Promise(
            (resolve) =>
              setTimeout(
                resolve,
                2500
              )
          );
        }
      }

      if (!confirmedData) {
        const pendingError =
          new Error(
            "Payment was sent successfully, but blockchain confirmation is still pending. Do not send the payment again."
          );

        pendingError.paymentPending =
          true;

        pendingError.messageHash =
          messageHash;

        throw pendingError;
      }

      // =========================
      // REAL TX HASH + INVOICE
      // =========================

      const txHash =
        String(
          confirmedData
            ?.ton_tx_hash ||
          ""
        );

      if (!txHash) {
        throw new Error(
          "Backend confirmed payment but did not return ton_tx_hash"
        );
      }

      addDebug(
        "✅ REAL BLOCKCHAIN TX HASH",
        txHash
      );

      addDebug(
        "✅ VERIFIED GRAM AMOUNT",
        confirmedData?.gram_amount
      );

      addDebug(
        "✅ VERIFIED TON/GRAM AMOUNT",
        confirmedData?.ton_amount
      );

      addDebug(
        "✅ INVOICE",
        confirmedData?.invoice
      );

      addDebug(
        "Invoice already registered",
        Boolean(
          confirmedData
            ?.already_registered
        )
      );

      // =========================
      // RELOAD INVOICES
      // =========================

      addDebug(
        "Reloading invoices..."
      );

      await loadInvoices();

      addDebug(
        "✅ Invoices reloaded"
      );

      addDebug(
        "===================================="
      );

      addDebug(
        "✅ PAYMENT CONFIRMED + INVOICE CREATED"
      );

      addDebug(
        "===================================="
      );

      showSuccess(
        `✅ Payment confirmed! TX: ${txHash.slice(0, 12)}...`
      );
    } catch (error) {
      const details =
        getErrorDetails(
          error
        );

      console.error(
        "Payment error:",
        error
      );

      addDebug(
        "===================================="
      );

      if (
        error?.paymentPending ||
        walletBroadcastSucceeded
      ) {
        addDebug(
          "⏳ PAYMENT SENT - CONFIRMATION/VERIFICATION PENDING"
        );

        addDebug(
          "Pending message hash",
          error?.messageHash || ""
        );

        addDebug(
          "DETAILS",
          details
        );

        alert(
          "✅ The wallet already sent the payment. Blockchain confirmation could not finish yet. Do NOT pay again. Keep this debug log and check the invoice again after confirmation."
        );
      } else {
        addDebug(
          "❌ PAYMENT ERROR"
        );

        addDebug(
          "ERROR DETAILS",
          details
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
      }

      addDebug(
        "===================================="
      );
    } finally {
      addDebug(
        "Payment flow ended"
      );

      setLoading(false);
    }
  }

  // =========================
  // INVOICES
  // =========================

  const allInvoices =
    useMemo(() => {
      return invoices.map(
        (invoice) => ({
          ...invoice,
          currency:
            "TON",
        })
      );
    }, [invoices]);

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

            {loading && (
              <div className="loading-text">
                Processing...
              </div>
            )}

            {/* =========================
                DEBUG PANEL
            ========================= */}

            <div
              style={{
                margin: "16px 0",
                padding: 14,
                border:
                  "1px solid #334155",
                borderRadius: 12,
                background:
                  "#020617",
                color:
                  "#e2e8f0",
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
                  gap: 10,
                  marginBottom:
                    10,
                }}
              >
                <strong>
                  🧪 Payment Debug Log
                </strong>

                <div
                  style={{
                    display:
                      "flex",
                    gap: 8,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      navigator
                        .clipboard
                        ?.writeText(
                          debugLogs.join(
                            "\n"
                          )
                        )
                        .catch(
                          () => {}
                        );
                    }}
                    style={{
                      cursor:
                        "pointer",
                    }}
                  >
                    Copy Log
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setDebugLogs(
                        []
                      )
                    }
                    style={{
                      cursor:
                        "pointer",
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div
                style={{
                  marginBottom:
                    10,
                  opacity: 0.7,
                  fontSize:
                    12,
                }}
              >
                GRAM merchant address is received
                only from Backend.
              </div>

              {/* USER WALLET */}

              <div
                style={{
                  marginBottom:
                    8,
                }}
              >
                <b>
                  USER Wallet:
                </b>{" "}

                <span
                  style={{
                    wordBreak:
                      "break-all",
                  }}
                >
                  {walletAddress ||
                    "-"}
                </span>
              </div>

              {/* GRAM ADDRESS */}

              <div
                style={{
                  marginBottom:
                    8,
                }}
              >
                <b>
                  GRAM Merchant Address:
                </b>{" "}

                <span
                  style={{
                    wordBreak:
                      "break-all",
                  }}
                >
                  {gramAddress ||
                    "Waiting for backend..."}
                </span>
              </div>

              {/* GRAM AMOUNT */}

              <div
                style={{
                  marginBottom:
                    12,
                }}
              >
                <b>
                  GRAM Amount:
                </b>{" "}

                <span
                  style={{
                    wordBreak:
                      "break-all",
                  }}
                >
                  {gramAmount ||
                    "Waiting for backend..."}

                  {gramAmount
                    ? ` nanoTON (≈ ${
                        Number(
                          gramAmount
                        ) /
                        1e9
                      } TON)`
                    : ""}
                </span>
              </div>

              {/* RAW DEBUG LOG */}

              <pre
                style={{
                  margin: 0,
                  padding: 12,
                  minHeight:
                    150,
                  maxHeight:
                    520,
                  overflow:
                    "auto",
                  whiteSpace:
                    "pre-wrap",
                  wordBreak:
                    "break-word",
                  borderRadius:
                    8,
                  background:
                    "#000",
                  color:
                    "#d1fae5",
                  fontSize:
                    12,
                  lineHeight:
                    1.5,
                }}
              >
                {debugLogs.length
                  ? debugLogs.join(
                      "\n"
                    )
                  : "Press Stake TON to start debug logging..."}
              </pre>
            </div>

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
                  ⚡ ECG
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
                  💵 USDT
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
                  <span className="box-icon">
                    ⚡
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
                  <span className="box-icon">
                    💵
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
                loading
              }
            >
              {loading
                ? "Processing..."
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
                  const isTest =
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
                            isTest
                              ? "status-test"
                              : "status-paid"
                          }`}
                        >
                          <span className="dot" />

                          {isTest
                            ? "TEST"
                            : "PAID"}
                        </div>
                      </div>

                      <div className="invoice-body">
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
                          value={
                            item.self_profit_5
                          }
                        />

                        <Row
                          label="Principal Unlock"
                          value={
                            item.principal_unlock_at
                          }
                        />

                        <Row
                          label="Profit Unlock"
                          value={
                            item.self_profit_unlock_at
                          }
                        />
                      </div>

                      <div
                        className="invoice-tx"
                        title={
                          txHash
                        }
                      >
                        TX:{" "}
                        <b>
                          {typeof txHash ===
                          "string"
                            ? `${txHash.slice(
                                0,
                                12
                              )}...`
                            : "-"}
                        </b>
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