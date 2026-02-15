import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";

import {
  avatarExpressionLabel,
  AVATAR_EXPRESSIONS,
  AvatarExpression,
  AVATAR_STYLE_OPTIONS,
  createSignedAvatarUrl,
  createSignedOriginalAvatarUrl,
  findExistingOriginalAvatarPath,
} from "../features/avatar/avatarPack";
import { getSupabaseClient, isSupabaseConfigured } from "../lib/supabase";
import { RootTabParamList } from "../navigation/types";
import { AppText } from "../ui/primitives/AppText";
import { InfoCard } from "../ui/primitives/InfoCard";
import { PrimaryButton } from "../ui/primitives/PrimaryButton";
import { Screen } from "../ui/primitives/Screen";
import { useTheme } from "../ui/theme/ThemeProvider";

type AvatarPackStatus = "queued" | "processing" | "ready" | "failed";

type AvatarPackSummary = {
  styleId: string;
  version: number;
  status: AvatarPackStatus;
  createdAt: string;
  basePath: string;
};

type AvatarPreviewItem = {
  expression: AvatarExpression;
  imageUrl: string;
};

type InvokePayload = {
  avatarPack?: {
    basePath?: string;
    status?: AvatarPackStatus;
  };
};

const PRESET_STYLE_IDS = new Set<string>(AVATAR_STYLE_OPTIONS.map((style) => style.id));

