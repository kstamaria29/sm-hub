import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import {
  badRequestResponse,
  jsonResponse,
  methodNotAllowedResponse,
  unauthorizedResponse,
} from "../_shared/http.ts";
import { createServiceClient, getAuthenticatedUserId } from "../_shared/supabase.ts";

type CueClashShotRequest = {
  gameId: string;
  requestId: string;
  direction: { x: number; y: number };
  power: number;
};

type CueClashBallState = {
  version: number;
  position_scale: number;
  table: {
    width: number;
    height: number;
    ball_radius: number;
    pocket_radius: number;
  };
  pocketed_mask: number;
  positions: number[];
};

type CueClashPlayerRow = {
  user_id: string;
  player_order: number;
  suit: "solids" | "stripes" | null;
};

type SimBall = {
  id: number; // 0..15
  x: number;
  y: number;
  vx: number;
  vy: number;
  pocketed: boolean;
};

type ReplayFrame = { p: number[]; m: number };
type CueClashReplay = {
  version: 1;
  frame_rate: number;
  position_scale: number;
  table: CueClashBallState["table"];
  frames: ReplayFrame[];
};

function isUuid(value: string): boolean {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(value);
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asInteger(value: unknown): number | null {
  const num = asNumber(value);
  if (num === null || !Number.isInteger(num)) {
    return null;
  }

  return num;
}

function asNumberArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const parsed: number[] = [];
  for (const entry of value) {
    const num = asNumber(entry);
    if (num === null) {
      return null;
    }
    parsed.push(num);
  }

  return parsed;
}

function parseBallState(raw: unknown): CueClashBallState {
  const obj = asObject(raw);
  if (!obj) {
    throw new Error("Invalid cue clash ball state");
  }

  const version = asInteger(obj.version);
  const positionScale = asInteger(obj.position_scale);
  const pocketedMask = asInteger(obj.pocketed_mask);
  const positions = asNumberArray(obj.positions);
  const tableObj = asObject(obj.table);
  const width = asNumber(tableObj?.width);
  const height = asNumber(tableObj?.height);
  const ballRadius = asNumber(tableObj?.ball_radius);
  const pocketRadius = asNumber(tableObj?.pocket_radius);

  if (version !== 1 || !positionScale || positionScale <= 0) {
    throw new Error("Unsupported cue clash ball state version");
  }

  if (pocketedMask === null || pocketedMask < 0 || pocketedMask > 0xffff) {
    throw new Error("Invalid cue clash pocketed mask");
  }

  if (!positions || positions.length !== 32) {
    throw new Error("Invalid cue clash positions array");
  }

  if (
    width === null ||
    height === null ||
    ballRadius === null ||
    pocketRadius === null ||
    width <= 0 ||
    height <= 0 ||
    ballRadius <= 0 ||
    pocketRadius <= 0
  ) {
    throw new Error("Invalid cue clash table config");
  }

  return {
    version,
    position_scale: positionScale,
    table: {
      width,
      height,
      ball_radius: ballRadius,
      pocket_radius: pocketRadius,
    },
    pocketed_mask: pocketedMask,
    positions: positions.map((entry) => Math.trunc(entry)),
  };
}

function isPocketed(mask: number, ballId: number): boolean {
  return (mask & (1 << ballId)) !== 0;
}

function setPocketed(mask: number, ballId: number): number {
  return mask | (1 << ballId);
}

function clearPocketed(mask: number, ballId: number): number {
  return mask & ~(1 << ballId);
}

function ballSuit(ballId: number): "solids" | "stripes" | "eight" | "cue" {
  if (ballId === 0) return "cue";
  if (ballId === 8) return "eight";
  if (ballId >= 1 && ballId <= 7) return "solids";
  return "stripes";
}

function countRemaining(mask: number, suit: "solids" | "stripes"): number {
  const ids = suit === "solids" ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
  let remaining = 0;
  for (const ballId of ids) {
    if (!isPocketed(mask, ballId)) {
      remaining += 1;
    }
  }
  return remaining;
}

