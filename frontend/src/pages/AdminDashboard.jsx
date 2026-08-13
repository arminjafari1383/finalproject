import { useEffect, useMemo, useState } from "react";
import { useTonWallet } from "@tonconnect/ui-react";
import { api } from "../api";
import "./AdminDashboard.css";

const tabs = ["users", "purchases", "withdrawals"];
const short = (value = "") => value.length > 18 ? `${value.slice(0, 9)}…${value.slice(-6)}` : value;
const number = (value) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 6 });

export default function AdminDashboard() {
  const tonWallet = useTonWallet();
  const address = tonWallet?.account?.address || "";
  const [token, setToken] = useState(() => sessionStorage.getItem("admin_dashboard_token") || "");
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("users");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadDashboard() {
    if (!address || !token) return;
    setLoading(true);
    setError("");
    try {
      sessionStorage.setItem("admin_dashboard_token", token);
      const response = await api.get("/admin/system-dashboard/", {
        headers: { "X-Admin-Token": token, "X-Admin-Wallet": address },
      });
      setData(response.data);
    } catch (err) {
      setError(err.response?.data?.error || "Unable to load admin dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (token && address) loadDashboard(); }, [address]);

  const rows = useMemo(() => {
    const list = data?.[tab] || [];
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((item) => JSON.stringify(item).toLowerCase().includes(needle));
  }, [data, tab, query]);

  if (!address) return <main className="admin-page"><div className="admin-login">Connect the admin TON wallet first.</div></main>;
  if (!data) return <main className="admin-page"><div className="admin-login"><h1>System Admin</h1><input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Admin dashboard token"/><button onClick={loadDashboard} disabled={loading}>{loading ? "Loading…" : "Open dashboard"}</button>{error && <p className="admin-error">{error}</p>}</div></main>;

  const summary = data.summary;
  const treasury = summary.treasury || {};
  return <main className="admin-page">
    <header className="admin-head"><div><p>AI POLIFY</p><h1>System Dashboard</h1></div><button onClick={loadDashboard}>Refresh</button></header>
    {treasury.low_balance && <div className="treasury-alert">Warning: treasury TON balance is below 100 TON.</div>}
    {treasury.error && <div className="treasury-alert">Treasury error: {treasury.error}</div>}
    <section className="summary-grid">
      <Stat label="Users" value={summary.total_users}/><Stat label="Active users" value={summary.active_users}/><Stat label="Purchases" value={summary.total_purchases}/><Stat label="TON received" value={number(summary.total_ton_received)}/><Stat label="Treasury TON" value={treasury.balance_ton == null ? "—" : number(treasury.balance_ton)} danger={treasury.low_balance}/><Stat label="ECG profit payable" value={number(summary.profit_payable_ecg)}/><Stat label="USDT profit payable" value={number(summary.profit_payable_usdt)}/><Stat label="Pending TON withdrawals" value={number(summary.pending_withdraw_ton)}/>
    </section>
    <section className="admin-panel"><div className="admin-tools"><div>{tabs.map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</div><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…"/></div><Table tab={tab} rows={rows}/></section>
  </main>;
}

function Stat({ label, value, danger }) { return <article className={`stat ${danger ? "danger" : ""}`}><span>{label}</span><strong>{value}</strong></article>; }
function Table({ tab, rows }) {
  const columns = tab === "users" ? [["username","User"],["wallet_address","Wallet"],["total_investment","Investment"],["total_earned","Earned"],["withdrawable_ecg","Withdrawable ECG"],["is_active","Active"]] : tab === "purchases" ? [["invoice_no","Invoice"],["username","User"],["ton_amount","TON"],["output_amount","Output"],["output_asset","Asset"],["self_profit_5","5% Profit"],["profit_asset","Profit Asset"]] : [["username","User"],["asset","Asset"],["amount","Amount"],["ton_amount","TON Amount"],["status","Status"],["destination_wallet","Destination"]];
  return <div className="table-wrap"><table><thead><tr>{columns.map(([,label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={`${tab}-${row.id}`}>{columns.map(([key]) => <td key={key}>{key.includes("wallet") || key === "destination_wallet" ? short(String(row[key] || "")) : typeof row[key] === "boolean" ? (row[key] ? "Yes" : "No") : String(row[key] ?? "—")}</td>)}</tr>)}</tbody></table>{!rows.length && <p className="empty">No records</p>}</div>;
}
