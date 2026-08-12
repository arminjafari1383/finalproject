import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { NavLink } from "react-router-dom";
import { useTonWallet } from "@tonconnect/ui-react";
import "./Navbar.css";

import WalletIcon from "../assets/wallet.png";
import StakeIcon from "../assets/stake.png";
import MineIcon from "../assets/mine.png";
import FriendIcon from "../assets/friends.png";
import AboutUsIcon from "../assets/aboutus.png";

const navItems = [
  {
    to: "/Timer",
    label: "Mine",
    icon: MineIcon,
    protected: true,
  },
  {
    to: "/stake",
    label: "Stake",
    icon: StakeIcon,
    protected: true,
  },
  {
    to: "/referrals",
    label: "Friends",
    icon: FriendIcon,
    protected: true,
  },
  {
    to: "/Aboutus",
    label: "About Us",
    icon: AboutUsIcon,
    protected: true,
  },
  {
    to: "/",
    label: "Wallets",
    icon: WalletIcon,
    protected: false,
  },
];

const Navbar = () => {
  const tonWallet = useTonWallet();

  const walletAddress =
    tonWallet?.account?.address || "";

  const isWalletConnected = Boolean(walletAddress);

  const [popup, setPopup] = useState({
    visible: false,
    message: "",
  });

  const timerRef = useRef(null);

  const closePopup = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setPopup({
      visible: false,
      message: "",
    });
  }, []);

  const showPopup = useCallback((message) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    setPopup({
      visible: true,
      message,
    });

    timerRef.current = setTimeout(() => {
      setPopup({
        visible: false,
        message: "",
      });

      timerRef.current = null;
    }, 2500);
  }, []);

  const handleNavigation = useCallback(
    (event, item) => {
      if (!item.protected) {
        return;
      }

      if (!isWalletConnected) {
        event.preventDefault();

        showPopup(
          "Please connect your wallet first!"
        );
      }

      /*
       * اگر کیف پول متصل باشد، هیچ preventDefault اجرا نمی‌شود
       * و صفحه با همان کلیک اول باز می‌شود.
       */
    },
    [isWalletConnected, showPopup]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <>
      <nav
        className="navbar"
        aria-label="Main navigation"
      >
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              [
                "nav-item",
                isActive ? "active" : "",
                item.protected &&
                !isWalletConnected
                  ? "disabled"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")
            }
            onClick={(event) =>
              handleNavigation(event, item)
            }
          >
            <img
              src={item.icon}
              alt={`${item.label} icon`}
            />

            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {popup.visible && (
        <div className="navbar-toast" role="alert">
          <span className="navbar-toast-icon">
            ⚠️
          </span>

          <span>{popup.message}</span>

          <button
            type="button"
            onClick={closePopup}
            aria-label="Close message"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
};

export default Navbar;