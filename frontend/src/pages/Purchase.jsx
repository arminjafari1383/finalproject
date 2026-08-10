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
  const [activeTab, setActiveTab] = useState("ton"); // "ton" | "usdt" | "bnb"

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

    let amount, endpoint, txHash;

    if (activeTab === "ton") {
      amount = Number(tonAmount);
      if (!amount || amount <= 0) return alert("Invalid TON amount.");
      
      const nano = BigInt(Math.floor(amount * 1e9));
      const tx = buildTonTransaction(nano);
      await tonConnectUI.sendTransaction(tx);
      
      txHash = prompt("Enter TX Hash (MVP):");
      if (!txHash) return;
      
      await api.post("/purchase/create/", {
        wallet_address: address,
        ton_amount: tonAmount,
        ton_tx_hash: txHash,
      });
    }
    
    if (activeTab === "usdt") {
      amount = Number(usdtAmount);
      if (!amount || amount <= 0) return alert("Invalid USDT amount.");
      
      // شبیه‌سازی تراکنش USDT
      txHash = prompt("Enter USDT TX Hash:");
      if (!txHash) return;
      
      await api.post("/purchase/usdt/create/", {
        wallet_address: address,
        usdt_amount: usdtAmount,
        usdt_tx_hash: txHash,
      });
    }
    
    if (activeTab === "bnb") {
      amount = Number(bnbAmount);
      if (!amount || amount <= 0) return alert("Invalid BNB amount.");
      
      // شبیه‌سازی تراکنش BNB
      txHash = prompt("Enter BNB TX Hash:");
      if (!txHash) return;
      
      await api.post("/purchase/bnb/create/", {
        wallet_address: address,
        bnb_amount: bnbAmount,
        bnb_tx_hash: txHash,
      });
    }

    await loadAllInvoices();
    showSuccess(`Funds added successfully with ${activeTab.toUpperCase()}!`);
  }

  // Test Stake
  async function testStake() {
    if (!address) return alert("Wallet is not connected.");
    try {
      if (activeTab === "ton") {
        await api.post("/purchase/create/", {
          wallet_address: address,
          ton_amount: tonAmount,
          ton_tx_hash: "TEST_TX_" + Date.now(),
          is_test: true,
        });
      } else if (activeTab === "usdt") {
        await api.post("/purchase/usdt/create/", {
          wallet_address: address,
          usdt_amount: usdtAmount,
          usdt_tx_hash: "TEST_USDT_" + Date.now(),
          is_test: true,
        });
      } else if (activeTab === "bnb") {
        await api.post("/purchase/bnb/create/", {
          wallet_address: address,
          bnb_amount: bnbAmount,
          bnb_tx_hash: "TEST_BNB_" + Date.now(),
          is_test: true,
        });
      }
      await loadAllInvoices();
      showSuccess(`Test invoice added successfully with ${activeTab.toUpperCase()}!`);
    } catch (e) {
      console.error(e);
      alert("Failed to register test stake.");
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
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, paddingBottom: 8, borderBottom: "1px dashed #222" }}>
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

            <div className="logo-box">
              <img src={logo} alt="chart" className="logo-img" />
            </div>

            {/* ====== Tab Switcher ====== */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20, justifyContent: "center" }}>
              <button
                onClick={() => setActiveTab("ton")}
                style={{
                  padding: "8px 24px",
                  borderRadius: 8,
                  border: activeTab === "ton" ? "2px solid #22c55e" : "1px solid #333",
                  background: activeTab === "ton" ? "rgba(34,197,94,0.15)" : "transparent",
                  color: activeTab === "ton" ? "#22c55e" : "#888",
                  cursor: "pointer",
                  fontWeight: 600,
                  transition: "all 0.2s"
                }}
              >
                ⚡ TON
              </button>
              <button
                onClick={() => setActiveTab("usdt")}
                style={{
                  padding: "8px 24px",
                  borderRadius: 8,
                  border: activeTab === "usdt" ? "2px solid #26a17b" : "1px solid #333",
                  background: activeTab === "usdt" ? "rgba(38,161,123,0.15)" : "transparent",
                  color: activeTab === "usdt" ? "#26a17b" : "#888",
                  cursor: "pointer",
                  fontWeight: 600,
                  transition: "all 0.2s"
                }}
              >
                💵 USDT
              </button>
              <button
                onClick={() => setActiveTab("bnb")}
                style={{
                  padding: "8px 24px",
                  borderRadius: 8,
                  border: activeTab === "bnb" ? "2px solid #f3ba2f" : "1px solid #333",
                  background: activeTab === "bnb" ? "rgba(243,186,47,0.15)" : "transparent",
                  color: activeTab === "bnb" ? "#f3ba2f" : "#888",
                  cursor: "pointer",
                  fontWeight: 600,
                  transition: "all 0.2s"
                }}
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
            />

            <p className="label-text">You Receive (ECG)</p>
            <input className="input-box dark-input" readOnly value={equivalentECG} />

            <button onClick={payAndRegister} className="convert-btn">
              Stake {activeTab.toUpperCase()}
            </button>

            {/* ====== Test Button ====== */}
            <button
              onClick={testStake}
              style={{
                marginTop: 10,
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid #f5a524",
                background: "rgba(245,165,36,0.1)",
                color: "#f5a524",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                transition: "all 0.2s",
                width: "100%"
              }}
            >
              🧪 Test {activeTab.toUpperCase()} Stake
            </button>
          </div>

          {/* ====== Invoices Section ====== */}
          <div style={{ maxWidth: 900, margin: "18px auto 60px", padding: "0 16px 40px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <h3 style={{ margin: 0, color: "#fff" }}>My Invoices</h3>
              <div style={{ color: "#cfcfcf", fontSize: 13 }}>
                Total: <b style={{ color: "#fff" }}>{allInvoices.length}</b>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 14,
                marginTop: 14,
              }}
            >
              {allInvoices.map((item) => {
                const isTest = typeof item.ton_tx_hash === "string" && item.ton_tx_hash.startsWith("TEST_");
                const currency = item.currency || "TON";
                
                // دریافت مقادیر بر اساس ارز
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

                return (
                  <div
                    key={item.id}
                    style={{
                      background: "#111",
                      border: "1px solid #222",
                      borderRadius: 16,
                      padding: 14,
                      boxShadow: "0 10px 26px rgba(0,0,0,0.55)",
                      color: "#fff",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div>
                        <div style={{ opacity: 0.7, fontSize: 12 }}>
                          Invoice {currency}
                        </div>
                        <div style={{ fontWeight: 800, fontSize: 16 }}>#{item.invoice_no}</div>
                      </div>

                      <div
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          border: "1px solid #2a2a2a",
                          background: isTest ? "rgba(245,165,36,0.12)" : bgMap[currency] || "rgba(34,197,94,0.12)",
                          color: isTest ? "#f5a524" : colorMap[currency] || "#22c55e",
                          fontWeight: 700,
                          fontSize: 12,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 999,
                            background: isTest ? "#f5a524" : colorMap[currency] || "#22c55e",
                          }}
                        />
                        {isTest ? "TEST" : "PAID"}
                      </div>
                    </div>

                    <div style={{ marginTop: 12, display: "grid", gap: 8, fontSize: 13 }}>
                      <Row label={`${currency} Amount`} value={amount} />
                      <Row label="ECG Value" value={item.ecg_value} />
                      <Row label="5% Profit" value={item.self_profit_5} />
                      <Row label="Principal Unlock" value={item.principal_unlock_at} />
                      <Row label="Profit Unlock" value={item.self_profit_unlock_at} />
                    </div>
                    <br /><br />

                    <div
                      style={{
                        marginTop: 12,
                        marginBottom: 10,
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid #222",
                        background: "#0b0b0b",
                        fontSize: 12,
                        color: "#cfcfcf",
                      }}
                      title={txHash}
                    >
                      TX:{" "}
                      <b style={{ color: "#fff" }}>
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