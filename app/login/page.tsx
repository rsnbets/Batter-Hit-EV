"use client";

import { useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";

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
    <main className="max-w-sm mx-auto p-6 mt-20">
      <h1 className="text-2xl font-bold mb-1">MLB Batter Hits +EV</h1>
      <p className="text-sm text-neutral-400 mb-6">Sign in to continue.</p>

      {sent ? (
        <div className="rounded bg-emerald-950/40 border border-emerald-800/60 p-4 text-emerald-200 text-sm">
          Check your email for a sign-in link. The link expires in 1 hour.
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <div className="text-xs text-neutral-400 mb-1">Email</div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded font-medium text-sm disabled:opacity-50"
          >
            {loading ? "Sending…" : "Email me a sign-in link"}
          </button>
          {err && (
            <div className="bg-red-950/60 border border-red-800 text-red-200 rounded p-2 text-xs">
              {err}
            </div>
          )}
          <p className="text-xs text-neutral-500 pt-2">
            Invite-only. Email must already be added by an admin.
          </p>
        </form>
      )}
    </main>
  );
}
