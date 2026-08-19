import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useTonWallet } from "@tonconnect/ui-react";
import axios from "axios";

import "./Timer.css";

import Logo from "../assets/2.png";
import Blade from "../assets/1.png";


// ✅ استفاده از آدرس نسبی برای جلوگیری از مشکل CORS و Nginx
const API = "/api/wallet";


/* =========================================================
   HOURGLASS
========================================================= */

function CountdownHourglass({
  remaining,
  topSandHeight,
  bottomSandHeight,
}) {
  /*
   * مقدارهای اصلی برنامه:
   * topSandHeight     => از 90 به 0
   * bottomSandHeight  => از 0 به 90
   *
   * اینجا آن‌ها را به ابعاد SVG تبدیل می‌کنیم.
   */

  const topFill = Math.max(
    0,
    Math.min(77, topSandHeight * 0.84)
  );

  const bottomFill = Math.max(
    0,
    Math.min(77, bottomSandHeight * 0.84)
  );


  /* سطح شن قسمت بالا */
  const topY = 132 - topFill;


  /* سطح شن قسمت پایین */
  const bottomBase = 236;

  const bottomPeak =
    bottomFill <= 1
      ? bottomBase
      : Math.max(
          169,
          bottomBase - bottomFill
        );


  /*
   * پهنای توده شن پایین
   * هرچه شن بیشتر شود پهن‌تر می‌شود.
   */
  const bottomHalfWidth =
    13 + (bottomFill / 77) * 43;


  const bottomLeft =
    120 - bottomHalfWidth;

  const bottomRight =
    120 + bottomHalfWidth;


  return (
    <svg
      viewBox="0 0 240 285"
      xmlns="http://www.w3.org/2000/svg"
      className={`countdown-hourglass ${
        remaining > 0
          ? "hourglass-running"
          : "hourglass-ready"
      }`}
      role="img"
      aria-label="Hourly reward countdown"
    >

      {/* =====================================================
          SVG STYLES
      ===================================================== */}

      <style>
        {`

          .hg-glass-main {
            fill: rgba(0, 73, 120, 0.035);
            stroke: url(#hgGlassEdge);
            stroke-width: 3;
          }

          .hg-glass-inside {
            fill: none;
            stroke: rgba(114, 221, 255, 0.28);
            stroke-width: 1.2;
          }

          .hg-glass-highlight {
            fill: none;
            stroke: rgba(230, 252, 255, 0.92);
            stroke-width: 2;
            stroke-linecap: round;
          }


          .hg-top-cap,
          .hg-bottom-cap {
            filter: url(#hgBlueGlow);
          }


          .hg-stream {
            animation:
              hgStreamPulse .16s linear infinite alternate;
          }

          .hg-stream-glow {
            animation:
              hgStreamPulse .16s linear infinite alternate;
          }


          @keyframes hgStreamPulse {

            from {
              opacity: .67;
            }

            to {
              opacity: 1;
            }

          }


          .hg-particle {

            fill: #ffe979;

            filter:
              url(#hgGoldGlow);

            animation:
              hgParticleFall 1.25s linear infinite;

          }


          .hg-p1 {
            animation-delay: 0s;
          }

          .hg-p2 {
            animation-delay: -.18s;
          }

          .hg-p3 {
            animation-delay: -.34s;
          }

          .hg-p4 {
            animation-delay: -.52s;
          }

          .hg-p5 {
            animation-delay: -.72s;
          }

          .hg-p6 {
            animation-delay: -.95s;
          }


          @keyframes hgParticleFall {

            0% {

              transform:
                translateY(-12px);

              opacity: 0;

            }


            15% {
              opacity: 1;
            }


            80% {
              opacity: .8;
            }


            100% {

              transform:
                translateY(63px);

              opacity: 0;

            }

          }


          .hg-top-grain {

            fill: #fff1a0;

            animation:
              hgTopGrainFloat
              1.8s
              ease-in-out
              infinite
              alternate;

          }


          .hg-top-grain:nth-child(2) {
            animation-delay: -.3s;
          }

          .hg-top-grain:nth-child(3) {
            animation-delay: -.6s;
          }

          .hg-top-grain:nth-child(4) {
            animation-delay: -.9s;
          }

          .hg-top-grain:nth-child(5) {
            animation-delay: -1.2s;
          }


          @keyframes hgTopGrainFloat {

            from {

              opacity: .35;

              transform:
                translateY(1px);

            }


            to {

              opacity: 1;

              transform:
                translateY(-2px);

            }

          }


          .hg-base-glow {

            transform-origin:
              center;

            animation:
              hgBaseGlow
              2s
              ease-in-out
              infinite
              alternate;

          }


          @keyframes hgBaseGlow {

            from {

              opacity: .28;

              transform:
                scaleX(.87);

            }


            to {

              opacity: .66;

              transform:
                scaleX(1.05);

            }

          }


          .hg-shine {

            animation:
              hgGlassShine
              2.4s
              ease-in-out
              infinite
              alternate;

          }


          @keyframes hgGlassShine {

            from {
              opacity: .3;
            }

            to {
              opacity: .9;
            }

          }

        `}
      </style>


      <defs>

        {/* =====================================================
            BLUE METAL
        ===================================================== */}

        <linearGradient
          id="hgMetal"
          x1="0"
          y1="0"
          x2="1"
          y2="1"
        >

          <stop
            offset="0%"
            stopColor="#001a69"
          />

          <stop
            offset="13%"
            stopColor="#005bca"
          />

          <stop
            offset="27%"
            stopColor="#19d8ff"
          />

          <stop
            offset="43%"
            stopColor="#077cff"
          />

          <stop
            offset="63%"
            stopColor="#00369e"
          />

          <stop
            offset="80%"
            stopColor="#10c9ff"
          />

          <stop
            offset="100%"
            stopColor="#001354"
          />

        </linearGradient>


        {/* =====================================================
            GLASS EDGE
        ===================================================== */}

        <linearGradient
          id="hgGlassEdge"
          x1="0"
          y1="0"
          x2="1"
          y2="0"
        >

          <stop
            offset="0%"
            stopColor="#0058bc"
          />

          <stop
            offset="15%"
            stopColor="#dffcff"
          />

          <stop
            offset="31%"
            stopColor="#1adaff"
          />

          <stop
            offset="55%"
            stopColor="#007de7"
          />

          <stop
            offset="76%"
            stopColor="#44dfff"
          />

          <stop
            offset="86%"
            stopColor="#e8fdff"
          />

          <stop
            offset="100%"
            stopColor="#0063c7"
          />

        </linearGradient>


        {/* =====================================================
            SAND
        ===================================================== */}

        <linearGradient
          id="hgSand"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >

          <stop
            offset="0%"
            stopColor="#fff9ba"
          />

          <stop
            offset="18%"
            stopColor="#ffe96e"
          />

          <stop
            offset="43%"
            stopColor="#ffc72f"
          />

          <stop
            offset="68%"
            stopColor="#f5a008"
          />

          <stop
            offset="100%"
            stopColor="#b85900"
          />

        </linearGradient>


        {/* =====================================================
            GOLD LIGHT
        ===================================================== */}

        <radialGradient id="hgGoldCenter">

          <stop
            offset="0%"
            stopColor="#fff6b8"
            stopOpacity=".95"
          />

          <stop
            offset="35%"
            stopColor="#ffca31"
            stopOpacity=".55"
          />

          <stop
            offset="100%"
            stopColor="#ff8a00"
            stopOpacity="0"
          />

        </radialGradient>


        {/* =====================================================
            BLUE GLOW
        ===================================================== */}

        <filter
          id="hgBlueGlow"
          x="-100%"
          y="-100%"
          width="300%"
          height="300%"
        >

          <feGaussianBlur
            stdDeviation="4"
            result="blueBlur"
          />

          <feMerge>

            <feMergeNode
              in="blueBlur"
            />

            <feMergeNode
              in="SourceGraphic"
            />

          </feMerge>

        </filter>


        {/* =====================================================
            STRONG BLUE GLOW
        ===================================================== */}

        <filter
          id="hgStrongBlueGlow"
          x="-150%"
          y="-150%"
          width="400%"
          height="400%"
        >

          <feGaussianBlur
            stdDeviation="10"
          />

        </filter>


        {/* =====================================================
            GOLD GLOW
        ===================================================== */}

        <filter
          id="hgGoldGlow"
          x="-100%"
          y="-100%"
          width="300%"
          height="300%"
        >

          <feGaussianBlur
            stdDeviation="2.3"
            result="goldBlur"
          />

          <feMerge>

            <feMergeNode
              in="goldBlur"
            />

            <feMergeNode
              in="SourceGraphic"
            />

          </feMerge>

        </filter>


        {/* =====================================================
            UPPER GLASS CHAMBER
        ===================================================== */}

        <clipPath id="hgTopChamber">

          <path
            d="
              M63 47

              C64 87
              77 108
              103 129

              C111 136
              116 143
              120 149

              C124 143
              129 136
              137 129

              C163 108
              176 87
              177 47

              Z
            "
          />

        </clipPath>


        {/* =====================================================
            LOWER GLASS CHAMBER
        ===================================================== */}

        <clipPath id="hgBottomChamber">

          <path
            d="
              M120 149

              C116 156
              111 162
              103 169

              C77 190
              64 211
              63 239

              L177 239

              C176 211
              163 190
              137 169

              C129 162
              124 156
              120 149

              Z
            "
          />

        </clipPath>

      </defs>


      {/* =====================================================
          GLOW BELOW HOURGLASS
      ===================================================== */}

      <ellipse
        className="hg-base-glow"
        cx="120"
        cy="258"
        rx="58"
        ry="9"
        fill="#008cff"
        opacity=".45"
        filter="url(#hgStrongBlueGlow)"
      />


      {/* =====================================================
          DARK GLASS BACKGROUND
      ===================================================== */}

      <path
        d="
          M63 47

          C64 87
          77 108
          103 129

          C111 136
          116 143
          120 149

          C124 143
          129 136
          137 129

          C163 108
          176 87
          177 47

          Z
        "
        fill="#003865"
        opacity=".12"
      />


      <path
        d="
          M120 149

          C116 156
          111 162
          103 169

          C77 190
          64 211
          63 239

          L177 239

          C176 211
          163 190
          137 169

          C129 162
          124 156
          120 149

          Z
        "
        fill="#003865"
        opacity=".12"
      />


      {/* =====================================================
          TOP SAND
      ===================================================== */}

      <g clipPath="url(#hgTopChamber)">

        {topFill > 0 && (
          <>

            <rect
              x="57"
              y={topY}
              width="126"
              height={topFill + 5}
              fill="url(#hgSand)"
              filter="url(#hgGoldGlow)"
            />


            {/* سطح روی شن */}

            <ellipse
              cx="120"
              cy={topY}
              rx="50"
              ry="6"
              fill="#ffe970"
              opacity=".92"
            />


            {/* روشنایی روی شن */}

            <ellipse
              cx="105"
              cy={topY - 1}
              rx="28"
              ry="2"
              fill="#fff9b8"
              opacity=".45"
            />

          </>
        )}


        {/* ریزدانه‌های داخل شن بالا */}

        {remaining > 0 && topFill > 15 && (

          <g>

            <circle
              className="hg-top-grain"
              cx="91"
              cy="91"
              r=".85"
            />

            <circle
              className="hg-top-grain"
              cx="104"
              cy="102"
              r=".7"
            />

            <circle
              className="hg-top-grain"
              cx="116"
              cy="94"
              r=".9"
            />

            <circle
              className="hg-top-grain"
              cx="132"
              cy="102"
              r=".7"
            />

            <circle
              className="hg-top-grain"
              cx="145"
              cy="92"
              r=".8"
            />

          </g>

        )}

      </g>


      {/* =====================================================
          BOTTOM SAND
      ===================================================== */}

      <g clipPath="url(#hgBottomChamber)">

        {bottomFill > 1 && (

          <>

            {/* نور پشت توده شن */}

            <ellipse
              cx="120"
              cy="228"
              rx="52"
              ry="27"
              fill="url(#hgGoldCenter)"
              opacity=".25"
            />


            {/* توده اصلی شن */}

            <path
              d={`
                M ${bottomLeft} ${bottomBase}

                Q 83 ${bottomPeak + 12}
                  120 ${bottomPeak}

                Q 157 ${bottomPeak + 12}
                  ${bottomRight} ${bottomBase}

                Z
              `}
              fill="url(#hgSand)"
              filter="url(#hgGoldGlow)"
            />


            {/* سطح پایین شن */}

            <ellipse
              cx="120"
              cy={bottomBase}
              rx={bottomHalfWidth}
              ry="4"
              fill="#e58900"
              opacity=".55"
            />

          </>

        )}

      </g>


      {/* =====================================================
          CENTER GOLD LIGHT
      ===================================================== */}

      {remaining > 0 && (

        <circle
          cx="120"
          cy="151"
          r="24"
          fill="url(#hgGoldCenter)"
          opacity=".23"
        />

      )}


      {/* =====================================================
          FALLING SAND STREAM
      ===================================================== */}

      {remaining > 0 && topFill > 1 && (

        <>

          {/* glow */}

          <line
            className="hg-stream-glow"
            x1="120"
            y1="146"
            x2="120"
            y2={Math.max(205, bottomPeak)}
            stroke="#ffa600"
            strokeWidth="5"
            strokeLinecap="round"
            opacity=".28"
            filter="url(#hgGoldGlow)"
          />


          {/* main stream */}

          <line
            className="hg-stream"
            x1="120"
            y1="146"
            x2="120"
            y2={Math.max(205, bottomPeak)}
            stroke="#ffe470"
            strokeWidth="1.6"
            strokeLinecap="round"
          />


          {/* particles */}

          <g>

            <circle
              className="hg-particle hg-p1"
              cx="117"
              cy="151"
              r=".8"
            />

            <circle
              className="hg-particle hg-p2"
              cx="123"
              cy="153"
              r=".65"
            />

            <circle
              className="hg-particle hg-p3"
              cx="119"
              cy="158"
              r=".75"
            />

            <circle
              className="hg-particle hg-p4"
              cx="122"
              cy="162"
              r=".9"
            />

            <circle
              className="hg-particle hg-p5"
              cx="116"
              cy="166"
              r=".6"
            />

            <circle
              className="hg-particle hg-p6"
              cx="124"
              cy="171"
              r=".7"
            />

          </g>

        </>

      )}


      {/* =====================================================
          OUTER GLASS
      ===================================================== */}

      <path
        className="hg-glass-main"
        d="
          M63 47

          C64 87
          77 108
          103 129

          C111 136
          116 143
          120 149

          C124 143
          129 136
          137 129

          C163 108
          176 87
          177 47
        "
      />


      <path
        className="hg-glass-main"
        d="
          M120 149

          C116 156
          111 162
          103 169

          C77 190
          64 211
          63 239


          M120 149

          C124 156
          129 162
          137 169

          C163 190
          176 211
          177 239
        "
      />


      {/* =====================================================
          INNER GLASS DETAILS
      ===================================================== */}

      <path
        className="hg-glass-inside"
        d="
          M70 54
          C70 86
          82 105
          107 126
        "
      />


      <path
        className="hg-glass-inside"
        d="
          M170 54
          C170 86
          158 105
          133 126
        "
      />


      <path
        className="hg-glass-inside"
        d="
          M70 232
          C71 208
          83 190
          107 171
        "
      />


      <path
        className="hg-glass-inside"
        d="
          M170 232
          C169 208
          157 190
          133 171
        "
      />


      {/* =====================================================
          WHITE GLASS REFLECTION
      ===================================================== */}

      <path
        className="hg-glass-highlight hg-shine"
        d="
          M72 59
          C72 84
          78 99
          93 115
        "
      />


      <path
        className="hg-glass-highlight hg-shine"
        d="
          M72 228
          C72 208
          79 194
          94 181
        "
      />


      {/* =====================================================
          TOP BLUE CAP
      ===================================================== */}

      <g className="hg-top-cap">

        <ellipse
          cx="120"
          cy="41"
          rx="60"
          ry="7.5"
          fill="#001c6d"
        />


        <rect
          x="59"
          y="34"
          width="122"
          height="15"
          rx="6"
          fill="url(#hgMetal)"
          stroke="#17cfff"
          strokeWidth="1.5"
        />


        <path
          d="
            M66 38
            Q120 32
            174 38
          "
          fill="none"
          stroke="#73e9ff"
          strokeWidth="1.2"
          opacity=".82"
        />

      </g>


      {/* =====================================================
          BOTTOM BLUE CAP
      ===================================================== */}

      <g className="hg-bottom-cap">

        <rect
          x="59"
          y="235"
          width="122"
          height="15"
          rx="6"
          fill="url(#hgMetal)"
          stroke="#17cfff"
          strokeWidth="1.5"
        />


        <path
          d="
            M66 240
            Q120 245
            174 240
          "
          fill="none"
          stroke="#74eaff"
          strokeWidth="1.1"
          opacity=".7"
        />


        <ellipse
          cx="120"
          cy="250"
          rx="62"
          ry="8"
          fill="#002381"
          stroke="#099cff"
          strokeWidth="1.4"
        />


        <ellipse
          cx="120"
          cy="248"
          rx="54"
          ry="4.5"
          fill="#0788ff"
          opacity=".45"
        />

      </g>

    </svg>
  );
}



