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
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, room?.id]);

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
    senderNames,
    sendMessage,
    refresh: load,
  };
}
