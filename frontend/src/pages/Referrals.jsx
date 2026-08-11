
import { useEffect, useMemo, useRef, useState } from "react";
import { useTonWallet } from "@tonconnect/ui-react";
import { api } from "../api";
import "./Referrals.css";
import {
  captureInviterCode,
  getInviterCode,
} from "../utils/referral";

// ==========================================
// Constants
// ==========================================

const USER_DATA_KEY = "my_app_user_data";
const BOT_USERNAME = "aipolynetbot";

// ==========================================
// LocalStorage Helpers
// ==========================================

const loadUserDataFromStorage = () => {
  try {
    const data = localStorage.getItem(USER_DATA_KEY);

    console.log(
      "💾 [DEBUG] loadUserDataFromStorage:",
      data
    );

    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error(
      "❌ Error parsing localStorage:",
      error
    );

    return null;
  }
};

const saveUserDataToStorage = (newData) => {
  try {
    const currentData =
      loadUserDataFromStorage() || {};

    const mergedData = {
      ...currentData,
      ...newData,
    };

    localStorage.setItem(
      USER_DATA_KEY,
      JSON.stringify(mergedData)
    );

    console.log(
      "💾 [DEBUG] User data saved:",
      mergedData
    );
  } catch (error) {
    console.error(
      "❌ Error saving localStorage:",
      error
    );
  }
};

// ==========================================
// Telegram
// ==========================================

const getTelegramWebApp = () => {
  const tg =
    window.Telegram?.WebApp || null;

  console.log(
    "📱 [DEBUG] getTelegramWebApp():",
    tg
  );

  return tg;
};

// ==========================================
// Component
// ==========================================

