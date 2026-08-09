import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import Navbar from "./components/Navbar";

import Wallet from "./pages/Wallet";
import Referrals from "./pages/Referrals";
import Purchase from "./pages/Purchase";
import AboutUs from "./pages/Aboutus";
import Timer from "./pages/Timer";

import useTgStartRedirect from "./hooks/useTgStartRedirect";
import { useTonWallet } from "@tonconnect/ui-react";


// ===========================
// ✅ محافظت از مسیرها با چک ولت
// ===========================
function ProtectedRoute({ children }) {
  const tonWallet = useTonWallet();

  // Wallet وصل نیست → برگرد به Wallet
  if (!tonWallet?.account?.address) {
    return <Navigate to="/" replace />;
  }

  // Wallet وصل است → اجازه ورود
  return children;
}


// ===========================
// ✅ چک کردن تلگرام
// ===========================
function TelegramGuard({ children }) {
  const [isTelegram, setIsTelegram] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    
    if (tg) {
      tg.ready();
      tg.expand();
      setIsTelegram(true);
    } else {
      setIsTelegram(false);
    }
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: '#0a0a1a',
        color: '#fff',
        fontSize: '18px'
      }}>
        Loading...
      </div>
    );
  }

  // ❌ اگر از تلگرام نباشد، صفحه خطا نشان بده
  if (!isTelegram) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: '#0a0a1a',
        color: '#fff',
        flexDirection: 'column',
        textAlign: 'center',
        padding: '20px'
      }}>
        <h1 style={{ color: '#e94560', fontSize: '2.5rem', marginBottom: '10px' }}>
          ⛔ Access Denied
        </h1>
        <p style={{ color: '#888', fontSize: '1.1rem' }}>
          This application is only available through Telegram mini-app.
        </p>
        <p style={{ color: '#666', fontSize: '0.9rem', marginTop: '10px' }}>
          Please open it from Telegram
        </p>
      </div>
    );
  }

  return children;
}


function AppContent() {
  useTgStartRedirect();

  const tonWallet = useTonWallet();
  const isWalletConnected = !!tonWallet?.account?.address;

  return (
    <TelegramGuard>
      <div style={{ padding: 16 }}>
        <Routes>

          {/* =========================
              Wallet - تنها صفحه آزاد
          ========================= */}
          <Route path="/" element={<Wallet />} />


          {/* =========================
              صفحات محافظت‌شده با ولت
          ========================= */}

          <Route
            path="/referrals"
            element={
              <ProtectedRoute>
                <Referrals />
              </ProtectedRoute>
            }
          />

          <Route
            path="/stake"
            element={
              <ProtectedRoute>
                <Purchase />
              </ProtectedRoute>
            }
          />

          <Route
            path="/Aboutus"
            element={
              <ProtectedRoute>
                <AboutUs />
              </ProtectedRoute>
            }
          />

          <Route
            path="/Timer"
            element={
              <ProtectedRoute>
                <Timer />
              </ProtectedRoute>
            }
          />


          {/* =========================
              هر مسیر ناشناخته
              ========================= */}
          <Route
            path="*"
            element={<Navigate to="/" replace />}
          />

        </Routes>
      </div>

      {/* Navbar */}
      <Navbar />
    </TelegramGuard>
  );
}


export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}