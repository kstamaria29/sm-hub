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
  neutral: "calm neutral expression, relaxed eyebrows, closed gentle smile or neutral lips",
  happy:
    "very joyful expression: broad genuine smile, raised cheeks, bright smiling eyes, lively positive energy",
  angry:
    "strong angry expression: deeply furrowed brows, narrowed eyes, tense jaw, flared nostrils, intense but family-safe",
  crying:
    "strong crying expression: watery eyes with visible tears, downturned mouth, sad brows, emotional but family-safe",
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
    return parseQuality(Deno.env.get("OPENAI_IMAGE_QUALITY_NEUTRAL")) ?? "high";
  }

  return parseQuality(Deno.env.get("OPENAI_IMAGE_QUALITY_EXPRESSIONS")) ?? "high";
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

function buildAvatarPrompt(expression: keyof typeof EXPRESSION_PROMPTS, styleId: string): string {
  const sharedInstructions = [
    "Output exactly one stylized cartoon avatar portrait with transparent background.",
    "Family-safe style. No text, no watermark, no border.",
    "Keep framing centered from upper torso to head.",
    `Avatar style: ${styleId}.`,
  ];

  if (expression === "neutral") {
    return [
      "Task: Create the neutral base avatar from the original profile photo reference.",
      "Preserve identity precisely: same apparent gender presentation, age group, skin tone, facial geometry, eye shape, hairline, and hairstyle.",
      "Keep clothing direction and neckline consistent when visible.",
      "Maintain adult facial maturity; do not infantilize the face.",
      ...sharedInstructions,
      `Expression target: ${EXPRESSION_PROMPTS.neutral}.`,
      "If style and identity conflict, prioritize identity preservation first.",
    ].join(" ");
  }

  const expressionSpecificInstructions: Record<
    Exclude<keyof typeof EXPRESSION_PROMPTS, "neutral">,
    string
  > = {
    happy:
      "Make the emotion clearly happier than neutral: wide joyful smile, lifted cheeks, brighter eyes, and celebratory warmth.",
    angry:
      "Make the emotion clearly angrier than neutral: stronger brow compression, sharper eye tension, firmer mouth/jaw. Optional subtle cartoon heat cues (light cheek flush or tiny steam squiggles) are allowed if family-safe.",
    crying:
      "Make the emotion clearly sadder than neutral: visible tears, watery eyes, trembling/downturned mouth, and softened sorrowful brows.",
  };

  return [
    "Task: Edit the provided neutral avatar image and change only facial expression.",
    "Treat the neutral avatar as the exact source character and composition.",
    "Do not change identity, hairstyle, hair color, skin tone, face shape, clothing, shoulders, camera angle, framing, linework, shading, or palette.",
    "Keep pose and crop identical to neutral.",
    ...sharedInstructions,
    `Expression target: ${EXPRESSION_PROMPTS[expression]}.`,
    expressionSpecificInstructions[expression],
    "Important: preserve character consistency first, then maximize emotional clarity.",
  ].join(" ");
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
  const prompt = buildAvatarPrompt(expression, styleId);

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
