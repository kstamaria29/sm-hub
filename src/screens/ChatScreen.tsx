import { useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  Platform,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { useFamilyChat } from "../features/chat/useFamilyChat";
import { AppText } from "../ui/primitives/AppText";
import { IconButton } from "../ui/primitives/IconButton";
import { InfoCard } from "../ui/primitives/InfoCard";
import { Screen } from "../ui/primitives/Screen";
import { Tag } from "../ui/primitives/Tag";
import { useTheme } from "../ui/theme/ThemeProvider";

const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "😡"] as const;

export function ChatScreen() {
  const { colors, spacing, radius } = useTheme();
  const chatState = useFamilyChat();
  const [draftMessage, setDraftMessage] = useState("");
  const [activeMessageId, setActiveMessageId] = useState<number | null>(null);

  const lastTapAtRef = useRef(0);
  const lastTapMessageIdRef = useRef<number | null>(null);

  const emptyStateText = useMemo(() => {
    if (!chatState.configured) {
      return "Add Expo public Supabase environment variables to enable chat.";
    }

    if (chatState.loading) {
      return "Loading family chat...";
    }

    return "No messages yet.";
  }, [chatState.configured, chatState.loading]);

  const onSend = async () => {
    const sent = await chatState.sendMessage(draftMessage);
    if (sent) {
      setDraftMessage("");
    }
  };

  return (
    <Screen padded={false}>
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <View style={[styles.header, { paddingHorizontal: spacing.lg, paddingTop: spacing.md }]}>
          <View style={[styles.headerRow, { gap: spacing.sm }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="heading">{chatState.roomTitle}</AppText>
              <AppText muted>Family chat</AppText>
            </View>
            <Tag tone="neutral" label={chatState.loading ? "Loading" : "Live"} />
          </View>
        </View>

        {chatState.error ? (
          <InfoCard>
            <AppText variant="title">Chat Status</AppText>
            <AppText muted>{chatState.error}</AppText>
          </InfoCard>
        ) : null}

        <FlatList
          data={chatState.messages}
          keyExtractor={(item) => item.id.toString()}
          refreshControl={<RefreshControl refreshing={chatState.loading} onRefresh={() => void chatState.refresh()} />}
          contentContainerStyle={[
            styles.messagesContainer,
            {
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              gap: spacing.sm,
            },
          ]}
          ListEmptyComponent={<AppText muted>{emptyStateText}</AppText>}
          renderItem={({ item }) => {
            const isMine = Boolean(chatState.currentUserId && item.sender_id === chatState.currentUserId);
            const displayName = chatState.senderNames.get(item.sender_id) ?? item.sender_id;
            const reactionSummary = chatState.reactionsByMessageId.get(item.id) ?? null;
            const entries = reactionSummary ? Object.entries(reactionSummary.counts) : [];
            const hasReactions = reactionSummary ? reactionSummary.total > 0 : false;
            const isActive = activeMessageId === item.id;

            return (
              <View style={[styles.messageRow, { justifyContent: isMine ? "flex-end" : "flex-start" }]}>
                <View style={styles.messageStack}>
                  {!isMine ? (
                    <AppText variant="caption" muted>
                      {displayName}
                    </AppText>
                  ) : null}

                  <Pressable
                    onLongPress={() => setActiveMessageId(item.id)}
                    onPress={() => {
                      const now = Date.now();
                      if (lastTapMessageIdRef.current === item.id && now - lastTapAtRef.current < 320) {
                        void chatState.setReaction(item.id, "👍");
                        setActiveMessageId(null);
                        lastTapAtRef.current = 0;
                        lastTapMessageIdRef.current = null;
                        return;
                      }

                      lastTapAtRef.current = now;
                      lastTapMessageIdRef.current = item.id;
                      setActiveMessageId(null);
                    }}
                    style={[
                      styles.bubble,
                      {
                        borderRadius: radius.lg,
                        backgroundColor: isMine ? colors.primary : colors.surface,
                        borderColor: isMine ? "transparent" : colors.border,
                      },
                    ]}
                  >
                    <AppText style={{ color: isMine ? "#FFFFFF" : colors.text }}>{item.content}</AppText>
                    <AppText variant="caption" muted style={{ color: isMine ? "#D1FAF5" : colors.textMuted }}>
                      {new Date(item.created_at).toLocaleTimeString()}
                    </AppText>
                  </Pressable>

                  {hasReactions ? (
                    <View
                      style={[
                        styles.reactionsRow,
                        {
                          borderColor: colors.border,
                          backgroundColor: colors.surface,
                          borderRadius: radius.lg,
                        },
                      ]}
                    >
                      {entries.slice(0, 4).map(([emoji, count]) => (
                        <Pressable
                          key={emoji}
                          onPress={() => setActiveMessageId(item.id)}
                          style={[
                            styles.reactionPill,
                            {
                              backgroundColor: reactionSummary?.myReaction === emoji ? colors.surfaceMuted : "transparent",
                              borderRadius: radius.lg,
                            },
                          ]}
                        >
                          <AppText variant="caption">
                            {emoji}
                            {count > 1 ? ` ${count}` : ""}
                          </AppText>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}

                  {isActive ? (
                    <View style={[styles.reactionPicker, { borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface }]}>
                      {REACTIONS.map((emoji) => (
                        <Pressable
                          key={emoji}
                          onPress={() => {
                            void chatState.setReaction(item.id, emoji);
                            setActiveMessageId(null);
                          }}
                          style={({ pressed }) => [
                            styles.reactionPick,
                            {
                              borderRadius: radius.lg,
                              backgroundColor: reactionSummary?.myReaction === emoji ? colors.surfaceMuted : "transparent",
                              opacity: pressed ? 0.8 : 1,
                            },
                          ]}
                        >
                          <AppText style={{ fontSize: 18 }}>{emoji}</AppText>
                        </Pressable>
                      ))}
                      <Pressable
                        onPress={() => setActiveMessageId(null)}
                        style={({ pressed }) => [
                          styles.reactionPick,
                          {
                            borderRadius: radius.lg,
                            opacity: pressed ? 0.8 : 1,
                          },
                        ]}
                      >
                        <AppText muted style={{ fontSize: 16 }}>
                          ✕
                        </AppText>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          }}
        />

        <View style={[styles.composer, { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm }]}>
          <View
            style={[
              styles.composerRow,
              {
                borderColor: colors.border,
                borderRadius: radius.lg,
                backgroundColor: colors.surface,
              },
            ]}
          >
            <TextInput
              editable={chatState.configured && !chatState.loading}
              placeholder="Write a message..."
              placeholderTextColor={colors.textMuted}
              value={draftMessage}
              onChangeText={setDraftMessage}
              multiline
              style={[
                styles.input,
                {
                  color: colors.text,
                },
              ]}
            />
            <IconButton
              tone="primary"
              onPress={() => void onSend()}
              disabled={!chatState.configured || chatState.loading || chatState.sending || draftMessage.trim().length === 0}
              accessibilityLabel="Send"
              style={{ borderWidth: 0 }}
            >
              <AppText style={{ color: "#FFFFFF", fontWeight: "900" }}>➤</AppText>
            </IconButton>
          </View>
          <AppText variant="caption" muted>
            Tip: double-tap a bubble to 👍.
          </AppText>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  header: {
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  messagesContainer: {
    flexGrow: 1,
  },
  messageRow: {
    flexDirection: "row",
  },
  messageStack: {
    maxWidth: "86%",
    gap: 6,
  },
  bubble: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  composer: {
    marginTop: "auto",
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderWidth: 1,
    padding: 8,
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: "top",
  },
  reactionsRow: {
    alignSelf: "flex-start",
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  reactionPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  reactionPicker: {
    alignSelf: "flex-start",
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  reactionPick: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
