"use client";

import type { ResidentAvatarConfig } from "../lib/resident-avatar";
import { sitePath } from "../lib/site-path";

export function ResidentAvatar({
  label = "내 캐릭터",
}: {
  config?: ResidentAvatarConfig | null;
  greeting?: boolean;
  label?: string;
}) {
  return (
    <img className="resident-avatar" src={sitePath("/jikeoro-brand-v6.png")} alt={label} />
  );
}
