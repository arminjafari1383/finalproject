import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { NavLink } from "react-router-dom";
import { useTonWallet } from "@tonconnect/ui-react";
import { useWallet } from "../context/WalletContext";
import "./Navbar.css";

import WalletIcon from "../assets/wallet.png";
import StakeIcon from "../assets/stake.png";
import MineIcon from "../assets/mine.png";
import FriendIcon from "../assets/friends.png";
import AboutUsIcon from "../assets/aboutus.png";

const AUTO_CLOSE_DELAY = 5000;

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

  /*
   * اگر داخل WalletContext متغیر isWalletLoading داری،
   * همین نام را استفاده کن.
   */
  const {
    isWalletValid,
    isWalletLoading = false,
  } = useWallet();

  const walletAddress = tonWallet?.account?.address || null;
  const isWalletConnected = Boolean(walletAddress);

  const isValidationFinished =
    isWalletConnected &&
    !isWalletLoading &&
    typeof isWalletValid === "boolean";

  const isNavbarActive =
    isValidationFinished && isWalletValid === true;

  const [popup, setPopup] = useState({
    visible: false,
    type: "invalid",
    message: "",
  });

  const popupTimerRef = useRef(null);
  const previousWalletAddressRef = useRef(null);
  const lastValidationRef = useRef(null);

  const clearPopupTimer = useCallback(() => {
    if (popupTimerRef.current) {
      clearTimeout(popupTimerRef.current);
      popupTimerRef.current = null;
    }
  }, []);

  const closePopup = useCallback(() => {
    clearPopupTimer();

    setPopup((previousPopup) => ({
      ...previousPopup,
      visible: false,
    }));
  }, [clearPopupTimer]);

  const openPopup = useCallback(
    (type, message) => {
      clearPopupTimer();

      setPopup({
        visible: true,
        type,
        message,
      });

      popupTimerRef.current = setTimeout(() => {
        setPopup((previousPopup) => ({
          ...previousPopup,
          visible: false,
        }));

        popupTimerRef.current = null;
      }, AUTO_CLOSE_DELAY);
    },
    [clearPopupTimer]
  );

  /*
   * پیام اتصال فقط پس از پایان اعتبارسنجی نمایش داده می‌شود.
   * برای هر وضعیت نیز تنها یک‌بار Popup باز می‌شود.
   */
  useEffect(() => {
    if (!isWalletConnected) {
      previousWalletAddressRef.current = null;
      lastValidationRef.current = null;
      closePopup();
      return;
    }

    if (!isValidationFinished) {
      return;
    }

    const validationKey =
      `${walletAddress}:${String(isWalletValid)}`;

    if (lastValidationRef.current === validationKey) {
      return;
    }

    const walletChanged =
      previousWalletAddressRef.current !== walletAddress;

    previousWalletAddressRef.current = walletAddress;
    lastValidationRef.current = validationKey;

    if (!walletChanged && isWalletValid !== false) {
      return;
    }

    if (isWalletValid === true) {
      openPopup(
        "valid",
        "Your wallet is valid and connected!"
      );
    } else {
      openPopup(
        "invalid",
        "This wallet is not registered. Please use your registered wallet."
      );
    }
  }, [
    walletAddress,
    isWalletConnected,
    isValidationFinished,
    isWalletValid,
    openPopup,
    closePopup,
  ]);

  useEffect(() => {
    return () => {
      clearPopupTimer();
    };
  }, [clearPopupTimer]);

  const handleProtectedNavigation = useCallback(
    (event, item) => {
      if (!item.protected) {
        return;
      }

      if (!isWalletConnected) {
        event.preventDefault();

        openPopup(
          "invalid",
          "Please connect your wallet first!"
        );

        return;
      }

      if (isWalletLoading || !isValidationFinished) {
        event.preventDefault();

        openPopup(
          "invalid",
          "Please wait while your wallet is being verified."
        );

        return;
      }

      if (!isWalletValid) {
        event.preventDefault();

        openPopup(
          "invalid",
          "Please connect with your registered wallet first!"
        );
      }
    },
    [
      isWalletConnected,
      isWalletLoading,
      isValidationFinished,
      isWalletValid,
      openPopup,
    ]
  );

  return (
    <>
      <nav className="navbar" aria-label="Main navigation">
        {navItems.map((item) => {
          const isDisabled =
            item.protected && !isNavbarActive;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                [
                  "nav-item",
                  isActive ? "active" : "",
                  isDisabled ? "disabled" : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              }
              onClick={(event) =>
                handleProtectedNavigation(event, item)
              }
              aria-disabled={isDisabled}
            >
              <img
                src={item.icon}
                alt=""
                aria-hidden="true"
              />

              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {popup.visible && (
        <div
          className={`popup-overlay ${popup.type}`}
          onClick={closePopup}
          role="presentation"
        >
          <div
            className="popup-content"
            role="alertdialog"
            aria-modal="true"
            aria-live="assertive"
            aria-label="Wallet status"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="popup-close"
              onClick={closePopup}
              aria-label="Close popup"
            >
              ✕
            </button>

            <div className="popup-icon" aria-hidden="true">
              {popup.type === "valid" ? "✅" : "❌"}
            </div>

            <p className="popup-message">
              {popup.message}
            </p>

            <button
              type="button"
              className="popup-button"
              onClick={closePopup}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;