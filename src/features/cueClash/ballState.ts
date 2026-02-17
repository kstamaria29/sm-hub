import { Json } from "../../lib/database.types";

export type CueClashTable = {
  width: number;
  height: number;
  ballRadius: number;
  pocketRadius: number;
};

export type CueClashBallsState = {
  version: 1;
  positionScale: number;
  table: CueClashTable;
  pocketedMask: number;
  positions: number[];
};

export type CueClashReplayFrame = {
  positions: number[];
  pocketedMask: number;
};

export type CueClashReplay = {
  version: 1;
  frameRate: number;
  positionScale: number;
  table: CueClashTable;
  frames: CueClashReplayFrame[];
};

function asJsonObject(value: Json): Record<string, Json> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, Json>;
  }

  return null;
}

function asNumber(value: Json | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asInteger(value: Json | undefined): number | null {
  const num = asNumber(value);
  if (num === null || !Number.isInteger(num)) {
    return null;
  }

  return num;
}

function asNumberArray(value: Json | undefined): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const parsed: number[] = [];
  for (const entry of value) {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      return null;
    }
    parsed.push(entry);
  }

  return parsed;
}

export function parseCueClashBallsState(raw: Json): CueClashBallsState | null {
  const obj = asJsonObject(raw);
  if (!obj) {
    return null;
  }

  const version = asInteger(obj.version);
  const positionScale = asInteger(obj.position_scale);
  const pocketedMask = asInteger(obj.pocketed_mask);
  const positions = asNumberArray(obj.positions);
  const tableObj = asJsonObject(obj.table ?? null);

  const width = asNumber(tableObj?.width);
  const height = asNumber(tableObj?.height);
  const ballRadius = asNumber(tableObj?.ball_radius);
  const pocketRadius = asNumber(tableObj?.pocket_radius);

  if (version !== 1 || !positionScale || positionScale <= 0) {
    return null;
  }

  if (pocketedMask === null || pocketedMask < 0 || pocketedMask > 0xffff) {
    return null;
  }

  if (!positions || positions.length !== 32) {
    return null;
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
    return null;
  }

  return {
    version: 1,
    positionScale,
    table: {
      width,
      height,
      ballRadius,
      pocketRadius,
    },
    pocketedMask,
    positions: positions.map((value) => Math.trunc(value)),
  };
}

export function cueClashIsBallPocketed(state: CueClashBallsState, ballId: number): boolean {
  if (!Number.isInteger(ballId) || ballId < 0 || ballId > 15) {
    return false;
  }

  return (state.pocketedMask & (1 << ballId)) !== 0;
}

export function cueClashBallPosition(
  state: CueClashBallsState,
  ballId: number,
): { x: number; y: number } | null {
  if (!Number.isInteger(ballId) || ballId < 0 || ballId > 15) {
    return null;
  }

  const index = ballId * 2;
  const x = state.positions[index];
  const y = state.positions[index + 1];
  if (!Number.isFinite(x) || !Number.isFinite(y) || state.positionScale <= 0) {
    return null;
  }

  return {
    x: x / state.positionScale,
    y: y / state.positionScale,
  };
}

export function parseCueClashReplay(raw: Json): CueClashReplay | null {
  const obj = asJsonObject(raw);
  if (!obj) {
    return null;
  }

  const version = asInteger(obj.version);
  const frameRate = asInteger(obj.frame_rate);
  const positionScale = asInteger(obj.position_scale);
  const tableObj = asJsonObject(obj.table ?? null);
  const framesRaw = obj.frames;

  const width = asNumber(tableObj?.width);
  const height = asNumber(tableObj?.height);
  const ballRadius = asNumber(tableObj?.ball_radius);
  const pocketRadius = asNumber(tableObj?.pocket_radius);

  if (version !== 1 || !frameRate || frameRate <= 0 || !positionScale || positionScale <= 0) {
    return null;
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
    return null;
  }

  if (!Array.isArray(framesRaw) || framesRaw.length === 0) {
    return null;
  }

  const frames: CueClashReplayFrame[] = [];
  for (const entry of framesRaw) {
    const frameObj = asJsonObject(entry as Json);
    if (!frameObj) {
      return null;
    }

    const pocketedMask = asInteger(frameObj.m);
    const positions = asNumberArray(frameObj.p);
    if (pocketedMask === null || pocketedMask < 0 || pocketedMask > 0xffff || !positions || positions.length !== 32) {
      return null;
    }

    frames.push({ positions: positions.map((value) => Math.trunc(value)), pocketedMask });
  }

  return {
    version: 1,
    frameRate,
    positionScale,
    table: {
      width,
      height,
      ballRadius,
      pocketRadius,
    },
    frames,
  };
}

