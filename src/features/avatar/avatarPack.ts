import { SupabaseClient } from "@supabase/supabase-js";

import { Database } from "../../lib/database.types";

export const AVATAR_EXPRESSIONS = ["neutral", "happy", "angry", "crying"] as const;

export type AvatarExpression = (typeof AVATAR_EXPRESSIONS)[number];

export function avatarExpressionLabel(expression: AvatarExpression): string {
  switch (expression) {
    case "neutral":
      return "Neutral";
    case "happy":
      return "Happy";
    case "angry":
      return "Angry";
    case "crying":
      return "Crying";
    default:
      return expression;
  }
}

export async function createSignedAvatarUrl(
  supabase: SupabaseClient<Database>,
  storagePath: string,
  expiresInSeconds = 60 * 60,
): Promise<string | null> {
  const { data, error } = await supabase.storage.from("avatar-packs").createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data?.signedUrl) {
    return null;
  }

  return data.signedUrl;
}
