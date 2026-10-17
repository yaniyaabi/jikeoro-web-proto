"use client";

import { ResidentAvatar } from "./resident-avatar";
import type { ResidentAvatarConfig } from "../lib/resident-avatar";

const RESIDENT_AVATARS: Array<{ name: string; config: ResidentAvatarConfig }> = [
  { name: "동그란 안경 지킴이", config: { skin: "peach", hair: "wave", hairColor: "walnut", top: "purple", background: "lemon", accessory: "round" } },
  { name: "짧은 머리 지킴이", config: { skin: "brown", hair: "short", hairColor: "espresso", top: "coral", background: "lilac", accessory: "none" } },
  { name: "묶은 머리 지킴이", config: { skin: "deep", hair: "bun", hairColor: "espresso", top: "yellow", background: "mint", accessory: "round" } },
  { name: "단발머리 지킴이", config: { skin: "sand", hair: "bob", hairColor: "walnut", top: "yellow", background: "lilac", accessory: "none" } },
  { name: "히잡을 쓴 지킴이", config: { skin: "peach", hair: "hijab", hairColor: "walnut", top: "purple", background: "pink", accessory: "round" } },
  { name: "은빛 머리 지킴이", config: { skin: "sand", hair: "short", hairColor: "silver", top: "coral", background: "sky", accessory: "square" } },
  { name: "주근깨 지킴이", config: { skin: "sand", hair: "wave", hairColor: "amber", top: "mint", background: "lemon", accessory: "freckles" } },
  { name: "네모 안경 지킴이", config: { skin: "deep", hair: "bob", hairColor: "espresso", top: "blue", background: "sky", accessory: "square" } },
  { name: "민트 옷 지킴이", config: { skin: "brown", hair: "bun", hairColor: "walnut", top: "mint", background: "pink", accessory: "none" } },
  { name: "밝은 머리 지킴이", config: { skin: "peach", hair: "bob", hairColor: "silver", top: "blue", background: "mint", accessory: "round" } },
];

function isSameAvatar(left: ResidentAvatarConfig, right: ResidentAvatarConfig) {
  return Object.keys(left).every((key) => left[key as keyof ResidentAvatarConfig] === right[key as keyof ResidentAvatarConfig]);
}

export function ResidentAvatarBuilder({ value, onChange }: { value: ResidentAvatarConfig; onChange: (next: ResidentAvatarConfig) => void }) {
  return (
    <fieldset className="avatar-builder avatar-picker">
      <legend>내 캐릭터 고르기</legend>
      <p>마음에 드는 동네지킴이를 하나 선택해주세요.</p>
      <div className="avatar-preset-grid" role="radiogroup" aria-label="주민 캐릭터 선택">
        {RESIDENT_AVATARS.map((avatar, index) => {
          const selected = isSameAvatar(value, avatar.config);
          return (
            <button type="button" role="radio" aria-checked={selected} aria-label={avatar.name} title={avatar.name} className={selected ? "selected" : ""} key={avatar.name} onClick={() => onChange(avatar.config)}>
              <ResidentAvatar config={avatar.config} label="" />
              <span aria-hidden="true">{selected ? "✓" : index + 1}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

