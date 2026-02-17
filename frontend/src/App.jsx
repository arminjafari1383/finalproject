import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Wallet from "./pages/Wallet";
import Referrals from "./pages/Referrals";
import Purchase from "./pages/Purchase";
import AboutUs from "./pages/Aboutus";
import Timer from "./pages/Timer";
import useTgStartRedirect from "./hooks/useTgStartRedirect";

function AppContent() {
  useTgStartRedirect(); // ✅ دیپ‌لینک اینجا هندل میشه

  return (
    <>
      <Navbar />
      <div style={{ padding: 16 }}>
        <Routes>
          <Route path="/" element={<Wallet />} />
          <Route path="/referrals" element={<Referrals />} />
          <Route path="/stake" element={<Purchase />} />
          <Route path="/Aboutus" element={<AboutUs />} />
          <Route path="/Timer" element={<Timer />} />
        </Routes>
      </div>
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
