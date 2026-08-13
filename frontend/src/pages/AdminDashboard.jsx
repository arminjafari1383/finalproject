// frontend/src/pages/AdminDashboard.jsx

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { api } from "../api";
import "./AdminDashboard.css";


const tabs = [
  "users",
  "purchases",
  "withdrawals",
];


const short = (value = "") => {
  const text = String(value || "");

  return text.length > 18
    ? `${text.slice(0, 9)}…${text.slice(-6)}`
    : text;
};


const number = (value) => {
  const parsedValue = Number(value || 0);

  if (!Number.isFinite(parsedValue)) {
    return "0";
  }

  return parsedValue.toLocaleString(
    undefined,
    {
      maximumFractionDigits: 6,
    }
  );
};


export default function AdminDashboard() {
  const [token, setToken] = useState(() => {
    return (
      sessionStorage.getItem(
        "admin_dashboard_token"
      ) || ""
    );
  });

  const [data, setData] = useState(null);
  const [tab, setTab] = useState("users");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);


  const loadDashboard = useCallback(async () => {
    const cleanToken = token.trim();

    if (!cleanToken) {
      setError(
        "Please enter the admin dashboard token."
      );

      return;
    }

    setLoading(true);
    setError("");

    try {
      sessionStorage.setItem(
        "admin_dashboard_token",
        cleanToken
      );

      const response = await api.get(
        "/admin/system-dashboard/",
        {
          headers: {
            "X-Admin-Token": cleanToken,
          },
        }
      );

      setData(response.data);
    } catch (err) {
      setData(null);

      setError(
        err.response?.data?.error ||
          "Unable to load admin dashboard."
      );
    } finally {
      setLoading(false);
    }
  }, [token]);


  useEffect(() => {
    if (token.trim()) {
      loadDashboard();
    }
  }, [loadDashboard, token]);


  const logoutAdmin = () => {
    sessionStorage.removeItem(
      "admin_dashboard_token"
    );

    setToken("");
    setData(null);
    setError("");
  };


  const rows = useMemo(() => {
    const list = data?.[tab] || [];
    const needle = query
      .trim()
      .toLowerCase();

    if (!needle) {
      return list;
    }

    return list.filter((item) => {
      return JSON.stringify(item)
        .toLowerCase()
        .includes(needle);
    });
  }, [data, tab, query]);


  if (!data) {
    return (
      <main className="admin-page">
        <div className="admin-login">
          <h1>System Admin</h1>

          <input
            type="password"
            value={token}
            onChange={(event) => {
              setToken(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                loadDashboard();
              }
            }}
            placeholder="Admin dashboard token"
            autoComplete="current-password"
          />

          <button
            type="button"
            onClick={loadDashboard}
            disabled={loading}
          >
            {loading
              ? "Loading…"
              : "Open dashboard"}
          </button>

          {error && (
            <p className="admin-error">
              {error}
            </p>
          )}
        </div>
      </main>
    );
  }


  const summary = data.summary || {};
  const treasury = summary.treasury || {};


  return (
    <main className="admin-page">
      <header className="admin-head">
        <div>
          <p>AI POLIFY</p>
          <h1>System Dashboard</h1>
        </div>

        <div className="admin-head-actions">
          <button
            type="button"
            onClick={loadDashboard}
            disabled={loading}
          >
            {loading
              ? "Loading…"
              : "Refresh"}
          </button>

          <button
            type="button"
            onClick={logoutAdmin}
          >
            Logout
          </button>
        </div>
      </header>


      {treasury.low_balance && (
        <div className="treasury-alert">
          Warning: treasury TON balance is
          below 100 TON.
        </div>
      )}


      <section className="summary-grid">
        {/* کاربران */}

        <Stat
          label="Total users"
          value={number(
            summary.total_users
          )}
        />

        <Stat
          label="Active users"
          value={number(
            summary.active_users
          )}
        />


        {/* خریدها */}

        <Stat
          label="Total purchases"
          value={number(
            summary.total_purchases
          )}
        />

        <Stat
          label="TON received"
          value={`${number(
            summary.total_ton_received
          )} TON`}
        />

        <Stat
          label="Total USD value"
          value={`$${number(
            summary.total_usd_value
          )}`}
        />


        {/* خزانه */}

        <Stat
          label="Treasury TON"
          value={
            treasury.balance_ton == null
              ? "—"
              : `${number(
                  treasury.balance_ton
                )} TON`
          }
          danger={treasury.low_balance}
        />


        {/* پاداش رفرال */}

        <Stat
          label="Referral rewards"
          value={`${number(
            summary.total_referral_bonus
          )} ECG`}
        />

        <Stat
          label="Referral reward events"
          value={number(
            summary.referral_reward_events
          )}
        />


        {/* پاداش روزانه */}

        <Stat
          label="Daily rewards total"
          value={`${number(
            summary.total_daily_rewards
          )} ECG`}
        />

        <Stat
          label="Daily rewards locked"
          value={`${number(
            summary.total_daily_locked
          )} ECG`}
        />

        <Stat
          label="Daily rewards unlocked"
          value={`${number(
            summary.total_daily_unlocked
          )} ECG`}
        />

        <Stat
          label="Daily claim events"
          value={number(
            summary.daily_reward_events
          )}
        />


        {/* سود زیرمجموعه */}

        <Stat
          label="Downline profit"
          value={`${number(
            summary.total_downline_profit
          )} ECG`}
        />


        {/* سود شخصی */}

        <Stat
          label="Self profit locked"
          value={`${number(
            summary.total_self_profit_locked
          )} ECG`}
        />

        <Stat
          label="Self profit unlocked"
          value={`${number(
            summary.total_self_profit_unlocked
          )} ECG`}
        />

        <Stat
          label="ECG profit payable"
          value={`${number(
            summary.profit_payable_ecg
          )} ECG`}
        />

        <Stat
          label="USDT profit payable"
          value={`${number(
            summary.profit_payable_usdt
          )} USDT`}
        />


        {/* اصل سرمایه */}

        <Stat
          label="Principal locked"
          value={`${number(
            summary.total_principal_locked
          )} ECG`}
        />

        <Stat
          label="Principal unlocked"
          value={`${number(
            summary.total_principal_unlocked
          )} ECG`}
        />


        {/* واریز و برداشت */}

        <Stat
          label="Total deposited"
          value={number(
            summary.total_deposited
          )}
        />

        <Stat
          label="Total withdrawn"
          value={number(
            summary.total_withdrawn
          )}
        />


        {/* موجودی USDT */}

        <Stat
          label="USDT principal locked"
          value={`${number(
            summary.usdt_principal_locked
          )} USDT`}
        />

        <Stat
          label="USDT principal unlocked"
          value={`${number(
            summary.usdt_principal_unlocked
          )} USDT`}
        />

        <Stat
          label="USDT profit locked"
          value={`${number(
            summary.usdt_profit_locked
          )} USDT`}
        />

        <Stat
          label="USDT profit unlocked"
          value={`${number(
            summary.usdt_profit_unlocked
          )} USDT`}
        />


        {/* برداشت‌های در انتظار */}

        <Stat
          label="Pending ECG withdrawals"
          value={`${number(
            summary.pending_withdraw_ecg
          )} ECG`}
        />

        <Stat
          label="Pending TON withdrawals"
          value={`${number(
            summary.pending_withdraw_ton
          )} TON`}
        />
      </section>


      <section className="admin-panel">
        <div className="admin-tools">
          <div>
            {tabs.map((item) => (
              <button
                type="button"
                key={item}
                className={
                  tab === item
                    ? "active"
                    : ""
                }
                onClick={() => {
                  setTab(item);
                  setQuery("");
                }}
              >
                {item}
              </button>
            ))}
          </div>

          <input
            value={query}
            onChange={(event) => {
              setQuery(
                event.target.value
              );
            }}
            placeholder="Search users, wallets or invoices…"
          />
        </div>


        <Table
          tab={tab}
          rows={rows}
        />
      </section>
    </main>
  );
}


