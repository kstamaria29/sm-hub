import { SupabaseClient } from "@supabase/supabase-js";

import { Database } from "../../lib/database.types";

export const AVATAR_EXPRESSIONS = ["neutral", "happy", "angry", "crying"] as const;
export const AVATAR_STYLE_OPTIONS = [
  { id: "anime", label: "Anime" },
  { id: "pixar", label: "Pixar" },
  { id: "caricature", label: "Caricature" },
] as const;

export const AVATAR_PACKS_BUCKET = "avatar-packs";
export const AVATAR_ORIGINALS_BUCKET = "avatar-originals";

export type AvatarExpression = (typeof AVATAR_EXPRESSIONS)[number];
export type AvatarStyleId = (typeof AVATAR_STYLE_OPTIONS)[number]["id"];

type SignedUrlCacheEntry = {
  signedUrl: string;
  expiresAtMs: number;
};

const SIGNED_URL_REFRESH_BUFFER_MS = 2 * 60 * 1000;
const signedUrlCache = new Map<string, SignedUrlCacheEntry>();

function buildSignedUrlCacheKey(bucket: string, storagePath: string): string {
  return `${bucket}:${storagePath}`;
}

function getCachedSignedUrl(bucket: string, storagePath: string): string | null {
  const key = buildSignedUrlCacheKey(bucket, storagePath);
  const cached = signedUrlCache.get(key);
  if (!cached) {
    return null;
  }

  if (cached.expiresAtMs - Date.now() <= SIGNED_URL_REFRESH_BUFFER_MS) {
    signedUrlCache.delete(key);
    return null;
  }

  return cached.signedUrl;
}

function setCachedSignedUrl(bucket: string, storagePath: string, signedUrl: string, expiresInSeconds: number): void {
  const key = buildSignedUrlCacheKey(bucket, storagePath);
  signedUrlCache.set(key, {
    signedUrl,
    expiresAtMs: Date.now() + expiresInSeconds * 1000,
  });
}

export function clearAvatarSignedUrlCache(): void {
  signedUrlCache.clear();
}

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
  const cachedSignedUrl = getCachedSignedUrl(AVATAR_PACKS_BUCKET, storagePath);
  if (cachedSignedUrl) {
    return cachedSignedUrl;
  }

  const { data, error } = await supabase.storage.from(AVATAR_PACKS_BUCKET).createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data?.signedUrl) {
    return null;
  }

  setCachedSignedUrl(AVATAR_PACKS_BUCKET, storagePath, data.signedUrl, expiresInSeconds);
  return data.signedUrl;
}

export async function createSignedOriginalAvatarUrl(
  supabase: SupabaseClient<Database>,
  storagePath: string,
  expiresInSeconds = 60 * 60,
): Promise<string | null> {
  const cachedSignedUrl = getCachedSignedUrl(AVATAR_ORIGINALS_BUCKET, storagePath);
  if (cachedSignedUrl) {
    return cachedSignedUrl;
  }

  const { data, error } = await supabase
    .storage
    .from(AVATAR_ORIGINALS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    return null;
  }

  setCachedSignedUrl(AVATAR_ORIGINALS_BUCKET, storagePath, data.signedUrl, expiresInSeconds);
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
