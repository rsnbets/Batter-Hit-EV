"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export default function UserBadge() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, []);

  if (!email) return null;

  return (
    <form action="/auth/sign-out" method="post" className="flex items-center gap-2">
      <span className="text-xs text-neutral-500">{email}</span>
      <button
        type="submit"
        className="text-xs text-neutral-400 hover:text-neutral-200 underline underline-offset-2"
      >
        Sign out
      </button>
    </form>
  );
}
