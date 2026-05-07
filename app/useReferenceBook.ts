"use client";

import { useEffect, useState } from "react";
import {
  REFERENCE_BOOK_OPTIONS,
  type ReferenceBookKey,
} from "@/lib/types";

const STORAGE_KEY = "referenceBook";
const VALID_KEYS = new Set(REFERENCE_BOOK_OPTIONS.map((o) => o.key));

/**
 * Persists the user's selected "reference book" in localStorage and keeps the
 * value in sync across tabs / pages via the storage event.
 *
 * Default is "pool" (sharp pool average — current Pin-wt behavior).
 */
export function useReferenceBook(): [ReferenceBookKey, (k: ReferenceBookKey) => void] {
  const [ref, setRef] = useState<ReferenceBookKey>("pool");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw && VALID_KEYS.has(raw as ReferenceBookKey)) {
        setRef(raw as ReferenceBookKey);
      }
    } catch {
      // localStorage may be unavailable in some sandboxes — fall back to default.
    }
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === STORAGE_KEY &&
        e.newValue &&
        VALID_KEYS.has(e.newValue as ReferenceBookKey)
      ) {
        setRef(e.newValue as ReferenceBookKey);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = (k: ReferenceBookKey) => {
    setRef(k);
    try {
      localStorage.setItem(STORAGE_KEY, k);
    } catch {
      // Same as above — non-fatal.
    }
  };

  return [ref, update];
}
