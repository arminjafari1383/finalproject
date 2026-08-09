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

  if (!tonWallet?.account?.address) {
    return <Navigate to="/" replace />;
  }

  return children;
}


function AppContent() {
  useTgStartRedirect();

  return (
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