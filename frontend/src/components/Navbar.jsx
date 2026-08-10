import React, { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { useTonWallet } from "@tonconnect/ui-react";
import { useWallet } from "../context/WalletContext";
import "./Navbar.css";

import Wallet from "../assets/wallet.png";
import Stake from "../assets/stake.png";
import Mine from "../assets/mine.png";
import Friend from "../assets/friends.png";
import Aboutus from "../assets/aboutus.png";

const Navbar = () => {
  const tonWallet = useTonWallet();
  const { isWalletValid } = useWallet();
  
  const isWalletConnected = !!tonWallet?.account?.address;
  const isNavbarActive = isWalletConnected && isWalletValid;

  // State برای کنترل نمایش Popup
  const [showPopup, setShowPopup] = useState(false);
  const [popupMessage, setPopupMessage] = useState("");
  const [popupType, setPopupType] = useState(""); // "valid" یا "invalid"

  // بررسی وضعیت ولت و نمایش Popup
  useEffect(() => {
    if (isWalletConnected) {
      if (isWalletValid) {
        setPopupType("valid");
        setPopupMessage("✅ Your wallet is valid and connected!");
        setShowPopup(true);
      } else {
        setPopupType("invalid");
        setPopupMessage("❌ This wallet is not registered. Please use your registered wallet.");
        setShowPopup(true);
      }
    }
  }, [isWalletConnected, isWalletValid]);

  // بستن Popup بعد از 5 ثانیه
  useEffect(() => {
    if (showPopup) {
      const timer = setTimeout(() => {
        setShowPopup(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showPopup]);

  // تابع برای مدیریت کلیک روی آیتم‌های غیرفعال
  const handleDisabledClick = (e, to) => {
    if (to === '/') return; 
    
    if (!isNavbarActive) {
      e.preventDefault();
      setPopupType("invalid");
      setPopupMessage("⚠️ Please connect with your registered wallet first!");
      setShowPopup(true);
      
      // بستن خودکار بعد از 5 ثانیه
      setTimeout(() => setShowPopup(false), 5000);
    }
  };

  // بستن Popup با کلیک
  const closePopup = () => {
    setShowPopup(false);
  };

  return (
    <>
      <nav className="navbar">
        {/* ========== Mine ========== */}
        <NavLink 
          to="/Timer" 
          className={({ isActive }) => 
            `nav-item ${isActive ? 'active' : ''} ${!isNavbarActive ? 'disabled' : ''}`
          }
          onClick={(e) => handleDisabledClick(e, '/Timer')}
        >
          <img src={Mine} alt="Mine icon" />
          <span>Mine</span>
        </NavLink>

        {/* ========== Stake ========== */}
        <NavLink 
          to="/stake" 
          className={({ isActive }) => 
            `nav-item ${isActive ? 'active' : ''} ${!isNavbarActive ? 'disabled' : ''}`
          }
          onClick={(e) => handleDisabledClick(e, '/stake')}
        >
          <img src={Stake} alt="Stake icon" />
          <span>Stake</span>
        </NavLink>

        {/* ========== Friends ========== */}
        <NavLink 
          to="/referrals" 
          className={({ isActive }) => 
            `nav-item ${isActive ? 'active' : ''} ${!isNavbarActive ? 'disabled' : ''}`
          }
          onClick={(e) => handleDisabledClick(e, '/referrals')}
        >
          <img src={Friend} alt="Friends icon" />
          <span>Friends</span>
        </NavLink>

        {/* ========== About Us ========== */}
        <NavLink 
          to="/Aboutus" 
          className={({ isActive }) => 
            `nav-item ${isActive ? 'active' : ''} ${!isNavbarActive ? 'disabled' : ''}`
          }
          onClick={(e) => handleDisabledClick(e, '/Aboutus')}
        >
          <img src={Aboutus} alt="Aboutus icon" />
          <span>About Us</span>
        </NavLink>

        {/* ========== Wallets (همیشه فعال) ========== */}
        <NavLink 
          to="/" 
          className={({ isActive }) => 
            `nav-item ${isActive ? 'active' : ''}`
          }
        >
          <img src={Wallet} alt="Wallets icon" />
          <span>Wallets</span>
        </NavLink>
      </nav>

      {/* ============================================================
          POPUP - خارج از Navbar
          ============================================================ */}
      {showPopup && (
        <div className={`popup-overlay ${popupType}`} onClick={closePopup}>
          <div className="popup-content" onClick={(e) => e.stopPropagation()}>
            <button className="popup-close" onClick={closePopup}>✕</button>
            <div className="popup-icon">
              {popupType === "valid" ? "✅" : "❌"}
            </div>
            <p className="popup-message">{popupMessage}</p>
            <button className="popup-button" onClick={closePopup}>
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;