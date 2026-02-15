import { useCallback, useEffect, useMemo, useState } from "react";
import { RealtimeChannel } from "@supabase/supabase-js";

import { AvatarExpression, createSignedAvatarUrl } from "../avatar/avatarPack";
import { BoardSkinId, DEFAULT_BOARD_SKIN_ID, isBoardSkinId } from "./boardSkins";
import { Database, Json } from "../../lib/database.types";
import { getSupabaseClient, isSupabaseConfigured } from "../../lib/supabase";

type GameRow = Database["public"]["Tables"]["games"]["Row"];
type GamePlayerRow = Database["public"]["Tables"]["game_players"]["Row"];
type GameEventRow = Database["public"]["Tables"]["game_events"]["Row"];

type UserProfileName = {
  user_id: string;
  display_name: string | null;
  avatar_style_id: string | null;
};

type AvatarPackPathRow = {
  user_id: string;
  style_id: string;
  base_path: string;
};

export type GamePlayerView = {
  userId: string;
  playerOrder: number;
  tilePosition: number;
  displayName: string;
  expression: AvatarExpression;
  avatarUrl: string | null;
};

export type GameEventView = {
  id: number;
  eventType: string;
  payload: Json;
  createdAt: string;
  createdBy: string | null;
};

export type FamilyMemberOption = {
  userId: string;
  role: "admin" | "member";
  displayName: string;
};

export type FamilyGameState = {
  configured: boolean;
  loading: boolean;
  startingGame: boolean;
  rolling: boolean;
  endingGame: boolean;
  savingBoardSkin: boolean;
  error: string | null;
  role: "admin" | "member" | null;
  roomTitle: string;
  game: GameRow | null;
  boardSkinId: BoardSkinId;
  cinematicsEnabled: boolean;
  familyMembers: FamilyMemberOption[];
  players: GamePlayerView[];
  events: GameEventView[];
  canStartGame: boolean;
  canRoll: boolean;
  canEndGame: boolean;
  isMyTurn: boolean;
  currentUserId: string | null;
  refresh: () => Promise<void>;
  startGame: (playerUserIds?: string[]) => Promise<boolean>;
  rollMove: () => Promise<boolean>;
  endGame: () => Promise<boolean>;
  setBoardSkin: (skinId: BoardSkinId) => Promise<boolean>;
};

function formatFallbackUserLabel(userId: string): string {
  return `User ${userId.slice(0, 8)}`;
}

function asJsonObject(value: Json): Record<string, Json> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, Json>;
  }

  return null;
}

function toStringValue(value: Json | undefined): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  return null;
}

function resolvePreferredAvatarPackPath(
  packRows: AvatarPackPathRow[],
  preferredStyleId: string | null,
): string | null {
  if (packRows.length === 0) {
    return null;
  }

  if (preferredStyleId) {
    const preferredPack = packRows.find((pack) => pack.style_id === preferredStyleId);
    if (preferredPack) {
      return preferredPack.base_path;
    }
  }

  return packRows[0].base_path;
}

function resolvePlayerExpression(
  gameRow: GameRow,
  latestRollEvent: GameEventView | null,
  playerUserId: string,
): AvatarExpression {
  if (gameRow.status === "finished" && gameRow.winner_user_id) {
    return gameRow.winner_user_id === playerUserId ? "happy" : "crying";
  }

  if (!latestRollEvent || latestRollEvent.createdBy !== playerUserId) {
    return "neutral";
  }

  const payload = asJsonObject(latestRollEvent.payload);
  const transition = toStringValue(payload?.transition);

  if (transition === "ladder") {
    return "happy";
  }

  if (transition === "snake") {
    return "angry";
  }

  if (transition === "big_snake") {
    return "crying";
  }

  return "neutral";
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  return template.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    if (char === "x") {
      return random.toString(16);
    }

    return ((random & 0x3) | 0x8).toString(16);
  });
}

