import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import {
  badRequestResponse,
  jsonResponse,
  methodNotAllowedResponse,
  unauthorizedResponse,
} from "../_shared/http.ts";
import { createServiceClient, getAuthenticatedUserId } from "../_shared/supabase.ts";

type CueClashStartRequest = {
  roomId: string;
  playerUserIds?: string[];
};

function isUuid(value: string): boolean {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(value);
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

  let body: CueClashStartRequest;
  try {
    body = (await req.json()) as CueClashStartRequest;
  } catch {
    return badRequestResponse("Invalid JSON payload");
  }

  if (!body.roomId || !isUuid(body.roomId)) {
    return badRequestResponse("roomId must be a valid UUID");
  }

  if (body.playerUserIds && body.playerUserIds.some((userId) => !isUuid(userId))) {
    return badRequestResponse("playerUserIds must contain only UUID values");
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("cue_clash_start_v1", {
    p_room_id: body.roomId,
    p_actor_user_id: actorUserId,
    p_player_user_ids: body.playerUserIds ?? null,
  });

  if (error) {
    return jsonResponse(400, {
      error: error.message,
      code: error.code,
      hint: error.hint,
    });
  }

  return jsonResponse(200, {
    game: data,
  });
});

