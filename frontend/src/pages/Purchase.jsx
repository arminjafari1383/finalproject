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
    // هر پرداخت جدید:
    // لاگ قبلی پاک شود
    setDebugLogs([]);

    setGramAddress("");
    setGramAmount("");

    addDebug(
      "===================================="
    );

    addDebug(
      "🚀 PAYMENT STARTED"
    );

    addDebug(
      "===================================="
    );

    addDebug(
      "API baseURL",
      api?.defaults?.baseURL ||
        "relative/default"
    );

    addDebug(
      "Connected USER wallet",
      walletAddress ||
        "NOT CONNECTED"
    );

    addDebug(
      "Wallet chain",
      tonWallet?.account?.chain ||
        "unknown"
    );

    addDebug(
      "TON amount input",
      tonAmount
    );

    addDebug(
      "Selected output",
      selectedOutput
    );

    // =========================
    // CHECK USER WALLET
    // =========================

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

    try {
      // =========================
      // CHECK AMOUNT
      // =========================

      const amount =
        Number(tonAmount);

      addDebug(
        "Parsed TON amount",
        amount
      );

      if (
        !amount ||
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
      // TON -> nanoTON
      // =========================

      const nano =
        BigInt(
          Math.floor(
            amount * 1e9
          )
        );

      addDebug(
        "Amount in nanoTON",
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

      addDebug(
        "POST /purchase/create-transaction/",
        {
          amount:
            nano.toString(),
        }
      );

      const txResponse =
        await api.post(
          "/purchase/create-transaction/",
          {
            amount:
              String(nano),
          }
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
        backendData?.gram_address ||
        "";

      const backendGramAmount =
        backendData?.gram_amount ??
        "";

      addDebug(
        "GRAM address returned by BACKEND",
        backendGramAddress
      );

      addDebug(
        "GRAM amount returned by BACKEND",
        backendGramAmount
      );

      // =========================
      // CHECK GRAM ADDRESS
      // =========================

      if (
        !backendGramAddress
      ) {
        throw new Error(
          "Backend did not return gram_address"
        );
      }

      // فقط از Backend
      setGramAddress(
        String(
          backendGramAddress
        )
      );

      setGramAmount(
        String(
          backendGramAmount
        )
      );

      addDebug(
        "✅ GRAM Merchant Address",
        backendGramAddress
      );

      addDebug(
        "GRAM amount nanoTON",
        backendGramAmount
      );

      if (
        backendGramAmount !== ""
      ) {
        addDebug(
          "GRAM amount TON",
          Number(
            backendGramAmount
          ) / 1e9
        );
      }

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

      // =========================
      // CHECK MESSAGES
      // =========================

      if (
        !Array.isArray(
          transaction?.messages
        ) ||
        transaction.messages
          .length === 0
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
        "Transaction messages count",
        transaction.messages.length
      );

      transaction.messages.forEach(
        (
          message,
          index
        ) => {
          addDebug(
            `Message ${
              index + 1
            } FULL`,
            message
          );

          addDebug(
            `Message ${
              index + 1
            } destination`,
            message?.address
          );

          addDebug(
            `Message ${
              index + 1
            } amount`,
            message?.amount
          );
        }
      );

      // =========================
      // VERIFY GRAM ADDRESS
      // =========================

      const firstMessageAddress =
        String(
          transaction
            ?.messages?.[0]
            ?.address || ""
        );

      if (
        !firstMessageAddress
      ) {
        throw new Error(
          "Transaction message does not contain address"
        );
      }

      addDebug(
        "GRAM Address from API",
        backendGramAddress
      );

      addDebug(
        "GRAM Address inside transaction",
        firstMessageAddress
      );

      if (
        firstMessageAddress !==
        String(
          backendGramAddress
        )
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

      addDebug(
        "✅ GRAM address verification PASSED"
      );

      // =========================
      // SEND TO TON CONNECT
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

      // =========================
      // BOC
      // =========================

      if (
        sendResult?.boc
      ) {
        addDebug(
          "Returned BOC",
          sendResult.boc
        );

        addDebug(
          "Returned BOC length",
          sendResult.boc.length
        );
      } else {
        addDebug(
          "⚠️ TON Connect did not return BOC"
        );
      }

      // =========================
      // TX HASH
      // =========================

      addDebug(
        "Waiting for TX Hash"
      );

      const txHash =
        prompt(
          "Enter TX Hash:"
        );

      if (!txHash) {
        addDebug(
          "❌ STOP",
          "TX Hash was empty or cancelled"
        );

        return;
      }

      addDebug(
        "TX Hash",
        txHash
      );

      // =========================
      // PURCHASE PAYLOAD
      // =========================

      const payload = {
        // این آدرس، آدرس USER است
        wallet_address:
          walletAddress,

        ton_amount:
          tonAmount,

        ton_tx_hash:
          txHash,

        output_asset:
          selectedOutput,

        // اطلاعات GRAM برای لاگ/ثبت
        gram_address:
          backendGramAddress,

        gram_amount:
          String(
            backendGramAmount
          ),
      };

      addDebug(
        "------------------------------------"
      );

      addDebug(
        "📡 REGISTER PURCHASE"
      );

      addDebug(
        "POST /purchase/create/ PAYLOAD",
        payload
      );

      // =========================
      // CREATE PURCHASE
      // =========================

      const createResponse =
        await api.post(
          "/purchase/create/",
          payload
        );

      addDebug(
        "purchase/create HTTP STATUS",
        createResponse?.status
      );

      addDebug(
        "purchase/create FULL RESPONSE",
        createResponse?.data
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
        "✅ PAYMENT FINISHED SUCCESSFULLY"
      );

      addDebug(
        "===================================="
      );

      showSuccess(
        `✅ Stake successful! You received ${outputValue} ${outputLabel}`
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

      addDebug(
        "❌ PAYMENT ERROR"
      );

      addDebug(
        "ERROR DETAILS",
        details
      );

      addDebug(
        "===================================="
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