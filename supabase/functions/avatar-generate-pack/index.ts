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
  sourceImagePath: string | undefined,
  actorUserId: string,
): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const model = Deno.env.get("OPENAI_IMAGE_MODEL") ?? "gpt-image-1.5";
  const prompt = [
    "Create one cartoon avatar portrait with transparent background.",
    "Preserve centered framing and scale for compatibility across expression variants.",
    "Family-safe style. No text, no watermark, no border.",
    `Avatar style: ${styleId}.`,
    `Expression: ${EXPRESSION_PROMPTS[expression]}.`,
    sourceImagePath
      ? `Reference input path hint: ${sourceImagePath}. Keep visual identity consistent.`
      : "No reference image path provided. Keep character proportions consistent.",
  ].join(" ");

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      size: "1024x1024",
      quality: "high",
      background: "transparent",
      output_format: "png",
      user: actorUserId,
    }),
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

  const avatarPackId = reservedPack.avatar_pack_id as string;
  const basePath = reservedPack.base_path as string;
  const version = reservedPack.version as number;
  const uploadedPaths: string[] = [];

  try {
    for (const expression of Object.keys(EXPRESSION_PROMPTS) as Array<keyof typeof EXPRESSION_PROMPTS>) {
      const generatedBase64 = await generateExpressionImageBase64(
        expression,
        body.styleId,
        body.sourceImagePath,
        actorUserId,
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

    const { error: finalizePackError } = await supabase
      .from("avatar_packs")
      .update({ status: "ready" })
      .eq("id", avatarPackId);

    if (finalizePackError) {
      throw new Error(`Failed to finalize avatar pack: ${finalizePackError.message}`);
    }

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

    return jsonResponse(200, {
      avatarPack: {
        id: avatarPackId,
        familyId: body.familyId,
        userId: body.userId,
        styleId: body.styleId,
        version,
        basePath,
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
