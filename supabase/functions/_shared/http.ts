export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export function methodNotAllowedResponse(): Response {
  return jsonResponse(405, { error: "Method Not Allowed" });
}

export function unauthorizedResponse(message = "Unauthorized"): Response {
  return jsonResponse(401, { error: message });
}

export function badRequestResponse(message: string): Response {
  return jsonResponse(400, { error: message });
}
