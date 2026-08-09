import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import Navbar from "./components/Navbar";

import Wallet from "./pages/Wallet";
import Referrals from "./pages/Referrals";
import Purchase from "./pages/Purchase";
import AboutUs from "./pages/Aboutus";
import Timer from "./pages/Timer";

import useTgStartRedirect from "./hooks/useTgStartRedirect";
import { useTonWallet } from "@tonconnect/ui-react";
import { useWallet } from "./context/WalletContext";


function ProtectedRoute({ children }) {
  const tonWallet = useTonWallet();
  const { isWalletValid } = useWallet();

  // اگر ولت وصل نیست یا ولت معتبر نیست
  if (!tonWallet?.account?.address || !isWalletValid) {
    return <Navigate to="/" replace />;
  }

  return children;
}


function AppContent() {
  useTgStartRedirect();
  const tonWallet = useTonWallet();
  const { isWalletValid, validateWallet, setIsWalletValid } = useWallet();
  const address = tonWallet?.account?.address;

  // بررسی ولت هر بار که تغییر می‌کند
  useEffect(() => {
    if (address) {
      const telegramId = localStorage.getItem('telegram_id');
      const savedWallet = localStorage.getItem('valid_wallet');

      // ✅ منطق اصلاح شده:
      // اگر ولت در localStorage ذخیره شده و با ولت فعلی یکی است، اعتبارسنجی کن
      if (savedWallet && address === savedWallet) {
        validateWallet(address, parseInt(telegramId));
        setIsWalletValid(true);
      } 
      // ✅ اگر ولت ذخیره نشده ولی ولت فعلی وجود دارد، آن را به عنوان ولت معتبر بشناس
      else {
        // اینجا ولت را در localStorage ذخیره می‌کنیم تا دفعه بعد چک شود
        localStorage.setItem('valid_wallet', address);
        if (telegramId) {
          validateWallet(address, parseInt(telegramId));
        }
        setIsWalletValid(true);
      }
    } else {
      // اگر ولت قطع شده
      setIsWalletValid(false);
    }
  }, [address, validateWallet, setIsWalletValid]);

  return (
    <div style={{ padding: 16, paddingBottom: 80 }}>
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
      
      <Navbar />
    </div>
  );
}


export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}