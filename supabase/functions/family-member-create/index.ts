import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import {
  badRequestResponse,
  jsonResponse,
  methodNotAllowedResponse,
  unauthorizedResponse,
} from "../_shared/http.ts";
import { createServiceClient, getAuthenticatedUserId } from "../_shared/supabase.ts";

type CreateFamilyMemberRequest = {
  familyId: string;
  email: string;
  displayName?: string;
};

const PASSWORD_LENGTH = 14;
const PASSWORD_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";

function normalizeEmail(rawEmail: string): string {
  return rawEmail.trim().toLowerCase();
}

function generateTemporaryPassword(length = PASSWORD_LENGTH): string {
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  let result = "";

  for (let index = 0; index < length; index += 1) {
    result += PASSWORD_CHARSET[bytes[index] % PASSWORD_CHARSET.length];
  }

  return result;
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

  let body: CreateFamilyMemberRequest;
  try {
    body = (await req.json()) as CreateFamilyMemberRequest;
  } catch {
    return badRequestResponse("Invalid JSON payload");
  }

  const familyId = body.familyId?.trim();
  const email = normalizeEmail(body.email ?? "");
  const displayName = body.displayName?.trim() || null;

  if (!familyId || !email) {
    return badRequestResponse("familyId and email are required");
  }

  const supabase = createServiceClient();
  const { data: actorMembership, error: actorMembershipError } = await supabase
    .from("family_members")
    .select("role,status")
    .eq("family_id", familyId)
    .eq("user_id", actorUserId)
    .maybeSingle();

  if (actorMembershipError || !actorMembership || actorMembership.status !== "active") {
    return unauthorizedResponse("Caller is not an active member of this family");
  }

  if (actorMembership.role !== "admin") {
    return unauthorizedResponse("Only admins can create family members");
  }

  const temporaryPassword = generateTemporaryPassword();
  const { data: createdUser, error: createUserError } = await supabase.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
  });

  if (createUserError || !createdUser.user) {
    return jsonResponse(400, {
      error: createUserError?.message ?? "Unable to create auth user",
      code: createUserError?.code,
    });
  }

  const userId = createdUser.user.id;
  const { data: membershipData, error: membershipError } = await supabase.rpc(
    "admin_add_family_member_v1",
    {
      p_actor_user_id: actorUserId,
      p_family_id: familyId,
      p_member_user_id: userId,
      p_display_name: displayName,
    },
  );

  if (membershipError) {
    await supabase.auth.admin.deleteUser(userId);
    return jsonResponse(400, {
      error: membershipError.message,
      code: membershipError.code,
      hint: membershipError.hint,
    });
  }

  return jsonResponse(200, {
    member: membershipData,
    credentials: {
      email,
      temporaryPassword,
    },
  });
});