function resolveCueRespawn(
  table: CueClashBallState["table"],
  balls: SimBall[],
): { x: number; y: number } {
  const radius = table.ball_radius;
  const baseX = 250;
  const baseY = table.height / 2;

  const candidates: Array<{ x: number; y: number }> = [];
  for (let dx = 0; dx <= 220; dx += 44) {
    for (let dy = -132; dy <= 132; dy += 44) {
      candidates.push({ x: baseX + dx, y: baseY + dy });
    }
  }

  function isClear(candidate: { x: number; y: number }): boolean {
    if (
      candidate.x < radius ||
      candidate.x > table.width - radius ||
      candidate.y < radius ||
      candidate.y > table.height - radius
    ) {
      return false;
    }

    for (const ball of balls) {
      if (ball.id === 0 || ball.pocketed) {
        continue;
      }

      const dx = ball.x - candidate.x;
      const dy = ball.y - candidate.y;
      if (dx * dx + dy * dy < (radius * 2.05) * (radius * 2.05)) {
        return false;
      }
    }

    return true;
  }

  for (const candidate of candidates) {
    if (isClear(candidate)) {
      return candidate;
    }
  }

  return { x: Math.min(Math.max(baseX, radius), table.width - radius), y: Math.min(Math.max(baseY, radius), table.height - radius) };
}

