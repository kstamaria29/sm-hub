import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import {
  badRequestResponse,
  jsonResponse,
  methodNotAllowedResponse,
  unauthorizedResponse,
} from "../_shared/http.ts";
import { createServiceClient, getAuthenticatedUserId } from "../_shared/supabase.ts";

type InviteAcceptRequest = {
  token: string;
  displayName?: string;
};

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

  let body: InviteAcceptRequest;
  try {
    body = (await req.json()) as InviteAcceptRequest;
  } catch {
    return badRequestResponse("Invalid JSON payload");
  }

  if (!body.token || body.token.trim().length === 0) {
    return badRequestResponse("token is required");
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("accept_invite_v1", {
    p_actor_user_id: actorUserId,
    p_invite_token: body.token.trim(),
    p_display_name: body.displayName?.trim() || null,
  });

  if (error) {
    return jsonResponse(400, {
      error: error.message,
      code: error.code,
      hint: error.hint,
    });
  }

  return jsonResponse(200, {
    invite: data,
  });
});
