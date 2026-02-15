import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import {
  badRequestResponse,
  jsonResponse,
  methodNotAllowedResponse,
  unauthorizedResponse,
} from "../_shared/http.ts";
import { createServiceClient, getAuthenticatedUserId } from "../_shared/supabase.ts";

type Placement = {
  row: number;
  col: number;
  letter: string;
};

type WordMasterPlayRequest = {
  gameId: string;
  requestId: string;
  placements: Placement[];
};

function isUuid(value: string): boolean {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(value);
}

function isValidPlacement(value: unknown): value is Placement {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    Number.isInteger(record.row) &&
    Number.isInteger(record.col) &&
    typeof record.letter === "string" &&
    record.letter.trim().length === 1
  );
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

  let body: WordMasterPlayRequest;
  try {
    body = (await req.json()) as WordMasterPlayRequest;
  } catch {
    return badRequestResponse("Invalid JSON payload");
  }

  if (!body.gameId || !isUuid(body.gameId)) {
    return badRequestResponse("gameId must be a valid UUID");
  }

  if (!body.requestId || !isUuid(body.requestId)) {
    return badRequestResponse("requestId must be a valid UUID");
  }

  if (!Array.isArray(body.placements) || body.placements.length === 0) {
    return badRequestResponse("placements must be a non-empty array");
  }

  if (body.placements.length > 10) {
    return badRequestResponse("placements is too large");
  }

  if (body.placements.some((placement) => !isValidPlacement(placement))) {
    return badRequestResponse("placements must contain { row, col, letter } entries");
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("word_master_play_turn_v1", {
    p_game_id: body.gameId,
    p_actor_user_id: actorUserId,
    p_request_id: body.requestId,
    p_placements: body.placements,
  });

  if (error) {
    return jsonResponse(400, {
      error: error.message,
      code: error.code,
      hint: error.hint,
    });
  }

  return jsonResponse(200, {
    result: data,
  });
});

