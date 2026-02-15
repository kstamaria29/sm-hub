import { useCallback, useEffect, useMemo, useState } from "react";
import { RealtimeChannel } from "@supabase/supabase-js";

import { Database, Json } from "../../lib/database.types";
import { getSupabaseClient, isSupabaseConfigured } from "../../lib/supabase";

type WordMasterGameRow = Database["public"]["Tables"]["word_master_games"]["Row"];
type WordMasterPlayerRow = Database["public"]["Tables"]["word_master_players"]["Row"];
type WordMasterBoardTileRow = Database["public"]["Tables"]["word_master_board_tiles"]["Row"];
type WordMasterEventRow = Database["public"]["Tables"]["word_master_events"]["Row"];

export type WordMasterPlayerView = {
  userId: string;
  playerOrder: number;
  score: number;
  rack: string[];
  displayName: string;
};

export type WordMasterEventView = {
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

export type WordMasterPlacement = {
  row: number;
  col: number;
  letter: string;
};

export type FamilyWordMasterState = {
  configured: boolean;
  loading: boolean;
  startingGame: boolean;
  playingTurn: boolean;
  passingTurn: boolean;
  endingGame: boolean;
  error: string | null;
  role: "admin" | "member" | null;
  roomTitle: string;
  roomId: string | null;
  game: WordMasterGameRow | null;
  players: WordMasterPlayerView[];
  boardTiles: WordMasterBoardTileRow[];
  events: WordMasterEventView[];
  familyMembers: FamilyMemberOption[];
  currentUserId: string | null;
  isMyTurn: boolean;
  canStartGame: boolean;
  canPlayTurn: boolean;
  canPassTurn: boolean;
  canEndGame: boolean;
  refresh: () => Promise<void>;
  startGame: (playerUserIds?: string[]) => Promise<boolean>;
  playTurn: (placements: WordMasterPlacement[]) => Promise<boolean>;
  passTurn: () => Promise<boolean>;
  endGame: () => Promise<boolean>;
};

function formatFallbackUserLabel(userId: string): string {
  return `User ${userId.slice(0, 8)}`;
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

export function useFamilyWordMaster(): FamilyWordMasterState {
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [loading, setLoading] = useState(true);
  const [startingGame, setStartingGame] = useState(false);
  const [playingTurn, setPlayingTurn] = useState(false);
  const [passingTurn, setPassingTurn] = useState(false);
  const [endingGame, setEndingGame] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [familyId, setFamilyId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomTitle, setRoomTitle] = useState("Word Master");
  const [role, setRole] = useState<"admin" | "member" | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [familyMembers, setFamilyMembers] = useState<FamilyMemberOption[]>([]);
  const [game, setGame] = useState<WordMasterGameRow | null>(null);
  const [players, setPlayers] = useState<WordMasterPlayerView[]>([]);
  const [boardTiles, setBoardTiles] = useState<WordMasterBoardTileRow[]>([]);
  const [events, setEvents] = useState<WordMasterEventView[]>([]);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      setError("Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to enable Word Master.");
      setRole(null);
      setRoomId(null);
      setFamilyMembers([]);
      setGame(null);
      setPlayers([]);
      setBoardTiles([]);
      setEvents([]);
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
      setError("Sign in is required before Word Master can load.");
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
      setRoomId(null);
      setFamilyMembers([]);
      setGame(null);
      setPlayers([]);
      setBoardTiles([]);
      setEvents([]);
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
      .eq("slug", "word-master")
      .maybeSingle();

    if (roomError) {
      setLoading(false);
      setError(roomError.message);
      return;
    }

    if (!room) {
      setLoading(false);
      setError("No Word Master room is available for this family.");
      setRoomId(null);
      setGame(null);
      setPlayers([]);
      setBoardTiles([]);
      setEvents([]);
      return;
    }

    setRoomId(room.id);
    setRoomTitle(room.title);

    const { data: currentGameData, error: gameError } = await supabase
      .from("word_master_games")
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

    const currentGame = (currentGameData as WordMasterGameRow | null) ?? null;

    if (!currentGame) {
      setGame(null);
      setPlayers([]);
      setBoardTiles([]);
      setEvents([]);
      setLoading(false);
      return;
    }

    setGame(currentGame);

    const { data: gamePlayers, error: playersError } = await supabase
      .from("word_master_players")
      .select("user_id,player_order,score,rack")
      .eq("game_id", currentGame.id)
      .order("player_order", { ascending: true });

    if (playersError) {
      setLoading(false);
      setError(playersError.message);
      return;
    }

    const playerRows =
      (gamePlayers ?? []) as Pick<WordMasterPlayerRow, "user_id" | "player_order" | "score" | "rack">[];
    const playerUserIds = playerRows.map((player) => player.user_id);

    let profileRows: Pick<Database["public"]["Tables"]["user_profiles"]["Row"], "user_id" | "display_name">[] = [];
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

      profileRows =
        (names ?? []) as Pick<Database["public"]["Tables"]["user_profiles"]["Row"], "user_id" | "display_name">[];
    }

    const namesByUserId = new Map(profileRows.map((entry) => [entry.user_id, entry.display_name]));
    setPlayers(
      playerRows.map((player) => ({
        userId: player.user_id,
        playerOrder: player.player_order,
        score: player.score,
        rack: player.rack ?? [],
        displayName: namesByUserId.get(player.user_id) ?? formatFallbackUserLabel(player.user_id),
      })),
    );

    const { data: tiles, error: tilesError } = await supabase
      .from("word_master_board_tiles")
      .select("row,col,letter,points,placed_by,placed_at_turn,created_at,family_id,game_id")
      .eq("game_id", currentGame.id);

    if (tilesError) {
      setLoading(false);
      setError(tilesError.message);
      return;
    }

    setBoardTiles((tiles ?? []) as WordMasterBoardTileRow[]);

    const { data: gameEvents, error: eventsError } = await supabase
      .from("word_master_events")
      .select("id,event_type,payload,created_at,created_by")
      .eq("game_id", currentGame.id)
      .order("id", { ascending: false })
      .limit(20);

    if (eventsError) {
      setLoading(false);
      setError(eventsError.message);
      return;
    }

    const eventRows = (gameEvents ?? []) as Pick<WordMasterEventRow, "id" | "event_type" | "payload" | "created_at" | "created_by">[];
    setEvents(
      eventRows.map((entry) => ({
        id: entry.id,
        eventType: entry.event_type,
        payload: entry.payload,
        createdAt: entry.created_at,
        createdBy: entry.created_by,
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
      .channel(`word-master-sync:${familyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "word_master_games", filter: `family_id=eq.${familyId}` },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "word_master_players", filter: `family_id=eq.${familyId}` },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "word_master_board_tiles", filter: `family_id=eq.${familyId}` },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "word_master_events", filter: `family_id=eq.${familyId}` },
        () => void load(),
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

  const startGame = useCallback(
    async (playerUserIds?: string[]) => {
      if (!supabase || !roomId || role !== "admin") {
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

      const { error: invokeError } = await supabase.functions.invoke("word-master-start", {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: {
          roomId,
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
    },
    [load, resolveAccessToken, role, roomId, supabase],
  );

  const playTurn = useCallback(
    async (placements: WordMasterPlacement[]) => {
      if (!supabase || !game || game.status !== "active") {
        return false;
      }

      setPlayingTurn(true);
      setError(null);

      const accessToken = await resolveAccessToken();
      if (!accessToken) {
        setError("Your session is invalid or expired. Please sign out and sign in again.");
        setPlayingTurn(false);
        return false;
      }

      const { error: invokeError } = await supabase.functions.invoke("word-master-play", {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: {
          gameId: game.id,
          requestId: createRequestId(),
          placements,
        },
      });

      if (invokeError) {
        setError(await parseFunctionInvokeError(invokeError as { message: string; context?: Response }));
        setPlayingTurn(false);
        return false;
      }

      await load();
      setPlayingTurn(false);
      return true;
    },
    [game, load, resolveAccessToken, supabase],
  );

  const passTurn = useCallback(async () => {
    if (!supabase || !game || game.status !== "active") {
      return false;
    }

    setPassingTurn(true);
    setError(null);

    const accessToken = await resolveAccessToken();
    if (!accessToken) {
      setError("Your session is invalid or expired. Please sign out and sign in again.");
      setPassingTurn(false);
      return false;
    }

    const { error: invokeError } = await supabase.functions.invoke("word-master-pass", {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        gameId: game.id,
        requestId: createRequestId(),
      },
    });

    if (invokeError) {
      setError(await parseFunctionInvokeError(invokeError as { message: string; context?: Response }));
      setPassingTurn(false);
      return false;
    }

    await load();
    setPassingTurn(false);
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

    const { error: invokeError } = await supabase.functions.invoke("word-master-end", {
      headers: { Authorization: `Bearer ${accessToken}` },
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
    playingTurn,
    passingTurn,
    endingGame,
    error,
    role,
    roomTitle,
    roomId,
    game,
    players,
    boardTiles,
    events,
    familyMembers,
    currentUserId,
    isMyTurn,
    canStartGame: role === "admin" && roomId !== null && game === null,
    canPlayTurn: Boolean(game && game.status === "active" && isMyTurn),
    canPassTurn: Boolean(game && game.status === "active" && isMyTurn),
    canEndGame: Boolean(game && role === "admin" && (game.status === "active" || game.status === "pending")),
    refresh: load,
    startGame,
    playTurn,
    passTurn,
    endGame,
  };
}

