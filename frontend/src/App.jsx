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
// ✅ چک کردن تلگرام با لاگ کامل
// ===========================
function TelegramGuard({ children }) {
  const [isTelegram, setIsTelegram] = useState(null);
  const [loading, setLoading] = useState(true);
  const [debugInfo, setDebugInfo] = useState({});

  useEffect(() => {
    console.log('🔍 TelegramGuard: Starting check...');
    console.log('📌 window.Telegram:', window.Telegram);
    console.log('📌 window.Telegram?.WebApp:', window.Telegram?.WebApp);
    
    // تابع چک کردن تلگرام
    const checkTelegram = () => {
      const tg = window.Telegram?.WebApp;
      
      console.log('🔍 Checking Telegram WebApp...');
      console.log('📌 tg object:', tg);
      
      if (tg) {
        console.log('✅ Telegram WebApp found!');
        console.log('📊 User:', tg.initDataUnsafe?.user);
        console.log('📊 Platform:', tg.platform);
        console.log('📊 Version:', tg.version);
        
        try {
          tg.ready();
          console.log('✅ ready() called');
          tg.expand();
          console.log('✅ expand() called');
        } catch (e) {
          console.error('❌ Error in Telegram setup:', e);
        }
        
        setIsTelegram(true);
        setDebugInfo({
          found: true,
          userId: tg.initDataUnsafe?.user?.id,
          platform: tg.platform,
          version: tg.version
        });
      } else {
        console.log('❌ Telegram WebApp NOT found');
        console.log('🔍 window.Telegram:', window.Telegram);
        
        // بررسی اگر اسکریپت لود نشده
        if (!window.Telegram) {
          console.log('⚠️ window.Telegram is undefined - script not loaded?');
          setDebugInfo({
            found: false,
            error: 'Telegram script not loaded',
            hasTelegram: false,
            hasWebApp: false
          });
        } else if (!window.Telegram.WebApp) {
          console.log('⚠️ window.Telegram exists but WebApp is undefined');
          setDebugInfo({
            found: false,
            error: 'Telegram.WebApp is undefined',
            hasTelegram: true,
            hasWebApp: false
          });
        } else {
          setDebugInfo({
            found: false,
            error: 'Unknown error',
            hasTelegram: !!window.Telegram,
            hasWebApp: !!window.Telegram?.WebApp
          });
        }
        
        setIsTelegram(false);
      }
      
      setLoading(false);
    };

    // اجرا با تاخیر برای لود شدن اسکریپت
    console.log('⏳ Waiting 500ms before checking Telegram...');
    setTimeout(checkTelegram, 500);
    
    // همچنین یک چک دیگر بعد از 2 ثانیه
    setTimeout(() => {
      console.log('🔄 Second check after 2 seconds...');
      const tg = window.Telegram?.WebApp;
      console.log('📌 After 2s - Telegram.WebApp:', tg);
      if (tg && !isTelegram) {
        console.log('✅ Found Telegram in second check!');
        setIsTelegram(true);
        setLoading(false);
      }
    }, 2000);

  }, []);

  console.log(`📊 State: isTelegram=${isTelegram}, loading=${loading}`);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: '#0a0a1a',
        color: '#fff',
        flexDirection: 'column',
        fontSize: '18px'
      }}>
        <div>Loading...</div>
        <div style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
          Checking Telegram...
        </div>
        <div style={{ fontSize: '11px', color: '#444', marginTop: '5px', maxWidth: '400px', textAlign: 'center' }}>
          {Object.keys(debugInfo).length > 0 && JSON.stringify(debugInfo, null, 2)}
        </div>
      </div>
    );
  }

  // ❌ اگر از تلگرام نباشد، صفحه خطا با اطلاعات دیباگ نشان بده
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
        
        {/* باکس دیباگ */}
        <div style={{
          marginTop: '20px',
          padding: '15px',
          background: '#111',
          borderRadius: '8px',
          maxWidth: '450px',
          width: '100%',
          textAlign: 'left',
          fontSize: '11px',
          color: '#666',
          border: '1px solid #222'
        }}>
          <div style={{ color: '#888', marginBottom: '8px', fontWeight: 'bold' }}>🔍 Debug Info:</div>
          <div>window.Telegram: {window.Telegram ? '✅ exists' : '❌ undefined'}</div>
          <div>window.Telegram?.WebApp: {window.Telegram?.WebApp ? '✅ exists' : '❌ undefined'}</div>
          <div>User Agent: {navigator.userAgent.substring(0, 60)}...</div>
          <div>URL: {window.location.href}</div>
          <div style={{ marginTop: '5px', color: '#444' }}>
            Debug: {JSON.stringify(debugInfo, null, 2)}
          </div>
          <div style={{ marginTop: '8px', color: '#555', fontSize: '10px' }}>
            💡 Try: Open this page from Telegram mini-app
          </div>
        </div>
      </div>
    );
  }

  console.log('✅ All checks passed! Rendering app...');
  return children;
}


function AppContent() {
  console.log('📱 AppContent rendering...');
  useTgStartRedirect();

  const tonWallet = useTonWallet();
  const isWalletConnected = !!tonWallet?.account?.address;
  console.log(`📱 Wallet connected: ${isWalletConnected}`);

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
  console.log('🚀 App starting...');
  console.log('📌 Environment:', process.env.NODE_ENV);
  console.log('📌 URL:', window.location.href);
  
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}