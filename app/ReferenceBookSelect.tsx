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
    <label className="flex items-center gap-2 text-xs text-neutral-400">
      Reference:
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ReferenceBookKey)}
        className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-100"
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
