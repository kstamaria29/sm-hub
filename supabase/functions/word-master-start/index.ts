import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import {
  badRequestResponse,
  jsonResponse,
  methodNotAllowedResponse,
  unauthorizedResponse,
} from "../_shared/http.ts";
import { createServiceClient, getAuthenticatedUserId } from "../_shared/supabase.ts";

type WordMasterStartRequest = {
  roomId: string;
  playerUserIds?: string[];
  boardSize?: number;
  rackSize?: number;
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

  let body: WordMasterStartRequest;
  try {
    body = (await req.json()) as WordMasterStartRequest;
  } catch {
    return badRequestResponse("Invalid JSON payload");
  }

  if (!body.roomId || !isUuid(body.roomId)) {
    return badRequestResponse("roomId must be a valid UUID");
  }

  if (body.playerUserIds && body.playerUserIds.some((userId) => !isUuid(userId))) {
    return badRequestResponse("playerUserIds must contain only UUID values");
  }

  if (body.boardSize !== undefined && (!Number.isInteger(body.boardSize) || body.boardSize < 9 || body.boardSize > 15)) {
    return badRequestResponse("boardSize must be an integer between 9 and 15");
  }

  if (body.rackSize !== undefined && (!Number.isInteger(body.rackSize) || body.rackSize < 5 || body.rackSize > 10)) {
    return badRequestResponse("rackSize must be an integer between 5 and 10");
  }

  const supabase = createServiceClient();
  const rpcArgs: Record<string, unknown> = {
    p_room_id: body.roomId,
    p_actor_user_id: actorUserId,
    p_player_user_ids: body.playerUserIds ?? null,
  };

  if (body.boardSize !== undefined) {
    rpcArgs.p_board_size = body.boardSize;
  }

  if (body.rackSize !== undefined) {
    rpcArgs.p_rack_size = body.rackSize;
  }

  const { data, error } = await supabase.rpc("word_master_start_v1", rpcArgs);

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

