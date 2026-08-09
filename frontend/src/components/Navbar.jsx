import React from "react";
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

  // تابع برای مدیریت کلیک روی آیتم‌های غیرفعال
  const handleDisabledClick = (e, to) => {
    // اگر به صفحه Wallets می‌روید، همیشه اجازه بده
    if (to === '/') return; 
    
    if (!isNavbarActive) {
      e.preventDefault();
      alert('⚠️ Please connect with your registered wallet first!');
    }
  };

  return (
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

      {/* نمایش وضعیت ولت در پایین navbar */}
      {isWalletConnected && (
        <div className="wallet-status">
          {isWalletValid ? (
            <span className="status-valid">✅ Valid Wallet</span>
          ) : (
            <span className="status-invalid">❌ Invalid Wallet</span>
          )}
        </div>
      )}
    </nav>
  );
};

export default Navbar;