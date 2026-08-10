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
  return window.Telegram?.WebApp || null;
};

// ==========================================
// Component
// ==========================================

export default function Referrals() {
  const tonWallet = useTonWallet();

  const address = useMemo(
    () => tonWallet?.account?.address || null,
    [tonWallet]
  );

  // ==========================================
  // State
  // ==========================================

  const [myCode, setMyCode] = useState(null);
  const [refCount, setRefCount] = useState(null);
  const [levels, setLevels] = useState(null);

  const [showTestTable, setShowTestTable] =
    useState(false);

  const [testData, setTestData] = useState(null);

  const [totalReferrals, setTotalReferrals] =
    useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [telegramId, setTelegramId] =
    useState(null);

  const [telegramUsername, setTelegramUsername] =
    useState(null);

  const [isTelegramWebApp, setIsTelegramWebApp] =
    useState(false);

  /*
   * null = هنوز Telegram بررسی نشده
   *
   * string = referral پیدا شده
   *
   * false = بررسی شد ولی referral وجود ندارد
   */
  const [inviterCode, setInviterCode] =
    useState(null);

  const [referralReady, setReferralReady] =
    useState(false);

  const hasFetched = useRef(false);

  // ==========================================
  // Telegram Initialization
  // ==========================================

  useEffect(() => {
    console.log(
      "🔍 Checking Telegram WebApp..."
    );

    const tg = getTelegramWebApp();

    if (!tg) {
      console.log(
        "🌐 Browser mode"
      );

      setIsTelegramWebApp(false);

      // اگر قبلاً referral ذخیره شده
      const savedReferral =
        getInviterCode();

      setInviterCode(
        savedReferral || false
      );

      setReferralReady(true);

      return;
    }

    // ==========================================
    // Telegram Found
    // ==========================================

    console.log(
      "✅ Telegram WebApp found"
    );

    tg.ready();
    tg.expand();

    setIsTelegramWebApp(true);

    // ==========================================
    // Telegram User
    // ==========================================

    const user =
      tg.initDataUnsafe?.user || null;

    if (user) {
      const tgId = user.id;

      const tgUsername =
        user.username || null;

      setTelegramId(tgId);
      setTelegramUsername(tgUsername);

      saveUserDataToStorage({
        telegramId: tgId,
        telegramUsername: tgUsername,
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
    }

    // ==========================================
    // Referral
    // ==========================================

    const capturedCode =
      captureInviterCode();

    console.log(
      "🎯 Captured inviter code:",
      capturedCode
    );

    setInviterCode(
      capturedCode || false
    );

    /*
     * VERY IMPORTANT
     *
     * بعد از این مرحله اجازه /connect/
     * داده می‌شود.
     */
    setReferralReady(true);
  }, []);

  // ==========================================
  // Save Wallet
  // ==========================================

  useEffect(() => {
    if (!address) return;

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
      return (
        Math.floor(Date.now() / 1000) +
        2000000000000
      );
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

    return (
      Math.abs(hash) +
      1000000000000
    );
  }, [address]);

  // ==========================================
  // Register User
  // ==========================================

  useEffect(() => {
    if (!address) {
      setMyCode(null);
      setRefCount(null);
      setError("");
      return;
    }

    /*
     * DO NOT register before Telegram
     * referral detection is finished.
     */
    if (!referralReady) {
      console.log(
        "⏳ Waiting for referral detection..."
      );

      return;
    }

    if (hasFetched.current) {
      console.log(
        "⛔️ Already registered - skipping"
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

        /*
         * inviterCode from state is preferred.
         * localStorage is fallback.
         */
        const finalInviterCode =
          inviterCode ||
          storedInviter ||
          null;

        console.log(
          "🎯 FINAL INVITER CODE:",
          finalInviterCode
        );

        // ==========================================
        // Telegram
        // ==========================================

        const savedData =
          loadUserDataFromStorage();

        let finalTelegramId;
        let finalTelegramUsername = null;

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

        console.log(
          "📤 /connect/ PAYLOAD:",
          payload
        );

        // ==========================================
        // Connect / Register
        // ==========================================

        const res =
          await api.post(
            "/connect/",
            payload
          );

        if (cancelled) return;

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

        setMyCode(
          returnedCode
        );

        // ==========================================
        // Referral Count
        // ==========================================

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

        if (cancelled) return;

        const count =
          countRes.data?.count ?? 0;

        setRefCount(count);

        console.log(
          "👥 Referral count:",
          count
        );
      } catch (error) {
        if (cancelled) return;

        console.error(
          "❌ /connect/ ERROR:",
          error
        );

        console.error(
          "❌ Backend response:",
          error?.response?.data
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

    async function fetchLevels() {
      try {
        console.log(
          "🔄 Fetching referral levels..."
        );

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

        setLevels(
          response.data?.levels || {}
        );

        setTotalReferrals(
          response.data
            ?.total_referrals || 0
        );

        console.log(
          "✅ Levels:",
          response.data
        );
      } catch (error) {
        console.error(
          "❌ Failed to fetch levels:",
          error
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

      setTestData(
        response.data?.levels || {}
      );

      setShowTestTable(true);
    } catch (error) {
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

    return (
      `https://t.me/${BOT_USERNAME}` +
      `/app?startapp=ref_` +
      `${encodeURIComponent(myCode)}`
    );
  };

  const referralLink =
    getMiniAppLink();

  // ==========================================
  // Open Mini App
  // ==========================================

  function openReferralLink() {
    if (!referralLink) return;

    const tg =
      getTelegramWebApp();

    console.log(
      "🚀 Mini App link:",
      referralLink
    );

    if (
      tg &&
      typeof tg.openTelegramLink ===
        "function"
    ) {
      tg.openTelegramLink(
        referralLink
      );
    } else {
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

          {/* ==========================================
              Referral Link
          ========================================== */}

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

            {/* ==========================================
                Stats
            ========================================== */}

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

            {/* ==========================================
                Telegram Status
            ========================================== */}

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

            {/* ==========================================
                Current Inviter
            ========================================== */}

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

          {/* ==========================================
              Referral Tree
          ========================================== */}

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

            {/* ==========================================
                Test Button
            ========================================== */}

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

            {/* ==========================================
                Test Table
            ========================================== */}

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