async function parseFunctionInvokeError(error: { message: string; context?: Response }): Promise<string> {
  const context = error.context;
  if (!context) {
    return error.message;
  }

  try {
    const payload = (await context.clone().json()) as { error?: unknown; message?: unknown };
    if (typeof payload.error === "string" && payload.error.trim().length > 0) {
      return payload.error;
    }

    if (typeof payload.message === "string" && payload.message.trim().length > 0) {
      return payload.message;
    }
  } catch {
    // Fall through to text parsing.
  }

  try {
    const text = await context.text();
    if (text.trim().length > 0) {
      return text;
    }
  } catch {
    // Fall through to default message.
  }

  return error.message;
}

export function useFamilyGame(roomSlug = "snakes-ladders"): FamilyGameState {
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [loading, setLoading] = useState(true);
  const [startingGame, setStartingGame] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [endingGame, setEndingGame] = useState(false);
  const [savingBoardSkin, setSavingBoardSkin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "member" | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [gameRoomId, setGameRoomId] = useState<string | null>(null);
  const [roomTitle, setRoomTitle] = useState("Snakes and Ladders");
  const [game, setGame] = useState<GameRow | null>(null);
  const [boardSkinId, setBoardSkinId] = useState<BoardSkinId>(DEFAULT_BOARD_SKIN_ID);
  const [cinematicsEnabled, setCinematicsEnabled] = useState(true);
  const [familyMembers, setFamilyMembers] = useState<FamilyMemberOption[]>([]);
  const [players, setPlayers] = useState<GamePlayerView[]>([]);
  const [events, setEvents] = useState<GameEventView[]>([]);

  const load = useCallback(async () => {
    if (!supabase || !isSupabaseConfigured) {
      setLoading(false);
      setError("Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to enable games.");
      setBoardSkinId(DEFAULT_BOARD_SKIN_ID);
      setCinematicsEnabled(true);
      setFamilyMembers([]);
      return;
    }

    setLoading(true);
    setError(null);

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      setLoading(false);
      setError(sessionError.message);
      setBoardSkinId(DEFAULT_BOARD_SKIN_ID);
      setCinematicsEnabled(true);
      setFamilyMembers([]);
      return;
    }

    const sessionUser = sessionData.session?.user;
    if (!sessionUser) {
      setLoading(false);
      setError("Sign in is required before games can load.");
      setBoardSkinId(DEFAULT_BOARD_SKIN_ID);
      setCinematicsEnabled(true);
      setFamilyMembers([]);
      return;
    }

    setCurrentUserId(sessionUser.id);

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("family_id,board_skin_id,cinematics_enabled")
      .eq("user_id", sessionUser.id)
      .maybeSingle();

    if (profileError) {
      setLoading(false);
      setError(profileError.message);
      setBoardSkinId(DEFAULT_BOARD_SKIN_ID);
      setCinematicsEnabled(true);
      setFamilyMembers([]);
      return;
    }

    if (!profile?.family_id) {
      setLoading(false);
      setError("No family found for this user profile.");
      setBoardSkinId(DEFAULT_BOARD_SKIN_ID);
      setCinematicsEnabled(true);
      setFamilyMembers([]);
      return;
    }

    setFamilyId(profile.family_id);
    setBoardSkinId(isBoardSkinId(profile.board_skin_id) ? profile.board_skin_id : DEFAULT_BOARD_SKIN_ID);
    setCinematicsEnabled(profile.cinematics_enabled ?? true);

    const { data: membership, error: membershipError } = await supabase
      .from("family_members")
      .select("role,status")
      .eq("family_id", profile.family_id)
      .eq("user_id", sessionUser.id)
      .maybeSingle();

    if (membershipError || !membership || membership.status !== "active") {
      setLoading(false);
      setError(membershipError?.message ?? "No active family membership found.");
      setFamilyMembers([]);
      return;
    }

    setRole(membership.role === "admin" ? "admin" : "member");

    const { data: activeMembersData, error: activeMembersError } = await supabase
      .from("family_members")
      .select("user_id,role")
      .eq("family_id", profile.family_id)
      .eq("status", "active")
      .order("joined_at", { ascending: true });

    if (activeMembersError) {
      setLoading(false);
      setError(activeMembersError.message);
      return;
    }

    const activeMembers = (activeMembersData ?? []) as Pick<Database["public"]["Tables"]["family_members"]["Row"], "user_id" | "role">[];
    const activeMemberUserIds = activeMembers.map((entry) => entry.user_id);
    let activeMemberNames: Pick<Database["public"]["Tables"]["user_profiles"]["Row"], "user_id" | "display_name">[] = [];
    if (activeMemberUserIds.length > 0) {
      const { data: activeMemberProfiles, error: activeMemberProfilesError } = await supabase
        .from("user_profiles")
        .select("user_id,display_name")
        .eq("family_id", profile.family_id)
        .in("user_id", activeMemberUserIds);

      if (activeMemberProfilesError) {
        setLoading(false);
        setError(activeMemberProfilesError.message);
        return;
      }

      activeMemberNames =
        (activeMemberProfiles ?? []) as Pick<Database["public"]["Tables"]["user_profiles"]["Row"], "user_id" | "display_name">[];
    }

    const activeMemberNamesByUserId = new Map(activeMemberNames.map((entry) => [entry.user_id, entry.display_name]));
    setFamilyMembers(
      activeMembers.map((entry) => ({
        userId: entry.user_id,
        role: entry.role === "admin" ? "admin" : "member",
        displayName: activeMemberNamesByUserId.get(entry.user_id) ?? formatFallbackUserLabel(entry.user_id),
      })),
    );

    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id,title")
      .eq("family_id", profile.family_id)
      .eq("kind", "game")
      .eq("slug", roomSlug)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (roomError) {
      setLoading(false);
      setError(roomError.message);
      return;
    }

    if (!room) {
      setLoading(false);
      setError("No game room is available for this family.");
      setGame(null);
      setPlayers([]);
      setEvents([]);
      return;
    }

    setGameRoomId(room.id);
    setRoomTitle(room.title);

    const { data: currentGameData, error: gameError } = await supabase
      .from("games")
      .select("*")
      .eq("room_id", room.id)
      .in("status", ["pending", "active"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (gameError) {
      setLoading(false);
      setError(gameError.message);
      return;
    }

    const currentGame = (currentGameData as GameRow | null) ?? null;

    if (!currentGame) {
      setGame(null);
      setPlayers([]);
      setEvents([]);
      setLoading(false);
      return;
    }

    setGame(currentGame);

    const { data: gamePlayers, error: playersError } = await supabase
      .from("game_players")
      .select("user_id,player_order,tile_position")
      .eq("game_id", currentGame.id)
      .order("player_order", { ascending: true });

    if (playersError) {
      setLoading(false);
      setError(playersError.message);
      return;
    }

    const playerRows = (gamePlayers ?? []) as Pick<GamePlayerRow, "user_id" | "player_order" | "tile_position">[];
    const playerUserIds = playerRows.map((player) => player.user_id);

    let profileRows: UserProfileName[] = [];
    if (playerUserIds.length > 0) {
      const { data: names, error: namesError } = await supabase
        .from("user_profiles")
        .select("user_id,display_name,avatar_style_id")
        .eq("family_id", profile.family_id)
        .in("user_id", playerUserIds);

      if (namesError) {
        setLoading(false);
        setError(namesError.message);
        return;
      }

      profileRows = (names ?? []) as UserProfileName[];
    }

    const { data: gameEvents, error: eventsError } = await supabase
      .from("game_events")
      .select("id,event_type,payload,created_at,created_by")
      .eq("game_id", currentGame.id)
      .order("id", { ascending: false })
      .limit(20);

    if (eventsError) {
      setLoading(false);
      setError(eventsError.message);
      return;
    }

    const eventRows = (gameEvents ?? []) as Pick<GameEventRow, "id" | "event_type" | "payload" | "created_at" | "created_by">[];
    const eventViews: GameEventView[] = eventRows.map((entry) => ({
      id: entry.id,
      eventType: entry.event_type,
      payload: entry.payload,
      createdAt: entry.created_at,
      createdBy: entry.created_by,
    }));
    const latestRollEvent = eventViews.find((event) => event.eventType === "roll_move") ?? null;

    const profilesByUserId = new Map(profileRows.map((entry) => [entry.user_id, entry]));
    const expressionByUserId = new Map(
      playerRows.map((player) => [player.user_id, resolvePlayerExpression(currentGame, latestRollEvent, player.user_id)]),
    );

    let avatarPackRows: AvatarPackPathRow[] = [];
    if (playerUserIds.length > 0) {
      const { data: packData, error: packError } = await supabase
        .from("avatar_packs")
        .select("user_id,style_id,base_path")
        .eq("family_id", profile.family_id)
        .eq("status", "ready")
        .in("user_id", playerUserIds)
        .order("created_at", { ascending: false });

      if (packError) {
        setLoading(false);
        setError(packError.message);
        return;
      }

      avatarPackRows = (packData ?? []) as AvatarPackPathRow[];
    }

    const avatarPackRowsByUserId = avatarPackRows.reduce<Map<string, AvatarPackPathRow[]>>((acc, row) => {
      const existingRows = acc.get(row.user_id);
      if (existingRows) {
        existingRows.push(row);
      } else {
        acc.set(row.user_id, [row]);
      }

      return acc;
    }, new Map());

    const avatarUrlByUserId = new Map<string, string | null>();
    await Promise.all(
      playerRows.map(async (player) => {
        const profileEntry = profilesByUserId.get(player.user_id);
        const userPackRows = avatarPackRowsByUserId.get(player.user_id) ?? [];
        const basePath = resolvePreferredAvatarPackPath(userPackRows, profileEntry?.avatar_style_id ?? null);
        if (!basePath) {
          avatarUrlByUserId.set(player.user_id, null);
          return;
        }

        const expression = expressionByUserId.get(player.user_id) ?? "neutral";
        const imagePath = `${basePath}/${expression}.png`;
        const signedUrl = await createSignedAvatarUrl(supabase, imagePath, 60 * 30);
        avatarUrlByUserId.set(player.user_id, signedUrl);
      }),
    );

    const namesByUserId = new Map(profileRows.map((entry) => [entry.user_id, entry.display_name]));
    setPlayers(
      playerRows.map((player) => ({
        userId: player.user_id,
        playerOrder: player.player_order,
        tilePosition: player.tile_position,
        displayName: namesByUserId.get(player.user_id) ?? formatFallbackUserLabel(player.user_id),
        expression: expressionByUserId.get(player.user_id) ?? "neutral",
        avatarUrl: avatarUrlByUserId.get(player.user_id) ?? null,
      })),
    );

    setEvents(
      eventViews.map((entry) => ({
        id: entry.id,
        eventType: entry.eventType,
        payload: entry.payload,
        createdAt: entry.createdAt,
        createdBy: entry.createdBy,
      })),
    );
    setLoading(false);
  }, [roomSlug, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!supabase || !familyId) {
      return;
    }

    const channel: RealtimeChannel = supabase
      .channel(`game-sync:${familyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games", filter: `family_id=eq.${familyId}` },
        () => {
          void load();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_players", filter: `family_id=eq.${familyId}` },
        () => {
          void load();
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "game_events", filter: `family_id=eq.${familyId}` },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [familyId, load, supabase]);

  const resolveAccessToken = useCallback(async () => {
    if (!supabase) {
      return null;
    }

    const { data: refreshData } = await supabase.auth.refreshSession();
    let accessToken = refreshData.session?.access_token ?? null;

    if (!accessToken) {
      const { data: sessionData } = await supabase.auth.getSession();
      accessToken = sessionData.session?.access_token ?? null;
    }

    return accessToken;
  }, [supabase]);

  const startGame = useCallback(async (playerUserIds?: string[]) => {
    if (!supabase || !gameRoomId || role !== "admin") {
      return false;
    }

    setStartingGame(true);
    setError(null);

    const accessToken = await resolveAccessToken();
    if (!accessToken) {
      setError("Your session is invalid or expired. Please sign out and sign in again.");
      setStartingGame(false);
      return false;
    }

    const { error: invokeError } = await supabase.functions.invoke("game-start", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: {
        roomId: gameRoomId,
        ...(playerUserIds && playerUserIds.length > 0 ? { playerUserIds } : {}),
      },
    });

    if (invokeError) {
      setError(await parseFunctionInvokeError(invokeError as { message: string; context?: Response }));
      setStartingGame(false);
      return false;
    }

    await load();
    setStartingGame(false);
    return true;
  }, [gameRoomId, load, resolveAccessToken, role, supabase]);

  const rollMove = useCallback(async () => {
    if (!supabase || !game || game.status !== "active") {
      return false;
    }

    setRolling(true);
    setError(null);

    const accessToken = await resolveAccessToken();
    if (!accessToken) {
      setError("Your session is invalid or expired. Please sign out and sign in again.");
      setRolling(false);
      return false;
    }

    const { error: invokeError } = await supabase.functions.invoke("game-roll-move", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: {
        gameId: game.id,
        requestId: createRequestId(),
      },
    });

    if (invokeError) {
      setError(await parseFunctionInvokeError(invokeError as { message: string; context?: Response }));
      setRolling(false);
      return false;
    }

    await load();
    setRolling(false);
    return true;
  }, [game, load, resolveAccessToken, supabase]);

  const endGame = useCallback(async () => {
    if (!supabase || !game || role !== "admin") {
      return false;
    }

    setEndingGame(true);
    setError(null);

    const accessToken = await resolveAccessToken();
    if (!accessToken) {
      setError("Your session is invalid or expired. Please sign out and sign in again.");
      setEndingGame(false);
      return false;
    }

    const { error: invokeError } = await supabase.functions.invoke("game-end", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: {
        gameId: game.id,
        reason: "admin_end",
      },
    });

    if (invokeError) {
      setError(await parseFunctionInvokeError(invokeError as { message: string; context?: Response }));
      setEndingGame(false);
      return false;
    }

    await load();
    setEndingGame(false);
    return true;
  }, [game, load, resolveAccessToken, role, supabase]);

  const setBoardSkin = useCallback(
    async (skinId: BoardSkinId) => {
      if (!supabase || !familyId || !currentUserId) {
        return false;
      }

      if (boardSkinId === skinId) {
        return true;
      }

      const previousSkinId = boardSkinId;
      setBoardSkinId(skinId);
      setSavingBoardSkin(true);
      setError(null);

      const { error: updateError } = await supabase
        .from("user_profiles")
        .update({ board_skin_id: skinId })
        .eq("user_id", currentUserId)
        .eq("family_id", familyId);

      if (updateError) {
        setBoardSkinId(previousSkinId);
        setError(updateError.message);
        setSavingBoardSkin(false);
        return false;
      }

      setSavingBoardSkin(false);
      return true;
    },
    [boardSkinId, currentUserId, familyId, supabase],
  );

  const isMyTurn = Boolean(
    game &&
      game.status === "active" &&
      currentUserId &&
      game.current_turn_user_id &&
      game.current_turn_user_id === currentUserId,
  );

  return {
    configured: isSupabaseConfigured,
    loading,
    startingGame,
    rolling,
    endingGame,
    savingBoardSkin,
    error,
    role,
    roomTitle,
    game,
    boardSkinId,
    cinematicsEnabled,
    familyMembers,
    players,
    events,
    canStartGame: role === "admin" && gameRoomId !== null && game === null,
    canRoll: Boolean(game && game.status === "active" && isMyTurn),
    canEndGame: Boolean(game && role === "admin" && (game.status === "active" || game.status === "pending")),
    isMyTurn,
    currentUserId,
    refresh: load,
    startGame,
    rollMove,
    endGame,
    setBoardSkin,
  };
}
