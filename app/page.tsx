"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { sitePath } from "./lib/site-path";

type Hazard = {
  id: number;
  type: "단차" | "포트홀" | "조도" | "적치물";
  title: string;
  place: string;
  time: string;
  detail: string;
  x: string;
  y: string;
  tone: string;
  latitude: number;
  longitude: number;
};

const hazards: Hazard[] = [
  {
    id: 1,
    type: "단차",
    title: "보도 경계석 단차",
    place: "성수이로 보행로",
    time: "오늘 09:42",
    detail: "보행보조기 바퀴가 걸릴 만큼 경계석 높이 차이가 커요.",
    x: "58%",
    y: "49%",
    tone: "coral",
    latitude: 37.5447,
    longitude: 127.0567,
  },
  {
    id: 2,
    type: "조도",
    title: "야간 조명 부족",
    place: "서울숲길 골목",
    time: "어제 20:18",
    detail: "가로등 사이 구간이 어두워 바닥 상태를 확인하기 어려워요.",
    x: "37%",
    y: "54%",
    tone: "navy",
    latitude: 37.5456,
    longitude: 127.0447,
  },
  {
    id: 3,
    type: "포트홀",
    title: "횡단보도 앞 포트홀",
    place: "뚝섬역 5번 출구 앞",
    time: "8월 12일 16:05",
    detail: "횡단보도 진입부 노면이 패여 비가 오면 물이 고입니다.",
    x: "73%",
    y: "34%",
    tone: "yellow",
    latitude: 37.5470,
    longitude: 127.0474,
  },
  {
    id: 4,
    type: "적치물",
    title: "보행로 적치물",
    place: "연무장길 상가 앞",
    time: "8월 11일 13:27",
    detail: "입간판이 보행 유효폭을 줄여 휠체어 통행이 어렵습니다.",
    x: "64%",
    y: "63%",
    tone: "mint",
    latitude: 37.5426,
    longitude: 127.0545,
  },
];

const filters = ["전체", "단차", "포트홀", "조도", "적치물"] as const;
type LocationChoice = "gps" | "manual" | null;
type GpsStatus = "idle" | "loading" | "success" | "error";
type GpsPoint = { latitude: number; longitude: number; accuracy: number };

