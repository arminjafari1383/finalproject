// frontend/src/components/Wallet.jsx
import { useEffect, useMemo, useState } from "react";
import { useTonWallet } from "@tonconnect/ui-react";
import { api } from "../api";
import "./Wallet.css";

const MINING_SECONDS = 24 * 60 * 60;

function formatTime(total) {
  const safe = Math.max(0, total);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0"));
}

function Fan() {
  const blades = Array.from({ length: 8 });
  return (
    <div className="fan" aria-hidden="true">
      {blades.map((_, i) => (
        <span
          key={i}
          className="fan-blade"
          style={{ "--r": `${i * 45}deg` }}
        />
      ))}
      <div className="fan-center">
        <div className="fan-label">
          <strong>MINER</strong>
          <span><i>E</i>CG</span>
        </div>
      </div>
    </div>
  );
}

function Hourglass() {
  return (
    <div className="hourglass-wrap" aria-hidden="true">
      <div className="hourglass">
        <div className="hourglass-glass">
          <div className="hourglass-sand-top" />
          <div className="hourglass-stream" />
          <div className="hourglass-sand-bottom" />
        </div>
      </div>
    </div>
  );
}

export default function Wallet() {
  const tonWallet = useTonWallet();
  const address = useMemo(() => tonWallet?.account?.address, [tonWallet]);

  const [wallet, setWallet] = useState(null);
  const [remaining, setRemaining] = useState(MINING_SECONDS - 13 * 60 - 47);
  const [progress, setProgress] = useState(68);

  useEffect(() => {
    const startedAtKey = "aipolify_mining_started_at";
    let startedAt = Number(localStorage.getItem(startedAtKey));

    if (!startedAt) {
      startedAt = Date.now();
      localStorage.setItem(startedAtKey, String(startedAt));
    }

    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const left = Math.max(0, MINING_SECONDS - elapsed);
      setRemaining(left);
      setProgress(Math.min(100, Math.max(0, (elapsed / MINING_SECONDS) * 100)));
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!address) return;

    let cancelled = false;

    (async () => {
      try {
        const response = await api.get(`/wallet/${address}/`);
        if (!cancelled) setWallet(response.data);
      } catch {
        // The visual mining screen still works when the wallet API is unavailable.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address]);

  const [hours, minutes, seconds] = formatTime(remaining);

  const reward =
    wallet?.withdrawable_total != null
      ? Number(wallet.withdrawable_total).toFixed(4)
      : "1.0000";

  return (
    <main className="mine-page">
      <div className="mine-shell">
        <header className="mine-header">
          <button className="mine-menu" aria-label="Menu">
            <span className="mine-menu-lines">
              <span />
              <span />
              <span />
            </span>
          </button>

          <h1 className="mine-brand">AI POLIFY</h1>

          <div className="mine-logo" aria-label="AI Polify">
            <span className="mine-logo-dot" />
            <span className="mine-logo-dot" />
            <span className="mine-logo-dot" />
            <span className="mine-logo-dot" />
            <span className="mine-logo-dot" />
            <span className="mine-logo-dot" />
            <span className="mine-logo-dot" />
            <div className="mine-logo-hex" />
          </div>
        </header>

        <section className="miner-frame">
          <span className="miner-screw tl" />
          <span className="miner-screw tr" />
          <span className="miner-screw bl" />
          <span className="miner-screw br" />
          <Fan />
          <div className="miner-feet">
            <span className="miner-foot" />
            <span className="miner-foot" />
          </div>
        </section>

        <Hourglass />

        <div className="mining-progress-text">Mining in progress...</div>

        <div className="countdown" aria-label="Mining countdown">
          <span className="countdown-number">{hours}</span>
          <span className="countdown-separator">:</span>
          <span className="countdown-number">{minutes}</span>
          <span className="countdown-separator">:</span>
          <span className="countdown-number">{seconds}</span>
        </div>

        <div className="countdown-labels">
          <span>HOURS</span>
          <span>MINUTES</span>
          <span>SECONDS</span>
        </div>

        <section className="reward-card">
          <div className="reward-head">
            <span className="reward-title">Estimated Reward</span>
            <strong className="reward-value">{reward} ECG</strong>
          </div>

          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${progress}%` }}
            >
              {Math.round(progress)}%
            </div>
          </div>

          <div className="reward-meta">
            <div className="reward-meta-item">
              <span className="reward-icon">▣</span>
              <span>Total Days Mined: 1</span>
            </div>
            <div className="reward-meta-item">
              <span className="reward-icon">♟</span>
              <span>Referral Bonus: 0.0000 ECG</span>
            </div>
          </div>
        </section>

        <section className="complete-card">
          <div className="complete-icon">◉</div>
          <div className="complete-copy">
            <strong>Mining will complete soon!</strong>
            <span>Stay online to claim your reward.</span>
          </div>
        </section>
      </div>

      <nav className="mine-nav" aria-label="Main navigation">
        <button className="nav-item active">
          <span className="nav-icon">⚒</span>
          <span>Mine</span>
        </button>
        <button className="nav-item">
          <span className="nav-icon">◉</span>
          <span>Stake</span>
        </button>
        <button className="nav-item">
          <span className="nav-icon">♧</span>
          <span>Friends</span>
        </button>
        <button className="nav-item">
          <span className="nav-icon">♙</span>
          <span>About Us</span>
        </button>
        <button className="nav-item">
          <span className="nav-icon">▱</span>
          <span>Wallets</span>
        </button>
      </nav>
    </main>
  );
}
