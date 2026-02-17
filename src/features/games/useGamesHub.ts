import { useCallback, useEffect, useMemo, useState } from "react";
import { RealtimeChannel } from "@supabase/supabase-js";

import { Database } from "../../lib/database.types";
import { getSupabaseClient, isSupabaseConfigured } from "../../lib/supabase";

type RoomRow = Pick<Database["public"]["Tables"]["rooms"]["Row"], "id" | "slug" | "title">;
type SnakesGameRow = Pick<
  Database["public"]["Tables"]["games"]["Row"],
  "id" | "status" | "current_turn_user_id" | "created_at"
>;
type WordMasterGameRow = Pick<
  Database["public"]["Tables"]["word_master_games"]["Row"],
  "id" | "status" | "current_turn_user_id" | "created_at"
>;
type CueClashGameRow = Pick<
  Database["public"]["Tables"]["cue_clash_games"]["Row"],
  "id" | "status" | "current_turn_user_id" | "created_at"
>;

type GameSummary = {
  slug: "snakes-ladders" | "word-master" | "cue-clash";
  title: string;
  roomId: string | null;
  gameId: string | null;
  status: "none" | "pending" | "active";
  currentTurnUserId: string | null;
  currentTurnName: string | null;
  isMyTurn: boolean;
};

export type GamesHubState = {
  configured: boolean;
  loading: boolean;
  error: string | null;
  currentUserId: string | null;
  familyId: string | null;
  snakes: GameSummary;
  wordMaster: GameSummary;
  cueClash: GameSummary;
  refresh: () => Promise<void>;
};

function emptySummary(slug: GameSummary["slug"], title: string): GameSummary {
  return {
    slug,
    title,
    roomId: null,
    gameId: null,
    status: "none",
    currentTurnUserId: null,
    currentTurnName: null,
    isMyTurn: false,
  };
}

function resolveDisplayName(
  namesByUserId: Map<string, string>,
  userId: string | null,
): string | null {
  if (!userId) {
    return null;
  }

  return namesByUserId.get(userId) ?? `User ${userId.slice(0, 8)}`;
}