function simulateShot(params: {
  state: CueClashBallState;
  direction: { x: number; y: number };
  power: number;
}): {
  newBalls: CueClashBallState;
  replay: CueClashReplay;
  scratch: boolean;
  firstContactBallId: number | null;
  pocketedBallIds: number[];
} {
  const { state, direction, power } = params;
  const { table } = state;
  const positionScale = state.position_scale;

  const frameRate = 30;
  const dt = 1 / 60;
  const maxSeconds = 10;
  const maxSteps = Math.ceil(maxSeconds / dt);
  const recordEvery = Math.max(1, Math.round(1 / (dt * frameRate)));

  const ballRadius = table.ball_radius;
  const pocketRadius = table.pocket_radius;
  const pocketRadiusSq = pocketRadius * pocketRadius;
  const minDist = ballRadius * 2;
  const minDistSq = minDist * minDist;

  const maxSpeed = 950;
  const rollingDecel = 260;
  const wallRestitution = 0.9;
  const ballRestitution = 0.96;
  const stopSpeed = 6;

  const pockets = [
    { x: ballRadius, y: ballRadius },
    { x: table.width / 2, y: ballRadius },
    { x: table.width - ballRadius, y: ballRadius },
    { x: ballRadius, y: table.height - ballRadius },
    { x: table.width / 2, y: table.height - ballRadius },
    { x: table.width - ballRadius, y: table.height - ballRadius },
  ];

  const balls: SimBall[] = Array.from({ length: 16 }, (_, id) => {
    const x = state.positions[id * 2] / positionScale;
    const y = state.positions[id * 2 + 1] / positionScale;
    const pocketed = id !== 0 && isPocketed(state.pocketed_mask, id);
    return { id, x, y, vx: 0, vy: 0, pocketed };
  });

  const dirLen = Math.hypot(direction.x, direction.y);
  const nx = dirLen > 0 ? direction.x / dirLen : 0;
  const ny = dirLen > 0 ? direction.y / dirLen : 0;

  balls[0].vx = nx * (maxSpeed * power);
  balls[0].vy = ny * (maxSpeed * power);

  let pocketedMask = state.pocketed_mask;
  const pocketedThisShot: number[] = [];
  let scratch = false;
  let cueOffTable = false;
  let firstContactBallId: number | null = null;

  const frames: ReplayFrame[] = [];

  const recordFrame = () => {
    const positions: number[] = new Array(32);
    for (const ball of balls) {
      positions[ball.id * 2] = Math.round(ball.x * positionScale);
      positions[ball.id * 2 + 1] = Math.round(ball.y * positionScale);
    }

    let mask = pocketedMask;
    if (cueOffTable) {
      mask = setPocketed(mask, 0);
    } else {
      mask = clearPocketed(mask, 0);
    }

    frames.push({ p: positions, m: mask });
  };

  recordFrame();

  for (let step = 0; step < maxSteps; step += 1) {
    for (const ball of balls) {
      if (ball.pocketed) {
        continue;
      }

      const speed = Math.hypot(ball.vx, ball.vy);
      if (speed > 0) {
        const nextSpeed = Math.max(0, speed - rollingDecel * dt);
        const scale = nextSpeed / speed;
        ball.vx *= scale;
        ball.vy *= scale;
      }

      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      // Pocket check first.
      for (const pocket of pockets) {
        const dx = ball.x - pocket.x;
        const dy = ball.y - pocket.y;
        if (dx * dx + dy * dy <= pocketRadiusSq) {
          if (ball.id === 0) {
            scratch = true;
            cueOffTable = true;
            ball.vx = 0;
            ball.vy = 0;
          } else if (!isPocketed(pocketedMask, ball.id)) {
            pocketedMask = setPocketed(pocketedMask, ball.id);
            pocketedThisShot.push(ball.id);
            ball.pocketed = true;
            ball.vx = 0;
            ball.vy = 0;
          }
          break;
        }
      }

      if (ball.id === 0 && cueOffTable) {
        continue;
      }

      // Cushion collisions.
      if (ball.x < ballRadius) {
        ball.x = ballRadius;
        ball.vx = Math.abs(ball.vx) * wallRestitution;
      } else if (ball.x > table.width - ballRadius) {
        ball.x = table.width - ballRadius;
        ball.vx = -Math.abs(ball.vx) * wallRestitution;
      }

      if (ball.y < ballRadius) {
        ball.y = ballRadius;
        ball.vy = Math.abs(ball.vy) * wallRestitution;
      } else if (ball.y > table.height - ballRadius) {
        ball.y = table.height - ballRadius;
        ball.vy = -Math.abs(ball.vy) * wallRestitution;
      }
    }

    // Ball-ball collisions.
    for (let i = 0; i < balls.length; i += 1) {
      const a = balls[i];
      if (a.pocketed || (a.id === 0 && cueOffTable)) continue;

      for (let j = i + 1; j < balls.length; j += 1) {
        const b = balls[j];
        if (b.pocketed || (b.id === 0 && cueOffTable)) continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy;

        if (distSq >= minDistSq || distSq === 0) continue;

        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const ny = dy / dist;

        const overlap = minDist - dist;
        a.x -= nx * (overlap / 2);
        a.y -= ny * (overlap / 2);
        b.x += nx * (overlap / 2);
        b.y += ny * (overlap / 2);

        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const relVel = rvx * nx + rvy * ny;
        if (relVel >= 0) continue;

        if (firstContactBallId === null && (a.id === 0 || b.id === 0)) {
          firstContactBallId = a.id === 0 ? b.id : a.id;
        }

        const impulse = (-(1 + ballRestitution) * relVel) / 2;
        const ix = impulse * nx;
        const iy = impulse * ny;

        a.vx -= ix;
        a.vy -= iy;
        b.vx += ix;
        b.vy += iy;
      }
    }

    if ((step + 1) % recordEvery === 0) {
      recordFrame();
    }

    let maxBallSpeed = 0;
    for (const ball of balls) {
      if (ball.pocketed || (ball.id === 0 && cueOffTable)) continue;
      const speed = Math.hypot(ball.vx, ball.vy);
      if (speed > maxBallSpeed) maxBallSpeed = speed;
    }

    if (maxBallSpeed < stopSpeed) {
      break;
    }
  }

  // Apply cue ball respot if scratched.
  if (scratch) {
    const cueRespawn = resolveCueRespawn(table, balls);
    const cue = balls[0];
    cue.x = cueRespawn.x;
    cue.y = cueRespawn.y;
    cue.vx = 0;
    cue.vy = 0;
    cueOffTable = false;
  }

  // Ensure final frame matches stored state.
  recordFrame();

  // Clear cue bit from final stored mask (cue ball is always present).
  const finalMask = clearPocketed(pocketedMask, 0);

  const finalPositions: number[] = new Array(32);
  for (const ball of balls) {
    finalPositions[ball.id * 2] = Math.round(ball.x * positionScale);
    finalPositions[ball.id * 2 + 1] = Math.round(ball.y * positionScale);
  }

  const newBalls: CueClashBallState = {
    version: 1,
    position_scale: positionScale,
    table,
    pocketed_mask: finalMask,
    positions: finalPositions,
  };

  const replay: CueClashReplay = {
    version: 1,
    frame_rate: frameRate,
    position_scale: positionScale,
    table,
    frames,
  };

  return {
    newBalls,
    replay,
    scratch,
    firstContactBallId,
    pocketedBallIds: pocketedThisShot,
  };
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

  let body: CueClashShotRequest;
  try {
    body = (await req.json()) as CueClashShotRequest;
  } catch {
    return badRequestResponse("Invalid JSON payload");
  }

  if (!body.gameId || !isUuid(body.gameId)) {
    return badRequestResponse("gameId must be a valid UUID");
  }

  if (!body.requestId || !isUuid(body.requestId)) {
    return badRequestResponse("requestId must be a valid UUID");
  }

  const power = typeof body.power === "number" && Number.isFinite(body.power) ? body.power : null;
  if (power === null || power <= 0 || power > 1) {
    return badRequestResponse("power must be a number between 0 and 1");
  }

  const directionX = typeof body.direction?.x === "number" && Number.isFinite(body.direction.x) ? body.direction.x : null;
  const directionY = typeof body.direction?.y === "number" && Number.isFinite(body.direction.y) ? body.direction.y : null;
  if (directionX === null || directionY === null || Math.hypot(directionX, directionY) < 0.0001) {
    return badRequestResponse("direction must be a non-zero vector");
  }

  const supabase = createServiceClient();
  const { data: game, error: gameError } = await supabase
    .from("cue_clash_games")
    .select("id,family_id,status,current_turn_user_id,balls,open_table,turn_number")
    .eq("id", body.gameId)
    .maybeSingle();

  if (gameError || !game) {
    return jsonResponse(400, {
      error: gameError?.message ?? "Cue Clash game not found",
      code: gameError?.code,
      hint: gameError?.hint,
    });
  }

  if (game.status !== "active") {
    return badRequestResponse("Game is not active");
  }

  const { data: players, error: playersError } = await supabase
    .from("cue_clash_players")
    .select("user_id,player_order,suit")
    .eq("game_id", body.gameId)
    .order("player_order", { ascending: true });

  if (playersError) {
    return jsonResponse(400, { error: playersError.message, code: playersError.code, hint: playersError.hint });
  }

  const playerRows = (players ?? []) as CueClashPlayerRow[];
  if (playerRows.length === 0) {
    return badRequestResponse("No players found for this game");
  }

  const actorPlayer = playerRows.find((entry) => entry.user_id === actorUserId) ?? null;
  if (!actorPlayer) {
    return badRequestResponse("Actor is not a player in this game");
  }

  const opponentPlayer = playerRows.find((entry) => entry.user_id !== actorUserId) ?? null;

  let ballState: CueClashBallState;
  try {
    ballState = parseBallState(game.balls);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid balls state";
    return jsonResponse(400, { error: message });
  }

  const sim = simulateShot({
    state: ballState,
    direction: { x: directionX, y: directionY },
    power,
  });

  const initialMask = ballState.pocketed_mask;
  const finalMask = sim.newBalls.pocketed_mask;
  const eightPocketedThisShot = !isPocketed(initialMask, 8) && isPocketed(finalMask, 8);

  const pocketedObjectBallIds = sim.pocketedBallIds.filter((ballId) => ballId !== 0);
  const pocketedSuitBalls = {
    solids: pocketedObjectBallIds.filter((ballId) => ballSuit(ballId) === "solids"),
    stripes: pocketedObjectBallIds.filter((ballId) => ballSuit(ballId) === "stripes"),
  };

  const actorSuit = actorPlayer.suit;

  let openTable = Boolean(game.open_table);
  let foul = false;
  const foulReasons: string[] = [];

  if (sim.scratch) {
    foul = true;
    foulReasons.push("scratch");
  }

  if (sim.firstContactBallId === null) {
    foul = true;
    foulReasons.push("no_contact");
  }

  if (openTable && sim.firstContactBallId === 8) {
    foul = true;
    foulReasons.push("hit_8_first_open_table");
  }

  if (actorSuit && sim.firstContactBallId !== null) {
    const remaining = countRemaining(initialMask, actorSuit);
    const legalFirst = remaining === 0 ? [8] : actorSuit === "solids" ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
    const legalSet = new Set(legalFirst.filter((ballId) => ballId === 8 || !isPocketed(initialMask, ballId)));
    if (!legalSet.has(sim.firstContactBallId)) {
      foul = true;
      foulReasons.push("wrong_first_contact");
    }
  }

  // Suit assignment (first non-8 pocket on a clean shot).
  const suitUpdates: Array<{ user_id: string; suit: "solids" | "stripes" }> = [];
  if (openTable && !foul) {
    const firstPocketed = pocketedObjectBallIds.find((ballId) => ballId !== 8) ?? null;
    if (firstPocketed !== null) {
      const suit = ballSuit(firstPocketed);
      if (suit === "solids" || suit === "stripes") {
        suitUpdates.push({ user_id: actorUserId, suit });
        if (opponentPlayer) {
          suitUpdates.push({ user_id: opponentPlayer.user_id, suit: suit === "solids" ? "stripes" : "solids" });
        }
        openTable = false;
      }
    }
  }

  const resolvedActorSuit = suitUpdates.find((entry) => entry.user_id === actorUserId)?.suit ?? actorSuit;
  const actorSuitRemainingAfter = resolvedActorSuit ? countRemaining(finalMask, resolvedActorSuit) : null;

  let winnerUserId: string | null = null;
  let status: "active" | "finished" = "active";

  if (eightPocketedThisShot) {
    const isWin = !foul && resolvedActorSuit !== null && actorSuitRemainingAfter === 0;

    status = "finished";
    if (isWin) {
      winnerUserId = actorUserId;
    } else {
      winnerUserId = opponentPlayer?.user_id ?? null;
    }
  }

  const continuesTurn =
    status === "active" &&
    !foul &&
    (resolvedActorSuit
      ? resolvedActorSuit === "solids"
        ? pocketedSuitBalls.solids.length > 0
        : pocketedSuitBalls.stripes.length > 0
      : pocketedObjectBallIds.some((ballId) => ballId !== 8));

  const nextTurnUserId =
    status === "finished"
      ? null
      : continuesTurn
        ? actorUserId
        : opponentPlayer?.user_id ?? actorUserId;

  const eventPayload = {
    request_id: body.requestId,
    shot: {
      direction: { x: directionX, y: directionY },
      power,
    },
    result: {
      first_contact_ball_id: sim.firstContactBallId,
      pocketed_ball_ids: pocketedObjectBallIds,
      scratch: sim.scratch,
      foul,
      foul_reasons: foulReasons,
      open_table: openTable,
      suit_updates: suitUpdates,
      actor_suit_remaining_after: actorSuitRemainingAfter,
    },
    replay: sim.replay,
  };

  const { data: shotEvent, error: shotError } = await supabase.rpc("cue_clash_take_shot_v1", {
    p_game_id: body.gameId,
    p_actor_user_id: actorUserId,
    p_request_id: body.requestId,
    p_expected_turn_number: game.turn_number,
    p_new_balls: sim.newBalls,
    p_next_turn_user_id: nextTurnUserId,
    p_open_table: openTable,
    p_suit_updates: suitUpdates.length > 0 ? suitUpdates : null,
    p_actor_foul: foul,
    p_winner_user_id: winnerUserId,
    p_new_status: status,
    p_event_payload: eventPayload,
  });

  if (shotError) {
    return jsonResponse(400, {
      error: shotError.message,
      code: shotError.code,
      hint: shotError.hint,
    });
  }

  return jsonResponse(200, {
    shotEvent,
  });
});
