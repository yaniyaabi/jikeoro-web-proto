"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";
import { SiteHeader } from "../components/site-header";
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
  mediaCount?: number;
};

type StoredReportMedia = {
  id: string;
  reportId: string;
  kind: "image" | "video" | "audio";
  name: string;
  type: string;
  blob: Blob;
};

type PreviewMedia = StoredReportMedia & { previewUrl: string };
type LikeEntry = { count: number; liked: boolean };
type LikeStore = Record<string, LikeEntry>;
type MunicipalityProperties = {
  code: string;
  name: string;
  name_eng?: string;
  base_year?: string;
};
type MunicipalityFeature = Feature<Polygon | MultiPolygon, MunicipalityProperties>;

const categories = ["전체", "단차", "포트홀", "조도", "적치물"];
const toneByType: Record<string, string> = { 단차: "coral", 포트홀: "yellow", 조도: "navy", 적치물: "mint" };
const statusText: Record<MapReport["status"], string> = { received: "접수", review: "현장 검토", action: "조치 진행", completed: "개선 완료" };
const LIKES_KEY = "jikeoro-map-likes";
const provinceNames: Record<string, string> = {
  "11": "서울특별시", "21": "부산광역시", "22": "대구광역시", "23": "인천광역시",
  "24": "광주광역시", "25": "대전광역시", "26": "울산광역시", "29": "세종특별자치시",
  "31": "경기도", "32": "강원특별자치도", "33": "충청북도", "34": "충청남도",
  "35": "전북특별자치도", "36": "전라남도", "37": "경상북도", "38": "경상남도",
  "39": "제주특별자치도",
};

function provinceCode(feature: MunicipalityFeature) {
  return feature.properties.code.slice(0, 2);
}

function geometryPolygons(geometry: Polygon | MultiPolygon): Position[][][] {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

function ringArea(ring: Position[]) {
  return ring.reduce((area, point, index) => {
    const next = ring[(index + 1) % ring.length];
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
}

function asClockwise(ring: Position[]) {
  return ringArea(ring) > 0 ? [...ring].reverse() : ring;
}

function pointInRing(point: Position, ring: Position[]) {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const [x1, y1] = ring[current];
    const [x2, y2] = ring[previous];
    const intersects = (y1 > point[1]) !== (y2 > point[1])
      && point[0] < ((x2 - x1) * (point[1] - y1)) / (y2 - y1) + x1;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInMunicipality(point: Position, feature: MunicipalityFeature) {
  return geometryPolygons(feature.geometry).some((polygon) => {
    if (!polygon[0] || !pointInRing(point, polygon[0])) return false;
    return !polygon.slice(1).some((hole) => pointInRing(point, hole));
  });
}

function geometryBounds(feature: MunicipalityFeature) {
  const positions = geometryPolygons(feature.geometry).flat(2);
  return positions.reduce(
    (bounds, [longitude, latitude]) => ({
      minLongitude: Math.min(bounds.minLongitude, longitude),
      minLatitude: Math.min(bounds.minLatitude, latitude),
      maxLongitude: Math.max(bounds.maxLongitude, longitude),
      maxLatitude: Math.max(bounds.maxLatitude, latitude),
    }),
    { minLongitude: 180, minLatitude: 90, maxLongitude: -180, maxLatitude: -90 },
  );
}

function boundaryLayerData(feature: MunicipalityFeature): FeatureCollection {
  const holes = geometryPolygons(feature.geometry)
    .map((polygon) => polygon[0])
    .filter(Boolean)
    .map(asClockwise);
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { kind: "mask" },
        geometry: {
          type: "Polygon",
          coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]], ...holes],
        },
      },
      { ...feature, properties: { ...feature.properties, kind: "selected" } },
    ],
  };
}

async function readReportMedia(reportId: string) {
  if (!("indexedDB" in window)) return [] as StoredReportMedia[];
  return new Promise<StoredReportMedia[]>((resolve) => {
    const request = window.indexedDB.open("jikeoro-media", 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("media")) database.createObjectStore("media", { keyPath: "id" });
    };
    request.onerror = () => resolve([]);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("media", "readonly");
      const getAll = transaction.objectStore("media").getAll();
      getAll.onsuccess = () => resolve((getAll.result as StoredReportMedia[]).filter((item) => item.reportId === reportId));
      getAll.onerror = () => resolve([]);
      transaction.oncomplete = () => database.close();
    };
  });
}

