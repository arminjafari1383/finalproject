import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import Navbar from "./components/Navbar";
import Wallet from "./pages/Wallet";
import Referrals from "./pages/Referrals";
import Purchase from "./pages/Purchase";
import AboutUs from "./pages/Aboutus";
import Timer from "./pages/Timer";
import AdminDashboard from "./pages/AdminDashboard";
import useTgStartRedirect from "./hooks/useTgStartRedirect";
import { useTonWallet } from "@tonconnect/ui-react";
import { useWallet } from "./context/WalletContext";

function ProtectedRoute({ children }) {
  const tonWallet = useTonWallet();
  const { isWalletValid } = useWallet();
  if (!tonWallet?.account?.address || !isWalletValid) return <Navigate to="/" replace />;
  return children;
}

function AppContent() {
  useTgStartRedirect();
  const tonWallet = useTonWallet();
  const { validateWallet, setIsWalletValid } = useWallet();
  const address = tonWallet?.account?.address;

  useEffect(() => {
    if (!address) { setIsWalletValid(false); return; }
    const telegramId = localStorage.getItem("telegram_id");
    localStorage.setItem("valid_wallet", address);
    if (telegramId) validateWallet(address, parseInt(telegramId, 10));
    setIsWalletValid(true);
  }, [address, validateWallet, setIsWalletValid]);

  return <div style={{ padding: 16, paddingBottom: 80 }}>
    <Routes>
      <Route path="/" element={<Wallet />} />
      <Route path="/referrals" element={<ProtectedRoute><Referrals /></ProtectedRoute>} />
      <Route path="/stake" element={<ProtectedRoute><Purchase /></ProtectedRoute>} />
      <Route path="/Aboutus" element={<ProtectedRoute><AboutUs /></ProtectedRoute>} />
      <Route path="/Timer" element={<ProtectedRoute><Timer /></ProtectedRoute>} />
      <Route path="/system-admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    <Navbar />
  </div>;
}

export default function App() {
  return <BrowserRouter><AppContent /></BrowserRouter>;
}
