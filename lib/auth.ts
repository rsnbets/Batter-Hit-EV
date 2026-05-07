import { getServerSupabase } from "./supabase/server";

/**
 * Returns the current user's id, with a localhost-only dev bypass.
 *
 * In development, if DEV_USER_ID is set in .env.local, it's returned when no
 * real Supabase session exists — so you can iterate without going through the
 * magic-link email flow on every cold start.
 *
 * DEV_USER_ID must NOT be set in Vercel production env vars; if it ever leaks
 * to prod, NODE_ENV=production gates it out as a defense-in-depth check.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const supabase = getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) return user.id;

  if (
    process.env.NODE_ENV === "development" &&
    process.env.DEV_USER_ID
  ) {
    return process.env.DEV_USER_ID;
  }
  return null;
}
