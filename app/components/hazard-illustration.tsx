import type { HazardCategory } from "../lib/hazard-categories";

export function HazardIllustration({ type }: { type: HazardCategory | string }) {
  if (type === "인도" || type === "단차") {
    return (
      <svg className="hazard-illustration-svg" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" role="img" aria-label="휠체어의 앞바퀴가 높은 보도 경계석에 막힌 모습을 보여주는 일러스트">
        <defs>
          <linearGradient id="curb-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#eef7e8" />
            <stop offset="1" stopColor="#dcebd8" />
          </linearGradient>
          <linearGradient id="curb-road" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#b9a68b" />
            <stop offset="1" stopColor="#aa9476" />
          </linearGradient>
          <linearGradient id="curb-top" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fffdf5" />
            <stop offset="1" stopColor="#efe7d5" />
          </linearGradient>
          <linearGradient id="curb-face" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f19a7b" />
            <stop offset="1" stopColor="#cf7459" />
          </linearGradient>
          <filter id="wheelchair-shadow" x="-30%" y="-30%" width="180%" height="190%">
            <feDropShadow dx="0" dy="10" stdDeviation="8" floodColor="#153c38" floodOpacity=".2" />
          </filter>
        </defs>

        <rect width="640" height="360" fill="url(#curb-sky)" />
        <circle cx="56" cy="47" r="84" fill="#d3eac5" />
        <circle cx="594" cy="31" r="94" fill="#c7e7b5" opacity=".75" />
        <path d="M0 112h640v44H0Z" fill="#b8cbc0" />
        <path d="M0 128h640v28H0Z" fill="#f9fbf4" />

        <path d="M0 156h640v204H0Z" fill="url(#curb-road)" />
        <path d="M0 218h420v142H0Z" fill="#c3b197" />
        <path d="M420 174h220v58H420Z" fill="url(#curb-top)" />
        <path d="M420 232h220v128H420Z" fill="url(#curb-face)" />
        <path d="M420 232h220" fill="none" stroke="#ff6554" strokeWidth="8" />
        <path d="M0 218h420" fill="none" stroke="#ddd0ba" strokeWidth="4" />
        <path d="M44 260h98m-75 42h82" fill="none" stroke="#e8ddca" strokeWidth="5" strokeLinecap="round" />
        <path d="M463 202h145" fill="none" stroke="#d7ddcf" strokeWidth="4" strokeDasharray="12 10" />

        <ellipse cx="265" cy="322" rx="166" ry="22" fill="#665b4d" opacity=".16" />
        <path d="M72 287h73" fill="none" stroke="#5aa66d" strokeWidth="9" strokeLinecap="round" />
        <path d="m132 274 17 13-17 13" fill="none" stroke="#5aa66d" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />

        <g filter="url(#wheelchair-shadow)">
          <circle cx="241" cy="263" r="62" fill="#fffdf7" stroke="#153c38" strokeWidth="10" />
          <circle cx="241" cy="263" r="38" fill="#dff5cb" stroke="#153c38" strokeWidth="7" />
          <circle cx="241" cy="263" r="10" fill="#aef05d" />
          <path d="M241 225v76M203 263h76m-65-42 54 84m-65-2 76-78" stroke="#8bb797" strokeWidth="4" opacity=".72" />

          <circle cx="385" cy="288" r="24" fill="#fffdf7" stroke="#153c38" strokeWidth="8" />
          <circle cx="385" cy="288" r="8" fill="#aef05d" />

          <path d="M177 128v87h112" fill="none" stroke="#153c38" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M169 128h-24" stroke="#153c38" strokeWidth="11" strokeLinecap="round" />
          <path d="M202 211h87l54 70h37" fill="none" stroke="#153c38" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M283 213 241 263m44-50 100 75" fill="none" stroke="#153c38" strokeWidth="8" strokeLinecap="round" />
          <path d="M335 278h58" stroke="#153c38" strokeWidth="8" strokeLinecap="round" />

          <circle cx="210" cy="97" r="29" fill="#f0bd9a" stroke="#fffdf7" strokeWidth="6" />
          <path d="M186 91c5-24 40-31 56-9-13-5-25-3-32 5-8 8-8 21-3 31-17-3-25-13-21-27Z" fill="#153c38" />
          <path d="M193 132c18-9 44-5 57 11l27 65h-83l-18-50c-4-12 3-22 17-26Z" fill="#ff806d" stroke="#fffdf7" strokeWidth="5" strokeLinejoin="round" />
          <path d="M242 153 286 181" fill="none" stroke="#153c38" strokeWidth="11" strokeLinecap="round" />
          <circle cx="290" cy="184" r="7" fill="#f0bd9a" />
          <path d="m246 207 48 39 54 12" fill="none" stroke="#153c38" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M342 257h28" stroke="#153c38" strokeWidth="12" strokeLinecap="round" />
        </g>

        <circle cx="409" cy="275" r="31" fill="#ff6554" opacity=".13" />
        <path d="m397 254 9 12 13-8-4 15 14 5-15 5 3 15-12-9-10 12-1-16-16-1 14-8-7-14 15 5Z" fill="#ff6554" />
        <path d="M455 187v96" fill="none" stroke="#ff6554" strokeWidth="5" strokeLinecap="round" />
        <path d="m444 199 11-12 11 12m-22 72 11 12 11-12" fill="none" stroke="#ff6554" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />

        <g transform="translate(474 194)">
          <rect width="140" height="48" rx="24" fill="#fffdf7" stroke="#f2d8cb" strokeWidth="2" />
          <circle cx="23" cy="24" r="7" fill="#ff6554" />
          <text x="88" y="30" textAnchor="middle" fill="#88483f" fontSize="17" fontWeight="850">12cm 높은 턱</text>
        </g>
        <g transform="translate(34 172)">
          <rect width="154" height="39" rx="19.5" fill="#153c38" />
          <text x="77" y="25" textAnchor="middle" fill="#d7ff9c" fontSize="15" fontWeight="850">휠체어 통행 위험</text>
        </g>
      </svg>
    );
  }

  if (type === "횡단보도" || type === "포트홀") {
    return (
      <svg className="hazard-illustration-svg" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" role="img" aria-label="보행 신호 시간이 짧아 어르신이 건너기 어려운 횡단보도 일러스트">
        <rect width="640" height="360" fill="#dfe9df" />
        <circle cx="86" cy="48" r="72" fill="#c9e5b8" />
        <circle cx="155" cy="34" r="45" fill="#b7d9a7" />
        <path d="M0 92 640 38v322H0Z" fill="#64756f" />
        <path d="M0 92 640 38" fill="none" stroke="#f7f3e8" strokeWidth="18" />
        <path d="M0 108 640 54" fill="none" stroke="#b9c8be" strokeWidth="6" />
        <path d="m56 150 93-8 39 38-94 9Zm89 73 94-9 41 40-96 10Zm92 76 97-10 42 41-99 11Z" fill="#fbfaf3" />
        <path d="m191 138 94-8 39 38-95 9Zm90 72 96-9 40 40-96 10Zm92 75 98-10 43 42-100 11Z" fill="#fbfaf3" />
        <path d="M484 360 247 120" fill="none" stroke="#f2c85c" strokeWidth="6" strokeDasharray="28 22" opacity=".72" />

        <path d="M526 266V89" fill="none" stroke="#183c37" strokeWidth="11" strokeLinecap="round" />
        <path d="M526 101h-48" fill="none" stroke="#183c37" strokeWidth="10" strokeLinecap="round" />
        <rect x="431" y="53" width="65" height="98" rx="14" fill="#153c38" />
        <circle cx="463.5" cy="84" r="17" fill="#aef05d" />
        <circle cx="464" cy="78" r="5" fill="#153c38" />
        <path d="m464 86-10 15m10-15 11 8m-11-8 1 17m0 0-10 13m10-13 11 12" fill="none" stroke="#153c38" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="443" y="120" width="41" height="23" rx="7" fill="#fff4cf" />
        <text x="463.5" y="137" textAnchor="middle" fill="#c54c3e" fontSize="17" fontWeight="900">7</text>

        <circle cx="263" cy="191" r="18" fill="#f3c7a8" />
        <path d="M250 215c9-10 25-11 35-2l17 53-42 4-15-39Z" fill="#e68269" />
        <path d="m258 267-13 48m41-49 18 43m-49-71-32 27" fill="none" stroke="#173d38" strokeWidth="11" strokeLinecap="round" />
        <path d="m304 222 29 27" fill="none" stroke="#173d38" strokeWidth="10" strokeLinecap="round" />
        <path d="M333 249v58" fill="none" stroke="#fffaf0" strokeWidth="7" strokeLinecap="round" />
        <path d="M333 307h15" fill="none" stroke="#fffaf0" strokeWidth="7" strokeLinecap="round" />

        <rect x="347" y="169" width="151" height="39" rx="19.5" fill="#fffaf0" />
        <circle cx="367" cy="188.5" r="6" fill="#ff6655" />
        <text x="424" y="194" textAnchor="middle" fill="#8f4a41" fontSize="16" fontWeight="850">신호가 짧아요</text>
      </svg>
    );
  }

  if (type === "조도") {
    return (
      <svg className="hazard-illustration-svg" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" role="img" aria-label="가로등 사이 보행로가 어두운 야간 조도 부족 일러스트">
        <rect width="640" height="360" fill="#17373f" />
        <circle cx="520" cy="57" r="25" fill="#f5d987" />
        <circle cx="529" cy="49" r="25" fill="#17373f" />
        <path d="M0 111 122 76v211L0 320Zm640-31-108 26v202l108 27Z" fill="#244951" />
        <path d="M20 142h72v56H20Zm548-11h47v38h-47Z" fill="#f4d378" opacity=".24" />
        <path d="M52 360 211 123h217L590 360Z" fill="#3b5754" />
        <path d="M117 360 252 145h135l137 215Z" fill="#526b63" />
        <path d="M247 360 300 145" stroke="#adc0b5" strokeWidth="4" opacity=".55" />
        <path d="M392 360 346 145" stroke="#adc0b5" strokeWidth="4" opacity=".55" />
        <path d="M89 360 205 128h115L430 360Z" fill="#f4d66c" opacity=".2" />
        <path d="M210 300V91c0-19 16-35 35-35h49" fill="none" stroke="#0e292a" strokeWidth="11" strokeLinecap="round" />
        <path d="M275 56h54" stroke="#0e292a" strokeWidth="14" strokeLinecap="round" />
        <ellipse cx="305" cy="70" rx="58" ry="34" fill="#f4d66c" opacity=".2" />
        <rect x="288" y="55" width="43" height="13" rx="7" fill="#f5d873" />
        <path d="M486 276V135c0-14 11-25 25-25h29" fill="none" stroke="#132f31" strokeWidth="8" strokeLinecap="round" opacity=".76" />
        <rect x="528" y="108" width="29" height="9" rx="5" fill="#807d62" />
        <ellipse cx="419" cy="264" rx="79" ry="55" fill="#102b30" opacity=".62" />
        <circle cx="420" cy="205" r="18" fill="#0e292d" />
        <path d="M420 224v59m0-31-27 34m27-34 29 34" stroke="#0e292d" strokeWidth="11" strokeLinecap="round" />
        <path d="M389 226h62" stroke="#ff6756" strokeWidth="4" strokeDasharray="9 9" opacity=".9" />
        <rect x="364" y="112" width="132" height="36" rx="18" fill="#eef3e8" />
        <text x="430" y="135" textAnchor="middle" fill="#35534c" fontSize="15" fontWeight="800">빛이 닿지 않는 구간</text>
      </svg>
    );
  }

  if (type === "날씨 관련 위험") {
    return (
      <svg className="hazard-illustration-svg" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" role="img" aria-label="비와 결빙으로 보행로가 미끄러운 날씨 관련 위험 일러스트">
        <rect width="640" height="360" fill="#d9e5e7" />
        <path d="M0 112 640 58v302H0Z" fill="#aabbb5" />
        <path d="M0 164 640 105v255H0Z" fill="#eef0e8" />
        <path d="M0 287 640 230" stroke="#c2d0c8" strokeWidth="5" />
        <path d="M93 28 69 82m121-63-24 54m127-37-26 59m138-76-22 52m124-40-24 54" stroke="#69a6ba" strokeWidth="8" strokeLinecap="round" opacity=".78" />
        <path d="M116 252c55-30 160-40 246-15 62-19 144-9 179 23-61 51-162 72-261 63-82 6-158-15-201-48 8-9 20-17 37-23Z" fill="#75aebc" opacity=".72" />
        <path d="M136 261c77-23 167-23 248-2m-203 35c94-18 190-12 266 14" fill="none" stroke="#d9f1f3" strokeWidth="9" strokeLinecap="round" opacity=".82" />
        <path d="m330 126 14 27 30 4-22 21 6 30-28-14-27 14 5-30-22-21 31-4Z" fill="#fff" stroke="#5c91a4" strokeWidth="4" />
        <path d="M330 116v98m-43-74 86 50m-86 0 86-50" stroke="#5c91a4" strokeWidth="5" strokeLinecap="round" />
        <rect x="405" y="201" width="135" height="38" rx="19" fill="#fff" />
        <text x="472" y="225" textAnchor="middle" fill="#356171" fontSize="15" fontWeight="800">빗물·결빙 주의</text>
      </svg>
    );
  }

  return (
    <svg className="hazard-illustration-svg" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" role="img" aria-label="상자와 입간판이 보행로를 막고 있는 기타 위험요소 일러스트">
      <rect width="640" height="360" fill="#dce7dd" />
      <circle cx="82" cy="61" r="74" fill="#d0e7bf" />
      <path d="M0 130 640 80v280H0Z" fill="#b6c6ba" />
      <path d="M0 174 640 126v234H0Z" fill="#f2f2e8" />
      <path d="M0 292 640 246" stroke="#cbd6cc" strokeWidth="5" />
      <path d="M472 0h168v246l-168 13Z" fill="#23483f" />
      <rect x="499" y="41" width="118" height="115" rx="5" fill="#8eaaa0" />
      <path d="M480 175h160" stroke="#d78a69" strokeWidth="20" />
      <path d="M356 185 463 173l4 105-109 10Z" fill="#d59a5f" />
      <path d="m356 185 45-31 106-8-44 27Z" fill="#efc588" />
      <path d="m463 173 44-27 3 101-43 31Z" fill="#b8784f" />
      <path d="M472 207h100l-9 109h-99Z" fill="#f2d58d" stroke="#294a42" strokeWidth="8" strokeLinejoin="round" />
      <path d="m486 316-18 35m76-37 20 34" stroke="#294a42" strokeWidth="9" strokeLinecap="round" />
      <rect x="487" y="229" width="69" height="46" rx="7" fill="#fff8e8" />
      <text x="522" y="257" textAnchor="middle" fill="#3b554d" fontSize="15" fontWeight="900">입간판</text>
      <circle cx="119" cy="268" r="31" fill="#153c38" stroke="#fff" strokeWidth="7" />
      <circle cx="119" cy="268" r="12" fill="#a8dc70" />
      <circle cx="176" cy="269" r="21" fill="#153c38" stroke="#fff" strokeWidth="6" />
      <path d="M118 235h45l26 17m-45-18 19-49m0 0h29" fill="none" stroke="#153c38" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M52 319c92 11 176 8 252-9 32-7 52-20 69-40" fill="none" stroke="#58a66a" strokeWidth="11" strokeLinecap="round" />
      <path d="m359 269 24-10-6 25" fill="#58a66a" />
      <path d="M327 226v91" stroke="#ff6655" strokeWidth="4" />
      <path d="m318 235 9-10 9 10m-18 73 9 10 9-10" fill="none" stroke="#ff6655" strokeWidth="4" strokeLinecap="round" />
      <rect x="232" y="190" width="119" height="34" rx="17" fill="#fff" />
      <text x="292" y="212" textAnchor="middle" fill="#9b5145" fontSize="15" fontWeight="800">통행 폭 부족</text>
    </svg>
  );
}
