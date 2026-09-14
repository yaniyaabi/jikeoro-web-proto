type HazardType = "단차" | "포트홀" | "조도" | "적치물";

export function HazardIllustration({ type }: { type: HazardType }) {
  if (type === "단차") {
    return (
      <svg className="hazard-illustration-svg" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" role="img" aria-label="한쪽 보도판이 들려 높이 차가 생긴 단차 일러스트">
        <rect width="640" height="360" fill="#dfe8df" />
        <circle cx="560" cy="62" r="92" fill="#d5ebc5" />
        <path d="M0 260 420 55 640 139 640 360 0 360Z" fill="#bfcec4" />
        <path d="M0 283 425 90 640 166 640 360 0 360Z" fill="#f5efe2" />
        <path d="m70 280 197-88 114 40-198 95Z" fill="#e5d9c5" stroke="#fdfbf6" strokeWidth="5" />
        <path d="m267 192 182-82 112 37-180 85Z" fill="#eee3d1" stroke="#fdfbf6" strokeWidth="5" />
        <path d="m381 232 180-85v25l-180 86Z" fill="#c78c6f" />
        <path d="m381 232 180-85" fill="none" stroke="#ff6655" strokeWidth="7" strokeLinecap="round" />
        <path d="m181 327 200-95v26l-196 97Z" fill="#b89f7d" />
        <circle cx="329" cy="258" r="31" fill="#153c38" stroke="#fff" strokeWidth="8" />
        <circle cx="329" cy="258" r="12" fill="#9bcf67" />
        <path d="M306 228c-18-25-34-46-45-70" fill="none" stroke="#153c38" strokeWidth="9" strokeLinecap="round" />
        <path d="M261 158h34" fill="none" stroke="#153c38" strokeWidth="9" strokeLinecap="round" />
        <path d="M405 196v-45c0-14 11-25 25-25h13" fill="none" stroke="#ff6655" strokeWidth="5" strokeLinecap="round" />
        <circle cx="444" cy="126" r="7" fill="#ff6655" />
        <rect x="421" y="180" width="89" height="34" rx="17" fill="#fffaf0" />
        <text x="465" y="202" textAnchor="middle" fill="#a15043" fontSize="15" fontWeight="800">들뜬 보도판</text>
      </svg>
    );
  }

  if (type === "포트홀") {
    return (
      <svg className="hazard-illustration-svg" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" role="img" aria-label="도로 표면이 파이고 물이 고인 포트홀 일러스트">
        <rect width="640" height="360" fill="#d9e3dc" />
        <path d="M0 82 640 8v352H0Z" fill="#66766f" />
        <path d="m-20 124 192-22 7 31-193 24Zm242-28 105-12 7 31-108 13Zm157-18 201-24 7 32-204 23Z" fill="#f7f3e5" opacity=".93" />
        <path d="M0 202 640 124" fill="none" stroke="#f0c258" strokeWidth="7" strokeDasharray="38 24" opacity=".8" />
        <path d="M224 224c21-35 66-45 104-38 29-16 83 2 92 31 35 9 42 44 12 63-17 28-66 30-98 16-38 17-94 5-103-26-28-8-29-32-7-46Z" fill="#263c38" />
        <path d="M250 231c31-25 70-25 97-16 27-8 55 3 66 22-23 24-56 39-91 42-35-1-67-13-88-31 4-6 9-12 16-17Z" fill="#315b61" />
        <path d="M273 232c34-13 71-11 103 3" fill="none" stroke="#a7d6d8" strokeWidth="8" strokeLinecap="round" opacity=".8" />
        <path d="m204 205-32-18m284 19 34-26m-51 118 29 20" stroke="#42544d" strokeWidth="6" strokeLinecap="round" />
        <rect x="411" y="248" width="89" height="34" rx="17" fill="#fff4cf" />
        <text x="455" y="270" textAnchor="middle" fill="#865f0f" fontSize="15" fontWeight="800">물 고임</text>
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

  return (
    <svg className="hazard-illustration-svg" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" role="img" aria-label="상자와 입간판이 보행로를 막고 있는 적치물 일러스트">
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