function normalizeCustomStyle(rawValue: string): string {
  return rawValue.trim().replace(/\s+/g, " ");
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

export function AvatarsScreen() {
  const { colors, spacing } = useTheme();
  const navigation = useNavigation<BottomTabNavigationProp<RootTabParamList>>();
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [selectedStyleId, setSelectedStyleId] = useState<string>(AVATAR_STYLE_OPTIONS[0].id);
  const [customStyleInput, setCustomStyleInput] = useState("");
  const [originalPhotoPath, setOriginalPhotoPath] = useState<string | null>(null);
  const [originalPhotoUrl, setOriginalPhotoUrl] = useState<string | null>(null);
  const [latestAvatarPack, setLatestAvatarPack] = useState<AvatarPackSummary | null>(null);
  const [avatarPreviews, setAvatarPreviews] = useState<AvatarPreviewItem[]>([]);
  const [isGeneratingNeutral, setIsGeneratingNeutral] = useState(false);
  const [isGeneratingExpressions, setIsGeneratingExpressions] = useState(false);
  const [regeneratingExpression, setRegeneratingExpression] = useState<AvatarExpression | null>(null);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);

  const loadPreviewImages = useCallback(
    async (basePath: string) => {
      if (!supabase) {
        setAvatarPreviews([]);
        return;
      }

      const previewResults = await Promise.all(
        AVATAR_EXPRESSIONS.map(async (expression) => {
          const imageUrl = await createSignedAvatarUrl(supabase, `${basePath}/${expression}.png`);
          if (!imageUrl) {
            return null;
          }

          return {
            expression,
            imageUrl,
          } satisfies AvatarPreviewItem;
        }),
      );

      setAvatarPreviews(previewResults.filter((item): item is AvatarPreviewItem => item !== null));
    },
    [supabase],
  );

  const loadPackForStyle = useCallback(
    async (resolvedFamilyId: string, resolvedUserId: string, styleId: string) => {
      if (!supabase) {
        return;
      }

      const { data: latestPack, error: latestPackError } = await supabase
        .from("avatar_packs")
        .select("style_id,version,status,created_at,base_path")
        .eq("family_id", resolvedFamilyId)
        .eq("user_id", resolvedUserId)
        .eq("style_id", styleId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestPackError) {
        setError(latestPackError.message);
        return;
      }

      if (!latestPack) {
        setLatestAvatarPack(null);
        setAvatarPreviews([]);
        return;
      }

      setLatestAvatarPack({
        styleId: latestPack.style_id,
        version: latestPack.version,
        status: latestPack.status as AvatarPackStatus,
        createdAt: latestPack.created_at,
        basePath: latestPack.base_path,
      });

      await loadPreviewImages(latestPack.base_path);
    },
    [loadPreviewImages, supabase],
  );

  const loadContext = useCallback(async () => {
    if (!supabase || !isSupabaseConfigured) {
      setLoading(false);
      setError("Supabase environment is not configured.");
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

    const userId = sessionData.session?.user?.id ?? null;
    if (!userId) {
      setLoading(false);
      setError("Sign in is required to manage avatars.");
      return;
    }

    setCurrentUserId(userId);

    const { data: profileData, error: profileError } = await supabase
      .from("user_profiles")
      .select("family_id,avatar_style_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError) {
      setLoading(false);
      setError(profileError.message);
      return;
    }

    if (!profileData?.family_id) {
      setLoading(false);
      setError("No family profile found for this user.");
      return;
    }

    const resolvedFamilyId = profileData.family_id;
    setFamilyId(resolvedFamilyId);

    const resolvedStyleId = profileData.avatar_style_id ?? AVATAR_STYLE_OPTIONS[0].id;
    setSelectedStyleId(resolvedStyleId);
    if (PRESET_STYLE_IDS.has(resolvedStyleId)) {
      setCustomStyleInput("");
    } else {
      setCustomStyleInput(resolvedStyleId);
    }

    const existingOriginalPath = await findExistingOriginalAvatarPath(supabase, resolvedFamilyId, userId);
    setOriginalPhotoPath(existingOriginalPath);
    if (existingOriginalPath) {
      setOriginalPhotoUrl(await createSignedOriginalAvatarUrl(supabase, existingOriginalPath));
    } else {
      setOriginalPhotoUrl(null);
    }

    await loadPackForStyle(resolvedFamilyId, userId, resolvedStyleId);
    setLoading(false);
  }, [loadPackForStyle, supabase]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  useEffect(() => {
    if (!familyId || !currentUserId) {
      return;
    }

    void loadPackForStyle(familyId, currentUserId, selectedStyleId);
  }, [currentUserId, familyId, loadPackForStyle, selectedStyleId]);

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

  const invokeGeneration = useCallback(
    async (expressions: AvatarExpression[]) => {
      if (!supabase || !familyId || !currentUserId || !originalPhotoPath) {
        setError("Upload your original profile photo first.");
        return false;
      }

      const accessToken = await resolveAccessToken();
      if (!accessToken) {
        setError("Your session is invalid or expired. Please sign out and sign in again.");
        return false;
      }

      const requestBody = {
        familyId,
        userId: currentUserId,
        styleId: selectedStyleId,
        expressions,
        sourceImagePath: originalPhotoPath,
      };

      const { data, error: invokeError } = await supabase.functions.invoke("avatar-generate-pack", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: requestBody,
      });

      if (invokeError) {
        const resolvedMessage = await parseFunctionInvokeError(invokeError as { message: string; context?: Response });
        if (!resolvedMessage.toLowerCase().includes("invalid jwt")) {
          setError(resolvedMessage);
          return false;
        }

        const { data: retryData, error: retryError } = await supabase.functions.invoke("avatar-generate-pack", {
          body: requestBody,
        });

        if (retryError) {
          setError(await parseFunctionInvokeError(retryError as { message: string; context?: Response }));
          return false;
        }

        const retryPayload = (retryData ?? {}) as InvokePayload;
        const retryBasePath = retryPayload.avatarPack?.basePath ?? null;
        if (retryBasePath) {
          await loadPreviewImages(retryBasePath);
        }
      } else {
        const payload = (data ?? {}) as InvokePayload;
        const basePath = payload.avatarPack?.basePath ?? null;
        if (basePath) {
          await loadPreviewImages(basePath);
        }
      }

      await loadPackForStyle(familyId, currentUserId, selectedStyleId);
      return true;
    },
    [currentUserId, familyId, loadPackForStyle, loadPreviewImages, originalPhotoPath, resolveAccessToken, selectedStyleId, supabase],
  );

  const generateNeutral = useCallback(async () => {
    setError(null);
    setProgressMessage("Generating neutral avatar...");
    setIsGeneratingNeutral(true);
    try {
      await invokeGeneration(["neutral"]);
    } finally {
      setIsGeneratingNeutral(false);
      setProgressMessage(null);
    }
  }, [invokeGeneration]);

  const generateRemainingExpressions = useCallback(async () => {
    const neutralPreview = avatarPreviews.find((item) => item.expression === "neutral");
    if (!neutralPreview) {
      setError("Generate and approve a neutral avatar first.");
      return;
    }

    setError(null);
    const remainingExpressions: AvatarExpression[] = ["happy", "angry", "crying"];
    setIsGeneratingExpressions(true);
    try {
      for (const [index, expression] of remainingExpressions.entries()) {
        setProgressMessage(`Generating ${expression} (${index + 1}/${remainingExpressions.length})...`);
        const ok = await invokeGeneration([expression]);
        if (!ok) {
          return;
        }
      }
    } finally {
      setIsGeneratingExpressions(false);
      setProgressMessage(null);
    }
  }, [avatarPreviews, invokeGeneration]);

  const regenerateSingleExpression = useCallback(
    async (expression: AvatarExpression) => {
      if (expression !== "neutral" && !avatarPreviews.some((item) => item.expression === "neutral")) {
        setError("Generate and approve a neutral avatar first.");
        return;
      }

      setError(null);
      setProgressMessage(`Regenerating ${avatarExpressionLabel(expression).toLowerCase()} avatar...`);
      setRegeneratingExpression(expression);
      try {
        await invokeGeneration([expression]);
      } finally {
        setRegeneratingExpression(null);
        setProgressMessage(null);
      }
    },
    [avatarPreviews, invokeGeneration],
  );

  const applyCustomStyle = useCallback(() => {
    const normalizedStyle = normalizeCustomStyle(customStyleInput);
    if (normalizedStyle.length === 0) {
      setError("Custom avatar style is required.");
      return;
    }

    if (normalizedStyle.length > 120) {
      setError("Custom avatar style must be 120 characters or less.");
      return;
    }

    if (/[\\/]/.test(normalizedStyle)) {
      setError("Custom avatar style cannot include / or \\ characters.");
      return;
    }

    setError(null);
    setSelectedStyleId(normalizedStyle);
  }, [customStyleInput]);

  const neutralPreview = avatarPreviews.find((item) => item.expression === "neutral") ?? null;
  const hasNeutralPreview = neutralPreview !== null;
  const usingCustomStyle = !PRESET_STYLE_IDS.has(selectedStyleId);
  const normalizedCustomStyle = normalizeCustomStyle(customStyleInput);
  const anyGenerationInFlight =
    isGeneratingNeutral || isGeneratingExpressions || regeneratingExpression !== null;
  const canApplyCustomStyle =
    normalizedCustomStyle.length > 0 && normalizedCustomStyle !== selectedStyleId && !anyGenerationInFlight;
  const inputStyle = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    color: colors.text,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
  } as const;

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.content, { gap: spacing.md, paddingBottom: spacing.xl }]}>
        <View style={styles.headerRow}>
          <AppText variant="heading">Avatars</AppText>
          <Pressable
            onPress={() => navigation.navigate("Profile")}
            style={[styles.backButton, { borderColor: colors.border, backgroundColor: colors.background }]}
          >
            <AppText muted>Back to Profile</AppText>
          </Pressable>
        </View>

        <InfoCard>
          <AppText variant="title">Original Profile Photo</AppText>
          {originalPhotoUrl ? (
            <Image source={{ uri: originalPhotoUrl }} style={[styles.originalPhoto, { borderColor: colors.border }]} />
          ) : (
            <AppText muted>Upload your original profile photo from Settings/Profile first.</AppText>
          )}
        </InfoCard>

        <InfoCard>
          <AppText variant="title">Avatar Style</AppText>
          <AppText muted>Select one style, then generate a neutral avatar preview.</AppText>
          <View style={[styles.styleGrid, { gap: spacing.sm }]}>
            {AVATAR_STYLE_OPTIONS.map((style) => {
              const selected = selectedStyleId === style.id;
              return (
                <Pressable
                  key={style.id}
                  onPress={() => {
                    setSelectedStyleId(style.id);
                    setError(null);
                  }}
                  style={[
                    styles.styleChip,
                    {
                      borderColor: colors.border,
                      backgroundColor: selected ? colors.primary : colors.background,
                    },
                  ]}
                >
                  <AppText style={{ color: selected ? "#ffffff" : colors.text }}>{style.label}</AppText>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            placeholder="Custom style (e.g. hand-drawn pastel portrait)"
            placeholderTextColor={colors.textMuted}
            value={customStyleInput}
            onChangeText={(value) => {
              setCustomStyleInput(value);
              setError(null);
            }}
            style={inputStyle}
          />
          <PrimaryButton
            onPress={applyCustomStyle}
            disabled={!canApplyCustomStyle}
          >
            Use Custom Style
          </PrimaryButton>
          <AppText muted>
            Active style: {selectedStyleId}
          </AppText>
          {usingCustomStyle ? (
            <AppText muted>Using custom style prompt.</AppText>
          ) : null}
        </InfoCard>

        <InfoCard>
          <AppText variant="title">Step 1: Neutral Avatar</AppText>
          <AppText muted>Generate neutral using your original photo as the reference identity.</AppText>

          {neutralPreview ? (
            <View style={styles.neutralPreviewContainer}>
              <Image source={{ uri: neutralPreview.imageUrl }} style={[styles.neutralPreview, { borderColor: colors.border }]} />
              <AppText variant="caption" muted>
                Neutral preview ready
              </AppText>
            </View>
          ) : (
            <AppText muted>No neutral preview yet.</AppText>
          )}

          <PrimaryButton
            onPress={() => {
              void generateNeutral();
            }}
            disabled={loading || anyGenerationInFlight || !originalPhotoPath}
          >
            {isGeneratingNeutral ? "Generating Neutral..." : neutralPreview ? "Regenerate Neutral" : "Generate Neutral Avatar"}
          </PrimaryButton>

          <PrimaryButton
            onPress={() => {
              void generateRemainingExpressions();
            }}
            disabled={loading || anyGenerationInFlight || !neutralPreview}
          >
            {isGeneratingExpressions ? "Generating Expressions..." : "Confirm Neutral & Generate Full Pack"}
          </PrimaryButton>
        </InfoCard>

        <InfoCard>
          <AppText variant="title">Avatar Pack Preview</AppText>
          {avatarPreviews.length === 0 ? (
            <AppText muted>No generated images yet for this style.</AppText>
          ) : (
            <View style={[styles.previewGrid, { gap: spacing.sm }]}>
              {AVATAR_EXPRESSIONS.map((expression) => {
                const preview = avatarPreviews.find((item) => item.expression === expression) ?? null;

                return (
                  <View key={expression} style={styles.previewCell}>
                    {preview ? (
                      <Image
                        source={{ uri: preview.imageUrl }}
                        style={[styles.previewImage, { borderColor: colors.border, backgroundColor: colors.background }]}
                      />
                    ) : (
                      <View
                        style={[
                          styles.previewImage,
                          styles.previewImagePlaceholder,
                          { borderColor: colors.border, backgroundColor: colors.background },
                        ]}
                      >
                        <AppText muted>Pending</AppText>
                      </View>
                    )}
                    <AppText variant="caption" muted>
                      {avatarExpressionLabel(expression)}
                    </AppText>
                    {expression !== "neutral" ? (
                      <Pressable
                        onPress={() => {
                          void regenerateSingleExpression(expression);
                        }}
                        disabled={loading || anyGenerationInFlight || !hasNeutralPreview}
                        style={[
                          styles.previewRegenerateButton,
                          {
                            borderColor: colors.border,
                            backgroundColor: colors.background,
                            opacity: loading || anyGenerationInFlight || !hasNeutralPreview ? 0.6 : 1,
                          },
                        ]}
                      >
                        <AppText variant="caption" muted>
                          {regeneratingExpression === expression ? "Regenerating..." : "Regenerate"}
                        </AppText>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}

          {latestAvatarPack ? (
            <View style={{ gap: 4 }}>
              <AppText variant="caption" muted>
                Latest style pack
              </AppText>
              <AppText muted>
                Style: {latestAvatarPack.styleId} | v{latestAvatarPack.version}
              </AppText>
              <AppText muted>Status: {latestAvatarPack.status}</AppText>
              <AppText muted>Updated: {new Date(latestAvatarPack.createdAt).toLocaleString()}</AppText>
            </View>
          ) : null}
        </InfoCard>

        {progressMessage ? <AppText muted>{progressMessage}</AppText> : null}
        {error ? <AppText muted>{error}</AppText> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  backButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  originalPhoto: {
    width: 160,
    height: 160,
    borderRadius: 14,
    borderWidth: 1,
  },
  styleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  styleChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  neutralPreviewContainer: {
    alignItems: "flex-start",
    gap: 6,
  },
  neutralPreview: {
    width: 180,
    height: 180,
    borderRadius: 14,
    borderWidth: 1,
  },
  previewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  previewCell: {
    width: 92,
    alignItems: "center",
    gap: 4,
  },
  previewRegenerateButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  previewImage: {
    width: 84,
    height: 84,
    borderRadius: 10,
    borderWidth: 1,
  },
  previewImagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
});
