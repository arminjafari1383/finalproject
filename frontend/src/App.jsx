import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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

  // Wallet وصل نیست → همیشه برگرد به Wallet
  if (!tonWallet?.account?.address) {
    return <Navigate to="/" replace />;
  }

  // Wallet وصل است → اجازه ورود
  return children;
}


function AppContent() {
  useTgStartRedirect();

  const tonWallet = useTonWallet();
  const isWalletConnected = !!tonWallet?.account?.address;

  return (
    <>
      <div style={{ padding: 16 }}>
        <Routes>

          {/* =========================
              Wallet - تنها صفحه آزاد
          ========================= */}
          <Route path="/" element={<Wallet />} />


          {/* =========================
              صفحات محافظت‌شده
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
    </>
  );
}


export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}