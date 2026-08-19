"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import { sitePath } from "../lib/site-path";

type MapReport = {
  id: string;
  type: string;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  place: string;
  status: "received" | "review" | "action" | "completed";
  createdAt: string;
};

const categories = ["전체", "단차", "포트홀", "조도", "적치물"];
const toneByType: Record<string, string> = { 단차: "coral", 포트홀: "yellow", 조도: "navy", 적치물: "mint" };
const statusText: Record<MapReport["status"], string> = { received: "접수", review: "현장 검토", action: "조치 진행", completed: "개선 완료" };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatAccuracy(value: number | null) {
  if (value == null) return "정확도 미확인";
  if (value >= 1000) return `오차 약 ${Math.round(value / 1000)}km`;
  return `오차 약 ${Math.round(value)}m`;
}

export default function RiskMapPage() {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const mapLibraryRef = useRef<typeof import("maplibre-gl") | null>(null);
  const [reports, setReports] = useState<MapReport[]>([]);
  const [filter, setFilter] = useState("전체");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [dataError, setDataError] = useState("");
  const [mapError, setMapError] = useState("");

  useEffect(() => {
    fetch("/api/map/reports")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("data")))
      .then((data) => {
        const next = (data.reports ?? []) as MapReport[];
        setReports(next);
        setSelectedId(next[0]?.id ?? null);
      })
      .catch(() => setDataError("현황 데이터를 불러오지 못했어요."))
      .finally(() => setLoading(false));
  }, []);

  const filteredReports = useMemo(
    () => filter === "전체" ? reports : reports.filter((report) => report.type === filter),
    [filter, reports],
  );
  const selected = reports.find((report) => report.id === selectedId) ?? filteredReports[0] ?? null;

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;
    let disposed = false;
    let loadTimer: number | undefined;
    import("maplibre-gl").then((maplibregl) => {
      if (disposed || !mapElementRef.current) return;
      try {
        mapLibraryRef.current = maplibregl;
        const map = new maplibregl.Map({
          container: mapElementRef.current,
          style: {
            version: 8,
            sources: {
              openStreetMap: {
                type: "raster",
                tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
                tileSize: 256,
                maxzoom: 19,
                attribution: "© OpenStreetMap contributors",
              },
            },
            layers: [{ id: "openStreetMap", type: "raster", source: "openStreetMap" }],
          },
          center: [127.0522, 37.5448],
          zoom: 14.8,
          minZoom: 5,
          maxZoom: 19,
          attributionControl: true,
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        map.on("load", () => {
          if (loadTimer) window.clearTimeout(loadTimer);
          setMapError("");
          setMapReady(true);
          map.resize();
        });
        loadTimer = window.setTimeout(() => {
          if (!map.loaded()) setMapError("무료 지도를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.");
        }, 12000);
        mapRef.current = map;
      } catch (error) {
        console.error("MapLibre initialization failed", error);
        setMapError("무료 지도를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.");
      }
    }).catch((error) => {
      console.error("MapLibre module failed to load", error);
      if (!disposed) setMapError("무료 지도를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.");
    });
    return () => {
      disposed = true;
      if (loadTimer) window.clearTimeout(loadTimer);
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      mapLibraryRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = mapLibraryRef.current;
    if (!mapReady || !map || !maplibregl) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    if (!filteredReports.length) return;

    const first = filteredReports[0];
    const bounds = new maplibregl.LngLatBounds([first.longitude, first.latitude], [first.longitude, first.latitude]);
    filteredReports.forEach((report, index) => {
      const tone = toneByType[report.type] ?? "navy";
      const safeType = categories.includes(report.type) ? report.type : "위험";
      const element = document.createElement("button");
      element.type = "button";
      element.className = `free-risk-marker marker-${tone}`;
      element.setAttribute("aria-label", `${safeType} 위험요소`);
      const label = document.createElement("b");
      label.textContent = String(index + 1);
      element.appendChild(label);
      element.addEventListener("click", () => setSelectedId(report.id));
      const marker = new maplibregl.Marker({ element, anchor: "bottom" })
        .setLngLat([report.longitude, report.latitude])
        .addTo(map);
      markersRef.current.push(marker);
      bounds.extend([report.longitude, report.latitude]);
    });

    if (filteredReports.length === 1) {
      map.flyTo({ center: [first.longitude, first.latitude], zoom: 16.5, essential: true });
    } else {
      map.fitBounds(bounds, { padding: 80, maxZoom: 16.5, duration: 700 });
    }
  }, [filteredReports, mapReady]);

  const selectReport = (report: MapReport) => {
    setSelectedId(report.id);
    mapRef.current?.flyTo({ center: [report.longitude, report.latitude], zoom: Math.max(mapRef.current.getZoom(), 16), essential: true });
  };

  const todayCount = reports.filter((report) => new Date(report.createdAt).toDateString() === new Date().toDateString()).length;

  return (
    <main className="risk-map-page">
      <header className="risk-map-header">
        <a className="brand" href={sitePath("/")} aria-label="지켜로 첫 화면으로 이동">
          <span className="brand-mark" aria-hidden="true">路</span>
          <span><strong>지켜路</strong><small>우리동네 보행안전 지도</small></span>
        </a>
        <div className="risk-map-header-actions">
          <span>GPS 기록 현황</span>
          <a href={sitePath("/?report=1")}>위험요소 기록하기</a>
        </div>
      </header>

      <section className="risk-map-intro">
        <div>
          <p className="eyebrow">SEONGSU LIVE SAFETY MAP</p>
          <h1>위험요소 등록<br />현황지도</h1>
          <p>주민이 위치정보와 함께 남긴 기록만 지도에 표시합니다. 마커를 누르면 현장 내용과 대응 단계를 확인할 수 있어요.</p>
        </div>
        <dl>
          <div><dt>GPS 기록</dt><dd>{reports.length}<span>건</span></dd></div>
          <div><dt>오늘 등록</dt><dd>{todayCount}<span>건</span></dd></div>
          <div><dt>표시 지역</dt><dd className="place-metric">성수동</dd></div>
        </dl>
      </section>

      <section className="risk-map-workspace" aria-label="성수동 위험요소 GPS 현황">
        <div className="risk-map-canvas">
          <div ref={mapElementRef} className="free-map-canvas" aria-label="무료 공개 지도" />
          {!mapReady && !mapError && <div className="map-loading"><i />현황지도를 불러오는 중</div>}
          {mapError && <div className="map-error-card"><span aria-hidden="true">!</span><strong>{mapError}</strong></div>}
          <div className="map-privacy-note"><span /> 신고자 정보 없이 위험 위치만 표시됩니다.</div>
        </div>

        <aside className="risk-report-drawer">
          <div className="risk-drawer-heading">
            <div><p className="eyebrow">GPS REPORTS</p><h2>등록된 위치</h2></div>
            <strong>{filteredReports.length}</strong>
          </div>
          <div className="risk-map-filters" role="group" aria-label="위험 유형 필터">
            {categories.map((category) => (
              <button key={category} className={filter === category ? "active" : ""} onClick={() => setFilter(category)} aria-pressed={filter === category}>{category}</button>
            ))}
          </div>
          <div className="risk-report-list">
            {loading && <p className="risk-list-message">위치 기록을 불러오는 중이에요.</p>}
            {!loading && dataError && <p className="risk-list-message error">{dataError}</p>}
            {!loading && !dataError && !filteredReports.length && <p className="risk-list-message">이 유형으로 등록된 GPS 기록이 아직 없어요.</p>}
            {filteredReports.map((report, index) => (
              <button key={report.id} className={selected?.id === report.id ? "selected" : ""} onClick={() => selectReport(report)}>
                <span className={`report-index index-${toneByType[report.type] ?? "navy"}`}>{index + 1}</span>
                <span className="report-list-copy">
                  <span><b>{report.type}</b><small>{statusText[report.status]}</small></span>
                  <strong>{report.title}</strong>
                  <span className="report-list-place">{report.place}</span>
                  <time>{formatDate(report.createdAt)}</time>
                  <span className={`gps-accuracy${(report.accuracy ?? 0) > 500 ? " low" : ""}`}>{formatAccuracy(report.accuracy)}</span>
                </span>
              </button>
            ))}
          </div>
          {selected && (
            <div className="selected-report-summary">
              <span className={`summary-tone tone-${toneByType[selected.type] ?? "navy"}`} />
              <div><small>선택한 기록 · {formatAccuracy(selected.accuracy)}</small><strong>{selected.title}</strong><p>{selected.description}</p></div>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
