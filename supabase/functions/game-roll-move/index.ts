import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import {
  badRequestResponse,
  jsonResponse,
  methodNotAllowedResponse,
  unauthorizedResponse,
} from "../_shared/http.ts";
import { createServiceClient, getAuthenticatedUserId } from "../_shared/supabase.ts";

type RollMoveRequest = {
  gameId: string;
  requestId: string;
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

  let body: RollMoveRequest;

  try {
    body = (await req.json()) as RollMoveRequest;
  } catch {
    return badRequestResponse("Invalid JSON payload");
  }

  if (!body.gameId || !body.requestId) {
    return badRequestResponse("Missing gameId or requestId");
  }

  if (!isUuid(body.gameId)) {
    return badRequestResponse("gameId must be a valid UUID");
  }

  if (!isUuid(body.requestId)) {
    return badRequestResponse("requestId must be a valid UUID");
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("roll_game_turn_v1", {
    p_game_id: body.gameId,
    p_actor_user_id: actorUserId,
    p_request_id: body.requestId,
  });

  if (error) {
    return jsonResponse(400, {
      error: error.message,
      code: error.code,
      hint: error.hint,
    });
  }

  return jsonResponse(200, {
    gameEvent: data,
  });
});
