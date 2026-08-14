import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation
} from "react-router-dom";

import { useEffect, useRef } from "react";

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

  const {
    isWalletValid
  } = useWallet();


  if (
    !tonWallet?.account?.address ||
    !isWalletValid
  ) {
    return (
      <Navigate
        to="/"
        replace
      />
    );
  }


  return children;
}





function AppContent() {

  useTgStartRedirect();


  const navigate = useNavigate();

  const location = useLocation();


  const tonWallet = useTonWallet();


  const {
    validateWallet,
    setIsWalletValid
  } = useWallet();



  const address =
    tonWallet?.account?.address;



  // فقط یک بار redirect اولیه
  const hasRedirected =
    useRef(false);




  useEffect(() => {


    // اگر ولت قطع شد
    if (!address) {

      setIsWalletValid(false);

      hasRedirected.current = false;

      return;
    }



    const telegramId =
      localStorage.getItem(
        "telegram_id"
      );



    localStorage.setItem(
      "valid_wallet",
      address
    );




    if (telegramId) {

      validateWallet(
        address,
        Number(telegramId)
      );

    }



    setIsWalletValid(true);




    /*
      فقط وقتی اپ تازه باز شده
      و کاربر در صفحه اصلی است
      برو Timer
    */

    if (
      location.pathname === "/" &&
      !hasRedirected.current
    ) {

      hasRedirected.current = true;


      navigate(
        "/Timer",
        {
          replace:true
        }
      );

    }



  }, [
    address,
    validateWallet,
    setIsWalletValid,
    navigate,
    location.pathname
  ]);






  return (

    <div
      style={{
        padding:16,
        paddingBottom:80
      }}
    >


      <Routes>


        <Route
          path="/"
          element={
            <Wallet />
          }
        />



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
          path="/system-admin"
          element={
            <AdminDashboard />
          }
        />



        <Route
          path="*"
          element={
            <Navigate
              to="/"
              replace
            />
          }
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