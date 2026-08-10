import { useEffect, useMemo, useState } from "react";
import { useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { api } from "../api";
import { buildTonTransaction } from "../ton";
import logo from "../assets/chart.jpg";
import "./Purchase.css";

export default function Purchase() {
  const tonWallet = useTonWallet();
  const address = useMemo(() => tonWallet?.account?.address, [tonWallet]);
  const [tonConnectUI] = useTonConnectUI();

  // ✅ فقط TON ورودی
  const [tonAmount, setTonAmount] = useState("1");
  
  // ✅ انتخاب خروجی: ECG یا USDT
  const [selectedOutput, setSelectedOutput] = useState("ECG"); // "ECG" یا "USDT"
  
  const [invoices, setInvoices] = useState([]);
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [tonPrice, setTonPrice] = useState(null);
  const [priceError, setPriceError] = useState("");

  const ECG_PER_USDT = 312;

  // Mock Invoice
  const mockTestInvoice = useMemo(
    () => ({
      id: "test-invoice-1",
      invoice_no: "TEST-001",
      ton_amount: "10",
      ecg_value: "5000",
      usdt_value: "16.02", // 5000 / 312 = 16.02
      self_profit_5: "250",
      principal_unlock_at: "2026-12-01",
      self_profit_unlock_at: "2026-12-05",
      ton_tx_hash: "TEST_TX_FRONTEND",
      currency: "TON"
    }),
    []
  );

  function showSuccess(msg) {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(""), 4000);
  }

  // دریافت قیمت TON
  useEffect(() => {
    let cancelled = false;

    async function fetchPrices() {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd"
        );
        const data = await res.json();
        if (!cancelled) {
          setTonPrice(data?.["the-open-network"]?.usd ?? null);
        }
      } catch {
        if (!cancelled) setPriceError("Failed to fetch TON price.");
      }
    }

    fetchPrices();
    return () => (cancelled = true);
  }, []);

  // بارگذاری فاکتورها
  async function loadInvoices() {
    if (!address) return;
    try {
      setLoading(true);
      const res = await api.get(`/purchase/list/?wallet=${address}`);
      setInvoices(res.data || []);
    } catch (e) {
      console.error("load invoices error", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInvoices();
  }, [address]);

  // محاسبه خروجی
  const outputValue = useMemo(() => {
    const amt = Number(tonAmount);
    if (!tonPrice || !amt || amt <= 0) return "0.00";
    
    const ecgValue = amt * tonPrice * ECG_PER_USDT;
    
    if (selectedOutput === "ECG") {
      return ecgValue.toFixed(2);
    } else {
      // USDT: ECG / 312
      return (ecgValue / ECG_PER_USDT).toFixed(2);
    }
  }, [tonAmount, tonPrice, selectedOutput]);

  const outputLabel = selectedOutput === "ECG" ? "ECG" : "USDT";

  // تابع پرداخت
  async function payAndRegister() {
    if (!address) return alert("Wallet is not connected.");

    setLoading(true);

    try {
      const amount = Number(tonAmount);
      if (!amount || amount <= 0) {
        alert("Invalid TON amount.");
        setLoading(false);
        return;
      }
      
      const nano = BigInt(Math.floor(amount * 1e9));
      const tx = buildTonTransaction(nano);
      await tonConnectUI.sendTransaction(tx);
      
      const txHash = prompt("Enter TX Hash:");
      if (!txHash) {
        setLoading(false);
        return;
      }
      
      const payload = {
        wallet_address: address,
        ton_amount: tonAmount,
        ton_tx_hash: txHash,
      };

      await api.post("/purchase/create/", payload);
      await loadInvoices();
      showSuccess(`✅ Stake successful! You received ${outputValue} ${outputLabel}`);
    } catch (error) {
      console.error("Payment error:", error);
      alert(`❌ Payment failed: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  }

  // Test Stake
  async function testStake() {
    if (!address) return alert("Wallet is not connected.");
    
    setLoading(true);
    
    try {
      const payload = {
        wallet_address: address,
        ton_amount: tonAmount,
        ton_tx_hash: "TEST_TX_" + Date.now(),
        is_test: true,
      };

      await api.post("/purchase/create/", payload);
      await loadInvoices();
      showSuccess(`🧪 Test stake successful! You received ${outputValue} ${outputLabel}`);
    } catch (error) {
      console.error("Test stake error:", error);
      alert(`❌ Test failed: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  }

  // ترکیب فاکتورها
  const allInvoices = useMemo(() => {
    const tonList = invoices.map(i => ({ ...i, currency: "TON" }));
    return [mockTestInvoice, ...tonList];
  }, [mockTestInvoice, invoices]);

  // Row Component
  function Row({ label, value }) {
    return (
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        gap: 12, 
        paddingBottom: 8, 
        borderBottom: "1px dashed #222" 
      }}>
        <div style={{ opacity: 0.75 }}>{label}</div>
        <div style={{ fontWeight: 700 }}>{value ?? "-"}</div>
      </div>
    );
  }

  return (
    <div className="dark-wrapper">
      {!address ? (
        <div className="center-box">
          <h3>Connect your wallet first</h3>
          <p>Please connect your TON wallet to continue.</p>
        </div>
      ) : (
        <>
          <div className="page-container dark-card">
            <h2 className="title">Stake</h2>

            {successMessage && <div className="success-box">{successMessage}</div>}
            {loading && <div className="loading-text">Processing...</div>}

            <div className="logo-box">
              <img src={logo} alt="chart" className="logo-img" />
            </div>

            {/* ====== Price Display ====== */}
            {tonPrice && (
              <div className="price-box dark-subcard">
                TON Price: <b>${tonPrice}</b> USD
              </div>
            )}
            {priceError && <div className="error-text">{priceError}</div>}

            {/* ====== Input TON ====== */}
            <p className="label-text">You Pay (TON)</p>
            <input
              className="input-box dark-input"
              type="number"
              value={tonAmount}
              onChange={(e) => setTonAmount(e.target.value)}
              min="0"
              step="0.1"
              disabled={loading}
            />

            {/* ====== انتخاب خروجی ====== */}
            <div className="output-selector">
              <p className="output-label">💰 Select Output Currency:</p>
              <div className="output-buttons">
                <button
                  className={`output-btn ${selectedOutput === "ECG" ? "active-ecg" : ""}`}
                  onClick={() => setSelectedOutput("ECG")}
                  disabled={loading}
                >
                  ⚡ ECG
                </button>
                <button
                  className={`output-btn ${selectedOutput === "USDT" ? "active-usdt" : ""}`}
                  onClick={() => setSelectedOutput("USDT")}
                  disabled={loading}
                >
                  💵 USDT
                </button>
              </div>
            </div>

            {/* ====== دو باکس خروجی مجزا ====== */}
            <div className="output-boxes">
              {/* باکس ECG */}
              <div className={`output-box ecg-box ${selectedOutput === "ECG" ? "box-active" : "box-inactive"}`}>
                <div className="box-header">
                  <span className="box-icon">⚡</span>
                  <div>
                    <span className="box-title">ECG</span>
                    <span className="box-subtitle">You Receive</span>
                  </div>
                </div>
                <div className="box-content">
                  <div className="box-row">
                    <span className="box-label">Amount:</span>
                    <span className="box-value">
                      {selectedOutput === "ECG" ? outputValue : 
                        (Number(tonAmount) * tonPrice * ECG_PER_USDT).toFixed(2)} ECG
                    </span>
                  </div>
                  <div className="box-row">
                    <span className="box-label">≈ USD:</span>
                    <span className="box-value">
                      ${(Number(tonAmount) * tonPrice).toFixed(2)}
                    </span>
                  </div>
                  <div className="box-row">
                    <span className="box-label">5% Profit:</span>
                    <span className="box-value">
                      {selectedOutput === "ECG" ? 
                        ((Number(tonAmount) * tonPrice * ECG_PER_USDT) * 0.05).toFixed(2) :
                        ((Number(tonAmount) * tonPrice) * 0.05).toFixed(2)
                      } {outputLabel}
                    </span>
                  </div>
                </div>
              </div>

              {/* باکس USDT */}
              <div className={`output-box usdt-box ${selectedOutput === "USDT" ? "box-active" : "box-inactive"}`}>
                <div className="box-header">
                  <span className="box-icon">💵</span>
                  <div>
                    <span className="box-title">USDT</span>
                    <span className="box-subtitle">You Receive</span>
                  </div>
                </div>
                <div className="box-content">
                  <div className="box-row">
                    <span className="box-label">Amount:</span>
                    <span className="box-value">
                      {selectedOutput === "USDT" ? outputValue :
                        ((Number(tonAmount) * tonPrice * ECG_PER_USDT) / ECG_PER_USDT).toFixed(2)} USDT
                    </span>
                  </div>
                  <div className="box-row">
                    <span className="box-label">≈ USD:</span>
                    <span className="box-value">
                      ${(Number(tonAmount) * tonPrice).toFixed(2)}
                    </span>
                  </div>
                  <div className="box-row">
                    <span className="box-label">5% Profit:</span>
                    <span className="box-value">
                      {selectedOutput === "USDT" ? 
                        ((Number(tonAmount) * tonPrice) * 0.05).toFixed(2) :
                        ((Number(tonAmount) * tonPrice * ECG_PER_USDT) * 0.05).toFixed(2)
                      } {outputLabel}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <button onClick={payAndRegister} className="convert-btn" disabled={loading}>
              {loading ? "Processing..." : `Stake TON → ${outputLabel}`}
            </button>

            {/* ====== Test Button ====== */}
            <button
              onClick={testStake}
              className="test-btn"
              disabled={loading}
            >
              🧪 Test Stake
            </button>
          </div>

          {/* ====== Invoices Section ====== */}
          <div className="invoices-section">
            <div className="invoices-header">
              <h3 className="invoices-title">My Invoices</h3>
              <div className="invoices-total">
                Total: <b>{allInvoices.length}</b>
              </div>
            </div>

            <div className="invoices-grid">
              {allInvoices.map((item) => {
                const isTest = item.ton_tx_hash?.startsWith("TEST_");
                const currency = item.currency || "TON";
                
                const amount = item.ton_amount || "-";
                const txHash = item.ton_tx_hash || "-";

                return (
                  <div key={item.id} className="invoice-card currency-ton">
                    <div className="invoice-header">
                      <div className="invoice-number">
                        <span className="invoice-label">Invoice {currency}</span>
                        <span className="invoice-id">#{item.invoice_no}</span>
                      </div>
                      <div className={`invoice-status ${isTest ? "status-test" : "status-paid"}`}>
                        <span className="dot" />
                        {isTest ? "TEST" : "PAID"}
                      </div>
                    </div>

                    <div className="invoice-body">
                      <Row label="TON Amount" value={amount} />
                      <Row label="ECG Value" value={item.ecg_value} />
                      <Row label="USDT Value" value={(Number(item.ecg_value) / ECG_PER_USDT).toFixed(2)} />
                      <Row label="5% Profit" value={item.self_profit_5} />
                      <Row label="Principal Unlock" value={item.principal_unlock_at} />
                      <Row label="Profit Unlock" value={item.self_profit_unlock_at} />
                    </div>

                    <div className="invoice-tx" title={txHash}>
                      TX:{" "}
                      <b>
                        {typeof txHash === "string" ? `${txHash.slice(0, 12)}...` : "-"}
                      </b>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}