/* =========================================================
   TIMER PAGE
========================================================= */

export default function TimerPage() {

  const tonWallet = useTonWallet();

  const walletAddress =
    tonWallet?.account?.address || null;


  const [remaining, setRemaining] =
    useState(null);

  const [cooldownSeconds, setCooldownSeconds] =
    useState(60 * 60);

  const [balance, setBalance] =
    useState("0");

  const [referralBonus, setReferralBonus] =
    useState("0");

  const [rewardCount, setRewardCount] =
    useState(0);

  const [message, setMessage] =
    useState("");

  const [menuOpen, setMenuOpen] =
    useState(false);


  const intervalRef =
    useRef(null);

  const menuRef =
    useRef(null);



  /* =========================================================
     MENU
  ========================================================= */

  useEffect(() => {

    const closeMenu = (event) => {

      if (
        menuRef.current &&
        !menuRef.current.contains(event.target)
      ) {

        setMenuOpen(false);

      }

    };


    document.addEventListener(
      "pointerdown",
      closeMenu
    );


    return () =>
      document.removeEventListener(
        "pointerdown",
        closeMenu
      );

  }, []);



  /* =========================================================
     TIMER CONTROL
  ========================================================= */

  const stopTimer = () => {

    if (intervalRef.current) {

      clearInterval(
        intervalRef.current
      );

      intervalRef.current = null;

    }

  };


  const startTimer = () => {

    if (intervalRef.current)
      return;


    intervalRef.current =
      setInterval(() => {

        setRemaining((sec) => {

          if (
            sec === null ||
            sec === undefined
          ) {

            return sec;

          }


          if (sec > 0) {

            return sec - 1;

          }


          return 0;

        });

      }, 1000);

  };



  /* =========================================================
     FETCH STATUS
  ========================================================= */

  const fetchStatus =
    useCallback(async () => {

      if (!walletAddress) {

        console.log(
          "[Timer] No wallet address"
        );

        return;

      }


      const url =
        `${API}/reward_status/`;


      console.log(
        "[Timer] fetchStatus =>",
        url,
        "wallet_address=",
        walletAddress
      );


      try {

        const res =
          await axios.get(
            url,
            {
              params: {

                wallet_address:
                  walletAddress,

              },
            }
          );


        console.log(
          "[Timer] reward_status HTTP:",
          res.status
        );


        console.log(
          "[Timer] reward_status data:",
          res.data
        );


        const data = res.data;


        if (
          data &&
          data.status === "ok"
        ) {

          const sec = Math.min(
            data.seconds_remaining ?? 0,
            data.cooldown_seconds ?? 60 * 60
          );

          setCooldownSeconds(
            data.cooldown_seconds ?? 60 * 60
          );

          setRemaining(sec);



          setReferralBonus(
            data.referral_points ?? "0"
          );

          setRewardCount(
            data.rewards_count ?? 0
          );


          if (sec > 0) {

            setMessage(
              "⏳ Timer is running..."
            );

            startTimer();

          } else {

            setMessage(
              "✅ Ready to claim hourly reward!"
            );

            stopTimer();

          }


        } else if (data) {

          console.warn(
            "[Timer] Unexpected response format, using data:",
            data
          );


          const serverCooldown =
            data.cooldown_seconds ?? 60 * 60;

          const sec = Math.min(
            data.seconds_remaining ??
            data.seconds ??
            0,
            serverCooldown
          );

          setCooldownSeconds(serverCooldown);

          setRemaining(sec);



          setReferralBonus(
            data.referral_points ??
            data.referralBonus ??
            data.referral_bonus ??
            "0"
          );


          setRewardCount(
            data.rewards_count ??
            data.rewardCount ??
            0
          );


          if (sec > 0) {

            setMessage(
              "⏳ Timer is running..."
            );

            startTimer();

          } else {

            setMessage(
              "✅ Ready to claim hourly reward!"
            );

            stopTimer();

          }


        } else {

          setMessage(
            "❌ Invalid server response."
          );

        }

      } catch (e) {

        console.error(
          "[Timer] fetchStatus ERROR:",
          e
        );


        console.error(
          "[Timer] fetchStatus status:",
          e.response?.status
        );


        console.error(
          "[Timer] fetchStatus data:",
          e.response?.data
        );


        setMessage(
          "❌ Cannot load timer status from server."
        );

      }

    }, [walletAddress]);



  /* =========================================================
     SAND PROGRESS
  ========================================================= */

  const canClaim =
    remaining === 0 ||
    remaining === null;


  const rewardCycleSeconds =
    cooldownSeconds || 60 * 60;


  const remainingRatio =
    remaining === null

      ? 1

      : Math.min(
          1,
          Math.max(
            0,
            remaining / rewardCycleSeconds
          )
        );


  const elapsedRatio =
    1 - remainingRatio;


  /*
   * بالا:
   * 90 -> 0
   *
   * پایین:
   * 0 -> 90
   */
  const topSandHeight =
    90 * remainingRatio;


  const bottomSandHeight =
    90 * elapsedRatio;



  /* =========================================================
     CLAIM
  ========================================================= */

  const claimReward =
    async () => {

      if (!walletAddress) {

        setMessage(
          "⚠️ Please connect your wallet first."
        );

        return;

      }


      if (!canClaim) {

        setMessage(
          "⚠️ Please wait for the timer to finish."
        );

        return;

      }


      const url =
        `${API}/tick/`;


      console.log(
        "[Timer] claimReward =>",
        url,
        "wallet_address=",
        walletAddress
      );


      try {

        setMessage(
          "⏳ Claiming reward..."
        );


        const res =
          await axios.post(
            url,
            {
              wallet_address:
                walletAddress,
            }
          );


        console.log(
          "[Timer] tick HTTP:",
          res.status
        );


        console.log(
          "[Timer] tick data:",
          res.data
        );


        const data =
          res.data;


        if (
          data?.status ===
          "rewarded"
        ) {



          setTotalRewards(
            data.total_rewards ??
            "0"
          );


          setRewardCount(
            data.rewards_count ??
            0
          );


          setMessage(
            `🎉 ${
              data.message ||
              "Reward claimed!"
            }`
          );


          await fetchStatus();


        } else if (
          data?.status ===
          "too_early"
        ) {

          const serverCooldown =
            data.cooldown_seconds ?? 60 * 60;

          const sec = Math.min(
            data.seconds_remaining || 0,
            serverCooldown
          );

          setCooldownSeconds(serverCooldown);
          setRemaining(sec);


          setMessage(
            `⏳ Please wait ${
              Math.floor(sec / 60)
            } minutes ${
              sec % 60
            } seconds`
          );


          startTimer();


        } else {

          console.warn(
            "[Timer] tick unexpected response:",
            data
          );


          setMessage(
            "⚠️ " +
            (
              data?.message ||
              data?.error ||
              "Could not claim."
            )
          );


          setTimeout(
            fetchStatus,
            5000
          );

        }


      } catch (e) {

        console.error(
          "[Timer] claimReward ERROR:",
          e
        );


        console.error(
          "[Timer] claimReward status:",
          e.response?.status
        );


        console.error(
          "[Timer] claimReward data:",
          e.response?.data
        );


        const errorMsg =
          e.response?.data?.message ||
          e.response?.data?.error ||
          "Error claiming reward.";


        setMessage(
          `❌ ${errorMsg}`
        );


        if (
          e.response?.status === 405
        ) {

          setMessage(
            "❌ Server method not allowed. Please try again later."
          );

        }


        setTimeout(
          fetchStatus,
          5000
        );

      }

    };



  /* =========================================================
     WALLET STATUS
  ========================================================= */

  useEffect(() => {

    stopTimer();


    if (!walletAddress) {

      setRemaining(null);

      setMessage("");


      console.log(
        "[Timer] wallet not connected"
      );


      return;

    }


    console.log(
      "[Timer] wallet connected:",
      walletAddress
    );


    fetchStatus();


    return () =>
      stopTimer();

  }, [
    walletAddress,
    fetchStatus,
  ]);



  /* =========================================================
     TIME FORMAT
  ========================================================= */

  const formatTime = (
    seconds
  ) => {

    if (
      seconds === null ||
      seconds === undefined
    ) {

      return "--:--:--";

    }


    const h =
      Math.floor(
        seconds / 3600
      );


    const m =
      Math.floor(
        (seconds % 3600) /
        60
      );


    const s =
      Math.floor(
        seconds % 60
      );


    return `${
      String(h).padStart(
        2,
        "0"
      )
    } : ${
      String(m).padStart(
        2,
        "0"
      )
    } : ${
      String(s).padStart(
        2,
        "0"
      )
    }`;

  };



  /* =========================================================
     PROGRESS
  ========================================================= */

  const progress =
    Math.round(
      elapsedRatio * 100
    );


  const hours =
    remaining == null

      ? "--"

      : String(
          Math.floor(
            remaining / 3600
          )
        ).padStart(
          2,
          "0"
        );


  const minutes =
    remaining == null

      ? "--"

      : String(
          Math.floor(
            (remaining % 3600) /
            60
          )
        ).padStart(
          2,
          "0"
        );


  const seconds =
    remaining == null

      ? "--"

      : String(
          Math.floor(
            remaining % 60
          )
        ).padStart(
          2,
          "0"
        );



  /* =========================================================
     UI
  ========================================================= */

  return (

    <div className="boost-page">

      <main className="mining-shell">


        {/* =====================================================
            HEADER
        ===================================================== */}

        <header className="topbar">


          <div
            className="hamburger-menu"
            ref={menuRef}
          >

            <button
              type="button"
              className={`hamburger-btn ${
                menuOpen
                  ? "is-open"
                  : ""
              }`}
              onClick={() =>
                setMenuOpen(
                  (open) => !open
                )
              }
              aria-label="Open menu"
              aria-expanded={menuOpen}
            >

              <span />
              <span />
              <span />

            </button>



            {menuOpen && (

              <>

                <button
                  type="button"
                  className="menu-backdrop"
                  aria-label="Close menu overlay"
                  onClick={() =>
                    setMenuOpen(false)
                  }
                />


                <aside
                  className="side-drawer"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Navigation menu"
                >


                  <div className="drawer-header">


                    <div className="drawer-brand">

                      <strong>
                        AI POLIFY
                      </strong>

                      <span>
                        quick menu
                      </span>

                    </div>


                    <button
                      type="button"
                      className="drawer-icon-btn"
                      aria-label="Close menu"
                      onClick={() =>
                        setMenuOpen(false)
                      }
                    >

                      <span className="drawer-icon">
                        ×
                      </span>

                    </button>


                  </div>



                  <div className="drawer-buttons">


                    <button
                      type="button"
                      className="
                        drawer-main-btn
                        drawer-main-btn-disabled
                      "
                      disabled
                    >

                      <span className="drawer-btn-text">
                        🛍️ Shopping
                      </span>

                      <span className="drawer-coming-soon">
                        Coming Soon
                      </span>

                    </button>



                    <a
                      className="
                        drawer-main-btn
                        drawer-support-btn
                      "
                      href="https://t.me/Ai_polyfi_support"
                      target="_blank"
                      rel="noreferrer"
                      onClick={() =>
                        setMenuOpen(false)
                      }
                    >

                      <span className="drawer-btn-text">
                        🎧 Support
                      </span>

                      <span className="drawer-telegram">
                        @Ai_polyfi_support
                      </span>

                    </a>


                  </div>


                </aside>

              </>

            )}

          </div>



          <h1>
            AI POLIFY
          </h1>


          <img
            src={Logo}
            alt="AI POLIFY Logo"
            className="brand-logo"
          />


        </header>



        {/* =====================================================
            MINER
        ===================================================== */}

        <section
          className="miner-card"
          aria-label="FLOWER Miner"
        >

          <div className="miner-top-edge" />


          <svg
            viewBox="0 0 400 400"
            xmlns="http://www.w3.org/2000/svg"
            className="miner-svg"
          >

            <defs>


              <filter
                id="centerBloom"
                x="-80%"
                y="-80%"
                width="260%"
                height="260%"
              >

                <feGaussianBlur
                  stdDeviation="24"
                />

              </filter>


              <mask id="mask-blades">

                <rect
                  width="100%"
                  height="100%"
                  fill="white"
                />

                <circle
                  cx="200"
                  cy="210"
                  r="47"
                  fill="black"
                />

              </mask>


            </defs>


            <g filter="url(#centerBloom)">

              <circle
                cx="200"
                cy="210"
                r="115"
                fill="#039bea"
                opacity="0.14"
              />


              <circle
                cx="200"
                cy="210"
                r="72"
                fill="#00d9ff"
                opacity="0.18"
              />

            </g>



            <image
              className="fan-blades"
              href={Blade}
              x="72"
              y="82"
              width="256"
              height="256"
              mask="url(#mask-blades)"
            />



            <circle
              cx="200"
              cy="210"
              r="62"
              fill="#06142d"
              stroke="#0ab9ff"
              strokeWidth="3"
            />


            <circle
              cx="200"
              cy="210"
              r="55"
              fill="none"
              stroke="rgba(72,207,255,.18)"
              strokeWidth="2"
            />


            <text
              x="200"
              y="198"
              textAnchor="middle"
              fill="white"
              fontSize="18"
              fontWeight="800"
            >
              MINER
            </text>


            <path
              d="
                M177 211
                H189

                M189 211

                Q192 202
                195 211

                T201 211

                Q204 202
                207 211

                T213 211

                H224
              "
              stroke="#ffffff"
              strokeWidth="2.6"
              fill="none"
            />


            <text
              x="200"
              y="232"
              textAnchor="middle"
              fill="white"
              fontSize="22"
              fontWeight="700"
            >
              FLOWER
            </text>


          </svg>



          <span className="corner-dot dot-a" />
          <span className="corner-dot dot-b" />
          <span className="corner-dot dot-c" />
          <span className="corner-dot dot-d" />


          <span className="miner-foot foot-left" />
          <span className="miner-foot foot-right" />


        </section>



        {/* =====================================================
            TIMER
        ===================================================== */}

        <section className="countdown-zone">


          <CountdownHourglass
            remaining={remaining}
            topSandHeight={topSandHeight}
            bottomSandHeight={bottomSandHeight}
          />


          <p className="mining-caption">

            {remaining === 0
              ? "Mining completed!"
              : "Mining in progress..."
            }

          </p>



          <div
            className="digital-countdown"
            aria-label={
              formatTime(remaining)
            }
          >


            <div className="time-part">

              <strong>
                {hours}
              </strong>

              <span>
                HOURS
              </span>

            </div>


            <b className="colon">
              :
            </b>


            <div className="time-part">

              <strong>
                {minutes}
              </strong>

              <span>
                MINUTES
              </span>

            </div>


            <b className="colon">
              :
            </b>


            <div className="time-part">

              <strong>
                {seconds}
              </strong>

              <span>
                SECONDS
              </span>

            </div>


          </div>


        </section>



        {/* =====================================================
            REWARD
        ===================================================== */}

        <section className="reward-card glass-card">


          <div className="reward-heading">

            <span>
              Estimated Hourly Reward
            </span>

            <strong>
              10.0000 FLOWER
            </strong>

          </div>



          <div
            className="progress-track"
            aria-label={
              `Mining progress ${progress}%`
            }
          >

            <div
              className="progress-fill"
              style={{
                width:
                  `${progress}%`,
              }}
            >

              <span>
                {progress}%
              </span>

            </div>

          </div>



          <div className="reward-stats">


            <div className="stat-item">

              <span className="stat-icon">
                ▣
              </span>

              <span>

                Hourly Claims:{" "}

                <strong>
                  {rewardCount}
                </strong>

              </span>

            </div>



            <div className="stat-divider" />



            <div className="stat-item">

              <span className="stat-icon">
                ♟
              </span>

              <span>

                Referral Bonus:{" "}

                <strong>

                  {Number(
                    referralBonus
                  ).toFixed(4)} FLOWER

                </strong>

              </span>

            </div>


          </div>


        </section>



        {/* =====================================================
            STATUS
        ===================================================== */}

        <section className="status-card glass-card">


          <div className="coin-icon">

            <span />
            <span />
            <span />

          </div>


          <div>

            <h2>

              {remaining === 0
                ? "Your reward is ready!"
                : "Mining will complete soon!"
              }

            </h2>


            <p>

              {remaining === 0
                ? "Claim your hourly reward now."
                : "Stay online to claim your reward."
              }

            </p>

          </div>


        </section>



        {/* =====================================================
            CLAIM BUTTON
        ===================================================== */}

        {walletAddress && (

          <button
            className={`claim-btn ${!canClaim ? "claim-loading" : ""}`}
            onClick={canClaim ? claimReward : undefined}
            disabled={!canClaim}
          >
            {canClaim ? "Claim 10 FLOWER" : "Mining..."}
          </button>

        )}



        {/* =====================================================
            MESSAGE
        ===================================================== */}

        {message && (

          <p className="server-message">
            {message}
          </p>

        )}



      </main>



      {/* =====================================================
          BOTTOM NAV
      ===================================================== */}

      <nav
        className="bottom-nav"
        aria-label="Main navigation"
      >


        <button className="nav-item active">

          <span className="nav-icon">
            ⚒
          </span>

          <span>
            Mine
          </span>

        </button>



        <button className="nav-item">

          <span className="nav-icon">
            ◉
          </span>

          <span>
            Stake
          </span>

        </button>



        <button className="nav-item">

          <span className="nav-icon">
            🤝
          </span>

          <span>
            Friends
          </span>

        </button>



        <button className="nav-item">

          <span className="nav-icon">
            ♙
          </span>

          <span>
            About Us
          </span>

        </button>



        <button className="nav-item">

          <span className="nav-icon">
            ▢
          </span>

          <span>
            Wallets
          </span>

        </button>


      </nav>


    </div>

  );

}