export default function Referrals() {
  const tonWallet = useTonWallet();

  const address = useMemo(
    () =>
      tonWallet?.account?.address ||
      null,
    [tonWallet]
  );

  // ==========================================
  // State
  // ==========================================

  const [myCode, setMyCode] =
    useState(null);

  const [refCount, setRefCount] =
    useState(null);

  const [levels, setLevels] =
    useState(null);

  const [showTestTable, setShowTestTable] =
    useState(false);

  const [testData, setTestData] =
    useState(null);

  const [totalReferrals, setTotalReferrals] =
    useState(0);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [telegramId, setTelegramId] =
    useState(null);

  const [telegramUsername, setTelegramUsername] =
    useState(null);

  const [isTelegramWebApp, setIsTelegramWebApp] =
    useState(false);

  /*
   * null = هنوز Telegram بررسی نشده
   * string = referral پیدا شده
   * false = بررسی شد ولی referral وجود ندارد
   */
  const [inviterCode, setInviterCode] =
    useState(null);

  const [referralReady, setReferralReady] =
    useState(false);

  const hasFetched = useRef(false);

  // ==========================================
  // Wallet Debug
  // ==========================================

  useEffect(() => {
    console.log(
      "=================================================="
    );

    console.log(
      "💰 [REFERRAL DEBUG] WALLET CHANGED"
    );

    console.log(
      "=================================================="
    );

    console.log(
      "💰 TON Wallet:",
      tonWallet
    );

    console.log(
      "💰 Wallet address:",
      address
    );

    console.log(
      "🔗 Referral ready:",
      referralReady
    );

    console.log(
      "🎯 Current inviterCode:",
      inviterCode
    );

    console.log(
      "=================================================="
    );
  }, [
    tonWallet,
    address,
    referralReady,
    inviterCode,
  ]);

  // ==========================================
  // Telegram Initialization + DEBUG
  // ==========================================

  useEffect(() => {
    console.log(
      "=================================================="
    );

    console.log(
      "🔵 [REFERRAL DEBUG] STEP 1 - INIT"
    );

    console.log(
      "=================================================="
    );

    console.log(
      "🌐 Current URL:",
      window.location.href
    );

    console.log(
      "🌐 Current pathname:",
      window.location.pathname
    );

    console.log(
      "🌐 Current search:",
      window.location.search
    );

    const tg = getTelegramWebApp();

    console.log(
      "📱 Telegram WebApp object:",
      tg
    );

    if (!tg) {
      console.log(
        "⚠️ [REFERRAL DEBUG] STEP 2 - Telegram NOT detected"
      );

      setIsTelegramWebApp(false);

      const savedReferral =
        getInviterCode();

      console.log(
        "💾 Stored referral:",
        savedReferral
      );

      setInviterCode(
        savedReferral || false
      );

      setReferralReady(true);

      console.log(
        "✅ Browser mode referral ready"
      );

      return;
    }

    // ==========================================
    // Telegram Found
    // ==========================================

    console.log(
      "✅ [REFERRAL DEBUG] STEP 2 - Telegram detected"
    );

    tg.ready();
    tg.expand();

    setIsTelegramWebApp(true);

    // ==========================================
    // Telegram Init Data
    // ==========================================

    console.log(
      "📦 Telegram initDataUnsafe:",
      tg.initDataUnsafe
    );

    console.log(
      "📦 Telegram initData:",
      tg.initData
    );

    // ==========================================
    // Telegram User
    // ==========================================

    const user =
      tg.initDataUnsafe?.user ||
      null;

    console.log(
      "👤 Telegram user:",
      user
    );

    if (user) {
      const tgId = user.id;

      const tgUsername =
        user.username || null;

      setTelegramId(tgId);
      setTelegramUsername(
        tgUsername
      );

      saveUserDataToStorage({
        telegramId: tgId,
        telegramUsername:
          tgUsername,
        isTelegram: true,
      });

      console.log(
        "👤 Telegram ID:",
        tgId
      );

      console.log(
        "👤 Telegram Username:",
        tgUsername
      );
    } else {
      console.warn(
        "⚠️ Telegram user not available"
      );
    }

    // ==========================================
    // START PARAM - MOST IMPORTANT
    // ==========================================

    console.log(
      "=================================================="
    );

    console.log(
      "🟡 [REFERRAL DEBUG] STEP 3 - START PARAM"
    );

    console.log(
      "=================================================="
    );

    const startParam =
      tg.initDataUnsafe?.start_param ||
      null;

    console.log(
      "🎯 tg.initDataUnsafe.start_param:",
      startParam
    );

    // ==========================================
    // Check URL
    // ==========================================

    const urlParams =
      new URLSearchParams(
        window.location.search
      );

    const tgWebAppStartParam =
      urlParams.get(
        "tgWebAppStartParam"
      );

    console.log(
      "🎯 URL tgWebAppStartParam:",
      tgWebAppStartParam
    );

    console.log(
      "🎯 URL parameters:",
      Object.fromEntries(
        urlParams.entries()
      )
    );

    // ==========================================
    // Capture Referral
    // ==========================================

    console.log(
      "=================================================="
    );

    console.log(
      "🟠 [REFERRAL DEBUG] STEP 4 - CAPTURE"
    );

    console.log(
      "=================================================="
    );

    const capturedCode =
      captureInviterCode();

    console.log(
      "🎯 captureInviterCode() returned:",
      capturedCode
    );

    const storedAfterCapture =
      getInviterCode();

    console.log(
      "💾 getInviterCode() after capture:",
      storedAfterCapture
    );

    console.log(
      "💾 Raw localStorage inviter_code:",
      localStorage.getItem(
        "inviter_code"
      )
    );

    setInviterCode(
      capturedCode || false
    );

    setReferralReady(true);

    console.log(
      "✅ [REFERRAL DEBUG] Referral detection READY"
    );

    console.log(
      "=================================================="
    );
  }, []);

  // ==========================================
  // Save Wallet
  // ==========================================

  useEffect(() => {
    if (!address) {
      console.log(
        "💰 [DEBUG] No wallet address yet"
      );

      return;
    }

    console.log(
      "💰 [DEBUG] Saving wallet address:",
      address
    );

    saveUserDataToStorage({
      walletAddress: address,
    });

    console.log(
      "💾 Wallet address saved:",
      address
    );
  }, [address]);

  // ==========================================
  // Browser Telegram ID
  // ==========================================

  const browserTelegramId = useMemo(() => {
    if (!address) {
      const generated =
        Math.floor(
          Date.now() / 1000
        ) + 2000000000000;

      console.log(
        "🌐 [DEBUG] Generated browser Telegram ID:",
        generated
      );

      return generated;
    }

    let hash = 0;

    for (
      let i = 0;
      i < address.length;
      i++
    ) {
      const char =
        address.charCodeAt(i);

      hash =
        (hash << 5) -
        hash +
        char;

      hash = hash & hash;
    }

    const generated =
      Math.abs(hash) +
      1000000000000;

    console.log(
      "🌐 [DEBUG] Browser Telegram ID:",
      generated
    );

    return generated;
  }, [address]);

  // ==========================================
  // Register User
  // ==========================================

  useEffect(() => {
    console.log(
      "=================================================="
    );

    console.log(
      "🔴 [REFERRAL DEBUG] REGISTER EFFECT"
    );

    console.log(
      "=================================================="
    );

    console.log(
      "💰 address:",
      address
    );

    console.log(
      "🔗 referralReady:",
      referralReady
    );

    console.log(
      "🎯 inviterCode:",
      inviterCode
    );

    console.log(
      "📱 telegramId:",
      telegramId
    );

    console.log(
      "📱 telegramUsername:",
      telegramUsername
    );

    console.log(
      "📱 isTelegramWebApp:",
      isTelegramWebApp
    );

    if (!address) {
      console.log(
        "⏳ [REGISTER] No wallet - waiting..."
      );

      setMyCode(null);
      setRefCount(null);
      setError("");

      return;
    }

    if (!referralReady) {
      console.log(
        "⏳ [REGISTER] Waiting for referral detection..."
      );

      return;
    }

    if (hasFetched.current) {
      console.log(
        "⛔️ [REGISTER] Already registered - skipping"
      );

      return;
    }

    let cancelled = false;

    hasFetched.current = true;

    async function fetchData() {
      try {
        setLoading(true);
        setError("");

        // ==========================================
        // Referral
        // ==========================================

        const storedInviter =
          getInviterCode();

        console.log(
          "💾 [REGISTER] storedInviter:",
          storedInviter
        );

        const finalInviterCode =
          inviterCode ||
          storedInviter ||
          null;

        console.log(
          "🎯 [REGISTER] FINAL INVITER CODE:",
          finalInviterCode
        );

        // ==========================================
        // Telegram
        // ==========================================

        const savedData =
          loadUserDataFromStorage();

        console.log(
          "📂 [REGISTER] Saved user data:",
          savedData
        );

        let finalTelegramId;
        let finalTelegramUsername =
          null;

        if (
          savedData?.telegramId &&
          savedData.telegramId > 0
        ) {
          finalTelegramId =
            savedData.telegramId;

          finalTelegramUsername =
            savedData.telegramUsername ||
            null;

          console.log(
            "📂 Using Telegram ID from storage:",
            finalTelegramId
          );
        } else if (
          isTelegramWebApp &&
          telegramId &&
          telegramId > 0
        ) {
          finalTelegramId =
            telegramId;

          finalTelegramUsername =
            telegramUsername;

          console.log(
            "📱 Using real Telegram ID:",
            finalTelegramId
          );
        } else {
          finalTelegramId =
            browserTelegramId;

          finalTelegramUsername =
            `browser_${address.slice(
              0,
              8
            )}`;

          console.log(
            "🌐 Using browser Telegram ID:",
            finalTelegramId
          );
        }

        // ==========================================
        // Payload
        // ==========================================

        const payload = {
          wallet_address: address,

          inviter_code:
            finalInviterCode,

          telegram_id:
            finalTelegramId,

          telegram_username:
            finalTelegramUsername,

          is_telegram:
            isTelegramWebApp ||
            savedData?.isTelegram ||
            false,
        };

        // ==========================================
        // CRITICAL DEBUG
        // ==========================================

        console.log(
          "=================================================="
        );

        console.log(
          "🔴 [REFERRAL DEBUG] STEP 5 - BEFORE CONNECT"
        );

        console.log(
          "=================================================="
        );

        console.log(
          "💰 Wallet address:",
          address
        );

        console.log(
          "🎯 React inviterCode:",
          inviterCode
        );

        console.log(
          "🎯 Stored inviterCode:",
          storedInviter
        );

        console.log(
          "🎯 FINAL inviterCode:",
          finalInviterCode
        );

        console.log(
          "📱 Telegram ID:",
          finalTelegramId
        );

        console.log(
          "📱 Telegram username:",
          finalTelegramUsername
        );

        console.log(
          "📱 Is Telegram:",
          isTelegramWebApp
        );

        console.log(
          "📦 FULL /connect/ PAYLOAD:",
          payload
        );

        console.log(
          "📦 JSON PAYLOAD:",
          JSON.stringify(
            payload,
            null,
            2
          )
        );

        console.log(
          "🚀 Sending POST /connect/ ..."
        );

        // ==========================================
        // Connect / Register
        // ==========================================

        const res =
          await api.post(
            "/connect/",
            payload
          );

        if (cancelled) {
          console.log(
            "⚠️ Request cancelled"
          );

          return;
        }

        // ==========================================
        // BACKEND RESPONSE
        // ==========================================

        console.log(
          "=================================================="
        );

        console.log(
          "🟢 [REFERRAL DEBUG] STEP 6 - BACKEND RESPONSE"
        );

        console.log(
          "=================================================="
        );

        console.log(
          "✅ HTTP status:",
          res.status
        );

        console.log(
          "📥 Backend response:",
          res.data
        );

        console.log(
          "👤 Returned user:",
          res.data?.user
        );

        console.log(
          "🎯 Returned referral code:",
          res.data?.user?.referral_code
        );

        console.log(
          "🎯 Returned inviter:",
          res.data?.user?.inviter
        );

        console.log(
          "🎯 Returned parent:",
          res.data?.user?.parent
        );

        console.log(
          "=================================================="
        );

        console.log(
          "✅ /connect/ SUCCESS:",
          res.data
        );

        // ==========================================
        // My Referral Code
        // ==========================================

        const returnedCode =
          res.data?.user?.referral_code ||
          null;

        console.log(
          "🎟️ My referral code:",
          returnedCode
        );

        setMyCode(
          returnedCode
        );

        // ==========================================
        // Referral Count
        // ==========================================

        console.log(
          "🔄 Fetching referral count..."
        );

        const countRes =
          await api.get(
            "/referrals/count/",
            {
              params: {
                wallet_address:
                  address,
              },
            }
          );

        if (cancelled) {
          console.log(
            "⚠️ Referral count request cancelled"
          );

          return;
        }

        const count =
          countRes.data?.count ?? 0;

        console.log(
          "👥 Referral count response:",
          countRes.data
        );

        console.log(
          "👥 Referral count:",
          count
        );

        setRefCount(count);

      } catch (error) {
        if (cancelled) {
          console.log(
            "⚠️ Error occurred after cancellation"
          );

          return;
        }

        console.error(
          "=================================================="
        );

        console.error(
          "❌ [REFERRAL DEBUG] CONNECT ERROR"
        );

        console.error(
          "=================================================="
        );

        console.error(
          "❌ Error:",
          error
        );

        console.error(
          "❌ Error message:",
          error?.message
        );

        console.error(
          "❌ HTTP status:",
          error?.response?.status
        );

        console.error(
          "❌ Backend response:",
          error?.response?.data
        );

        console.error(
          "❌ Backend headers:",
          error?.response?.headers
        );

        console.error(
          "=================================================="
        );

        setError(
          error?.response?.data?.error ||
            error?.response?.data?.detail ||
            error?.message ||
            "Failed to fetch referral information."
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [
    address,
    referralReady,
    inviterCode,
    telegramId,
    telegramUsername,
    isTelegramWebApp,
    browserTelegramId,
  ]);

  // ==========================================
  // Fetch Referral Levels
  // ==========================================

  useEffect(() => {
    if (!address) return;

    console.log(
      "🔄 [LEVELS] Fetching referral levels..."
    );

    async function fetchLevels() {
      try {
        const response =
          await api.get(
            "/referral/levels/",
            {
              params: {
                wallet_address:
                  address,
              },
            }
          );

        console.log(
          "✅ [LEVELS] Response:",
          response.data
        );

        setLevels(
          response.data?.levels || {}
        );

        setTotalReferrals(
          response.data
            ?.total_referrals || 0
        );
      } catch (error) {
        console.error(
          "❌ [LEVELS] Failed:",
          error
        );

        console.error(
          "❌ [LEVELS] Backend:",
          error?.response?.data
        );
      }
    }

    fetchLevels();
  }, [address]);

  // ==========================================
  // Test Data
  // ==========================================

  async function fetchTestData() {
    if (!address) return;

    console.log(
      "🧪 [TEST] Fetching test referral data..."
    );

    try {
      setLoading(true);

      const response =
        await api.get(
          "/referral/levels/",
          {
            params: {
              wallet_address:
                address,
              test: "true",
            },
          }
        );

      console.log(
        "🧪 [TEST] Response:",
        response.data
      );

      setTestData(
        response.data?.levels || {}
      );

      setShowTestTable(true);
    } catch (error) {
      console.error(
        "❌ [TEST] Failed:",
        error
      );

      console.error(
        "❌ [TEST] Backend:",
        error?.response?.data
      );

      setError(
        `Failed to load test data: ${
          error?.response?.data?.error ||
          error?.message ||
          "Unknown error"
        }`
      );
    } finally {
      setLoading(false);
    }
  }

  // ==========================================
  // Telegram Mini App Referral Link
  // ==========================================

  const getMiniAppLink = () => {
    if (!myCode) return "";

    const link =
      `https://t.me/${BOT_USERNAME}` +
      `/app?startapp=ref_` +
      `${encodeURIComponent(myCode)}`;

    console.log(
      "🔗 [REFERRAL] Generated referral link:",
      link
    );

    return link;
  };

  const referralLink =
    getMiniAppLink();

  // ==========================================
  // Open Mini App
  // ==========================================

  function openReferralLink() {
    if (!referralLink) {
      console.warn(
        "⚠️ [REFERRAL] No referral link"
      );

      return;
    }

    const tg =
      getTelegramWebApp();

    console.log(
      "🚀 [REFERRAL] Opening link:",
      referralLink
    );

    if (
      tg &&
      typeof tg.openTelegramLink ===
        "function"
    ) {
      console.log(
        "📱 Opening via Telegram openTelegramLink"
      );

      tg.openTelegramLink(
        referralLink
      );
    } else {
      console.log(
        "🌐 Opening via browser"
      );

      window.open(
        referralLink,
        "_blank",
        "noopener,noreferrer"
      );
    }
  }

  // ==========================================
  // Share Telegram
  // ==========================================

  function shareOnTelegram() {
    if (!referralLink) return;

    const message =
      `🎯 Join me on AI PolyNet!\n\n` +
      `🚀 Open the Mini App using my referral link:\n\n` +
      `${referralLink}\n\n` +
      `💎 Don't miss out on the rewards!`;

    const shareUrl =
      `https://t.me/share/url` +
      `?url=${encodeURIComponent(
        referralLink
      )}` +
      `&text=${encodeURIComponent(
        message
      )}`;

    console.log(
      "📤 [REFERRAL] Telegram share URL:",
      shareUrl
    );

    const tg =
      getTelegramWebApp();

    if (
      tg &&
      typeof tg.openTelegramLink ===
        "function"
    ) {
      try {
        tg.openTelegramLink(
          shareUrl
        );
      } catch (error) {
        console.error(
          "❌ Telegram share failed:",
          error
        );

        window.open(
          shareUrl,
          "_blank",
          "noopener,noreferrer"
        );
      }
    } else {
      window.open(
        shareUrl,
        "_blank",
        "noopener,noreferrer"
      );
    }
  }

  // ==========================================
  // Copy Referral Link
  // ==========================================

  async function copyReferralLink() {
    if (!referralLink) return;

    try {
      await navigator.clipboard.writeText(
        referralLink
      );

      console.log(
        "📋 [REFERRAL] Link copied:",
        referralLink
      );

      alert(
        "✅ Telegram referral link copied!"
      );
    } catch (error) {
      console.error(
        "❌ Copy failed:",
        error
      );
    }
  }

  // ==========================================
  // Render Level Table
  // ==========================================

  function renderLevelTable(
    level,
    data
  ) {
    if (!data) {
      return (
        <div className="level-table">
          <div className="level-header">
            <h4>
              ⭐ Level {level}
            </h4>
          </div>

          <div className="empty-message">
            No data available
          </div>
        </div>
      );
    }

    const users =
      data.users || [];

    const count =
      data.count || 0;

    const displayUsers =
      users.slice(0, 10);

    return (
      <div className="level-table">

        <div className="level-header">
          <h4>
            ⭐ Level {level}
          </h4>

          <span className="level-count">
            Total: {count}
          </span>
        </div>

        <div className="table-wrapper">

          <table>

            <thead>
              <tr>
                <th>#</th>
                <th>Telegram ID</th>
                <th>Wallet Address</th>
                <th>
                  Investment (TON)
                </th>
                <th>
                  Profit
                </th>
              </tr>
            </thead>

            <tbody>

              {displayUsers.length ===
              0 ? (
                <tr>
                  <td
                    colSpan="5"
                    className="empty-message"
                  >
                    No users in this level
                  </td>
                </tr>
              ) : (
                displayUsers.map(
                  (
                    user,
                    index
                  ) => {

                    const isString =
                      typeof user ===
                      "string";

                    const telegramId =
                      isString
                        ? "-"
                        : user.telegram_id ||
                          "-";

                    const wallet =
                      isString
                        ? user
                        : user.wallet ||
                          "-";

                    const investment =
                      isString
                        ? 0
                        : user.investment ||
                          0;

                    const profit =
                      isString
                        ? 0
                        : user.profit ||
                          0;

                    return (
                      <tr
                        key={index}
                      >

                        <td>
                          {index + 1}
                        </td>

                        <td className="telegram-id">
                          {telegramId}
                        </td>

                        <td className="wallet-address">
                          {wallet.length >
                          10
                            ? `${wallet.slice(
                                0,
                                6
                              )}...${wallet.slice(
                                -4
                              )}`
                            : wallet}
                        </td>

                        <td className="investment-cell">
                          {investment}
                        </td>

                        <td className="profit-cell">
                          + {profit}
                        </td>

                      </tr>
                    );
                  }
                )
              )}

            </tbody>

          </table>

        </div>

        {users.length > 10 && (
          <div className="show-more">
            + {users.length - 10} more users
          </div>
        )}

      </div>
    );
  }

  // ==========================================
  // Wallet Not Connected
  // ==========================================

  if (!address) {
    return (
      <div className="wallet-required">
        🔌 Please connect your wallet first.
      </div>
    );
  }

  // ==========================================
  // Main Render
  // ==========================================

  return (
    <div className="referral-dashboard">

      <h2>
        🎯 Referral Dashboard
      </h2>

      {loading && (
        <div className="loading-spinner">
          Loading...
        </div>
      )}

      {error && (
        <div className="error-message">
          ❌ {error}
        </div>
      )}

      {!referralReady && (
        <div className="loading-spinner">
          🔗 Preparing referral...
        </div>
      )}

      {myCode ? (
        <>

          <div className="referral-link-section">

            <p className="referral-link-label">
              🔗 Telegram Mini App Invite Link
            </p>

            <div className="link-actions">

              <input
                value={referralLink}
                readOnly
                className="link-input"
              />

              <button
                onClick={
                  openReferralLink
                }
                disabled={!referralLink}
                className="btn-open"
              >
                🚀 Open Mini App
              </button>

              <button
                onClick={
                  copyReferralLink
                }
                disabled={!referralLink}
                className="btn-copy"
              >
                📋 Copy
              </button>

              <button
                onClick={
                  shareOnTelegram
                }
                disabled={!referralLink}
                className="btn-share-telegram"
              >
                📤 Share on Telegram
              </button>

            </div>

            <div className="stats-box">

              <div className="stat-item">

                <span className="stat-label">
                  👥 Direct Invites
                </span>

                <span className="stat-value">
                  {refCount === null
                    ? "..."
                    : refCount}
                </span>

              </div>

              <div className="stat-item">

                <span className="stat-label">
                  🌳 Total Tree
                </span>

                <span className="stat-value">
                  {totalReferrals}
                </span>

              </div>

            </div>

            <div className="telegram-status">

              {isTelegramWebApp ? (
                <span className="status-active">
                  ✅ Connected to Telegram
                </span>
              ) : (
                <span className="status-inactive">
                  🌐 Browser Mode
                </span>
              )}

            </div>

            {inviterCode && (
              <div className="info-note">
                🎁 Invited by:
                <b>
                  {" "}
                  {inviterCode}
                </b>
              </div>
            )}

            <div className="info-note">
              💡 This link opens the Telegram
              Mini App and keeps the referral
              code.
            </div>

          </div>

          <div className="levels-section">

            <h3>
              🔺 Referral Tree (5 Levels)
            </h3>

            <div className="levels-grid">

              {[1, 2, 3, 4, 5].map(
                (level) => (
                  <div
                    key={level}
                    className="level-card"
                  >
                    {renderLevelTable(
                      level,
                      levels?.[
                        `level_${level}`
                      ]
                    )}
                  </div>
                )
              )}

            </div>

            <div className="test-actions">

              <button
                onClick={
                  fetchTestData
                }
                className="btn-test"
                disabled={loading}
              >
                🧪 Show Test Table
              </button>

            </div>

            {showTestTable &&
              testData && (
                <div className="test-table-section">

                  <div className="test-header">

                    <h3>
                      🧪 Test Data
                      (5 Levels)
                    </h3>

                    <button
                      onClick={() =>
                        setShowTestTable(
                          false
                        )
                      }
                      className="btn-close"
                    >
                      ✕ Close
                    </button>

                  </div>

                  <div className="levels-grid">

                    {[1, 2, 3, 4, 5].map(
                      (level) => (
                        <div
                          key={`test-${level}`}
                          className="level-card test-card"
                        >
                          {renderLevelTable(
                            level,
                            testData?.[
                              `level_${level}`
                            ]
                          )}
                        </div>
                      )
                    )}

                  </div>

                  <div className="test-note">
                    ⚡ This is test data
                    showing how the
                    referral tree will
                    look with sample
                    users.
                  </div>

                </div>
              )}

          </div>

        </>
      ) : (
        <div className="loading-spinner">
          Loading referral data...
        </div>
      )}

    </div>
  );
}
