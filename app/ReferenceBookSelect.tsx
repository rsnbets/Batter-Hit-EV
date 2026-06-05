"use client";

import {
  REFERENCE_BOOK_OPTIONS,
  type ReferenceBookKey,
} from "@/lib/types";

export default function ReferenceBookSelect({
  value,
  onChange,
}: {
  value: ReferenceBookKey;
  onChange: (k: ReferenceBookKey) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[10px] tracking-[1.5px] uppercase text-dim">
      Ref
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ReferenceBookKey)}
        className="bg-panel border border-ppborder2 rounded-[10px] px-2.5 py-1.5 text-[11px] font-bold tracking-[1px] text-pptext hover:border-ppcyan focus:border-ppcyan focus:outline-none transition-colors"
      >
        {REFERENCE_BOOK_OPTIONS.map((opt) => (
          <option key={opt.key} value={opt.key}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
