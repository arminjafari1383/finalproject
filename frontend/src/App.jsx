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


function ProtectedRoute({ children }) {
  const tonWallet = useTonWallet();

  if (!tonWallet?.account?.address) {
    return <Navigate to="/" replace />;
  }

  return children;
}


// function TelegramOnly({ children }) {
//   const [isTelegram, setIsTelegram] = useState(null);
//   const [loading, setLoading] = useState(true);

//   useEffect(() => {
//     const checkTelegram = () => {
//       const tg = window.Telegram?.WebApp;
      
//       // بررسی کامل تلگرام
//       if (tg && tg.initDataUnsafe?.user?.id) {
//         try {
//           tg.ready();
//           tg.expand();
//         } catch (e) {}
//         setIsTelegram(true);
//       } else {
//         setIsTelegram(false);
//       }
//       setLoading(false);
//     };

//     // چک کردن با تاخیرهای مختلف
//     setTimeout(checkTelegram, 200);
//     setTimeout(checkTelegram, 600);
//     setTimeout(checkTelegram, 1200);

//     // چک کردن مداوم
//     const interval = setInterval(() => {
//       const tg = window.Telegram?.WebApp;
//       if (tg && tg.initDataUnsafe?.user?.id) {
//         setIsTelegram(true);
//         setLoading(false);
//       }
//     }, 3000);

//     return () => clearInterval(interval);
//   }, []);

//   if (loading) {
//     return (
//       <div style={{
//         display: 'flex',
//         justifyContent: 'center',
//         alignItems: 'center',
//         height: '100vh',
//         background: '#0a0a1a',
//         color: '#fff',
//         fontSize: '18px'
//       }}>
//         Loading...
//       </div>
//     );
//   }

//   if (!isTelegram) {
//     return (
//       <div style={{
//         display: 'flex',
//         justifyContent: 'center',
//         alignItems: 'center',
//         height: '100vh',
//         background: '#0a0a1a',
//         color: '#fff',
//         flexDirection: 'column',
//         textAlign: 'center',
//         padding: '20px'
//       }}>
//         <h1 style={{ color: '#e94560', fontSize: '2.5rem' }}>⛔ Access Denied</h1>
//         <p style={{ color: '#888', fontSize: '1.1rem' }}>
//           This application is only available through Telegram mini-app.
//         </p>
//         <p style={{ color: '#666', fontSize: '0.9rem' }}>
//           Please open it from Telegram
//         </p>
//       </div>
//     );
//   }

//   return children;
// }


function AppContent() {
  useTgStartRedirect();

  return (
    <TelegramOnly>
      <div style={{ padding: 16 }}>
        <Routes>
          <Route path="/" element={<Wallet />} />

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

          <Route
            path="*"
            element={<Navigate to="/" replace />}
          />
        </Routes>
      </div>
      <Navbar />
    </TelegramOnly>
  );
}


export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}