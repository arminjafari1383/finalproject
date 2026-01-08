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
  const [invoices,setInvoices] = useState([]);
  // const [result, setResult] = useState(null);

  const [tonPrice, setTonPrice] = useState(null);
  const [priceError, setPriceError] = useState("");

  // ⭐ 1 USDT = 200 ECG
  const ECG_PER_USDT = 312;

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

  useEffect(() => {
    if (!address) return;
    async function loadInvoices() {
      try{
        const res = await api.get(`/purchase/list/?wallet=${address}`)
        setInvoices(res.data);
      }catch(e){
        console.error("load invoices error",e);
      }
    }
    loadInvoices();
  },[address]);

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
    const resList = await api.get(`/purchase/list/?wallet=${address}`);
    setInvoices(resList.data)
    // setResult(res.data);
  }

  //test stake
  async function testStake(){
    if (!address) return alert("ولت وصل نیست")
    try {
      await api.post("/purchase/create/",{
        wallet_address:address,
        ton_amount:tonAmount,
        ton_tx_hash:"TEST_TX_"+Date.now(),
        is_test:true,
      });
      const resList = await api.get(`/purchase/list/?wallet=${address}`);
      setInvoices(resList);
      }catch(e){
        console.error(e);
        alert("خطا در ثبت تستی")
      }
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
            <button onClick={testStake} className="convert-btn"style={{background:"#888"}}>
              Test Stake
            </button>

            <br /><br /><br />
          </div>
          {invoices.length > 0 && (
            <div style={{marginTop:24}}>
              <h3>فاکتور های من</h3>
              {invoices.map((item) => (
                <div
                key={item.id}
                style={{ marginTop: 16,padding: 12, border:"1px solid #ddd",marginBottom: 90 }}
                >
                     <h4>فاکتور: {item.invoice_no}</h4>
                     <div>TON: {item.ton_amount}</div>
                     <div>ECG: {item.ecg_value}</div>
                     <div>سود 5%: {item.self_profit_5}</div>
                     <div>برداشت اصل: {item.principal_unlock_at}</div>
                     <div>واریز سود: {item.self_profit_unlock_at}</div><br /><br />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}