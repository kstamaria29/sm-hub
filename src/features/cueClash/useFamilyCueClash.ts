import { useCallback, useEffect, useMemo, useState } from "react";
import { RealtimeChannel } from "@supabase/supabase-js";

import { Database, Json } from "../../lib/database.types";
import { getSupabaseClient, isSupabaseConfigured } from "../../lib/supabase";

type CueClashGameRow = Database["public"]["Tables"]["cue_clash_games"]["Row"];
type CueClashPlayerRow = Database["public"]["Tables"]["cue_clash_players"]["Row"];
type CueClashEventRow = Database["public"]["Tables"]["cue_clash_events"]["Row"];

export type CueClashPlayerView = {
  userId: string;
  playerOrder: number;
  suit: "solids" | "stripes" | null;
  fouls: number;
  displayName: string;
};

export type CueClashEventView = {
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

export type FamilyCueClashState = {
  configured: boolean;
  loading: boolean;
  startingGame: boolean;
  shooting: boolean;
  endingGame: boolean;
  error: string | null;
  role: "admin" | "member" | null;
  roomTitle: string;
  roomId: string | null;
  game: CueClashGameRow | null;
  players: CueClashPlayerView[];
  events: CueClashEventView[];
  familyMembers: FamilyMemberOption[];
  currentUserId: string | null;
  isMyTurn: boolean;
  canStartGame: boolean;
  canShoot: boolean;
  canEndGame: boolean;
  refresh: () => Promise<void>;
  startGame: (playerUserIds?: string[]) => Promise<boolean>;
  shoot: (direction: { x: number; y: number }, power: number) => Promise<boolean>;
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

export function useFamilyCueClash(): FamilyCueClashState {
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [loading, setLoading] = useState(true);
  const [startingGame, setStartingGame] = useState(false);
  const [shooting, setShooting] = useState(false);
  const [endingGame, setEndingGame] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [familyId, setFamilyId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomTitle, setRoomTitle] = useState("Cue Clash");
  const [role, setRole] = useState<"admin" | "member" | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [familyMembers, setFamilyMembers] = useState<FamilyMemberOption[]>([]);
  const [game, setGame] = useState<CueClashGameRow | null>(null);
  const [players, setPlayers] = useState<CueClashPlayerView[]>([]);
  const [events, setEvents] = useState<CueClashEventView[]>([]);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      setError("Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to enable Cue Clash.");
      setRole(null);
      setRoomId(null);
      setFamilyMembers([]);
      setGame(null);
      setPlayers([]);
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
      setError("Sign in is required before Cue Clash can load.");
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
      setFamilyId(null);
      setFamilyMembers([]);
      setRoomId(null);
      setGame(null);
      setPlayers([]);
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

    const activeMembers = (activeMembersData ?? []) as Pick<
      Database["public"]["Tables"]["family_members"]["Row"],
      "user_id" | "role"
    >[];
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
      .eq("slug", "cue-clash")
      .maybeSingle();

    if (roomError) {
      setLoading(false);
      setError(roomError.message);
      return;
    }

    if (!room) {
      setLoading(false);
      setError("No Cue Clash room is available for this family.");
      setRoomId(null);
      setGame(null);
      setPlayers([]);
      setEvents([]);
      return;
    }

    setRoomId(room.id);
    setRoomTitle(room.title);

    const { data: currentGameData, error: gameError } = await supabase
      .from("cue_clash_games")
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

    const currentGame = (currentGameData as CueClashGameRow | null) ?? null;

    if (!currentGame) {
      setGame(null);
      setPlayers([]);
      setEvents([]);
      setLoading(false);
      return;
    }

    setGame(currentGame);

    const { data: gamePlayers, error: playersError } = await supabase
      .from("cue_clash_players")
      .select("user_id,player_order,suit,fouls")
      .eq("game_id", currentGame.id)
      .order("player_order", { ascending: true });

    if (playersError) {
      setLoading(false);
      setError(playersError.message);
      return;
    }

    const playerRows = (gamePlayers ?? []) as Pick<CueClashPlayerRow, "user_id" | "player_order" | "suit" | "fouls">[];
    const namesByUserId = new Map(activeMemberNames.map((entry) => [entry.user_id, entry.display_name]));
    setPlayers(
      playerRows.map((player) => ({
        userId: player.user_id,
        playerOrder: player.player_order,
        suit: player.suit,
        fouls: player.fouls,
        displayName: namesByUserId.get(player.user_id) ?? formatFallbackUserLabel(player.user_id),
      })),
    );

    const { data: gameEvents, error: eventsError } = await supabase
      .from("cue_clash_events")
      .select("id,event_type,payload,created_at,created_by")
      .eq("game_id", currentGame.id)
      .order("id", { ascending: false })
      .limit(20);

    if (eventsError) {
      setLoading(false);
      setError(eventsError.message);
      return;
    }

    const eventRows = (gameEvents ?? []) as Pick<CueClashEventRow, "id" | "event_type" | "payload" | "created_at" | "created_by">[];
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
      .channel(`cue-clash-sync:${familyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cue_clash_games", filter: `family_id=eq.${familyId}` },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cue_clash_players", filter: `family_id=eq.${familyId}` },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "cue_clash_events", filter: `family_id=eq.${familyId}` },
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

      const { error: invokeError } = await supabase.functions.invoke("cue-clash-start", {
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

  const shoot = useCallback(
    async (direction: { x: number; y: number }, power: number) => {
      if (!supabase || !game || game.status !== "active") {
        return false;
      }

      setShooting(true);
      setError(null);

      const accessToken = await resolveAccessToken();
      if (!accessToken) {
        setError("Your session is invalid or expired. Please sign out and sign in again.");
        setShooting(false);
        return false;
      }

      const { error: invokeError } = await supabase.functions.invoke("cue-clash-shot", {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: {
          gameId: game.id,
          requestId: createRequestId(),
          direction,
          power,
        },
      });

      if (invokeError) {
        setError(await parseFunctionInvokeError(invokeError as { message: string; context?: Response }));
        setShooting(false);
        return false;
      }

      await load();
      setShooting(false);
      return true;
    },
    [game, load, resolveAccessToken, supabase],
  );

  const endGame = useCallback(async () => {
    if (!supabase || !game || role !== "admin") {
      return false;
    }

    setEndingGame(true);
    setError(null);

    try {
      const accessToken = await resolveAccessToken();
      if (!accessToken) {
        setError("Your session is invalid or expired. Please sign out and sign in again.");
        return false;
      }

      const { error: invokeError } = await supabase.functions.invoke("cue-clash-end", {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: {
          gameId: game.id,
          reason: "admin_end",
        },
      });

      if (invokeError) {
        setError(await parseFunctionInvokeError(invokeError as { message: string; context?: Response }));
        return false;
      }

      setGame(null);
      setPlayers([]);
      setEvents([]);
      await load();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to end Cue Clash game.";
      setError(message);
      return false;
    } finally {
      setEndingGame(false);
    }
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
    shooting,
    endingGame,
    error,
    role,
    roomTitle,
    roomId,
    game,
    players,
    events,
    familyMembers,
    currentUserId,
    isMyTurn,
    canStartGame: role === "admin" && roomId !== null && game === null,
    canShoot: Boolean(game && game.status === "active" && isMyTurn),
    canEndGame: Boolean(game && role === "admin" && (game.status === "active" || game.status === "pending")),
    refresh: load,
    startGame,
    shoot,
    endGame,
  };
}