function Stat({
  label,
  value,
  danger,
}) {
  return (
    <article
      className={`stat ${
        danger ? "danger" : ""
      }`}
    >
      <span>{label}</span>

      <strong>
        {value ?? "—"}
      </strong>
    </article>
  );
}


function Table({
  tab,
  rows,
}) {
  let columns = [];


  if (tab === "users") {
    columns = [
      [
        "username",
        "User",
      ],

      [
        "wallet_address",
        "Wallet",
      ],

      [
        "referral_count",
        "Referrals",
      ],

      [
        "referral_bonus",
        "Referral Bonus",
      ],

      [
        "daily_reward_total",
        "Daily Total",
      ],

      [
        "daily_reward_locked",
        "Daily Locked",
      ],

      [
        "daily_reward_unlocked",
        "Daily Unlocked",
      ],

      [
        "downline_profit",
        "Downline Profit",
      ],

      [
        "self_profit_locked",
        "Self Profit Locked",
      ],

      [
        "self_profit_unlocked",
        "Self Profit Unlocked",
      ],

      [
        "principal_locked",
        "Principal Locked",
      ],

      [
        "principal_unlocked",
        "Principal Unlocked",
      ],

      [
        "total_investment",
        "Investment",
      ],

      [
        "total_earned",
        "Earned",
      ],

      [
        "withdrawable_ecg",
        "Withdrawable ECG",
      ],

      [
        "locked_ecg",
        "Locked ECG",
      ],

      [
        "withdrawable_usdt",
        "Withdrawable USDT",
      ],

      [
        "locked_usdt",
        "Locked USDT",
      ],

      [
        "is_active",
        "Active",
      ],
    ];
  }


  if (tab === "purchases") {
    columns = [
      [
        "invoice_no",
        "Invoice",
      ],

      [
        "username",
        "User",
      ],

      [
        "wallet_address",
        "Wallet",
      ],

      [
        "ton_amount",
        "TON",
      ],

      [
        "ton_usd_rate",
        "TON Rate",
      ],

      [
        "usd_value",
        "USD Value",
      ],

      [
        "ecg_value",
        "ECG Value",
      ],

      [
        "output_amount",
        "Output",
      ],

      [
        "output_asset",
        "Asset",
      ],

      [
        "self_profit_5",
        "5% Profit",
      ],

      [
        "profit_asset",
        "Profit Asset",
      ],

      [
        "tx_hash",
        "TX Hash",
      ],

      [
        "created_at",
        "Date",
      ],
    ];
  }


  if (tab === "withdrawals") {
    columns = [
      [
        "username",
        "User",
      ],

      [
        "wallet_address",
        "Wallet",
      ],

      [
        "asset",
        "Asset",
      ],

      [
        "scope",
        "Scope",
      ],

      [
        "amount",
        "Amount",
      ],

      [
        "ton_amount",
        "TON Amount",
      ],

      [
        "status",
        "Status",
      ],

      [
        "destination_wallet",
        "Destination",
      ],

      [
        "tx_hash",
        "TX Hash",
      ],

      [
        "created_at",
        "Created",
      ],
    ];
  }


  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map(
              ([key, label]) => (
                <th key={key}>
                  {label}
                </th>
              )
            )}
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr
              key={`${tab}-${row.id}`}
            >
              {columns.map(([key]) => {
                const value = formatCell(
                  key,
                  row[key]
                );

                return (
                  <td key={key}>
                    {value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>


      {!rows.length && (
        <p className="empty">
          No records
        </p>
      )}
    </div>
  );
}


function formatCell(
  key,
  value,
) {
  if (
    key.includes("wallet") ||
    key === "destination_wallet" ||
    key === "tx_hash"
  ) {
    return short(
      String(value || "")
    );
  }


  if (
    typeof value === "boolean"
  ) {
    return value
      ? "Yes"
      : "No";
  }


  if (
    key === "created_at" ||
    key === "last_active"
  ) {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return String(value);
    }

    return date.toLocaleString();
  }


  return String(
    value ?? "—"
  );
}