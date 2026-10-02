export const hazardCategories = ["인도", "횡단보도", "조도", "날씨 관련 위험", "기타"] as const;

export type HazardCategory = (typeof hazardCategories)[number];

export const hazardFilters = ["전체", ...hazardCategories] as const;

export const hazardIconFiles: Record<HazardCategory, string> = {
  인도: "category-sidewalk.png",
  횡단보도: "category-crosswalk.png",
  조도: "category-lighting.png",
  "날씨 관련 위험": "category-weather.png",
  기타: "category-other.png",
};

export const hazardPinFiles: Record<HazardCategory, string> = {
  인도: "pin-sidewalk.png",
  횡단보도: "pin-crosswalk.png",
  조도: "pin-lighting.png",
  "날씨 관련 위험": "pin-weather.png",
  기타: "pin-other.png",
};

export function normalizeHazardCategory(value?: string | null): HazardCategory {
  if (value === "단차" || value === "적치물") return "인도";
  if (value === "포트홀") return "횡단보도";
  if (hazardCategories.includes(value as HazardCategory)) return value as HazardCategory;
  return "기타";
}
