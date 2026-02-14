import { SupabaseClient } from "@supabase/supabase-js";

import { Database } from "../../lib/database.types";

export const AVATAR_EXPRESSIONS = ["neutral", "happy", "angry", "crying"] as const;
export const AVATAR_STYLE_OPTIONS = [
  { id: "storybook", label: "Storybook" },
  { id: "comic", label: "Comic" },
  { id: "anime-soft", label: "Anime Soft" },
  { id: "watercolor", label: "Watercolor" },
  { id: "3d-toy", label: "3D Toy" },
  { id: "pixel", label: "Pixel" },
  { id: "paper-cut", label: "Paper Cut" },
  { id: "flat-minimal", label: "Flat Minimal" },
] as const;

export const AVATAR_PACKS_BUCKET = "avatar-packs";
export const AVATAR_ORIGINALS_BUCKET = "avatar-originals";

export type AvatarExpression = (typeof AVATAR_EXPRESSIONS)[number];
export type AvatarStyleId = (typeof AVATAR_STYLE_OPTIONS)[number]["id"];

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
  const { data, error } = await supabase.storage.from(AVATAR_PACKS_BUCKET).createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data?.signedUrl) {
    return null;
  }

  return data.signedUrl;
}

export async function createSignedOriginalAvatarUrl(
  supabase: SupabaseClient<Database>,
  storagePath: string,
  expiresInSeconds = 60 * 60,
): Promise<string | null> {
  const { data, error } = await supabase
    .storage
    .from(AVATAR_ORIGINALS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    return null;
  }

  return data.signedUrl;
}

export function buildAvatarOriginalFolder(familyId: string, userId: string): string {
  return `${familyId}/${userId}`;
}

export function buildAvatarOriginalPath(familyId: string, userId: string, extension: string): string {
  return `${buildAvatarOriginalFolder(familyId, userId)}/original.${extension}`;
}

export function resolveImageExtension(mimeType?: string | null, fileName?: string | null): string {
  if (fileName) {
    const parts = fileName.split(".");
    if (parts.length > 1) {
      const rawExt = parts[parts.length - 1]?.trim().toLowerCase();
      if (rawExt) {
        return rawExt;
      }
    }
  }

  if (!mimeType) {
    return "jpg";
  }

  if (mimeType.includes("png")) {
    return "png";
  }

  if (mimeType.includes("webp")) {
    return "webp";
  }

  if (mimeType.includes("heic")) {
    return "heic";
  }

  if (mimeType.includes("heif")) {
    return "heif";
  }

  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) {
    return "jpg";
  }

  return "jpg";
}

export async function findExistingOriginalAvatarPath(
  supabase: SupabaseClient<Database>,
  familyId: string,
  userId: string,
): Promise<string | null> {
  const folder = buildAvatarOriginalFolder(familyId, userId);
  const { data, error } = await supabase.storage.from(AVATAR_ORIGINALS_BUCKET).list(folder, {
    limit: 50,
    sortBy: { column: "name", order: "asc" },
  });

  if (error || !data || data.length === 0) {
    return null;
  }

  const names = data
    .map((item) => item.name)
    .filter((name): name is string => typeof name === "string" && name.length > 0);

  const priority = ["original.jpg", "original.jpeg", "original.png", "original.webp", "original.heic", "original.heif"];
  for (const candidate of priority) {
    if (names.includes(candidate)) {
      return `${folder}/${candidate}`;
    }
  }

  const fallback = names.find((name) => name.startsWith("original."));
  return fallback ? `${folder}/${fallback}` : null;
}
