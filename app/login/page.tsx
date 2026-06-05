"use client";

import { useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import Hero from "../Hero";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const supabase = getBrowserSupabase();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        // Don't auto-create accounts — only invited users can sign in.
        shouldCreateUser: false,
      },
    });
    setLoading(false);
    if (error) {
      setErr(error.message);
    } else {
      setSent(true);
    }
  };

  return (
    <main className="max-w-md mx-auto px-4 sm:px-6 pb-12">
      <Hero tagline="MLB Batter Hits +EV" meta="Invite-only · sign in to continue" />

      {sent ? (
        <div className="rounded-[14px] bg-[var(--green-faint)] border border-ppgreen/30 p-4 text-ppgreen text-sm">
          Check your email for a sign-in link. The link expires in 1 hour.
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <div className="text-[10px] tracking-[1.5px] uppercase text-dim mb-1.5">
              Email
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full bg-panel border border-ppborder2 rounded-[10px] px-3 py-2.5 text-sm text-pptext placeholder:text-dim focus:border-ppcyan focus:outline-none transition-colors"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full px-3 py-2.5 bg-ppcyan border border-ppcyan text-[#06101e] rounded-[10px] text-[11px] font-bold tracking-[1.5px] uppercase hover:opacity-90 disabled:opacity-50 transition-opacity"
            style={{ boxShadow: "0 0 16px rgba(0,212,255,0.25)" }}
          >
            {loading ? "Sending…" : "Email me a sign-in link"}
          </button>
          {err && (
            <div className="bg-[var(--red-dim)] border border-ppred/40 text-ppred rounded-[10px] p-3 text-xs">
              {err}
            </div>
          )}
          <p className="text-xs text-muted pt-2 text-center">
            Invite-only. Email must already be added by an admin.
          </p>
        </form>
      )}
    </main>
  );
}
