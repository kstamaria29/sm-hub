import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import {
  badRequestResponse,
  jsonResponse,
  methodNotAllowedResponse,
  unauthorizedResponse,
} from "../_shared/http.ts";
import { createServiceClient, getAuthenticatedUserId } from "../_shared/supabase.ts";

type DeleteFamilyMemberRequest = {
  familyId: string;
  memberUserId: string;
};

function isUuid(value: string): boolean {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(value);
}

function normalizeStoragePrefix(prefix: string): string {
  return prefix.replace(/^\/+|\/+$/g, "");
}

async function listStorageFilesRecursively(
  supabase: ReturnType<typeof createServiceClient>,
  bucket: "avatar-originals" | "avatar-packs",
  rootPrefix: string,
): Promise<string[]> {
  const normalizedRoot = normalizeStoragePrefix(rootPrefix);
  if (!normalizedRoot) {
    return [];
  }

  const pendingFolders: string[] = [normalizedRoot];
  const filePaths: string[] = [];

  while (pendingFolders.length > 0) {
    const currentPrefix = pendingFolders.shift() as string;
    let offset = 0;

    while (true) {
      const { data, error } = await supabase.storage.from(bucket).list(currentPrefix, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

      if (error) {
        throw new Error(`Failed listing ${bucket}/${currentPrefix}: ${error.message}`);
      }

      if (!data || data.length === 0) {
        break;
      }

      for (const entry of data as Array<{ name: string; id?: string | null }>) {
        if (!entry.name) {
          continue;
        }

        const fullPath = `${currentPrefix}/${entry.name}`;
        // In storage list responses, folders are represented with null/undefined id.
        if (entry.id === null || typeof entry.id === "undefined") {
          pendingFolders.push(fullPath);
        } else {
          filePaths.push(fullPath);
        }
      }

      if (data.length < 100) {
        break;
      }

      offset += data.length;
    }
  }

  return filePaths;
}

async function removeStoragePrefix(
  supabase: ReturnType<typeof createServiceClient>,
  bucket: "avatar-originals" | "avatar-packs",
  prefix: string,
): Promise<number> {
  const filePaths = await listStorageFilesRecursively(supabase, bucket, prefix);
  if (filePaths.length === 0) {
    return 0;
  }

  let removedCount = 0;
  for (let index = 0; index < filePaths.length; index += 100) {
    const chunk = filePaths.slice(index, index + 100);
    const { error } = await supabase.storage.from(bucket).remove(chunk);
    if (error) {
      throw new Error(`Failed deleting storage objects from ${bucket}: ${error.message}`);
    }

    removedCount += chunk.length;
  }

  return removedCount;
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

  let body: DeleteFamilyMemberRequest;
  try {
    body = (await req.json()) as DeleteFamilyMemberRequest;
  } catch {
    return badRequestResponse("Invalid JSON payload");
  }

  const familyId = body.familyId?.trim();
  const memberUserId = body.memberUserId?.trim();

  if (!familyId || !memberUserId) {
    return badRequestResponse("familyId and memberUserId are required");
  }

  if (!isUuid(familyId) || !isUuid(memberUserId)) {
    return badRequestResponse("familyId and memberUserId must be valid UUID values");
  }

  if (memberUserId === actorUserId) {
    return badRequestResponse("Admins cannot delete themselves");
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
    return unauthorizedResponse("Only admins can delete family members");
  }

  const { data: targetMembership, error: targetMembershipError } = await supabase
    .from("family_members")
    .select("role,status")
    .eq("family_id", familyId)
    .eq("user_id", memberUserId)
    .maybeSingle();

  if (targetMembershipError || !targetMembership || targetMembership.status !== "active") {
    return badRequestResponse("Target user is not an active family member");
  }

  if (targetMembership.role !== "member") {
    return badRequestResponse("Only members can be deleted from this screen");
  }

  try {
    const originalPrefix = `${familyId}/${memberUserId}`;
    const packsPrefix = `${familyId}/${memberUserId}`;

    const removedOriginalCount = await removeStoragePrefix(supabase, "avatar-originals", originalPrefix);
    const removedPackCount = await removeStoragePrefix(supabase, "avatar-packs", packsPrefix);

    const { error: nullEventCreatorError } = await supabase
      .from("game_events")
      .update({ created_by: null })
      .eq("family_id", familyId)
      .eq("created_by", memberUserId);

    if (nullEventCreatorError) {
      throw new Error(`Failed cleaning game events: ${nullEventCreatorError.message}`);
    }

    const { error: clearCurrentTurnError } = await supabase
      .from("games")
      .update({ current_turn_user_id: null })
      .eq("family_id", familyId)
      .eq("current_turn_user_id", memberUserId);

    if (clearCurrentTurnError) {
      throw new Error(`Failed cleaning game current_turn_user_id: ${clearCurrentTurnError.message}`);
    }

    const { error: clearWinnerError } = await supabase
      .from("games")
      .update({ winner_user_id: null })
      .eq("family_id", familyId)
      .eq("winner_user_id", memberUserId);

    if (clearWinnerError) {
      throw new Error(`Failed cleaning game winner_user_id: ${clearWinnerError.message}`);
    }

    const { error: clearInvitesAcceptedByError } = await supabase
      .from("invites")
      .update({ accepted_by: null })
      .eq("family_id", familyId)
      .eq("accepted_by", memberUserId);

    if (clearInvitesAcceptedByError) {
      throw new Error(`Failed cleaning invite accepted_by references: ${clearInvitesAcceptedByError.message}`);
    }

    const { error: deleteMessagesError } = await supabase
      .from("messages")
      .delete()
      .eq("family_id", familyId)
      .eq("sender_id", memberUserId);

    if (deleteMessagesError) {
      throw new Error(`Failed deleting member messages: ${deleteMessagesError.message}`);
    }

    const { error: deleteGamePlayersError } = await supabase
      .from("game_players")
      .delete()
      .eq("family_id", familyId)
      .eq("user_id", memberUserId);

    if (deleteGamePlayersError) {
      throw new Error(`Failed deleting member game players: ${deleteGamePlayersError.message}`);
    }

    const { error: deleteAvatarPacksError } = await supabase
      .from("avatar_packs")
      .delete()
      .eq("family_id", familyId)
      .eq("user_id", memberUserId);

    if (deleteAvatarPacksError) {
      throw new Error(`Failed deleting member avatar packs: ${deleteAvatarPacksError.message}`);
    }

    const { error: deleteUserProfileError } = await supabase
      .from("user_profiles")
      .delete()
      .eq("family_id", familyId)
      .eq("user_id", memberUserId);

    if (deleteUserProfileError) {
      throw new Error(`Failed deleting member user profile: ${deleteUserProfileError.message}`);
    }

    const { error: deleteMembershipError } = await supabase
      .from("family_members")
      .delete()
      .eq("family_id", familyId)
      .eq("user_id", memberUserId);

    if (deleteMembershipError) {
      throw new Error(`Failed deleting member family membership: ${deleteMembershipError.message}`);
    }

    const { error: deleteAuthUserError } = await supabase.auth.admin.deleteUser(memberUserId);
    if (deleteAuthUserError && !deleteAuthUserError.message.toLowerCase().includes("not found")) {
      throw new Error(`Failed deleting auth user: ${deleteAuthUserError.message}`);
    }

    return jsonResponse(200, {
      success: true,
      memberUserId,
      removedStorage: {
        originals: removedOriginalCount,
        packs: removedPackCount,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed deleting family member";
    return jsonResponse(400, { error: message });
  }
});
