import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import {
  badRequestResponse,
  jsonResponse,
  methodNotAllowedResponse,
  unauthorizedResponse,
} from "../_shared/http.ts";
import { createServiceClient, getAuthenticatedUserId } from "../_shared/supabase.ts";

type GenerateAvatarPackRequest = {
  familyId: string;
  userId: string;
  styleId: string;
  expressions?: string[];
  sourceImagePath?: string;
};

type OpenAIImageResponse = {
  data?: Array<{
    b64_json?: string;
  }>;
};

const EXPRESSION_PROMPTS = {
  neutral: "neutral face, calm expression",
  happy: "happy face, warm smile",
  angry: "angry face, eyebrows lowered, playful intensity",
  crying: "crying face, visible tears, emotional but family friendly",
} as const;
const ALL_EXPRESSIONS = Object.keys(EXPRESSION_PROMPTS) as Array<keyof typeof EXPRESSION_PROMPTS>;

function parseQuality(rawValue: string | undefined): "low" | "medium" | "high" | null {
  const raw = (rawValue ?? "").trim().toLowerCase();
  if (raw === "low" || raw === "medium" || raw === "high") {
    return raw;
  }

  return null;
}

function resolveImageQuality(expression: keyof typeof EXPRESSION_PROMPTS): "low" | "medium" | "high" {
  const globalQuality = parseQuality(Deno.env.get("OPENAI_IMAGE_QUALITY"));
  if (globalQuality) {
    return globalQuality;
  }

  if (expression === "neutral") {
    return parseQuality(Deno.env.get("OPENAI_IMAGE_QUALITY_NEUTRAL")) ?? "low";
  }

  return parseQuality(Deno.env.get("OPENAI_IMAGE_QUALITY_EXPRESSIONS")) ?? "medium";
}

function fileNameFromPath(path: string, fallback: string): string {
  const parts = path.split("/");
  const candidate = parts[parts.length - 1]?.trim();
  return candidate && candidate.length > 0 ? candidate : fallback;
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function generateExpressionImageBase64(
  expression: keyof typeof EXPRESSION_PROMPTS,
  styleId: string,
  actorUserId: string,
  referenceImages: Array<{ blob: Blob; fileName: string }>,
): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const model = Deno.env.get("OPENAI_IMAGE_MODEL") ?? "gpt-image-1.5";
  const quality = resolveImageQuality(expression);
  const prompt = [
    "Transform the reference photo into one stylized cartoon avatar portrait with transparent background.",
    "Preserve the same person identity from the reference image.",
    "Do not gender-swap the subject. Preserve apparent gender presentation from the reference exactly.",
    "Do not change apparent age group, facial structure, skin tone, eye shape, or hairline.",
    "Keep hairstyle attributes from the reference: length, volume, direction, and parting.",
    "Keep facial geometry from the reference: jawline, nose shape, lip fullness, and eye spacing.",
    "Maintain adult facial maturity; avoid child-like proportions unless the reference itself is child-like.",
    "Avoid stereotypical defaults such as converting the subject to a short-haired teenage boy.",
    "Keep clothing and neckline direction broadly consistent with the reference when visible.",
    "Keep framing centered from upper torso to head, with consistent scale across all expression variants.",
    "Family-safe style. No text, no watermark, no border.",
    `Avatar style: ${styleId}.`,
    `Expression: ${EXPRESSION_PROMPTS[expression]}.`,
    "If style and identity conflict, prioritize identity preservation first.",
  ].join(" ");

  const formData = new FormData();
  formData.append("model", model);
  formData.append("prompt", prompt);
  formData.append("size", "1024x1024");
  formData.append("quality", quality);
  formData.append("background", "transparent");
  formData.append("output_format", "png");
  formData.append("user", actorUserId);
  for (const reference of referenceImages) {
    formData.append("image[]", reference.blob, reference.fileName);
  }

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const failureBody = await response.text();
    throw new Error(`OpenAI image generation failed: ${response.status} ${failureBody}`);
  }

  const payload = (await response.json()) as OpenAIImageResponse;
  const b64 = payload.data?.[0]?.b64_json;

  if (!b64) {
    throw new Error("OpenAI response did not include b64_json output");
  }

  return b64;
}

