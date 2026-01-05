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
  const [result, setResult] = useState(null);

  const [tonPrice, setTonPrice] = useState(null);
  const [priceError, setPriceError] = useState("");

  // ⭐ 1 USDT = 200 ECG
  const ECG_PER_USDT = 200;

  // گرفتن قیمت TON به USD
  useEffect(() => {
    let cancelled = false;

    async function fetchTonPrice() {
      try {
        setPriceError("");
        const res = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd"
        );
        const data = await res.json();
        const p = data?.["the-open-network"]?.usd;
        if (!cancelled) setTonPrice(p ?? null);
      } catch (e) {
        if (!cancelled) setPriceError("خطا در دریافت قیمت TON");
      }
    }

    fetchTonPrice();

    return () => {
      cancelled = true;
    };
  }, []);

  // محاسبه معادل ECG (نمایش لحظه‌ای)
  const equivalentECG = useMemo(() => {
    const amt = Number(tonAmount);
    if (!tonPrice || !amt || amt <= 0) return "0.00";
    return (amt * tonPrice * ECG_PER_USDT).toFixed(2);
  }, [tonAmount, tonPrice]);

  async function payAndRegister() {
    if (!address) return alert("ولت وصل نیست");

    const amt = Number(tonAmount);
    if (!amt || amt <= 0) return alert("مقدار TON معتبر نیست");

    // TON uses nano
    const nano = BigInt(Math.floor(amt * 1e9));
    const tx = buildTonTransaction(nano);

    // user sends TON
    await tonConnectUI.sendTransaction(tx);

    // MVP: گرفتن tx hash دستی
    const txHash = prompt("TX Hash را وارد کنید (برای MVP):");
    if (!txHash) return;

    const res = await api.post("/purchase/create/", {
      wallet_address: address,
      ton_amount: tonAmount,
      ton_tx_hash: txHash,
    });

    setResult(res.data);
  }

  return (
    <div>
      {!address ? (
        <div>ابتدا ولت را وصل کنید.</div>
      ) : (
        <>
          <div className="page-container">
            <h2 className="title">Stake</h2>

            <div className="logo-box">
              <img src={logo} alt="chart" className="logo-img" />
            </div>

            {/* قیمت TON */}
            {tonPrice && (
              <div className="price-box">TON Price: ${tonPrice} USDT</div>
            )}
            {priceError && <div style={{ color: "red" }}>{priceError}</div>}

            <p className="label-text">You Pay (TON)</p>
            <input
              className="input-box"
              type="number"
              value={tonAmount}
              onChange={(e) => setTonAmount(e.target.value)}
              placeholder="TON"
              min="0"
            />

            <p className="label-text" style={{ marginTop: "1rem" }}>
              You Receive (ECG)
            </p>
            <input className="input-box" readOnly value={equivalentECG} />

            <button onClick={payAndRegister} className="convert-btn">
             Stake
            </button>

            <br /><br /><br />
          </div>

          {result && (
            <div style={{ marginTop: 16, padding: 12, border: "1px solid #ddd" }}>
              <h3>فاکتور: {result.invoice_no}</h3>
              <div>مبلغ TON: {result.ton_amount}</div>
              <div>نرخ TON/USD: {result.ton_usd_rate}</div>
              <div>معادل ECG: {result.ecg_value}</div>
              <div>سود 5%: {result.self_profit_5}</div>
              <div>برداشت اصل بعد از: {result.principal_unlock_at}</div>
              <div>واریز سود بعد از: {result.self_profit_unlock_at}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}