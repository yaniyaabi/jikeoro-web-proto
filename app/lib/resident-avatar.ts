export type ResidentAvatarConfig = {
  skin: "peach" | "sand" | "brown" | "deep";
  hair: "wave" | "short" | "bun" | "bob" | "hijab";
  hairColor: "espresso" | "walnut" | "amber" | "silver";
  top: "purple" | "yellow" | "mint" | "coral" | "blue";
  background: "pink" | "sky" | "lilac" | "lemon" | "mint";
  accessory: "none" | "round" | "square" | "freckles" | "beard" | "mustache" | "cap";
};

export const DEFAULT_RESIDENT_AVATAR: ResidentAvatarConfig = {
  skin: "deep",
  hair: "short",
  hairColor: "espresso",
  top: "coral",
  background: "pink",
  accessory: "none",
};

const AVATAR_OPTIONS = {
  skin: ["peach", "sand", "brown", "deep"],
  hair: ["wave", "short", "bun", "bob", "hijab"],
  hairColor: ["espresso", "walnut", "amber", "silver"],
  top: ["purple", "yellow", "mint", "coral", "blue"],
  background: ["pink", "sky", "lilac", "lemon", "mint"],
  accessory: ["none", "round", "square", "freckles", "beard", "mustache", "cap"],
} as const;

export function normalizeResidentAvatar(value: unknown): ResidentAvatarConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_RESIDENT_AVATAR;
  const candidate = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(AVATAR_OPTIONS).map(([key, options]) => [
      key,
      options.includes(candidate[key] as never)
        ? candidate[key]
        : DEFAULT_RESIDENT_AVATAR[key as keyof ResidentAvatarConfig],
    ]),
  ) as ResidentAvatarConfig;
}
