import { useMemo, useState } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { useFamilyChat } from "../features/chat/useFamilyChat";
import { AppText } from "../ui/primitives/AppText";
import { InfoCard } from "../ui/primitives/InfoCard";
import { PrimaryButton } from "../ui/primitives/PrimaryButton";
import { Screen } from "../ui/primitives/Screen";
import { useTheme } from "../ui/theme/ThemeProvider";

export function ChatScreen() {
  const { colors, spacing, radius } = useTheme();
  const { configured, loading, sending, error, roomTitle, messages, sendMessage, refresh } = useFamilyChat();
  const [draftMessage, setDraftMessage] = useState("");

  const emptyStateText = useMemo(() => {
    if (!configured) {
      return "Add Expo public Supabase environment variables to enable chat.";
    }

    if (loading) {
      return "Loading family chat...";
    }

    return "No messages yet.";
  }, [configured, loading]);

  const onSend = async () => {
    const sent = await sendMessage(draftMessage);
    if (sent) {
      setDraftMessage("");
    }
  };

  return (
    <Screen>
      <View style={[styles.content, { gap: spacing.md }]}>
        <AppText variant="heading">{roomTitle}</AppText>

        {error ? (
          <InfoCard>
            <AppText variant="title">Chat Status</AppText>
            <AppText muted>{error}</AppText>
          </InfoCard>
        ) : null}

        <View style={[styles.timeline, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <FlatList
            data={messages}
            keyExtractor={(item) => item.id.toString()}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} />}
            contentContainerStyle={[
              styles.messagesContainer,
              {
                padding: spacing.md,
                gap: spacing.sm,
              },
            ]}
            ListEmptyComponent={<AppText muted>{emptyStateText}</AppText>}
            renderItem={({ item }) => (
              <View
                style={[
                  styles.messageBubble,
                  {
                    borderRadius: radius.sm,
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                    padding: spacing.sm,
                  },
                ]}
              >
                <AppText variant="caption" muted>
                  {item.sender_id}
                </AppText>
                <AppText>{item.content}</AppText>
                <AppText variant="caption" muted>
                  {new Date(item.created_at).toLocaleString()}
                </AppText>
              </View>
            )}
          />
        </View>

        <View style={[styles.composer, { gap: spacing.sm }]}>
          <TextInput
            editable={configured && !loading}
            placeholder="Write a message..."
            placeholderTextColor={colors.textMuted}
            value={draftMessage}
            onChangeText={setDraftMessage}
            multiline
            style={[
              styles.input,
              {
                borderColor: colors.border,
                borderRadius: radius.sm,
                color: colors.text,
                padding: spacing.sm,
              },
            ]}
          />
          <PrimaryButton
            onPress={() => void onSend()}
            disabled={!configured || loading || sending || draftMessage.trim().length === 0}
          >
            {sending ? "Sending..." : "Send"}
          </PrimaryButton>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  timeline: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
  },
  messagesContainer: {
    flexGrow: 1,
  },
  messageBubble: {
    borderWidth: 1,
    gap: 6,
  },
  composer: {
    marginTop: "auto",
  },
  input: {
    minHeight: 88,
    borderWidth: 1,
    textAlignVertical: "top",
  },
});
