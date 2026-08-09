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


// ✅ کامپوننت لایه‌بندی شده برای صفحاتی که نوار ناوبری می‌خواهند
function LayoutWithNavbar({ children }) {
  return (
    <div style={{ padding: 16, paddingBottom: 80 }}> {/* paddingBottom اضافه شد تا محتوا زیر نوار نرود */}
      {children}
      <Navbar />
    </div>
  );
}

function ProtectedRoute({ children }) {
  const tonWallet = useTonWallet();
  const { isWalletValid } = useWallet();

  // اگر ولت وصل نیست یا ولت معتبر نیست
  if (!tonWallet?.account?.address || !isWalletValid) {
    return <Navigate to="/" replace />;
  }

  // ✅ اگر ولت معتبر است، نوار ناوبری را دور محتوا بپیچ
  return <LayoutWithNavbar>{children}</LayoutWithNavbar>;
}


function AppContent() {
  useTgStartRedirect();
  const tonWallet = useTonWallet();
  const { isWalletValid, validateWallet, setIsWalletValid } = useWallet();
  const address = tonWallet?.account?.address;

  // بررسی ولت هر بار که تغییر می‌کند
  useEffect(() => {
    if (address) {
      // دریافت telegramId از localStorage
      const telegramId = localStorage.getItem('telegram_id');
      const savedWallet = localStorage.getItem('valid_wallet');
      
      if (telegramId && savedWallet) {
        // بررسی اینکه ولت فعلی با ولت ذخیره شده یکی است
        if (address === savedWallet) {
          validateWallet(address, parseInt(telegramId));
          setIsWalletValid(true);
        } else {
          setIsWalletValid(false);
        }
      } else if (telegramId) {
        // اگر ولت ذخیره نشده ولی telegramId وجود دارد
        localStorage.setItem('valid_wallet', address);
        validateWallet(address, parseInt(telegramId));
        setIsWalletValid(true);
      }
    } else {
      // اگر ولت قطع شده
      setIsWalletValid(false);
    }
  }, [address, validateWallet, setIsWalletValid]);

  return (
    <div style={{ padding: 16 }}>
      <Routes>
        {/* ✅ صفحه اصلی (Wallet) نوار ناوبری ندارد */}
        <Route path="/" element={<Wallet />} />

        {/* ✅ بقیه صفحات درون ProtectedRoute هستند و نوار ناوبری دارند */}
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
  );
}


// ✅ اینجا export default باید باشد
export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}