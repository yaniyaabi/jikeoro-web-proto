import type { HazardCategory } from "../lib/hazard-categories";
import { sitePath } from "../lib/site-path";

type HazardPhoto = {
  file: string;
  alt: string;
};

const hazardPhotos: Record<string, HazardPhoto> = {
  "인도": {
    file: "hazard-sidewalk.webp",
    alt: "보행보조기 앞바퀴가 높은 보도 경계석 앞에 멈춰 있는 현장 사진",
  },
  "단차": {
    file: "hazard-sidewalk.webp",
    alt: "보행보조기 앞바퀴가 높은 보도 경계석 앞에 멈춰 있는 현장 사진",
  },
  "횡단보도": {
    file: "hazard-crosswalk.webp",
    alt: "보행 신호가 얼마 남지 않은 횡단보도를 지팡이를 짚은 보행자가 건너는 현장 사진",
  },
  "포트홀": {
    file: "hazard-crosswalk.webp",
    alt: "보행 신호가 얼마 남지 않은 횡단보도를 지팡이를 짚은 보행자가 건너는 현장 사진",
  },
  "조도": {
    file: "hazard-lighting.webp",
    alt: "가로등 사이의 어두운 구간이 길게 이어진 아파트 보행로 현장 사진",
  },
  "날씨 관련 위험": {
    file: "hazard-weather.webp",
    alt: "얇은 얼음이 넓게 얼어 미끄러운 겨울철 보행로 현장 사진",
  },
  "기타": {
    file: "hazard-obstruction.webp",
    alt: "상자와 입간판이 보행로를 막아 통행 공간이 좁아진 현장 사진",
  },
};

const fallbackPhoto = hazardPhotos["기타"];

export function HazardIllustration({ type }: { type: HazardCategory | string }) {
  const photo = hazardPhotos[type] ?? fallbackPhoto;

  return (
    <img
      className="hazard-illustration-svg"
      src={sitePath(`/images/${photo.file}`)}
      alt={photo.alt}
      loading="lazy"
      decoding="async"
    />
  );
}
