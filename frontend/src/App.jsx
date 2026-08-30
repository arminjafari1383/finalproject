import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import Navbar from "./components/Navbar";

import Wallet from "./pages/Wallet";
import Referrals from "./pages/Referrals";
import Purchase from "./pages/Purchase";
import AboutUs from "./pages/Aboutus";
import Timer from "./pages/Timer";
import AdminDashboard from "./pages/AdminDashboard";

import useTgStartRedirect from "./hooks/useTgStartRedirect";


function AppContent() {
  // Telegram start_param / referral logic
  useTgStartRedirect();

  return (
    <div
      style={{
        padding: 16,
        paddingBottom: 80,
      }}
    >
      <Routes>

        {/* =========================================
            DEFAULT PAGE
            وقتی اپ باز می‌شود مستقیم Timer
        ========================================= */}
        <Route
          path="/"
          element={
            <Navigate
              to="/Timer"
              replace
            />
          }
        />


        {/* =========================================
            TIMER
            بدون نیاز به اتصال Wallet
        ========================================= */}
        <Route
          path="/Timer"
          element={<Timer />}
        />


        {/* =========================================
            WALLET
            اتصال Wallet اختیاری است
        ========================================= */}
        <Route
          path="/wallet"
          element={<Wallet />}
        />


        {/* =========================================
            REFERRALS
            بدون نیاز به اتصال Wallet
        ========================================= */}
        <Route
          path="/referrals"
          element={<Referrals />}
        />


        {/* =========================================
            STAKE / PURCHASE
            بدون نیاز به اتصال Wallet
        ========================================= */}
        <Route
          path="/stake"
          element={<Purchase />}
        />


        {/* =========================================
            ABOUT US
            بدون نیاز به اتصال Wallet
        ========================================= */}
        <Route
          path="/Aboutus"
          element={<AboutUs />}
        />


        {/* =========================================
            ADMIN
        ========================================= */}
        <Route
          path="/system-admin"
          element={<AdminDashboard />}
        />


        {/* =========================================
            UNKNOWN ROUTE
            هر آدرس اشتباه → Timer
        ========================================= */}
        <Route
          path="*"
          element={
            <Navigate
              to="/Timer"
              replace
            />
          }
        />

      </Routes>


      {/* =========================================
          NAVBAR
      ========================================= */}
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