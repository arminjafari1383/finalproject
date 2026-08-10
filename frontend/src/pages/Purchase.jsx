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

  // State برای هر ارز
  const [tonAmount, setTonAmount] = useState("1");
  const [usdtAmount, setUsdtAmount] = useState("1");
  const [bnbAmount, setBnbAmount] = useState("0.1");
  
  const [invoices, setInvoices] = useState([]);
  const [usdtInvoices, setUsdtInvoices] = useState([]);
  const [bnbInvoices, setBnbInvoices] = useState([]);
  
  const [successMessage, setSuccessMessage] = useState("");
  const [activeTab, setActiveTab] = useState("ton");
  const [loading, setLoading] = useState(false);

  const [tonPrice, setTonPrice] = useState(null);
  const [bnbPrice, setBnbPrice] = useState(null);
  const [priceError, setPriceError] = useState("");

  const ECG_PER_USDT = 312;

  // Mock Invoice
  const mockTestInvoice = useMemo(
    () => ({
      id: "test-invoice-1",
      invoice_no: "TEST-001",
      ton_amount: "10",
      ecg_value: "5000",
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

  // دریافت قیمت‌ها
  useEffect(() => {
    let cancelled = false;

    async function fetchPrices() {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network,binancecoin&vs_currencies=usd"
        );
        const data = await res.json();
        if (!cancelled) {
          setTonPrice(data?.["the-open-network"]?.usd ?? null);
          setBnbPrice(data?.["binancecoin"]?.usd ?? null);
        }
      } catch {
        if (!cancelled) setPriceError("Failed to fetch prices.");
      }
    }

    fetchPrices();
    return () => (cancelled = true);
  }, []);

  // بارگذاری همه فاکتورها
  async function loadAllInvoices() {
    if (!address) return;
    try {
      setLoading(true);
      
      // TON
      const tonRes = await api.get(`/purchase/list/?wallet=${address}`);
      setInvoices(tonRes.data || []);
      
      // USDT
      const usdtRes = await api.get(`/purchase/usdt/list/?wallet=${address}`);
      setUsdtInvoices(usdtRes.data || []);
      
      // BNB
      const bnbRes = await api.get(`/purchase/bnb/list/?wallet=${address}`);
      setBnbInvoices(bnbRes.data || []);
    } catch (e) {
      console.error("load invoices error", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAllInvoices();
  }, [address]);

  // محاسبات هر ارز
  const equivalentECG = useMemo(() => {
    if (activeTab === "ton") {
      const amt = Number(tonAmount);
      if (!tonPrice || !amt || amt <= 0) return "0.00";
      return (amt * tonPrice * ECG_PER_USDT).toFixed(2);
    }
    if (activeTab === "usdt") {
      const amt = Number(usdtAmount);
      if (!amt || amt <= 0) return "0.00";
      return (amt * ECG_PER_USDT).toFixed(2);
    }
    if (activeTab === "bnb") {
      const amt = Number(bnbAmount);
      if (!bnbPrice || !amt || amt <= 0) return "0.00";
      return (amt * bnbPrice * ECG_PER_USDT).toFixed(2);
    }
    return "0.00";
  }, [activeTab, tonAmount, usdtAmount, bnbAmount, tonPrice, bnbPrice]);

  // تابع پرداخت
  async function payAndRegister() {
    if (!address) return alert("Wallet is not connected.");

    setLoading(true);

    try {
      let amount, endpoint, payload;

      if (activeTab === "ton") {
        amount = Number(tonAmount);
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
        
        endpoint = "/purchase/create/";
        payload = {
          wallet_address: address,
          ton_amount: tonAmount,
          ton_tx_hash: txHash,
        };
      } else if (activeTab === "usdt") {
        amount = Number(usdtAmount);
        if (!amount || amount <= 0) {
          alert("Invalid USDT amount.");
          setLoading(false);
          return;
        }
        
        const txHash = prompt("Enter USDT TX Hash:");
        if (!txHash) {
          setLoading(false);
          return;
        }
        
        endpoint = "/purchase/usdt/create/";
        payload = {
          wallet_address: address,
          usdt_amount: usdtAmount,
          usdt_tx_hash: txHash,
        };
      } else if (activeTab === "bnb") {
        amount = Number(bnbAmount);
        if (!amount || amount <= 0) {
          alert("Invalid BNB amount.");
          setLoading(false);
          return;
        }
        
        const txHash = prompt("Enter BNB TX Hash:");
        if (!txHash) {
          setLoading(false);
          return;
        }
        
        endpoint = "/purchase/bnb/create/";
        payload = {
          wallet_address: address,
          bnb_amount: bnbAmount,
          bnb_tx_hash: txHash,
        };
      }

      await api.post(endpoint, payload);
      await loadAllInvoices();
      showSuccess(`✅ ${activeTab.toUpperCase()} stake successful! You received ${equivalentECG} ECG`);
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
      let endpoint, payload;
      
      if (activeTab === "ton") {
        endpoint = "/purchase/create/";
        payload = {
          wallet_address: address,
          ton_amount: tonAmount,
          ton_tx_hash: "TEST_TX_" + Date.now(),
          is_test: true,
        };
      } else if (activeTab === "usdt") {
        endpoint = "/purchase/usdt/create/";
        payload = {
          wallet_address: address,
          usdt_amount: usdtAmount,
          usdt_tx_hash: "TEST_USDT_" + Date.now(),
          is_test: true,
        };
      } else if (activeTab === "bnb") {
        endpoint = "/purchase/bnb/create/";
        payload = {
          wallet_address: address,
          bnb_amount: bnbAmount,
          bnb_tx_hash: "TEST_BNB_" + Date.now(),
          is_test: true,
        };
      }

      await api.post(endpoint, payload);
      await loadAllInvoices();
      showSuccess(`🧪 Test ${activeTab.toUpperCase()} stake successful!`);
    } catch (error) {
      console.error("Test stake error:", error);
      alert(`❌ Test failed: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  }

  // ترکیب همه فاکتورها
  const allInvoices = useMemo(() => {
    const tonList = invoices.map(i => ({ ...i, currency: "TON" }));
    const usdtList = usdtInvoices.map(i => ({ ...i, currency: "USDT" }));
    const bnbList = bnbInvoices.map(i => ({ ...i, currency: "BNB" }));
    return [mockTestInvoice, ...tonList, ...usdtList, ...bnbList];
  }, [mockTestInvoice, invoices, usdtInvoices, bnbInvoices]);

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

            {/* ====== Tab Switcher ====== */}
            <div className="tabs-container">
              <button
                className={`tab-button tab-ton ${activeTab === "ton" ? "tab-active" : ""}`}
                onClick={() => setActiveTab("ton")}
                disabled={loading}
              >
                ⚡ TON
              </button>
              <button
                className={`tab-button tab-usdt ${activeTab === "usdt" ? "tab-active" : ""}`}
                onClick={() => setActiveTab("usdt")}
                disabled={loading}
              >
                💵 USDT
              </button>
              <button
                className={`tab-button tab-bnb ${activeTab === "bnb" ? "tab-active" : ""}`}
                onClick={() => setActiveTab("bnb")}
                disabled={loading}
              >
                🔶 BNB
              </button>
            </div>

            {/* ====== Price Display ====== */}
            {activeTab === "ton" && tonPrice && (
              <div className="price-box dark-subcard">
                TON Price: <b>${tonPrice}</b> USD
              </div>
            )}
            {activeTab === "bnb" && bnbPrice && (
              <div className="price-box dark-subcard">
                BNB Price: <b>${bnbPrice}</b> USD
              </div>
            )}
            {activeTab === "usdt" && (
              <div className="price-box dark-subcard">
                USDT Price: <b>$1.00</b> USD
              </div>
            )}
            {priceError && <div className="error-text">{priceError}</div>}

            {/* ====== Input Fields ====== */}
            <p className="label-text">You Pay ({activeTab.toUpperCase()})</p>
            <input
              className="input-box dark-input"
              type="number"
              value={activeTab === "ton" ? tonAmount : activeTab === "usdt" ? usdtAmount : bnbAmount}
              onChange={(e) => {
                const val = e.target.value;
                if (activeTab === "ton") setTonAmount(val);
                else if (activeTab === "usdt") setUsdtAmount(val);
                else setBnbAmount(val);
              }}
              min="0"
              step={activeTab === "bnb" ? "0.01" : "0.1"}
              disabled={loading}
            />

            <p className="label-text">You Receive (ECG)</p>
            <input className="input-box dark-input" readOnly value={equivalentECG} />

            <button onClick={payAndRegister} className="convert-btn" disabled={loading}>
              {loading ? "Processing..." : `Stake ${activeTab.toUpperCase()}`}
            </button>

            {/* ====== Test Button ====== */}
            <button
              onClick={testStake}
              className="test-btn"
              disabled={loading}
            >
              🧪 Test {activeTab.toUpperCase()} Stake
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
                
                const amount = item.ton_amount || item.usdt_amount || item.bnb_amount || "-";
                const txHash = item.ton_tx_hash || item.usdt_tx_hash || item.bnb_tx_hash || "-";
                
                const colorMap = {
                  TON: "#22c55e",
                  USDT: "#26a17b",
                  BNB: "#f3ba2f"
                };
                const bgMap = {
                  TON: "rgba(34,197,94,0.12)",
                  USDT: "rgba(38,161,123,0.12)",
                  BNB: "rgba(243,186,47,0.12)"
                };

                const currencyClass = currency.toLowerCase();

                return (
                  <div key={item.id} className={`invoice-card currency-${currencyClass}`}>
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
                      <Row label={`${currency} Amount`} value={amount} />
                      <Row label="ECG Value" value={item.ecg_value} />
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