function SeongsuIllustrationMap({ items, selectedId, onSelect }: { items: Hazard[]; selectedId?: number; onSelect?: (id: number) => void }) {
  return (
    <div className="illustration-layer" role={onSelect ? "group" : "img"} aria-label="서울숲과 성수동 골목을 단순화한 일러스트 지도">
      <span className="district-shape district-a" />
      <span className="district-shape district-b" />
      <span className="han-river"><b>한강</b><small>HAN RIVER</small></span>
      <span className="seoul-forest"><i /><i /><i /><b>서울숲</b><small>SEOUL FOREST</small></span>
      <span className="seongsu-road street-achasan"><small>아차산로</small></span>
      <span className="seongsu-road street-seongsui"><small>성수이로</small></span>
      <span className="seongsu-road street-yeonmujang"><small>연무장길</small></span>
      <span className="metro-line line-two"><b>2</b><i className="station station-ttukseom" /><em className="station-name name-ttukseom">뚝섬역</em><i className="station station-seongsu" /><em className="station-name name-seongsu">성수역</em></span>
      <span className="factory-cluster" aria-hidden="true"><i /><i /><i /><i /></span>
      <span className="cafe-zone">작은 공장과 카페가 이어지는 길</span>
      {items.map((item) =>
        onSelect ? (
          <button
            type="button"
            key={item.id}
            className={`map-pin pin-${item.tone}${selectedId === item.id ? " selected" : ""}`}
            style={{ left: item.x, top: item.y }}
            onClick={() => onSelect(item.id)}
            aria-label={`${item.place} ${item.title} 보기`}
          ><span>{item.id}</span></button>
        ) : (
          <span key={item.id} className={`map-pin pin-${item.tone}`} style={{ left: item.x, top: item.y }} aria-hidden="true"><span>{item.id}</span></span>
        ),
      )}
    </div>
  );
}

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [filter, setFilter] = useState<(typeof filters)[number]>("전체");
  const [selectedId, setSelectedId] = useState(1);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportStep, setReportStep] = useState(1);
  const [locationChoice, setLocationChoice] = useState<LocationChoice>(null);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("idle");
  const [gpsPoint, setGpsPoint] = useState<GpsPoint | null>(null);
  const [gpsMessage, setGpsMessage] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [placeDescription, setPlaceDescription] = useState("");
  const [locationValidation, setLocationValidation] = useState("");
  const [reportType, setReportType] = useState<(typeof filters)[number]>("단차");
  const [reportDescription, setReportDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const filteredHazards = useMemo(
    () =>
      filter === "전체"
        ? hazards
        : hazards.filter((hazard) => hazard.type === filter),
    [filter],
  );

  const selected =
    filteredHazards.find((hazard) => hazard.id === selectedId) ??
    filteredHazards[0] ??
    hazards[0];

  useEffect(() => {
    fetch("/api/auth/session")
      .then((response) => response.json())
      .then((data) => setIsLoggedIn(Boolean(data.authenticated && data.user?.role === "member")))
      .catch(() => setIsLoggedIn(false));
    if (new URLSearchParams(window.location.search).get("report") === "1") {
      setReportOpen(true);
      window.history.replaceState({}, "", sitePath("/"));
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setReportOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const enterMyJikeoro = async () => {
    const response = await fetch("/api/auth/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "member" }),
    });
    if (response.ok) window.location.href = sitePath("/my");
  };

  const chooseFilter = (nextFilter: (typeof filters)[number]) => {
    setFilter(nextFilter);
    const first =
      nextFilter === "전체"
        ? hazards[0]
        : hazards.find((hazard) => hazard.type === nextFilter);
    if (first) setSelectedId(first.id);
  };

  const openReport = () => {
    setReportStep(1);
    setLocationChoice(null);
    setGpsStatus("idle");
    setGpsPoint(null);
    setGpsMessage("");
    setManualAddress("");
    setPlaceDescription("");
    setLocationValidation("");
    setReportType("단차");
    setReportDescription("");
    setSubmitError("");
    setIsSubmitting(false);
    setReportOpen(true);
  };

  const requestCurrentLocation = () => {
    setLocationChoice("gps");
    setLocationValidation("");
    setGpsMessage("");

    if (!("geolocation" in navigator)) {
      setGpsStatus("error");
      setGpsMessage("이 기기에서는 위치서비스를 사용할 수 없어요. 직접 입력해주세요.");
      return;
    }

    setGpsStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGpsPoint({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setGpsStatus("success");
      },
      (error) => {
        const messages: Record<number, string> = {
          1: "위치 권한이 허용되지 않았어요. 주소나 장소를 직접 입력할 수 있어요.",
          2: "현재 위치를 확인할 수 없어요. 잠시 후 다시 시도하거나 직접 입력해주세요.",
          3: "위치 확인 시간이 초과됐어요. 다시 시도하거나 직접 입력해주세요.",
        };
        setGpsStatus("error");
        setGpsMessage(messages[error.code] ?? "위치를 확인하지 못했어요. 직접 입력해주세요.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const chooseManualLocation = () => {
    setLocationChoice("manual");
    setLocationValidation("");
  };

  const submitReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const hasGps = gpsStatus === "success" && gpsPoint;
    const hasManualLocation = manualAddress.trim() || placeDescription.trim();
    if (!hasGps && !hasManualLocation) {
      setLocationValidation("현재 위치를 확인하거나 주소·장소 설명 중 하나를 입력해주세요.");
      return;
    }
    setIsSubmitting(true);
    setSubmitError("");
    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: reportType,
        title: reportDescription.trim() || `${reportType} 위험요소를 발견했어요`,
        description: reportDescription,
        latitude: gpsPoint?.latitude ?? null,
        longitude: gpsPoint?.longitude ?? null,
        accuracy: gpsPoint?.accuracy ?? null,
        address: manualAddress,
        placeDescription,
      }),
    }).catch(() => null);
    setIsSubmitting(false);
    if (!response?.ok) {
      setSubmitError("기록을 저장하지 못했어요. 잠시 후 다시 시도해주세요.");
      return;
    }
    const saved = await response.json();
    if (!isLoggedIn && saved.id) window.sessionStorage.setItem("jikeoro-pending-report-id", saved.id);
    setReportStep(3);
  };

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="지켜로 홈">
          <span className="brand-mark" aria-hidden="true">
            路
          </span>
          <span>
            <strong>지켜路</strong>
            <small>우리동네 보행안전 지도</small>
          </span>
        </a>
        <nav className="desktop-nav" aria-label="주요 메뉴">
          <a href="/map">위험지도</a>
          <a href="#map">참여방법</a>
          {isLoggedIn && <a href="/my">내 활동</a>}
          <a href="#project">프로젝트</a>
        </nav>
        <div className="header-actions">
          <button className="header-cta" onClick={openReport}>위험요소 기록하기</button>
          {isLoggedIn ? (
            <a className="account-button" href="/my" aria-label="내 지켜로 활동 보기"><span>김</span><b>김지킴</b></a>
          ) : (
            <button className="login-button" onClick={enterMyJikeoro}>로그인</button>
          )}
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">SEONGSU WALKABILITY LAB · YEAR 01</p>
          <h1>
            걷다가 발견한 위험,
            <br />
            <span className="hero-line"><span>성수의 더 나은 길</span>이 됩니다.</span>
          </h1>
          <p className="hero-description">
            주민이 직접 기록한 사진과 목소리가 모여 고령자와 모두에게
            안전한 생활권을 만듭니다.
          </p>
          <div className="hero-actions">
            <button className="primary-button" onClick={openReport}>
              <span className="button-icon" aria-hidden="true">＋</span>
              지금 기록하기
            </button>
            <a className="text-link" href="/map">
              위험지도 둘러보기 <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div className="hero-note">
            <div className="avatar-stack" aria-hidden="true">
              <span>김</span><span>박</span><span>이</span>
            </div>
            <p><strong>성수동 파일럿 준비 중</strong><br />주민과 연구진이 함께 설계합니다.</p>
          </div>
        </div>

        <div className="hero-visual" aria-label="성수동 보행위험 지도 미리보기">
          <div className="visual-glow" />
          <div className="dashboard-card">
            <div className="dashboard-topbar">
              <div className="dashboard-heading">
                <span className="mini-label">LIVE WALKABILITY MAP</span>
                <strong>성수동 보행안전 현황</strong>
              </div>
              <div className="dashboard-badges" aria-label="시범운영 지표">
                <div className="insight-badge coral-insight"><b>01</b><span>1차년도<br />시범운영</span></div>
                <div className="insight-badge dark-insight"><b>92%</b><span>위치정보<br />자동완성</span></div>
              </div>
            </div>
            <div className="hero-map map-surface seongsu-map">
              <SeongsuIllustrationMap items={hazards.slice(0, 3)} />
              <div className="floating-report">
                <span className="report-thumb" aria-hidden="true"><i /><i /></span>
                <div><small>방금 등록된 기록</small><strong>보도 경계석 단차</strong><span>성수이로 · 2분 전</span></div>
              </div>
            </div>
            <div className="dashboard-bottom">
              <div><small>이번 주 기록</small><strong>28</strong><span>건</span></div>
              <div><small>참여 동네</small><strong>3</strong><span>곳</span></div>
              <div className="sparkline" aria-label="최근 참여가 증가하는 추세"><i /><i /><i /><i /><i /><i /><i /></div>
            </div>
          </div>
        </div>
      </section>

      <section className="trust-strip" aria-label="프로젝트 핵심 원칙">
        <p>KAIST HEALTH DESIGN LAB</p>
        <span />
        <p>주민참여 데이터</p>
        <span />
        <p>고령자 친화 UI</p>
        <span />
        <p>성수동 1차년도 파일럿</p>
      </section>

      <section className="map-section">
        <div className="section-heading" id="map">
          <div>
            <p className="eyebrow">NEIGHBORHOOD SIGNALS</p>
            <h2>우리 동네의 작은 신호를<br />한눈에 살펴보세요.</h2>
          </div>
          <p>아래 내용은 서비스 경험을 보여주기 위한<br className="desktop-break" /> 1차년도 프로토타입 예시 데이터입니다.</p>
        </div>

        <div className="filter-row" role="group" aria-label="위험유형 필터">
          {filters.map((item) => (
            <button
              className={filter === item ? "active" : ""}
              key={item}
              onClick={() => chooseFilter(item)}
              aria-pressed={filter === item}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="explorer-card">
          <div className="explorer-map map-surface seongsu-map">
            <SeongsuIllustrationMap items={filteredHazards} selectedId={selected.id} onSelect={setSelectedId} />
            <div className="map-key"><span><i className="key-high" /> 관찰 필요</span><span><i className="key-new" /> 신규 기록</span></div>
          </div>

          <aside className="report-panel" aria-live="polite">
            <div className="panel-meta"><span>{selected.type}</span><small>{selected.time}</small></div>
            <div className={`detail-photo photo-${selected.tone}`} aria-hidden="true">
              <span className="photo-grid" /><span className="scene-object"><i /><b /></span><span className="scene-caption">{selected.type}</span><i className="focus-corner a" /><i className="focus-corner b" /><i className="focus-corner c" /><i className="focus-corner d" />
            </div>
            <div className="detail-body">
              <p className="location-line"><span aria-hidden="true">⌖</span> {selected.place}</p>
              <h3>{selected.title}</h3>
              <p>{selected.detail}</p>
              <dl>
                <div><dt>날씨</dt><dd>맑음 · 27°C</dd></div>
                <div><dt>기록</dt><dd>사진 + 음성</dd></div>
              </dl>
              <button className="panel-button" onClick={openReport}>나도 기록 남기기 <span>→</span></button>
            </div>
          </aside>
        </div>
      </section>

      <section className="how-section" id="how">
        <div className="section-heading compact">
          <div><p className="eyebrow">60-SECOND REPORT</p><h2>발견하고, 말하고,<br />변화를 함께 만듭니다.</h2></div>
          <p>복잡한 설명 없이 사진 한 장과 짧은 목소리면 충분합니다.</p>
        </div>
        <div className="steps-grid">
          <article><span className="step-number">01</span><div className="step-visual camera-visual"><i /><b>＋</b></div><h3>위험요소를 발견해요</h3><p>걷다가 불편하거나 위험하다고 느낀 장소에서 시작합니다.</p></article>
          <article><span className="step-number">02</span><div className="step-visual voice-visual"><i /><i /><i /><i /><i /></div><h3>사진과 목소리를 남겨요</h3><p>큰 버튼을 눌러 촬영하고, 위험한 이유를 편하게 말해주세요.</p></article>
          <article><span className="step-number">03</span><div className="step-visual map-visual"><i /><b>✓</b></div><h3>위치정보를 확인해요</h3><p>위치·시간·날씨가 자동으로 기록되고 연구 데이터가 됩니다.</p></article>
        </div>
      </section>

      <section className="project-section" id="project">
        <div className="project-copy">
          <p className="eyebrow light">YEAR 01 · SEONGSU PILOT</p>
          <h2>좋은 도시는<br />잘 듣는 것에서 시작합니다.</h2>
          <p>지켜路는 행정 통계만으로는 보이지 않았던 일상의 보행위험을 주민과 고령자의 경험으로 기록하는 참여형 연구 프로젝트입니다.</p>
          <a href="mailto:healthdesignlab@kaist.ac.kr">프로젝트 문의하기 <span>↗</span></a>
        </div>
        <div className="project-metrics">
          <div><strong>01</strong><span>성수동<br />시범 생활권</span></div>
          <div><strong>60<span>초</span></strong><span>목표 기록<br />완료 시간</span></div>
          <div><strong>3<span>종</span></strong><span>사진·음성·텍스트<br />참여 방식</span></div>
          <p>※ 수치는 1차년도 프로토타입의 초기 설계 목표이며 시범운영 결과에 따라 조정됩니다.</p>
        </div>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top"><span className="brand-mark">路</span><span><strong>지켜路</strong><small>우리동네 보행안전 지도</small></span></a>
        <p>KAIST Health Design Lab · 1차년도 연구 프로토타입</p>
        <p><a className="admin-entry-link" href="/admin/login">관리자·기관 로그인</a><br />© 2026 JIKEORO. Prototype for research.</p>
      </footer>

      <button className="mobile-report-button" onClick={openReport}><span>＋</span> 위험요소 기록하기</button>

      {reportOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setReportOpen(false)}>
          <section className="report-modal" role="dialog" aria-modal="true" aria-labelledby="report-title">
            <button className="modal-close" onClick={() => setReportOpen(false)} aria-label="닫기">×</button>
            {reportStep < 3 && <div className="modal-progress"><span style={{ width: reportStep === 1 ? "50%" : "100%" }} /></div>}
            {reportStep === 1 && (
              <>
                <p className="modal-step">1 / 2</p>
                <h2 id="report-title">어떤 위험을<br />발견하셨나요?</h2>
                <p className="modal-help">사진을 촬영하거나 기기에 저장된 사진을 선택해주세요.</p>
                <label className="upload-box">
                  <input type="file" accept="image/*" capture="environment" />
                  <span className="upload-icon">＋</span>
                  <strong>사진 촬영·선택</strong>
                  <small>얼굴과 차량번호는 제출 전 확인해주세요.</small>
                </label>
                <button className="modal-primary" onClick={() => setReportStep(2)}>사진 없이 계속하기 <span>→</span></button>
              </>
            )}
            {reportStep === 2 && (
              <form onSubmit={submitReport}>
                <p className="modal-step">2 / 2</p>
                <h2 id="report-title">위험한 이유를<br />알려주세요.</h2>
                <fieldset>
                  <legend>위험요소 유형</legend>
                  <div className="type-options">
                    {filters.slice(1).map((item) => <label key={item}><input type="radio" name="hazard" checked={reportType === item} onChange={() => setReportType(item)} /><span>{item}</span></label>)}
                  </div>
                </fieldset>
                <fieldset className="location-fieldset">
                  <legend>위치</legend>
                  <p className="field-guide">GPS를 사용하거나 알고 있는 주소·장소를 직접 알려주세요.</p>
                  <div className="location-methods">
                    <button
                      className={locationChoice === "gps" ? "active" : ""}
                      type="button"
                      onClick={requestCurrentLocation}
                      aria-pressed={locationChoice === "gps"}
                    >
                      <span aria-hidden="true">⌖</span>
                      현재 위치 사용
                    </button>
                    <button
                      className={locationChoice === "manual" ? "active" : ""}
                      type="button"
                      onClick={chooseManualLocation}
                      aria-pressed={locationChoice === "manual"}
                    >
                      <span aria-hidden="true">⌨</span>
                      직접 입력
                    </button>
                  </div>

                  {locationChoice === "gps" && (
                    <div className={`location-result ${gpsStatus}`} aria-live="polite">
                      {gpsStatus === "loading" && <><i className="location-loader" /><div><strong>현재 위치를 확인하고 있어요</strong><small>잠시만 기다려주세요.</small></div></>}
                      {gpsStatus === "success" && gpsPoint && <><i className="location-dot" /><div><strong>현재 위치를 확인했어요</strong><small>위도 {gpsPoint.latitude.toFixed(5)} · 경도 {gpsPoint.longitude.toFixed(5)} · 오차 약 {Math.round(gpsPoint.accuracy)}m</small></div><button type="button" onClick={requestCurrentLocation}>다시 확인</button></>}
                      {gpsStatus === "error" && <><i className="location-error-icon">!</i><div><strong>위치를 가져오지 못했어요</strong><small>{gpsMessage}</small></div><button type="button" onClick={chooseManualLocation}>직접 입력</button></>}
                    </div>
                  )}

                  {locationChoice === "manual" && (
                    <div className="manual-location-fields">
                      <label className="input-field">
                        <span>주소 <small>선택</small></span>
                        <input
                          type="text"
                          value={manualAddress}
                          onChange={(event) => { setManualAddress(event.target.value); setLocationValidation(""); }}
                          placeholder="예: 서울특별시 성동구 성수이로 82"
                          autoComplete="street-address"
                        />
                      </label>
                      <div className="manual-divider"><span>또는</span></div>
                      <label className="input-field">
                        <span>어디 앞인지 알려주기 <small>선택</small></span>
                        <input
                          type="text"
                          value={placeDescription}
                          onChange={(event) => { setPlaceDescription(event.target.value); setLocationValidation(""); }}
                          placeholder="예: 성수역 3번 출구 앞 횡단보도"
                        />
                      </label>
                      <p className="manual-hint">둘 중 하나만 입력해도 괜찮아요.</p>
                    </div>
                  )}
                  <p className="privacy-note">위치정보는 이 위험 기록의 장소를 확인하는 용도로만 사용됩니다.</p>
                  {locationValidation && <p className="location-validation" role="alert">{locationValidation}</p>}
                </fieldset>
                <label className="text-field"><span>설명</span><textarea value={reportDescription} onChange={(event) => setReportDescription(event.target.value)} placeholder="예: 보도블록 높이 차이 때문에 발이 걸릴 것 같아요." rows={3} /></label>
                <div className="auto-info"><span>☀ 27°C 맑음</span><span>날짜·시간 자동저장</span></div>
                {submitError && <p className="location-validation" role="alert">{submitError}</p>}
                <button className="modal-primary" type="submit" disabled={isSubmitting}>{isSubmitting ? "저장하고 있어요" : "기록 제출하기"} <span>→</span></button>
              </form>
            )}
            {reportStep === 3 && (
              <div className="success-state">
                <span className="success-icon">✓</span>
                <p className="modal-step">기록 완료</p>
                <h2 id="report-title">소중한 기록을<br />남겨주셔서 고맙습니다.</h2>
                <p>{isLoggedIn ? "내 활동에서 접수 상태와 이후 대응 과정을 확인할 수 있어요." : "로그인 없이 접수됐어요. 로그인하면 기록의 처리 과정과 담당 기관의 답변을 이어서 볼 수 있어요."}</p>
                <button className="modal-primary" onClick={isLoggedIn ? () => { window.location.href = sitePath("/my"); } : enterMyJikeoro}>{isLoggedIn ? "내 기록 확인하기" : "로그인하고 진행상황 보기"} <span>→</span></button>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
