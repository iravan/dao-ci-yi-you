import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

export function browserSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const schema = (process.env.NEXT_PUBLIC_DB_SCHEMA || "dao_ci_yi_you") as "public";
  client = url && key ? createClient(url, key, { db: { schema } }) : null;
  return client;
}
