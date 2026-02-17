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

  const [tonAmount, setTonAmount] = useState("1");
  const [invoices, setInvoices] = useState([]);
  const [successMessage, setSuccessMessage] = useState("");

  const [tonPrice, setTonPrice] = useState(null);
  const [priceError, setPriceError] = useState("");

  const ECG_PER_USDT = 312;

  // ✅ 1 frontend-only test invoice (always visible)
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
    }),
    []
  );

  function showSuccess(msg) {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(""), 4000);
  }

  useEffect(() => {
    let cancelled = false;

    async function fetchTonPrice() {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd"
        );
        const data = await res.json();
        const p = data?.["the-open-network"]?.usd;
        if (!cancelled) setTonPrice(p ?? null);
      } catch {
        if (!cancelled) setPriceError("Failed to fetch TON price.");
      }
    }

    fetchTonPrice();
    return () => (cancelled = true);
  }, []);

  async function loadInvoices() {
    if (!address) return;
    try {
      const res = await api.get(`/purchase/list/?wallet=${address}`);
      setInvoices(res.data || []);
    } catch (e) {
      console.error("load invoices error", e);
      setInvoices([]);
    }
  }

  useEffect(() => {
    loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const equivalentECG = useMemo(() => {
    const amt = Number(tonAmount);
    if (!tonPrice || !amt || amt <= 0) return "0.00";
    return (amt * tonPrice * ECG_PER_USDT).toFixed(2);
  }, [tonAmount, tonPrice]);

  async function payAndRegister() {
    if (!address) return alert("Wallet is not connected.");

    const amt = Number(tonAmount);
    if (!amt || amt <= 0) return alert("Invalid TON amount.");

    const nano = BigInt(Math.floor(amt * 1e9));
    const tx = buildTonTransaction(nano);

    await tonConnectUI.sendTransaction(tx);

    const txHash = prompt("Enter TX Hash (MVP):");
    if (!txHash) return;

    await api.post("/purchase/create/", {
      wallet_address: address,
      ton_amount: tonAmount,
      ton_tx_hash: txHash,
    });

    await loadInvoices();
    showSuccess("Funds have been successfully added to your wallet.");
  }

  // ✅ Test Stake button is back (backend test)
  async function testStake() {
    if (!address) return alert("Wallet is not connected.");
    try {
      await api.post("/purchase/create/", {
        wallet_address: address,
        ton_amount: tonAmount,
        ton_tx_hash: "TEST_TX_" + Date.now(),
        is_test: true,
      });

      await loadInvoices();
      showSuccess("Test invoice added successfully.");
    } catch (e) {
      console.error(e);
      alert("Failed to register test stake.");
    }
  }

  // Show frontend test invoice + backend invoices
  const allInvoices = useMemo(() => {
    return [mockTestInvoice, ...(Array.isArray(invoices) ? invoices : [])];
  }, [mockTestInvoice, invoices]);

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

            {tonPrice && (
              <div className="price-box dark-subcard">
                TON Price: <b>${tonPrice}</b> USD
              </div>
            )}
            {priceError && <div className="error-text">{priceError}</div>}

            <p className="label-text">You Pay (TON)</p>
            <input
              className="input-box dark-input"
              type="number"
              value={tonAmount}
              onChange={(e) => setTonAmount(e.target.value)}
              min="0"
            />

            <p className="label-text">You Receive (ECG)</p>
            <input className="input-box dark-input" readOnly value={equivalentECG} />

            <button onClick={payAndRegister} className="convert-btn">
              Stake
            </button>


          </div>

          {/* ✅ Invoices section (with frontend test invoice) */}
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
                const isTest =
                  typeof item.ton_tx_hash === "string" &&
                  item.ton_tx_hash.startsWith("TEST_");

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
                        <div style={{ opacity: 0.7, fontSize: 12 }}>Invoice</div>
                        <div style={{ fontWeight: 800, fontSize: 16 }}>#{item.invoice_no}</div>
                      </div>

                      <div
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          border: "1px solid #2a2a2a",
                          background: isTest ? "rgba(245,165,36,0.12)" : "rgba(34,197,94,0.12)",
                          color: isTest ? "#f5a524" : "#22c55e",
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
                            background: isTest ? "#f5a524" : "#22c55e",
                          }}
                        />
                        {isTest ? "TEST" : "PAID"}
                      </div>
                    </div>

                    <div style={{ marginTop: 12, display: "grid", gap: 8, fontSize: 13 }}>
                      <Row label="TON Amount" value={item.ton_amount} />
                      <Row label="ECG Value" value={item.ecg_value} />
                      <Row label="5% Profit" value={item.self_profit_5} />
                      <Row label="Principal Unlock" value={item.principal_unlock_at} />
                      <Row label="Profit Unlock" value={item.self_profit_unlock_at} />
                    </div><br /><br />

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
                      title={item.ton_tx_hash}
                    >
                      TX:{" "}
                      <b style={{ color: "#fff" }}>
                        {typeof item.ton_tx_hash === "string" ? `${item.ton_tx_hash.slice(0, 12)}...` : "-"}
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

function Row({ label, value }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        paddingBottom: 8,
        borderBottom: "1px dashed #222",
      }}
    >
      <div style={{ opacity: 0.75 }}>{label}</div>
      <div style={{ fontWeight: 700 }}>{value ?? "-"}</div>
    </div>
  );
}
