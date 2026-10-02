export const hazardCategories = ["인도", "횡단보도", "조도", "날씨 관련 위험", "기타"] as const;

export type HazardCategory = (typeof hazardCategories)[number];

export const hazardFilters = ["전체", ...hazardCategories] as const;

export function normalizeHazardCategory(value?: string | null): HazardCategory {
  if (value === "단차" || value === "적치물") return "인도";
  if (value === "포트홀") return "횡단보도";
  if (hazardCategories.includes(value as HazardCategory)) return value as HazardCategory;
  return "기타";
}
