import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import "react-native-url-polyfill/auto";

import { Database } from "./database.types";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export const isSupabaseConfigured = supabaseUrl.length > 0 && supabaseAnonKey.length > 0;

let cachedClient: SupabaseClient<Database> | null = null;

export function getSupabaseClient() {
  if (!isSupabaseConfigured) {
    return null;
  }

  if (!cachedClient) {
    cachedClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }

  return cachedClient;
}
