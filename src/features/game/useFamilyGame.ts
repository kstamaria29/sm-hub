import { useCallback, useEffect, useMemo, useState } from "react";
import { RealtimeChannel } from "@supabase/supabase-js";

import { Database, Json } from "../../lib/database.types";
import { getSupabaseClient, isSupabaseConfigured } from "../../lib/supabase";

type GameRow = Database["public"]["Tables"]["games"]["Row"];
type GamePlayerRow = Database["public"]["Tables"]["game_players"]["Row"];
type GameEventRow = Database["public"]["Tables"]["game_events"]["Row"];

type UserProfileName = {
  user_id: string;
  display_name: string | null;
};

export type GamePlayerView = {
  userId: string;
  playerOrder: number;
  tilePosition: number;
  displayName: string;
};

export type GameEventView = {
  id: number;
  eventType: string;
  payload: Json;
  createdAt: string;
};

export type FamilyGameState = {
  configured: boolean;
  loading: boolean;
  startingGame: boolean;
  rolling: boolean;
  error: string | null;
  role: "admin" | "member" | null;
  roomTitle: string;
  game: GameRow | null;
  players: GamePlayerView[];
  events: GameEventView[];
  canStartGame: boolean;
  canRoll: boolean;
  isMyTurn: boolean;
  currentUserId: string | null;
  refresh: () => Promise<void>;
  startGame: () => Promise<boolean>;
  rollMove: () => Promise<boolean>;
};

function formatFallbackUserLabel(userId: string): string {
  return `User ${userId.slice(0, 8)}`;
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const segment = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  return `${segment()}${segment()}-${segment()}-${segment()}-${segment()}-${segment()}${segment()}${segment()}`;
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

export function useFamilyGame(): FamilyGameState {
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [loading, setLoading] = useState(true);
  const [startingGame, setStartingGame] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "member" | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [gameRoomId, setGameRoomId] = useState<string | null>(null);
  const [roomTitle, setRoomTitle] = useState("Snakes and Ladders");
  const [game, setGame] = useState<GameRow | null>(null);
  const [players, setPlayers] = useState<GamePlayerView[]>([]);
  const [events, setEvents] = useState<GameEventView[]>([]);

  const load = useCallback(async () => {
    if (!supabase || !isSupabaseConfigured) {
      setLoading(false);
      setError("Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to enable games.");
      return;
    }

    setLoading(true);
    setError(null);

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      setLoading(false);
      setError(sessionError.message);
      return;
    }

    const sessionUser = sessionData.session?.user;
    if (!sessionUser) {
      setLoading(false);
      setError("Sign in is required before games can load.");
      return;
    }

    setCurrentUserId(sessionUser.id);

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("family_id")
      .eq("user_id", sessionUser.id)
      .maybeSingle();

    if (profileError) {
      setLoading(false);
      setError(profileError.message);
      return;
    }

    if (!profile?.family_id) {
      setLoading(false);
      setError("No family found for this user profile.");
      return;
    }

    setFamilyId(profile.family_id);

    const { data: membership, error: membershipError } = await supabase
      .from("family_members")
      .select("role,status")
      .eq("family_id", profile.family_id)
      .eq("user_id", sessionUser.id)
      .maybeSingle();

    if (membershipError || !membership || membership.status !== "active") {
      setLoading(false);
      setError(membershipError?.message ?? "No active family membership found.");
      return;
    }

    setRole(membership.role === "admin" ? "admin" : "member");

    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id,title")
      .eq("family_id", profile.family_id)
      .eq("kind", "game")
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
        .select("user_id,display_name")
        .eq("family_id", profile.family_id)
        .in("user_id", playerUserIds);

      if (namesError) {
        setLoading(false);
        setError(namesError.message);
        return;
      }

      profileRows = (names ?? []) as UserProfileName[];
    }

    const namesByUserId = new Map(profileRows.map((entry) => [entry.user_id, entry.display_name]));
    setPlayers(
      playerRows.map((player) => ({
        userId: player.user_id,
        playerOrder: player.player_order,
        tilePosition: player.tile_position,
        displayName: namesByUserId.get(player.user_id) ?? formatFallbackUserLabel(player.user_id),
      })),
    );

    const { data: gameEvents, error: eventsError } = await supabase
      .from("game_events")
      .select("id,event_type,payload,created_at")
      .eq("game_id", currentGame.id)
      .order("id", { ascending: false })
      .limit(20);

    if (eventsError) {
      setLoading(false);
      setError(eventsError.message);
      return;
    }

    setEvents(
      ((gameEvents ?? []) as Pick<GameEventRow, "id" | "event_type" | "payload" | "created_at">[]).map((entry) => ({
        id: entry.id,
        eventType: entry.event_type,
        payload: entry.payload,
        createdAt: entry.created_at,
      })),
    );
    setLoading(false);
  }, [supabase]);

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

  const startGame = useCallback(async () => {
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
    error,
    role,
    roomTitle,
    game,
    players,
    events,
    canStartGame: role === "admin" && gameRoomId !== null && game === null,
    canRoll: Boolean(game && game.status === "active" && isMyTurn),
    isMyTurn,
    currentUserId,
    refresh: load,
    startGame,
    rollMove,
  };
}
