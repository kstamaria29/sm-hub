import { useCallback, useEffect, useMemo, useState } from "react";
import { RealtimeChannel } from "@supabase/supabase-js";

import { getSupabaseClient, isSupabaseConfigured } from "../../lib/supabase";

type ChatRoom = {
  id: string;
  family_id: string;
  title: string;
};

export type ChatMessage = {
  id: number;
  sender_id: string;
  content: string;
  created_at: string;
};

export type ChatMessageReaction = {
  id: number;
  message_id: number;
  user_id: string;
  reaction: string;
  created_at: string;
};

export type ChatMessageReactionsSummary = {
  counts: Record<string, number>;
  myReaction: string | null;
  total: number;
};

type UserProfileName = {
  user_id: string;
  display_name: string | null;
};

function byTimestampAscending(left: ChatMessage, right: ChatMessage) {
  if (left.created_at < right.created_at) {
    return -1;
  }

  if (left.created_at > right.created_at) {
    return 1;
  }

  return left.id - right.id;
}

export function useFamilyChat() {
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactionsByMessageId, setReactionsByMessageId] = useState<Map<number, ChatMessageReactionsSummary>>(new Map());
  const [senderNames, setSenderNames] = useState<Map<string, string>>(new Map());
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      setError("Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to enable chat.");
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
      setError("Sign in is required before chat can load.");
      return;
    }

    setSessionUserId(sessionUser.id);

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

    const { data: chatRoom, error: roomError } = await supabase
      .from("rooms")
      .select("id,family_id,title")
      .eq("family_id", profile.family_id)
      .eq("kind", "chat")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (roomError) {
      setLoading(false);
      setError(roomError.message);
      return;
    }

    if (!chatRoom) {
      setLoading(false);
      setError("No chat room is available for this family.");
      return;
    }

    setRoom(chatRoom);

    const { data: messageRows, error: messagesError } = await supabase
      .from("messages")
      .select("id,sender_id,content,created_at")
      .eq("room_id", chatRoom.id)
      .order("created_at", { ascending: true })
      .limit(100);

    if (messagesError) {
      setLoading(false);
      setError(messagesError.message);
      return;
    }

    const loadedMessages = (messageRows ?? []) as ChatMessage[];
    setMessages(loadedMessages);

    const messageIds = loadedMessages.map((message) => message.id);
    if (messageIds.length > 0) {
      const { data: reactionRows, error: reactionsError } = await supabase
        .from("message_reactions")
        .select("id,message_id,user_id,reaction,created_at")
        .eq("room_id", chatRoom.id)
        .in("message_id", messageIds);

      if (reactionsError) {
        setLoading(false);
        setError(reactionsError.message);
        return;
      }

      const rows = (reactionRows ?? []) as ChatMessageReaction[];
      const countsByMessage = new Map<number, Record<string, number>>();
      const myReactionByMessage = new Map<number, string>();

      for (const row of rows) {
        const counts = countsByMessage.get(row.message_id) ?? {};
        counts[row.reaction] = (counts[row.reaction] ?? 0) + 1;
        countsByMessage.set(row.message_id, counts);

        if (row.user_id === sessionUser.id) {
          myReactionByMessage.set(row.message_id, row.reaction);
        }
      }

      const next = new Map<number, ChatMessageReactionsSummary>();
      for (const messageId of messageIds) {
        const counts = countsByMessage.get(messageId) ?? {};
        const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
        next.set(messageId, {
          counts,
          myReaction: myReactionByMessage.get(messageId) ?? null,
          total,
        });
      }

      setReactionsByMessageId(next);
    } else {
      setReactionsByMessageId(new Map());
    }

    const senderIds = Array.from(new Set(loadedMessages.map((message) => message.sender_id)));
    if (senderIds.length > 0) {
      const { data: profiles, error: profileNamesError } = await supabase
        .from("user_profiles")
        .select("user_id,display_name")
        .eq("family_id", chatRoom.family_id)
        .in("user_id", senderIds);

      if (profileNamesError) {
        setLoading(false);
        setError(profileNamesError.message);
        return;
      }

      const rows = (profiles ?? []) as UserProfileName[];
      setSenderNames(
        new Map(
          rows
            .filter((entry) => Boolean(entry.display_name))
            .map((entry) => [entry.user_id, entry.display_name as string]),
        ),
      );
    } else {
      setSenderNames(new Map());
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!supabase || !room?.id) {
      return;
    }

    const channel: RealtimeChannel = supabase
      .channel(`chat-room:${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${room.id}`,
        },
        (payload) => {
          const incomingMessage = payload.new as ChatMessage;

          void (async () => {
            const { data: profile } = await supabase
              .from("user_profiles")
              .select("display_name")
              .eq("user_id", incomingMessage.sender_id)
              .maybeSingle();

            const displayName = profile?.display_name;
            if (displayName && displayName.trim().length > 0) {
              setSenderNames((current) => {
                if (current.get(incomingMessage.sender_id) === displayName) {
                  return current;
                }

                const next = new Map(current);
                next.set(incomingMessage.sender_id, displayName);
                return next;
              });
            }
          })();

          setMessages((current) => {
            if (current.some((message) => message.id === incomingMessage.id)) {
              return current;
            }

            return [...current, incomingMessage].sort(byTimestampAscending);
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_reactions",
          filter: `room_id=eq.${room.id}`,
        },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, supabase, room?.id]);

  const setReaction = useCallback(
    async (messageId: number, reaction: string) => {
      const normalized = reaction.trim();
      if (!normalized || !supabase || !room || !sessionUserId) {
        return false;
      }

      const existing = reactionsByMessageId.get(messageId)?.myReaction ?? null;
      if (existing === normalized) {
        const { error: deleteError } = await supabase
          .from("message_reactions")
          .delete()
          .eq("room_id", room.id)
          .eq("message_id", messageId)
          .eq("user_id", sessionUserId);

        if (deleteError) {
          setError(deleteError.message);
          return false;
        }

        await load();
        return true;
      }

      const { error: upsertError } = await supabase
        .from("message_reactions")
        .upsert(
          {
            family_id: room.family_id,
            room_id: room.id,
            message_id: messageId,
            user_id: sessionUserId,
            reaction: normalized,
          },
          { onConflict: "message_id,user_id" },
        );

      if (upsertError) {
        setError(upsertError.message);
        return false;
      }

      await load();
      return true;
    },
    [load, reactionsByMessageId, room, sessionUserId, supabase],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || !supabase || !room || !sessionUserId) {
        return false;
      }

      setSending(true);
      setError(null);

      const { error: insertError } = await supabase.from("messages").insert({
        family_id: room.family_id,
        room_id: room.id,
        sender_id: sessionUserId,
        content,
      });

      if (insertError) {
        setError(insertError.message);
        setSending(false);
        return false;
      }

      setSending(false);
      return true;
    },
    [supabase, room, sessionUserId],
  );

  return {
    configured: isSupabaseConfigured,
    loading,
    sending,
    error,
    roomTitle: room?.title ?? "Family Chat",
    messages,
    reactionsByMessageId,
    senderNames,
    currentUserId: sessionUserId,
    setReaction,
    sendMessage,
    refresh: load,
  };
}