function ReportThumbnail({ report, onOpen }: { report: MapReport; onOpen: () => void }) {
  const [media, setMedia] = useState<PreviewMedia | null>(null);

  useEffect(() => {
    let disposed = false;
    let previewUrl = "";
    readReportMedia(report.id).then((items) => {
      if (disposed) return;
      const item = items.find((candidate) => candidate.kind === "image" || candidate.kind === "video");
      if (!item) return;
      previewUrl = URL.createObjectURL(item.blob);
      setMedia({ ...item, previewUrl });
    });
    return () => {
      disposed = true;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [report.id]);

  return (
    <button className="map-inline-thumb" type="button" onClick={onOpen} aria-label={`${report.title} 사진 또는 영상 크게 보기`}>
      {media?.kind === "image" && <img src={media.previewUrl} alt="" />}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      {media?.kind === "video" && <video src={media.previewUrl} muted preload="metadata" />}
      {!media && <span className={`map-inline-sample tone-${toneByType[report.type] ?? "navy"}`} aria-hidden="true"><span /></span>}
    </button>
  );
}

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
  const [municipalities, setMunicipalities] = useState<MunicipalityFeature[]>([]);
  const [boundaryError, setBoundaryError] = useState("");
  const [province, setProvince] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [appliedMunicipality, setAppliedMunicipality] = useState("");
  const [selectedMedia, setSelectedMedia] = useState<PreviewMedia[]>([]);
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [likes, setLikes] = useState<LikeStore>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(window.localStorage.getItem(LIKES_KEY) ?? "{}");
    } catch {
      return {};
    }
  });
  const [detailOpen, setDetailOpen] = useState(false);

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

  useEffect(() => {
    fetch(sitePath("/data/korea-municipalities-2013.geojson"))
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("boundary")))
      .then((data: FeatureCollection<Polygon | MultiPolygon, MunicipalityProperties>) => setMunicipalities(data.features))
      .catch(() => setBoundaryError("지역 경계 데이터를 불러오지 못했어요."));
  }, []);

  const selectedBoundary = useMemo(
    () => municipalities.find((feature) => feature.properties.code === appliedMunicipality) ?? null,
    [appliedMunicipality, municipalities],
  );
  const provinceOptions = useMemo(
    () => [...new Set(municipalities.map(provinceCode))]
      .sort()
      .map((code) => ({ code, name: provinceNames[code] ?? code })),
    [municipalities],
  );
  const municipalityOptions = useMemo(
    () => municipalities
      .filter((feature) => provinceCode(feature) === province)
      .sort((a, b) => a.properties.name.localeCompare(b.properties.name, "ko")),
    [municipalities, province],
  );
  const categoryFilteredReports = useMemo(
    () => filter === "전체" ? reports : reports.filter((report) => report.type === filter),
    [filter, reports],
  );
  const filteredReports = useMemo(
    () => selectedBoundary
      ? categoryFilteredReports.filter((report) => pointInMunicipality([report.longitude, report.latitude], selectedBoundary))
      : categoryFilteredReports,
    [categoryFilteredReports, selectedBoundary],
  );
  const selected = filteredReports.find((report) => report.id === selectedId) ?? filteredReports[0] ?? null;

  useEffect(() => {
    if (!selected?.id) return;
    let disposed = false;
    let previewUrls: string[] = [];
    Promise.resolve().then(async () => {
      if (disposed) return;
      setMediaLoading(true);
      setSelectedMedia([]);
      setSelectedMediaIndex(0);
      const items = await readReportMedia(selected.id);
      if (!disposed) {
        const previews = items.map((item) => ({ ...item, previewUrl: URL.createObjectURL(item.blob) }));
        previewUrls = previews.map((item) => item.previewUrl);
        setSelectedMedia(previews);
      }
      if (!disposed) setMediaLoading(false);
    });
    return () => {
      disposed = true;
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [selected?.id]);

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
          center: [127.8, 36.3],
          zoom: 6.5,
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

    if (selectedBoundary) return;
    if (filteredReports.length === 1) {
      map.flyTo({ center: [first.longitude, first.latitude], zoom: 16.5, essential: true });
    } else {
      map.fitBounds(bounds, { padding: 80, maxZoom: 16.5, duration: 700 });
    }
  }, [filteredReports, mapReady, selectedBoundary]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;

    ["municipality-outline", "municipality-fill", "municipality-mask"].forEach((layerId) => {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
    });
    if (map.getSource("municipality-boundary")) map.removeSource("municipality-boundary");

    if (!selectedBoundary) {
      if (reports.length) {
        const first = reports[0];
        const bounds = reports.reduce(
          (nextBounds, report) => nextBounds.extend([report.longitude, report.latitude]),
          new (mapLibraryRef.current!).LngLatBounds([first.longitude, first.latitude], [first.longitude, first.latitude]),
        );
        map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 700 });
      } else {
        map.flyTo({ center: [127.8, 36.3], zoom: 6.5, essential: true });
      }
      return;
    }

    map.addSource("municipality-boundary", { type: "geojson", data: boundaryLayerData(selectedBoundary) });
    map.addLayer({
      id: "municipality-mask",
      type: "fill",
      source: "municipality-boundary",
      filter: ["==", ["get", "kind"], "mask"],
      paint: { "fill-color": "#8d918f", "fill-opacity": 0.82 },
    });
    map.addLayer({
      id: "municipality-fill",
      type: "fill",
      source: "municipality-boundary",
      filter: ["==", ["get", "kind"], "selected"],
      paint: { "fill-color": "#b7f06b", "fill-opacity": 0.12 },
    });
    map.addLayer({
      id: "municipality-outline",
      type: "line",
      source: "municipality-boundary",
      filter: ["==", ["get", "kind"], "selected"],
      paint: { "line-color": "#0f3934", "line-width": 3, "line-opacity": 0.95 },
    });

    const bounds = geometryBounds(selectedBoundary);
    map.fitBounds(
      [[bounds.minLongitude, bounds.minLatitude], [bounds.maxLongitude, bounds.maxLatitude]],
      { padding: { top: 70, right: 70, bottom: 70, left: 70 }, duration: 800, maxZoom: 13.5 },
    );
  }, [mapReady, reports, selectedBoundary]);

  const selectReport = (report: MapReport) => {
    setSelectedId(report.id);
    mapRef.current?.flyTo({ center: [report.longitude, report.latitude], zoom: Math.max(mapRef.current.getZoom(), 16), essential: true });
  };

  const openReportMedia = (report: MapReport) => {
    setSelectedId(report.id);
    setDetailOpen(true);
  };

  const toggleLike = (reportId: string) => {
    setLikes((current) => {
      const entry = current[reportId] ?? { count: 0, liked: false };
      const next = {
        ...current,
        [reportId]: { count: Math.max(0, entry.count + (entry.liked ? -1 : 1)), liked: !entry.liked },
      };
      window.localStorage.setItem(LIKES_KEY, JSON.stringify(next));
      return next;
    });
  };

  const applyRegion = () => {
    if (!municipality) return;
    setAppliedMunicipality(municipality);
    setSelectedId(null);
  };

  const clearRegion = () => {
    setProvince("");
    setMunicipality("");
    setAppliedMunicipality("");
    setSelectedId(null);
  };

  const todayCount = reports.filter((report) => new Date(report.createdAt).toDateString() === new Date().toDateString()).length;
  const visualMedia = selectedMedia.filter((item) => item.kind === "image" || item.kind === "video");
  const activeMedia = visualMedia[selectedMediaIndex] ?? visualMedia[0] ?? null;

  return (
    <main className="risk-map-page">
      <SiteHeader active="map" inner />
      <section className="risk-map-intro">
        <div>
          <p className="eyebrow">NATIONWIDE LIVE SAFETY MAP</p>
          <h1>우리 동네 위험요소<br />현황지도</h1>
          <p>주민이 위치정보와 함께 남긴 기록만 지도에 표시합니다. 마커를 누르면 현장 내용과 대응 단계를 확인할 수 있어요.</p>
        </div>
        <dl>
          <div><dt>GPS 기록</dt><dd>{reports.length}<span>건</span></dd></div>
          <div><dt>오늘 등록</dt><dd>{todayCount}<span>건</span></dd></div>
          <div><dt>표시 범위</dt><dd className="place-metric">{selectedBoundary ? `${provinceNames[provinceCode(selectedBoundary)] ?? ""} ${selectedBoundary.properties.name}` : "전국"}</dd></div>
        </dl>
      </section>

      <section className="region-search" aria-label="시군구 지역 검색">
        <div className="region-search-copy">
          <span aria-hidden="true">⌖</span>
          <div><strong>지역별로 찾아보기</strong><small>시·도와 시·군·구를 선택하면 경계 안의 제보만 보여드려요.</small></div>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); applyRegion(); }}>
          <label>
            <span>시·도</span>
            <select value={province} onChange={(event) => { setProvince(event.target.value); setMunicipality(""); }}>
              <option value="">시·도 선택</option>
              {provinceOptions.map((option) => <option key={option.code} value={option.code}>{option.name}</option>)}
            </select>
          </label>
          <label>
            <span>시·군·구</span>
            <select value={municipality} onChange={(event) => setMunicipality(event.target.value)} disabled={!province}>
              <option value="">시·군·구 선택</option>
              {municipalityOptions.map((feature) => <option key={feature.properties.code} value={feature.properties.code}>{feature.properties.name}</option>)}
            </select>
          </label>
          <button className="region-search-submit" type="submit" disabled={!municipality}>지역 보기</button>
          {selectedBoundary && <button className="region-search-reset" type="button" onClick={clearRegion}>전국 보기</button>}
        </form>
        {boundaryError && <p className="region-search-error">{boundaryError}</p>}
      </section>

      <section className="risk-map-workspace" aria-label="전국 우리 동네 위험요소 GPS 현황">
        <div className="risk-map-canvas">
          <div ref={mapElementRef} className="free-map-canvas" aria-label="무료 공개 지도" />
          {!mapReady && !mapError && <div className="map-loading"><i />현황지도를 불러오는 중</div>}
          {mapError && <div className="map-error-card"><span aria-hidden="true">!</span><strong>{mapError}</strong></div>}
          {selectedBoundary && <div className="map-region-badge"><b>{provinceNames[provinceCode(selectedBoundary)]}</b><span>{selectedBoundary.properties.name}</span></div>}
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
            {!loading && !dataError && !filteredReports.length && <p className="risk-list-message">{selectedBoundary ? `${selectedBoundary.properties.name}에 등록된 GPS 기록이 아직 없어요.` : "이 유형으로 등록된 GPS 기록이 아직 없어요."}</p>}
            {filteredReports.map((report, index) => {
              const reportLike = likes[report.id] ?? { count: 0, liked: false };
              return (
                <article key={report.id} className={`risk-report-item${selected?.id === report.id ? " selected" : ""}`}>
                  <button className="risk-report-select" type="button" onClick={() => selectReport(report)}>
                    <span className={`report-index index-${toneByType[report.type] ?? "navy"}`}>{index + 1}</span>
                    <span className="report-list-copy">
                      <span><b>{report.type}</b><small>{statusText[report.status]}</small></span>
                      <strong>{report.title}</strong>
                      <span className="report-list-place">{report.place}</span>
                      <time>{formatDate(report.createdAt)}</time>
                      <span className={`gps-accuracy${(report.accuracy ?? 0) > 500 ? " low" : ""}`}>{formatAccuracy(report.accuracy)}</span>
                    </span>
                  </button>
                  <div className="map-inline-actions">
                    <ReportThumbnail report={report} onOpen={() => openReportMedia(report)} />
                    <button className={`map-inline-like${reportLike.liked ? " liked" : ""}`} type="button" onClick={() => toggleLike(report.id)} aria-pressed={reportLike.liked}><span aria-hidden="true">{reportLike.liked ? "♥" : "♡"}</span><b>{reportLike.count}</b></button>
                  </div>
                </article>
              );
            })}
          </div>
        </aside>
      </section>

      {detailOpen && selected && (
        <div className="map-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailOpen(false); }}>
          <section className="map-detail-modal media-only" role="dialog" aria-modal="true" aria-label={`${selected.title} 첨부 자료 크게 보기`}>
            <button className="map-detail-close" type="button" onClick={() => setDetailOpen(false)} aria-label="상세 내용 닫기">×</button>
            <div className="map-detail-media" aria-label="선택한 기록의 첨부 자료">
              {mediaLoading && <p className="map-media-empty">첨부 자료를 불러오는 중이에요.</p>}
              {!mediaLoading && activeMedia?.kind === "image" && <img src={activeMedia.previewUrl} alt={`${selected.title} 현장 사진`} />}
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              {!mediaLoading && activeMedia?.kind === "video" && <video src={activeMedia.previewUrl} controls preload="metadata" aria-label={`${selected.title} 현장 영상`} />}
              {!mediaLoading && !activeMedia && (
                <div className={`map-sample-media photo-${toneByType[selected.type] ?? "navy"}`}>
                  <span className="photo-grid" /><span className="scene-object"><i /><b /></span>
                  <span className="scene-caption">첨부 예시 · {selected.type}</span>
                  <i className="focus-corner a" /><i className="focus-corner b" /><i className="focus-corner c" /><i className="focus-corner d" />
                  <p>이 예시 기록에는 원본 사진·영상이 없어 현장 유형 이미지로 표시합니다.</p>
                </div>
              )}
              {visualMedia.length > 1 && <div className="map-media-thumbnails">{visualMedia.map((item, index) => <button key={item.id} type="button" className={selectedMediaIndex === index ? "active" : ""} onClick={() => setSelectedMediaIndex(index)}>{item.kind === "image" ? "사진" : "영상"} {index + 1}</button>)}</div>}
              <div className="map-lightbox-caption"><b>{selected.title}</b><span>{selected.place}</span></div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
