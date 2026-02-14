import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import {
  badRequestResponse,
  jsonResponse,
  methodNotAllowedResponse,
  unauthorizedResponse,
} from "../_shared/http.ts";
import { createServiceClient, getAuthenticatedUserId } from "../_shared/supabase.ts";

type BootstrapRequest = {
  familyName: string;
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

  let body: BootstrapRequest;
  try {
    body = (await req.json()) as BootstrapRequest;
  } catch {
    return badRequestResponse("Invalid JSON payload");
  }

  if (!body.familyName || body.familyName.trim().length === 0) {
    return badRequestResponse("familyName is required");
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("bootstrap_family_v1", {
    p_actor_user_id: actorUserId,
    p_family_name: body.familyName.trim(),
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
    family: data,
  });
});
