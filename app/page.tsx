"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { SiteHeader } from "./components/site-header";
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
    place: "우리 동네 주민센터 앞",
    time: "오늘 09:42",
    detail: "보행보조기 바퀴가 걸릴 만큼 경계석 높이 차이가 커요.",
    x: "58%",
    y: "42%",
    tone: "coral",
    latitude: 37.5447,
    longitude: 127.0567,
  },
  {
    id: 2,
    type: "조도",
    title: "야간 조명 부족",
    place: "중앙시장 옆 골목",
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
    place: "지하철역 5번 출구 앞",
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
    place: "동네 상가 앞",
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
type WeatherStatus = "idle" | "loading" | "success" | "error";
type WeatherSnapshot = { temperature: number; code: number; observedAt: string };
type SpeechRecognitionResultLike = { 0: { transcript: string } };
type SpeechRecognitionEventLike = { results: ArrayLike<SpeechRecognitionResultLike> };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type MediaKind = "image" | "video" | "audio";
type MediaAttachment = {
  id: string;
  kind: MediaKind;
  file: File;
  previewUrl: string;
};

function describeWeather(code: number) {
  if (code === 0) return { icon: "☀", label: "맑음" };
  if (code <= 3) return { icon: "⛅", label: "구름" };
  if (code === 45 || code === 48) return { icon: "〰", label: "안개" };
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { icon: "☂", label: "비" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { icon: "❄", label: "눈" };
  if (code >= 95) return { icon: "⚡", label: "뇌우" };
  return { icon: "◌", label: "날씨" };
}

async function storeReportMedia(reportId: string, attachments: MediaAttachment[]) {
  if (!("indexedDB" in window) || attachments.length === 0) return;
  await new Promise<void>((resolve, reject) => {
    const request = window.indexedDB.open("jikeoro-media", 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("media")) database.createObjectStore("media", { keyPath: "id" });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("media", "readwrite");
      const store = transaction.objectStore("media");
      attachments.forEach((attachment) => store.put({
        id: `${reportId}-${attachment.id}`,
        reportId,
        kind: attachment.kind,
        name: attachment.file.name,
        type: attachment.file.type,
        size: attachment.file.size,
        blob: attachment.file,
        createdAt: new Date().toISOString(),
      }));
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => { database.close(); reject(transaction.error); };
    };
  });
}

function NeighborhoodIllustrationMap({ items, selectedId, onSelect }: { items: Hazard[]; selectedId?: number; onSelect?: (id: number) => void }) {
  return (
    <div className="illustration-layer town-map" role={onSelect ? "group" : "img"} aria-label="공원과 하천, 주택과 상점이 이어진 우리 동네 일러스트 지도">
      <span className="town-land land-a" aria-hidden="true" />
      <span className="town-land land-b" aria-hidden="true" />
      <span className="town-stream"><i /><b>동네 하천</b><small>NEIGHBORHOOD STREAM</small></span>
      <span className="town-road road-main"><small>우리로</small></span>
      <span className="town-road road-link" />
      <span className="town-road road-riverside"><small>물빛길</small></span>
      <span className="town-crosswalk" aria-hidden="true" />
      <span className="town-park"><i /><i /><i /><i /><b>우리 동네 공원</b><small>걷고 쉬어가는 녹지</small></span>
      <span className="town-walk-loop"><i /><b>안심 산책길</b></span>
      <span className="town-buildings buildings-a" aria-hidden="true"><i /><i /><i /></span>
      <span className="town-buildings buildings-b" aria-hidden="true"><i /><i /><i /><i /></span>
      <span className="town-community"><i aria-hidden="true">⌂</i><b>생활지원센터</b><small>주민 쉼터</small></span>
      <span className="town-shop"><i aria-hidden="true" /><b>동네 상점</b></span>
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

function LocationPickerMap({ point, onChange }: { point: GpsPoint; onChange: (point: GpsPoint) => void }) {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const pointRef = useRef(point);
  const onChangeRef = useRef(onChange);
  const [mapError, setMapError] = useState("");

  useEffect(() => { pointRef.current = point; }, [point]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;
    let disposed = false;

    import("maplibre-gl").then((maplibregl) => {
      if (disposed || !mapElementRef.current) return;
      try {
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
          center: [pointRef.current.longitude, pointRef.current.latitude],
          zoom: 17,
          minZoom: 7,
          maxZoom: 19,
          attributionControl: true,
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        map.on("load", () => { setMapError(""); map.resize(); });
        map.on("moveend", () => {
          const center = map.getCenter();
          onChangeRef.current({ ...pointRef.current, latitude: center.lat, longitude: center.lng });
        });
        mapRef.current = map;
      } catch {
        setMapError("지도를 불러오지 못했어요. 직접 입력을 이용해주세요.");
      }
    }).catch(() => setMapError("지도를 불러오지 못했어요. 직접 입력을 이용해주세요."));

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="location-picker-map" aria-label="제보 위치 선택 지도">
      <div ref={mapElementRef} className="location-map-canvas" />
      {!mapError && <><span className="location-center-pin" aria-hidden="true">●</span><p className="location-map-guide">지도를 움직여 위험한 곳에 핀을 맞춰주세요.</p></>}
      {mapError && <p className="location-map-error" role="alert">{mapError}</p>}
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
  const [locationMapResetKey, setLocationMapResetKey] = useState(0);
  const [gpsMessage, setGpsMessage] = useState("");
  const [placeDescription, setPlaceDescription] = useState("");
  const [weatherStatus, setWeatherStatus] = useState<WeatherStatus>("idle");
  const [weatherSnapshot, setWeatherSnapshot] = useState<WeatherSnapshot | null>(null);
  const [reportTime, setReportTime] = useState(() => new Date().toISOString());
  const [locationValidation, setLocationValidation] = useState("");
  const [reportType, setReportType] = useState<(typeof filters)[number]>("단차");
  const [reportDescription, setReportDescription] = useState("");
  const [stepTwoValidation, setStepTwoValidation] = useState("");
  const [hasResearchConsent, setHasResearchConsent] = useState(false);
  const [consentValidation, setConsentValidation] = useState("");
  const [isDictating, setIsDictating] = useState(false);
  const [dictationMessage, setDictationMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [attachments, setAttachments] = useState<MediaAttachment[]>([]);
  const [mediaError, setMediaError] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const attachmentsRef = useRef<MediaAttachment[]>([]);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);

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
      if (event.key === "Escape") {
        if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
        speechRecognitionRef.current?.stop();
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
        setIsDictating(false);
        setReportOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => {
    if (!isRecording) return;
    const timer = window.setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [isRecording]);

  useEffect(() => { attachmentsRef.current = attachments; }, [attachments]);

  useEffect(() => {
    if (locationChoice !== "gps" || gpsStatus !== "success" || !gpsPoint) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setWeatherStatus("loading");
      const params = new URLSearchParams({
        latitude: String(gpsPoint.latitude),
        longitude: String(gpsPoint.longitude),
        current: "temperature_2m,weather_code",
        timezone: "Asia/Seoul",
      });
      fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: controller.signal })
        .then((response) => {
          if (!response.ok) throw new Error("weather request failed");
          return response.json();
        })
        .then((data: { current?: { temperature_2m?: number; weather_code?: number; time?: string } }) => {
          if (typeof data.current?.temperature_2m !== "number" || typeof data.current?.weather_code !== "number") throw new Error("weather response invalid");
          setWeatherSnapshot({
            temperature: data.current.temperature_2m,
            code: data.current.weather_code,
            observedAt: data.current.time ?? new Date().toISOString(),
          });
          setWeatherStatus("success");
        })
        .catch((error: Error) => {
          if (error.name === "AbortError") return;
          setWeatherSnapshot(null);
          setWeatherStatus("error");
        });
    }, 550);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [gpsPoint, gpsStatus, locationChoice]);

  useEffect(() => () => {
    mediaRecorderRef.current?.stop();
    speechRecognitionRef.current?.stop();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    attachmentsRef.current.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
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
    attachments.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
    mediaRecorderRef.current?.stop();
    speechRecognitionRef.current?.stop();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaRecorderRef.current = null;
    mediaStreamRef.current = null;
    setAttachments([]);
    setMediaError("");
    setIsRecording(false);
    setRecordingSeconds(0);
    setReportStep(1);
    setLocationChoice(null);
    setGpsStatus("idle");
    setGpsPoint(null);
    setLocationMapResetKey(0);
    setGpsMessage("");
    setPlaceDescription("");
    setWeatherStatus("idle");
    setWeatherSnapshot(null);
    setReportTime(new Date().toISOString());
    setLocationValidation("");
    setReportType("단차");
    setReportDescription("");
    setStepTwoValidation("");
    setHasResearchConsent(false);
    setConsentValidation("");
    setIsDictating(false);
    setDictationMessage("");
    setSubmitError("");
    setIsSubmitting(false);
    setReportOpen(true);
  };

  const closeReport = () => {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    speechRecognitionRef.current?.stop();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    setIsRecording(false);
    setIsDictating(false);
    setReportOpen(false);
  };

  const addFiles = (event: ChangeEvent<HTMLInputElement>, kind: MediaKind) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (selectedFiles.length === 0) return;
    const oversized = selectedFiles.find((file) => file.size > 80 * 1024 * 1024);
    if (oversized) {
      setMediaError("파일 한 개의 크기는 80MB 이하로 선택해주세요.");
      return;
    }
    setMediaError("");
    setAttachments((current) => {
      const available = Math.max(0, 5 - current.length);
      const next = selectedFiles.slice(0, available).map((file) => ({
        id: crypto.randomUUID(),
        kind,
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      if (selectedFiles.length > available) setMediaError("사진·영상·음성은 모두 합쳐 5개까지 넣을 수 있어요.");
      return [...current, ...next];
    });
  };

  const removeAttachment = (id: string) => {
    setAttachments((current) => {
      const target = current.find((attachment) => attachment.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((attachment) => attachment.id !== id);
    });
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !("MediaRecorder" in window)) {
      setMediaError("이 브라우저에서는 음성 녹음을 사용할 수 없어요. 녹음 파일을 선택해주세요.");
      return;
    }
    if (attachments.length >= 5) {
      setMediaError("사진·영상·음성은 모두 합쳐 5개까지 넣을 수 있어요.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const extension = mimeType.includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `현장음성-${Date.now()}.${extension}`, { type: mimeType });
        const attachment: MediaAttachment = { id: crypto.randomUUID(), kind: "audio", file, previewUrl: URL.createObjectURL(file) };
        setAttachments((current) => [...current, attachment].slice(0, 5));
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        setIsRecording(false);
      };
      setMediaError("");
      setRecordingSeconds(0);
      setIsRecording(true);
      recorder.start();
    } catch {
      setMediaError("마이크 권한이 필요해요. 권한을 허용하거나 녹음 파일을 선택해주세요.");
    }
  };

  const toggleDictation = () => {
    if (isDictating) {
      speechRecognitionRef.current?.stop();
      return;
    }
    if (isDictating) speechRecognitionRef.current?.stop();

    const recognitionConstructor = (
      window as Window & {
        SpeechRecognition?: SpeechRecognitionConstructor;
        webkitSpeechRecognition?: SpeechRecognitionConstructor;
      }
    ).SpeechRecognition ?? (
      window as Window & { webkitSpeechRecognition?: SpeechRecognitionConstructor }
    ).webkitSpeechRecognition;

    if (!recognitionConstructor) {
      setDictationMessage("이 브라우저에서는 말로 글쓰기를 지원하지 않아요. 직접 입력해주세요.");
      return;
    }

    if (isRecording) stopRecording();
    const recognition = new recognitionConstructor();
    recognition.lang = "ko-KR";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) {
        setReportDescription((current) => `${current}${current.trim() ? " " : ""}${transcript}`);
        setStepTwoValidation("");
        setDictationMessage("말한 내용을 설명에 입력했어요.");
      }
    };
    recognition.onerror = () => setDictationMessage("음성을 알아듣지 못했어요. 다시 눌러 말해주세요.");
    recognition.onend = () => { setIsDictating(false); speechRecognitionRef.current = null; };
    speechRecognitionRef.current = recognition;
    setDictationMessage("지금 말씀해주세요.");
    setIsDictating(true);
    recognition.start();
  };

  const goToLocationStep = () => {
    if (!reportDescription.trim()) {
      setStepTwoValidation("위험한 이유를 글이나 말로 알려주세요.");
      return;
    }
    speechRecognitionRef.current?.stop();
    if (isRecording) stopRecording();
    setStepTwoValidation("");
    setReportTime(new Date().toISOString());
    setReportStep(3);
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
        setLocationMapResetKey((current) => current + 1);
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
    setWeatherStatus("idle");
    setWeatherSnapshot(null);
  };

  const goToReviewStep = () => {
    const hasGps = locationChoice === "gps" && gpsStatus === "success" && gpsPoint;
    const hasManualLocation = locationChoice === "manual" && placeDescription.trim();
    if (!hasGps && !hasManualLocation) {
      setLocationValidation("현재 위치를 확인하거나 위험한 장소를 직접 입력해주세요.");
      return;
    }
    setLocationValidation("");
    setReportTime(new Date().toISOString());
    setReportStep(4);
  };

  const submitReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const hasGps = locationChoice === "gps" && gpsStatus === "success" && gpsPoint;
    const hasManualLocation = locationChoice === "manual" && placeDescription.trim();
    if (!hasGps && !hasManualLocation) {
      setLocationValidation("현재 위치를 확인하거나 주소·장소 설명 중 하나를 입력해주세요.");
      return;
    }
    if (!hasResearchConsent) {
      setConsentValidation("연구 목적의 수집·이용에 동의해야 제보할 수 있어요.");
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
        latitude: locationChoice === "gps" ? gpsPoint?.latitude ?? null : null,
        longitude: locationChoice === "gps" ? gpsPoint?.longitude ?? null : null,
        accuracy: locationChoice === "gps" ? gpsPoint?.accuracy ?? null : null,
        address: "",
        placeDescription: locationChoice === "manual" ? placeDescription : "",
        observedAt: new Date().toISOString(),
        weather: weatherSnapshot,
        media: attachments.map((attachment) => ({
          kind: attachment.kind,
          name: attachment.file.name,
          type: attachment.file.type,
          size: attachment.file.size,
        })),
      }),
    }).catch(() => null);
    setIsSubmitting(false);
    if (!response?.ok) {
      setSubmitError("기록을 저장하지 못했어요. 잠시 후 다시 시도해주세요.");
      return;
    }
    const saved = await response.json();
    if (saved.id && attachments.length > 0) {
      await storeReportMedia(saved.id, attachments).catch(() => {
        setMediaError("기록은 접수됐지만 이 기기의 미디어 보관에 실패했어요.");
      });
    }
    if (!isLoggedIn && saved.id) window.sessionStorage.setItem("jikeoro-pending-report-id", saved.id);
    setReportStep(5);
  };

  return (
    <main>
      <SiteHeader active="home" />

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">NEIGHBORHOOD WALKABILITY LAB · YEAR 01</p>
          <h1>
            걷다가 발견한 위험,
            <br />
            <span className="hero-line"><span>우리 동네의 더 나은 길</span>이 됩니다.</span>
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
            <a className="text-link" href={sitePath("/map")}>
              위험지도 둘러보기 <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div className="hero-note">
            <div className="avatar-stack" aria-hidden="true">
              <span>김</span><span>박</span><span>이</span>
            </div>
            <p><strong>전국 주민참여 조사 준비 중</strong><br />주민과 연구진이 함께 설계합니다.</p>
          </div>
        </div>

        <div className="hero-visual" aria-label="우리 동네 보행위험 지도 미리보기">
          <div className="visual-glow" />
          <div className="dashboard-card">
            <div className="dashboard-topbar">
              <div className="dashboard-heading">
                <span className="mini-label">LIVE WALKABILITY MAP</span>
                <strong>우리 동네 위험지도</strong>
              </div>
              <div className="dashboard-badges" aria-label="시범운영 지표">
                <div className="insight-badge coral-insight"><b>01</b><span>1차년도<br />시범운영</span></div>
                <div className="insight-badge dark-insight"><b>92%</b><span>위치정보<br />자동완성</span></div>
              </div>
            </div>
            <div className="hero-map map-surface neighborhood-map">
              <NeighborhoodIllustrationMap items={hazards.slice(0, 3)} />
              <div className="floating-report">
                <span className="report-thumb" aria-hidden="true"><i /><i /></span>
                <div><small>방금 등록된 기록</small><strong>보도 경계석 단차</strong><span>중앙로 · 2분 전</span></div>
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
        <p>전국 단위 주민참여 연구</p>
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
          <div className="explorer-map map-surface neighborhood-map">
            <NeighborhoodIllustrationMap items={filteredHazards} selectedId={selected.id} onSelect={setSelectedId} />
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
          <article><span className="step-number">02</span><div className="step-visual voice-visual"><i /><i /><i /><i /><i /></div><h3>사진·영상과 목소리를 남겨요</h3><p>큰 버튼을 눌러 촬영하고, 위험한 이유를 편하게 말해주세요.</p></article>
          <article><span className="step-number">03</span><div className="step-visual map-visual"><i /><b>✓</b></div><h3>위치정보를 확인해요</h3><p>위치와 시간이 기록되고, GPS 사용 시 날씨도 함께 저장됩니다.</p></article>
        </div>
      </section>

      <section className="project-section" id="project">
        <div className="project-copy">
          <p className="eyebrow light">YEAR 01 · NEIGHBORHOOD PILOT</p>
          <h2>좋은 도시는<br />잘 듣는 것에서 시작합니다.</h2>
          <p>지켜路는 행정 통계만으로는 보이지 않았던 일상의 보행위험을 주민과 고령자의 경험으로 기록하는 참여형 연구 프로젝트입니다.</p>
          <a href="mailto:healthdesignlab@kaist.ac.kr">프로젝트 문의하기 <span>↗</span></a>
        </div>
        <div className="project-metrics">
          <div><strong>전국</strong><span>우리 동네<br />참여 생활권</span></div>
          <div><strong>60<span>초</span></strong><span>목표 기록<br />완료 시간</span></div>
          <div><strong>4<span>종</span></strong><span>사진·영상·음성·텍스트<br />참여 방식</span></div>
          <p>※ 수치는 1차년도 프로토타입의 초기 설계 목표이며 시범운영 결과에 따라 조정됩니다.</p>
        </div>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top"><span className="brand-mark">路</span><span><strong>지켜路</strong><small>우리 동네 보행안전 지도</small></span></a>
        <p>KAIST Health Design Lab · 1차년도 연구 프로토타입</p>
        <p><a className="admin-entry-link" href={sitePath("/admin/login")}>관리자·기관 로그인</a><br />© 2026 JIKEORO. Prototype for research.</p>
      </footer>

      <button className="mobile-report-button" onClick={openReport}><span>＋</span> 위험요소 기록하기</button>

      {reportOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && closeReport()}>
          <section className="report-modal" role="dialog" aria-modal="true" aria-labelledby="report-title">
            <button className="modal-close" onClick={closeReport} aria-label="닫기">×</button>
            {reportStep < 5 && <div className="modal-progress"><span style={{ width: `${(reportStep / 4) * 100}%` }} /></div>}
            {reportStep === 1 && (
              <>
                <p className="modal-step">1 / 4</p>
                <h2 id="report-title">위험 모습을<br />남겨주세요.</h2>
                <p className="modal-help">사진이나 영상을 촬영하거나 기기에 저장된 자료를 선택해주세요.</p>
                <div className="media-picker-grid">
                  <label className="media-picker-card">
                    <input type="file" accept="image/*" capture="environment" multiple onChange={(event) => addFiles(event, "image")} />
                    <span className="upload-icon" aria-hidden="true">＋</span>
                    <strong>사진 촬영·선택</strong>
                    <small>카메라 또는 사진첩</small>
                  </label>
                  <label className="media-picker-card">
                    <input type="file" accept="video/*" capture="environment" multiple onChange={(event) => addFiles(event, "video")} />
                    <span className="upload-icon video-icon" aria-hidden="true">▶</span>
                    <strong>영상 촬영·선택</strong>
                    <small>카메라 또는 보관함</small>
                  </label>
                </div>
                {attachments.some((attachment) => attachment.kind !== "audio") && (
                  <div className="media-preview-list" aria-label="선택한 사진과 영상">
                    {attachments.filter((attachment) => attachment.kind !== "audio").map((attachment) => (
                      <article className={`media-preview ${attachment.kind}`} key={attachment.id}>
                        {attachment.kind === "image" && <img src={attachment.previewUrl} alt="선택한 현장 사진 미리보기" />}
                        {/* 사용자가 방금 선택한 원본 영상의 미리보기이며 자막 파일은 아직 존재하지 않습니다. */}
                        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                        {attachment.kind === "video" && <video src={attachment.previewUrl} controls preload="metadata" aria-label="선택한 현장 영상 미리보기" />}
                        <div><strong>{attachment.kind === "image" ? "사진" : "영상"}</strong><small>{attachment.file.name}</small></div>
                        <button type="button" onClick={() => removeAttachment(attachment.id)} aria-label={`${attachment.file.name} 삭제`}>×</button>
                      </article>
                    ))}
                  </div>
                )}
                <p className="media-privacy">얼굴과 차량번호가 보이면 제출 전에 확인해주세요. 파일은 이 기기에 안전하게 보관됩니다.</p>
                {mediaError && <p className="media-error" role="alert">{mediaError}</p>}
                <button className="modal-primary" onClick={() => setReportStep(2)}>{attachments.length > 0 ? "선택한 자료와 계속하기" : "자료 없이 계속하기"} <span>→</span></button>
              </>
            )}
            {reportStep === 2 && (
              <>
                <p className="modal-step">2 / 4</p>
                <h2 id="report-title">위험한 이유를<br />알려주세요.</h2>
                <fieldset>
                  <legend>위험요소 유형</legend>
                  <div className="type-options">
                    {filters.slice(1).map((item) => <label key={item}><input type="radio" name="hazard" checked={reportType === item} onChange={() => setReportType(item)} /><span>{item}</span></label>)}
                  </div>
                </fieldset>
                <label className="text-field">
                  <span>설명</span>
                  <textarea
                    value={reportDescription}
                    onChange={(event) => { setReportDescription(event.target.value); setStepTwoValidation(""); }}
                    placeholder="예: 보도블록 높이 차이 때문에 발이 걸릴 것 같아요."
                    rows={4}
                  />
                </label>
                <div className="description-voice-tools">
                  <button className={isDictating ? "active" : ""} type="button" onClick={toggleDictation}>
                    <span aria-hidden="true">{isDictating ? "■" : "🎙"}</span>
                    {isDictating ? "말하기 끝내기" : "말로 글쓰기"}
                  </button>
                  <p aria-live="polite">{dictationMessage || "말한 내용이 설명 칸에 글자로 입력됩니다."}</p>
                </div>
                <div className="voice-recorder step-two-recorder">
                  <div>
                    <strong>현장음 녹음</strong>
                    <small>{isRecording ? `${Math.floor(recordingSeconds / 60)}:${String(recordingSeconds % 60).padStart(2, "0")} 녹음 중` : "현장의 소리를 별도 파일로 남길 수 있어요."}</small>
                  </div>
                  <button className={isRecording ? "recording" : ""} type="button" onClick={isRecording ? stopRecording : startRecording}>
                    <span aria-hidden="true">{isRecording ? "■" : "●"}</span>{isRecording ? "녹음 끝내기" : "현장음 녹음"}
                  </button>
                  <label className="audio-file-button">
                    <input type="file" accept="audio/*" onChange={(event) => addFiles(event, "audio")} />
                    녹음 파일 선택
                  </label>
                </div>
                {attachments.some((attachment) => attachment.kind === "audio") && (
                  <div className="media-preview-list audio-preview-list" aria-label="선택한 음성">
                    {attachments.filter((attachment) => attachment.kind === "audio").map((attachment) => (
                      <article className="media-preview audio" key={attachment.id}>
                        <span className="audio-preview-icon" aria-hidden="true">♪</span>
                        {/* 사용자가 방금 녹음하거나 선택한 원본 음성의 미리듣기입니다. */}
                        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                        <audio src={attachment.previewUrl} controls aria-label="녹음한 현장 음성 미리듣기" />
                        <div><strong>현장음</strong><small>{attachment.file.name}</small></div>
                        <button type="button" onClick={() => removeAttachment(attachment.id)} aria-label={`${attachment.file.name} 삭제`}>×</button>
                      </article>
                    ))}
                  </div>
                )}
                {stepTwoValidation && <p className="location-validation" role="alert">{stepTwoValidation}</p>}
                {mediaError && <p className="media-error" role="alert">{mediaError}</p>}
                <div className="modal-navigation">
                  <button className="modal-secondary" type="button" onClick={() => setReportStep(1)}>← 이전</button>
                  <button className="modal-primary" type="button" onClick={goToLocationStep}>위치 입력하기 <span>→</span></button>
                </div>
              </>
            )}
            {reportStep === 3 && (
              <>
                <p className="modal-step">3 / 4</p>
                <h2 id="report-title">위험한 장소를<br />확인해주세요.</h2>
                <fieldset className="location-fieldset">
                  <legend>위치</legend>
                  <p className="field-guide">GPS 지도의 핀을 맞추거나 알고 있는 주소·장소를 직접 알려주세요.</p>
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

                  {locationChoice === "gps" && gpsStatus !== "success" && (
                    <div className={`location-result ${gpsStatus}`} aria-live="polite">
                      {gpsStatus === "loading" && <><i className="location-loader" /><div><strong>현재 위치를 확인하고 있어요</strong><small>잠시만 기다려주세요.</small></div></>}
                      {gpsStatus === "error" && <><i className="location-error-icon">!</i><div><strong>위치를 가져오지 못했어요</strong><small>{gpsMessage}</small></div><button type="button" onClick={chooseManualLocation}>직접 입력</button></>}
                    </div>
                  )}

                  {locationChoice === "gps" && gpsStatus === "success" && gpsPoint && (
                    <div className="gps-map-block">
                      <LocationPickerMap key={locationMapResetKey} point={gpsPoint} onChange={(nextPoint) => { setGpsPoint(nextPoint); setLocationValidation(""); }} />
                      <div className="gps-map-meta">
                        <span><i className="location-dot" />선택한 위치</span>
                        <small>위도 {gpsPoint.latitude.toFixed(5)} · 경도 {gpsPoint.longitude.toFixed(5)}</small>
                        <button type="button" onClick={requestCurrentLocation}>현재 위치로 돌아가기</button>
                      </div>
                    </div>
                  )}

                  {locationChoice === "manual" && (
                    <div className="manual-location-fields">
                      <label className="input-field">
                        <span>어디 앞인지 알려주기</span>
                        <input
                          type="text"
                          value={placeDescription}
                          onChange={(event) => { setPlaceDescription(event.target.value); setLocationValidation(""); }}
                          placeholder="예: 우리 동네 주민센터 앞 횡단보도"
                        />
                      </label>
                      <p className="manual-hint">건물이나 출입구처럼 찾기 쉬운 기준을 함께 적어주세요.</p>
                    </div>
                  )}
                  <p className="privacy-note">위치정보는 이 위험 기록의 장소를 확인하는 용도로만 사용됩니다.</p>
                  {locationValidation && <p className="location-validation" role="alert">{locationValidation}</p>}
                </fieldset>
                <div className="modal-navigation">
                  <button className="modal-secondary" type="button" onClick={() => setReportStep(2)}>← 이전</button>
                  <button className="modal-primary" type="button" onClick={goToReviewStep}>제보내용 확인하기 <span>→</span></button>
                </div>
              </>
            )}
            {reportStep === 4 && (
              <form onSubmit={submitReport}>
                <p className="modal-step">4 / 4</p>
                <h2 id="report-title">제보내용을<br />확인해주세요.</h2>
                <section className="report-review" aria-labelledby="report-review-title">
                  <h3 id="report-review-title">제보내용 확인</h3>
                  <dl>
                    <div><dt>위험유형</dt><dd>{reportType}</dd></div>
                    <div><dt>위치</dt><dd>{locationChoice === "gps" && gpsPoint ? `지도에서 선택한 위치 (${gpsPoint.latitude.toFixed(5)}, ${gpsPoint.longitude.toFixed(5)})` : placeDescription || "위치 입력 전"}</dd></div>
                    <div><dt>첨부</dt><dd>사진 {attachments.filter((item) => item.kind === "image").length} · 영상 {attachments.filter((item) => item.kind === "video").length} · 음성 {attachments.filter((item) => item.kind === "audio").length}</dd></div>
                  </dl>
                </section>
                <div className="auto-info">
                  {locationChoice === "gps" && <span>{weatherStatus === "loading" ? "날씨 확인 중" : weatherStatus === "success" && weatherSnapshot ? `${describeWeather(weatherSnapshot.code).icon} ${Math.round(weatherSnapshot.temperature)}°C ${describeWeather(weatherSnapshot.code).label}` : "날씨 확인 불가"}</span>}
                  <span>제보시각 {new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(reportTime))}</span>
                </div>
                <label className="research-consent">
                  <input
                    type="checkbox"
                    checked={hasResearchConsent}
                    onChange={(event) => { setHasResearchConsent(event.target.checked); setConsentValidation(""); }}
                  />
                  <span>위치와 제보내용을 연구목적으로 수집하는 것에 동의합니다.</span>
                </label>
                {consentValidation && <p className="location-validation" role="alert">{consentValidation}</p>}
                {submitError && <p className="location-validation" role="alert">{submitError}</p>}
                <div className="modal-navigation">
                  <button className="modal-secondary" type="button" onClick={() => setReportStep(3)}>← 이전</button>
                  <button className="modal-primary" type="submit" disabled={isSubmitting || !hasResearchConsent}>{isSubmitting ? "저장하고 있어요" : "제보 완료하기"} <span>→</span></button>
                </div>
              </form>
            )}
            {reportStep === 5 && (
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