export function useGamesHub(): GamesHubState {
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [snakes, setSnakes] = useState<GameSummary>(() => emptySummary("snakes-ladders", "Snakes and Ladders"));
  const [wordMaster, setWordMaster] = useState<GameSummary>(() => emptySummary("word-master", "Word Master"));
  const [cueClash, setCueClash] = useState<GameSummary>(() => emptySummary("cue-clash", "Cue Clash"));

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      setError("Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to enable games.");
      setCurrentUserId(null);
      setFamilyId(null);
      setSnakes(emptySummary("snakes-ladders", "Snakes and Ladders"));
      setWordMaster(emptySummary("word-master", "Word Master"));
      setCueClash(emptySummary("cue-clash", "Cue Clash"));
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
      setFamilyId(null);
      setSnakes(emptySummary("snakes-ladders", "Snakes and Ladders"));
      setWordMaster(emptySummary("word-master", "Word Master"));
      setCueClash(emptySummary("cue-clash", "Cue Clash"));
      return;
    }

    setFamilyId(profile.family_id);

    const { data: rooms, error: roomsError } = await supabase
      .from("rooms")
      .select("id,slug,title")
      .eq("family_id", profile.family_id)
      .eq("kind", "game")
      .in("slug", ["snakes-ladders", "word-master", "cue-clash"]);

    if (roomsError) {
      setLoading(false);
      setError(roomsError.message);
      return;
    }

    const roomRows = (rooms ?? []) as RoomRow[];
    const snakesRoom = roomRows.find((room) => room.slug === "snakes-ladders") ?? null;
    const wordRoom = roomRows.find((room) => room.slug === "word-master") ?? null;
    const cueRoom = roomRows.find((room) => room.slug === "cue-clash") ?? null;

    const { data: names, error: namesError } = await supabase
      .from("user_profiles")
      .select("user_id,display_name")
      .eq("family_id", profile.family_id);

    if (namesError) {
      setLoading(false);
      setError(namesError.message);
      return;
    }

    const namesByUserId = new Map(
      (names ?? [])
        .filter((entry) => typeof entry.display_name === "string" && entry.display_name.trim().length > 0)
        .map((entry) => [entry.user_id, entry.display_name as string]),
    );

    let snakesGame: SnakesGameRow | null = null;
    if (snakesRoom?.id) {
      const { data, error: gameError } = await supabase
        .from("games")
        .select("id,status,current_turn_user_id,created_at")
        .eq("room_id", snakesRoom.id)
        .in("status", ["pending", "active"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (gameError) {
        setLoading(false);
        setError(gameError.message);
        return;
      }

      snakesGame = (data as SnakesGameRow | null) ?? null;
    }

    let wordGame: WordMasterGameRow | null = null;
    if (wordRoom?.id) {
      const { data, error: gameError } = await supabase
        .from("word_master_games")
        .select("id,status,current_turn_user_id,created_at")
        .eq("room_id", wordRoom.id)
        .in("status", ["pending", "active"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (gameError) {
        setLoading(false);
        setError(gameError.message);
        return;
      }

      wordGame = (data as WordMasterGameRow | null) ?? null;
    }

    const snakesTurnName = resolveDisplayName(namesByUserId, snakesGame?.current_turn_user_id ?? null);
    const wordTurnName = resolveDisplayName(namesByUserId, wordGame?.current_turn_user_id ?? null);

    let cueGame: CueClashGameRow | null = null;
    if (cueRoom?.id) {
      const { data, error: gameError } = await supabase
        .from("cue_clash_games")
        .select("id,status,current_turn_user_id,created_at")
        .eq("room_id", cueRoom.id)
        .in("status", ["pending", "active"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (gameError) {
        setLoading(false);
        setError(gameError.message);
        return;
      }

      cueGame = (data as CueClashGameRow | null) ?? null;
    }

    const cueTurnName = resolveDisplayName(namesByUserId, cueGame?.current_turn_user_id ?? null);

    setSnakes({
      slug: "snakes-ladders",
      title: snakesRoom?.title ?? "Snakes and Ladders",
      roomId: snakesRoom?.id ?? null,
      gameId: snakesGame?.id ?? null,
      status: snakesGame ? (snakesGame.status as "pending" | "active") : "none",
      currentTurnUserId: snakesGame?.current_turn_user_id ?? null,
      currentTurnName: snakesTurnName,
      isMyTurn: Boolean(snakesGame?.current_turn_user_id && snakesGame.current_turn_user_id === sessionUser.id),
    });

    setWordMaster({
      slug: "word-master",
      title: wordRoom?.title ?? "Word Master",
      roomId: wordRoom?.id ?? null,
      gameId: wordGame?.id ?? null,
      status: wordGame ? (wordGame.status as "pending" | "active") : "none",
      currentTurnUserId: wordGame?.current_turn_user_id ?? null,
      currentTurnName: wordTurnName,
      isMyTurn: Boolean(wordGame?.current_turn_user_id && wordGame.current_turn_user_id === sessionUser.id),
    });

    setCueClash({
      slug: "cue-clash",
      title: cueRoom?.title ?? "Cue Clash",
      roomId: cueRoom?.id ?? null,
      gameId: cueGame?.id ?? null,
      status: cueGame ? (cueGame.status as "pending" | "active") : "none",
      currentTurnUserId: cueGame?.current_turn_user_id ?? null,
      currentTurnName: cueTurnName,
      isMyTurn: Boolean(cueGame?.current_turn_user_id && cueGame.current_turn_user_id === sessionUser.id),
    });

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
      .channel(`games-hub:${familyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games", filter: `family_id=eq.${familyId}` },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "word_master_games", filter: `family_id=eq.${familyId}` },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cue_clash_games", filter: `family_id=eq.${familyId}` },
        () => void load(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [familyId, load, supabase]);

  return {
    configured: isSupabaseConfigured,
    loading,
    error,
    currentUserId,
    familyId,
    snakes,
    wordMaster,
    cueClash,
    refresh: load,
  };
}