async function resolveOriginalSourcePath(
  supabase: ReturnType<typeof createServiceClient>,
  familyId: string,
  userId: string,
  sourceImagePath: string | undefined,
): Promise<string | null> {
  const providedSourcePath = sourceImagePath?.trim();
  if (providedSourcePath) {
    return providedSourcePath;
  }

  const folder = `${familyId}/${userId}`;
  const { data: files, error } = await supabase.storage.from("avatar-originals").list(folder, {
    limit: 50,
    sortBy: { column: "name", order: "asc" },
  });

  if (error || !files || files.length === 0) {
    return null;
  }

  const names = files
    .map((file) => file.name)
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

async function downloadStorageObject(
  supabase: ReturnType<typeof createServiceClient>,
  bucket: "avatar-originals" | "avatar-packs",
  path: string,
): Promise<Blob | null> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    return null;
  }

  return data;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return methodNotAllowedResponse();
  }

  let actorUserId: string;
  try {
    actorUserId = await getAuthenticatedUserId(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return unauthorizedResponse(message);
  }

  let body: GenerateAvatarPackRequest;
  try {
    body = (await req.json()) as GenerateAvatarPackRequest;
  } catch {
    return badRequestResponse("Invalid JSON payload");
  }

  if (!body.familyId || !body.userId || !body.styleId) {
    return badRequestResponse("Missing familyId, userId, or styleId");
  }

  const requestedExpressionsRaw =
    body.expressions && body.expressions.length > 0
      ? body.expressions
      : ALL_EXPRESSIONS;
  const requestedExpressions = Array.from(
    new Set(
      requestedExpressionsRaw
        .map((value) => value.trim().toLowerCase())
        .filter((value): value is keyof typeof EXPRESSION_PROMPTS => value in EXPRESSION_PROMPTS),
    ),
  );
  const expressionOrder: Record<keyof typeof EXPRESSION_PROMPTS, number> = {
    neutral: 0,
    happy: 1,
    angry: 2,
    crying: 3,
  };
  requestedExpressions.sort((left, right) => expressionOrder[left] - expressionOrder[right]);

  if (requestedExpressions.length === 0) {
    return badRequestResponse("expressions must include at least one of neutral, happy, angry, crying");
  }

  const supabase = createServiceClient();

  const { data: actorMembership, error: actorMembershipError } = await supabase
    .from("family_members")
    .select("role, status")
    .eq("family_id", body.familyId)
    .eq("user_id", actorUserId)
    .maybeSingle();

  if (actorMembershipError || !actorMembership || actorMembership.status !== "active") {
    return unauthorizedResponse("Caller is not an active member of the target family");
  }

  if (actorUserId !== body.userId && actorMembership.role !== "admin") {
    return unauthorizedResponse("Only admins can generate avatars for other users");
  }

  const { data: targetMembership, error: targetMembershipError } = await supabase
    .from("family_members")
    .select("id")
    .eq("family_id", body.familyId)
    .eq("user_id", body.userId)
    .eq("status", "active")
    .maybeSingle();

  if (targetMembershipError || !targetMembership) {
    return badRequestResponse("Target user is not an active member of the target family");
  }

  const { data: processingPack, error: processingPackError } = await supabase
    .from("avatar_packs")
    .select("id,base_path,version")
    .eq("family_id", body.familyId)
    .eq("user_id", body.userId)
    .eq("style_id", body.styleId)
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (processingPackError) {
    return jsonResponse(400, {
      error: processingPackError.message,
      code: processingPackError.code,
      hint: processingPackError.hint,
    });
  }

  let avatarPackId: string;
  let basePath: string;
  let version: number;

  if (processingPack) {
    avatarPackId = processingPack.id as string;
    basePath = processingPack.base_path as string;
    version = processingPack.version as number;
  } else {
    const { data: reservedPack, error: reserveError } = await supabase.rpc("reserve_avatar_pack_v1", {
      p_family_id: body.familyId,
      p_user_id: body.userId,
      p_style_id: body.styleId,
      p_created_by: actorUserId,
    });

    if (reserveError || !reservedPack) {
      return jsonResponse(400, {
        error: reserveError?.message ?? "Unable to reserve avatar pack version",
        code: reserveError?.code,
        hint: reserveError?.hint,
      });
    }

    avatarPackId = reservedPack.avatar_pack_id as string;
    basePath = reservedPack.base_path as string;
    version = reservedPack.version as number;
  }

  const originalSourcePath = await resolveOriginalSourcePath(
    supabase,
    body.familyId,
    body.userId,
    body.sourceImagePath,
  );

  const uploadedPaths: string[] = [];

  try {
    for (const expression of requestedExpressions) {
      const referenceImages: Array<{ blob: Blob; fileName: string }> = [];

      if (expression === "neutral") {
        if (!originalSourcePath) {
          throw new Error("Original profile photo is required before generating neutral avatar");
        }

        const originalBlob = await downloadStorageObject(supabase, "avatar-originals", originalSourcePath);
        if (!originalBlob) {
          throw new Error("Could not load original profile photo for neutral generation");
        }

        referenceImages.push({
          blob: originalBlob,
          fileName: fileNameFromPath(originalSourcePath, "original.jpg"),
        });
      } else {
        const neutralPath = `${basePath}/neutral.png`;
        const neutralBlob = await downloadStorageObject(supabase, "avatar-packs", neutralPath);
        if (!neutralBlob) {
          throw new Error("Generate and confirm a neutral avatar before generating other expressions");
        }

        referenceImages.push({
          blob: neutralBlob,
          fileName: "neutral.png",
        });
      }

      const generatedBase64 = await generateExpressionImageBase64(
        expression,
        body.styleId,
        actorUserId,
        referenceImages,
      );

      const storagePath = `${basePath}/${expression}.png`;
      const imageBytes = decodeBase64(generatedBase64);

      const { error: uploadError } = await supabase.storage
        .from("avatar-packs")
        .upload(storagePath, imageBytes, {
          contentType: "image/png",
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Failed uploading ${expression} image: ${uploadError.message}`);
      }

      uploadedPaths.push(storagePath);
    }

    const { data: storedFiles, error: listError } = await supabase.storage
      .from("avatar-packs")
      .list(basePath, { limit: 20, offset: 0 });

    if (listError) {
      throw new Error(`Failed listing avatar pack files: ${listError.message}`);
    }

    const generatedFileNames = new Set((storedFiles ?? []).map((file) => file.name));
    const allReady = ALL_EXPRESSIONS.every((expression) => generatedFileNames.has(`${expression}.png`));

    const { error: updatePackError } = await supabase
      .from("avatar_packs")
      .update({ status: allReady ? "ready" : "processing" })
      .eq("id", avatarPackId);

    if (updatePackError) {
      throw new Error(`Failed updating avatar pack status: ${updatePackError.message}`);
    }

    if (allReady) {
      const { error: profileUpdateError } = await supabase
        .from("user_profiles")
        .upsert(
          {
            user_id: body.userId,
            family_id: body.familyId,
            avatar_style_id: body.styleId,
          },
          { onConflict: "user_id" },
        );

      if (profileUpdateError) {
        throw new Error(`Failed to update user profile avatar style: ${profileUpdateError.message}`);
      }
    }

    return jsonResponse(200, {
      avatarPack: {
        id: avatarPackId,
        familyId: body.familyId,
        userId: body.userId,
        styleId: body.styleId,
        version,
        basePath,
        status: allReady ? "ready" : "processing",
        files: uploadedPaths,
      },
    });
  } catch (error) {
    await supabase
      .from("avatar_packs")
      .update({ status: "failed" })
      .eq("id", avatarPackId);

    const message = error instanceof Error ? error.message : "Unknown avatar generation failure";
    return jsonResponse(500, {
      error: message,
      avatarPackId,
    });
  }
});
