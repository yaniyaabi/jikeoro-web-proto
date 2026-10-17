"use client";

import { ResidentAvatar } from "./resident-avatar";
import type { ResidentAvatarConfig } from "../lib/resident-avatar";

const RESIDENT_AVATARS: Array<{ name: string; config: ResidentAvatarConfig }> = [
  { name: "씩씩한 지킴이", config: { skin: "deep", hair: "short", hairColor: "espresso", top: "coral", background: "pink", accessory: "none" } },
  { name: "수염 난 지킴이", config: { skin: "sand", hair: "short", hairColor: "walnut", top: "blue", background: "sky", accessory: "beard" } },
  { name: "주근깨 지킴이", config: { skin: "peach", hair: "bob", hairColor: "amber", top: "mint", background: "mint", accessory: "freckles" } },
  { name: "안경 쓴 지킴이", config: { skin: "brown", hair: "bun", hairColor: "espresso", top: "purple", background: "lilac", accessory: "round" } },
  { name: "모자 쓴 지킴이", config: { skin: "deep", hair: "short", hairColor: "espresso", top: "yellow", background: "lemon", accessory: "cap" } },
  { name: "은빛 수염 지킴이", config: { skin: "sand", hair: "short", hairColor: "silver", top: "coral", background: "sky", accessory: "mustache" } },
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
