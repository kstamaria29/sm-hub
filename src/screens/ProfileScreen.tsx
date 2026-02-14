import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Switch, TextInput, View } from "react-native";

import {
  avatarExpressionLabel,
  AVATAR_EXPRESSIONS,
  AvatarExpression,
  createSignedAvatarUrl,
} from "../features/avatar/avatarPack";
import { getSupabaseClient, isSupabaseConfigured } from "../lib/supabase";
import { AppText } from "../ui/primitives/AppText";
import { InfoCard } from "../ui/primitives/InfoCard";
import { PrimaryButton } from "../ui/primitives/PrimaryButton";
import { Screen } from "../ui/primitives/Screen";
import { useTheme } from "../ui/theme/ThemeProvider";

type ProvisionResponse = {
  credentials?: {
    email?: string;
    temporaryPassword?: string;
  };
};

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

const AVATAR_STYLE_OPTIONS = [
  { id: "storybook", label: "Storybook" },
  { id: "comic", label: "Comic" },
  { id: "anime-soft", label: "Anime Soft" },
  { id: "watercolor", label: "Watercolor" },
  { id: "3d-toy", label: "3D Toy" },
  { id: "pixel", label: "Pixel" },
  { id: "paper-cut", label: "Paper Cut" },
  { id: "flat-minimal", label: "Flat Minimal" },
] as const;

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
    // Fall through to raw text parsing.
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

export function ProfileScreen() {
  const { colors, spacing } = useTheme();
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "member" | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [savedDisplayName, setSavedDisplayName] = useState("");
  const [isSavingDisplayName, setIsSavingDisplayName] = useState(false);
  const [cinematicsEnabled, setCinematicsEnabled] = useState(true);
  const [isSavingCinematics, setIsSavingCinematics] = useState(false);
  const [selectedStyleId, setSelectedStyleId] = useState<string>(AVATAR_STYLE_OPTIONS[0].id);
  const [isGeneratingAvatar, setIsGeneratingAvatar] = useState(false);
  const [avatarProgress, setAvatarProgress] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [latestAvatarPack, setLatestAvatarPack] = useState<AvatarPackSummary | null>(null);
  const [avatarPreviews, setAvatarPreviews] = useState<AvatarPreviewItem[]>([]);

  const [adminError, setAdminError] = useState<string | null>(null);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberDisplayName, setMemberDisplayName] = useState("");
  const [isCreatingMember, setIsCreatingMember] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string;
    temporaryPassword: string;
  } | null>(null);

  const loadAvatarPreviews = useCallback(
    async (basePath: string) => {
      if (!supabase) {
        setAvatarPreviews([]);
        return;
      }

      const previewResults = await Promise.all(
        AVATAR_EXPRESSIONS.map(async (expression) => {
          const imagePath = `${basePath}/${expression}.png`;
          const imageUrl = await createSignedAvatarUrl(supabase, imagePath);
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

  const loadRole = useCallback(async () => {
    if (!supabase || !isSupabaseConfigured) {
      setLoadingRole(false);
      setSettingsError("Supabase environment is not configured.");
      return;
    }

    setLoadingRole(true);
    setSettingsError(null);
    setAdminError(null);
    setAvatarError(null);

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      setLoadingRole(false);
      setSettingsError(sessionError.message);
      return;
    }

    const userId = sessionData.session?.user?.id ?? null;
    setCurrentUserId(userId);

    if (!userId) {
      setLoadingRole(false);
      setRole(null);
      setFamilyId(null);
      setProfileDisplayName("");
      setSavedDisplayName("");
      setLatestAvatarPack(null);
      setAvatarPreviews([]);
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("user_profiles")
      .select("family_id,cinematics_enabled,avatar_style_id,display_name")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError) {
      setLoadingRole(false);
      setSettingsError(profileError.message);
      return;
    }

    if (!profileData?.family_id) {
      setLoadingRole(false);
      setRole(null);
      setFamilyId(null);
      setProfileDisplayName("");
      setSavedDisplayName("");
      setLatestAvatarPack(null);
      setAvatarPreviews([]);
      return;
    }

    setFamilyId(profileData.family_id);
    const loadedDisplayName = profileData.display_name ?? "";
    setProfileDisplayName(loadedDisplayName);
    setSavedDisplayName(loadedDisplayName);
    setCinematicsEnabled(profileData.cinematics_enabled ?? true);
    if (profileData.avatar_style_id) {
      setSelectedStyleId(profileData.avatar_style_id);
    }

    const { data: membershipData, error: membershipError } = await supabase
      .from("family_members")
      .select("role")
      .eq("family_id", profileData.family_id)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();

    if (membershipError) {
      setLoadingRole(false);
      setSettingsError(membershipError.message);
      return;
    }

    if (!membershipData) {
      setRole(null);
      setLoadingRole(false);
      return;
    }

    setRole(membershipData.role === "admin" ? "admin" : "member");

    const { data: latestPack, error: latestPackError } = await supabase
      .from("avatar_packs")
      .select("style_id,version,status,created_at,base_path")
      .eq("family_id", profileData.family_id)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestPackError) {
      setLoadingRole(false);
      setSettingsError(latestPackError.message);
      return;
    }

    if (!latestPack) {
      setLatestAvatarPack(null);
      setAvatarPreviews([]);
      setLoadingRole(false);
      return;
    }

    setLatestAvatarPack({
      styleId: latestPack.style_id,
      version: latestPack.version,
      status: latestPack.status as AvatarPackStatus,
      createdAt: latestPack.created_at,
      basePath: latestPack.base_path,
    });
    if (latestPack.status === "ready") {
      await loadAvatarPreviews(latestPack.base_path);
    } else {
      setAvatarPreviews([]);
    }

    setLoadingRole(false);
  }, [loadAvatarPreviews, supabase]);

  useEffect(() => {
    void loadRole();
  }, [loadRole]);

  const persistDisplayName = async () => {
    if (!supabase || !familyId || !currentUserId) {
      setSettingsError("Family profile is not ready yet.");
      return;
    }

    setIsSavingDisplayName(true);
    setSettingsError(null);

    const nextDisplayName = profileDisplayName.trim();
    const { error } = await supabase
      .from("user_profiles")
      .upsert(
        {
          user_id: currentUserId,
          family_id: familyId,
          display_name: nextDisplayName.length > 0 ? nextDisplayName : null,
        },
        { onConflict: "user_id" },
      );

    if (error) {
      setSettingsError(error.message);
      setIsSavingDisplayName(false);
      return;
    }

    setSavedDisplayName(nextDisplayName);
    setProfileDisplayName(nextDisplayName);
    setIsSavingDisplayName(false);
  };

  const persistCinematics = async (nextValue: boolean) => {
    if (!supabase || !familyId || !currentUserId) {
      setSettingsError("Family profile is not ready yet.");
      return;
    }

    const previousValue = cinematicsEnabled;
    setCinematicsEnabled(nextValue);
    setIsSavingCinematics(true);
    setSettingsError(null);

    const { error } = await supabase
      .from("user_profiles")
      .update({
        cinematics_enabled: nextValue,
      })
      .eq("user_id", currentUserId)
      .eq("family_id", familyId);

    if (error) {
      setCinematicsEnabled(previousValue);
      setSettingsError(error.message);
    }

    setIsSavingCinematics(false);
  };

  const generateAvatarPack = async () => {
    if (!supabase || !familyId || !currentUserId) {
      setAvatarError("Family profile is not ready yet.");
      return;
    }

    setAvatarError(null);
    setAvatarProgress(null);
    setSettingsError(null);
    setIsGeneratingAvatar(true);
    try {
      const { data: refreshData } = await supabase.auth.refreshSession();
      let accessToken = refreshData.session?.access_token ?? null;

      if (!accessToken) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          setAvatarError(sessionError.message);
          return;
        }

        accessToken = sessionData.session?.access_token ?? null;
      }

      if (!accessToken) {
        setAvatarError("Your session is invalid or expired. Please sign out and sign in again.");
        return;
      }

      const invokeExpression = async (expression: (typeof AVATAR_EXPRESSIONS)[number]): Promise<string | null> => {
        const requestBody = {
          familyId,
          userId: currentUserId,
          styleId: selectedStyleId,
          expressions: [expression],
        };

        const { error } = await supabase.functions.invoke("avatar-generate-pack", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: requestBody,
        });

        if (!error) {
          return null;
        }

        const resolvedMessage = await parseFunctionInvokeError(error as { message: string; context?: Response });
        if (!resolvedMessage.toLowerCase().includes("invalid jwt")) {
          return resolvedMessage;
        }

        const { error: retryError } = await supabase.functions.invoke("avatar-generate-pack", {
          body: requestBody,
        });

        if (!retryError) {
          return null;
        }

        return await parseFunctionInvokeError(retryError as { message: string; context?: Response });
      };

      for (const [index, expression] of AVATAR_EXPRESSIONS.entries()) {
        setAvatarProgress(`Generating ${expression} (${index + 1}/${AVATAR_EXPRESSIONS.length})...`);
        const invocationError = await invokeExpression(expression);
        if (invocationError) {
          setAvatarError(`Failed on ${expression}: ${invocationError}`);
          return;
        }
      }

      await loadRole();
    } finally {
      setAvatarProgress(null);
      setIsGeneratingAvatar(false);
    }
  };

  const createFamilyMember = async () => {
    if (!supabase || !familyId || role !== "admin") {
      return;
    }

    const email = memberEmail.trim().toLowerCase();
    if (email.length === 0) {
      setAdminError("Member email is required.");
      return;
    }

    setIsCreatingMember(true);
    setAdminError(null);
    setCreatedCredentials(null);

    const { data: refreshData } = await supabase.auth.refreshSession();
    let accessToken = refreshData.session?.access_token ?? null;

    if (!accessToken) {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        setAdminError(sessionError.message);
        setIsCreatingMember(false);
        return;
      }

      accessToken = sessionData.session?.access_token ?? null;
    }

    if (!accessToken) {
      setAdminError("Your session is invalid or expired. Please sign out and sign in again.");
      setIsCreatingMember(false);
      return;
    }

    const { data: currentUserData, error: currentUserError } = await supabase.auth.getUser(accessToken);
    if (currentUserError || !currentUserData.user) {
      setAdminError("Session token could not be verified. Sign out and sign in again.");
      setIsCreatingMember(false);
      return;
    }

    const requestBody = {
      familyId,
      email,
      displayName: memberDisplayName.trim() || undefined,
    };

    const { data, error } = await supabase.functions.invoke("family-member-create", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: requestBody,
    });

    if (error) {
      const resolvedMessage = await parseFunctionInvokeError(error as { message: string; context?: Response });
      if (resolvedMessage.toLowerCase().includes("invalid jwt")) {
        const { data: retryData, error: retryError } = await supabase.functions.invoke("family-member-create", {
          body: requestBody,
        });

        if (!retryError) {
          const retryPayload = (retryData ?? {}) as ProvisionResponse;
          const retryPassword = retryPayload.credentials?.temporaryPassword ?? "";
          const retryEmail = retryPayload.credentials?.email ?? email;

          if (!retryPassword) {
            setAdminError("Member created, but no temporary password was returned.");
            setIsCreatingMember(false);
            return;
          }

          setCreatedCredentials({
            email: retryEmail,
            temporaryPassword: retryPassword,
          });
          setMemberEmail("");
          setMemberDisplayName("");
          setIsCreatingMember(false);
          return;
        }

        const retryMessage = await parseFunctionInvokeError(retryError as { message: string; context?: Response });
        if (retryMessage.toLowerCase().includes("invalid jwt")) {
          const identity = currentUserData.user.email ?? currentUserData.user.id;
          setAdminError(
            `JWT rejected by Functions gateway for ${identity}. Check .env.local Supabase URL/anon key pair, then restart Expo with \`npx expo start -c\` and sign in again.`,
          );
          setIsCreatingMember(false);
          return;
        }
      }

      setAdminError(resolvedMessage);
      setIsCreatingMember(false);
      return;
    }

    const payload = (data ?? {}) as ProvisionResponse;
    const password = payload.credentials?.temporaryPassword ?? "";
    const createdEmail = payload.credentials?.email ?? email;

    if (!password) {
      setAdminError("Member created, but no temporary password was returned.");
      setIsCreatingMember(false);
      return;
    }

    setCreatedCredentials({
      email: createdEmail,
      temporaryPassword: password,
    });
    setMemberEmail("");
    setMemberDisplayName("");
    setIsCreatingMember(false);
  };

  const inputStyle = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    color: colors.text,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
  } as const;
  const normalizedProfileDisplayName = profileDisplayName.trim();
  const normalizedSavedDisplayName = savedDisplayName.trim();
  const isDisplayNameDirty = normalizedProfileDisplayName !== normalizedSavedDisplayName;

  return (
    <Screen>
      <View style={[styles.content, { gap: spacing.md }]}>
        <AppText variant="heading">Settings and Profile</AppText>
        <InfoCard>
          <AppText variant="title">Profile</AppText>
          <AppText muted>Set how your name appears in chat and game panels.</AppText>
          <TextInput
            placeholder="Display name"
            placeholderTextColor={colors.textMuted}
            value={profileDisplayName}
            onChangeText={setProfileDisplayName}
            style={inputStyle}
          />
          <PrimaryButton
            onPress={() => {
              void persistDisplayName();
            }}
            disabled={isSavingDisplayName || loadingRole || !isDisplayNameDirty}
          >
            {isSavingDisplayName ? "Saving Name..." : "Save Display Name"}
          </PrimaryButton>
        </InfoCard>

        <InfoCard>
          <AppText variant="title">Cinematics</AppText>
          <View style={styles.toggleRow}>
            <AppText muted>Board camera effects for dice, snake, and ladder moments.</AppText>
            <Switch
              value={cinematicsEnabled}
              onValueChange={(nextValue) => {
                void persistCinematics(nextValue);
              }}
              disabled={isSavingCinematics || loadingRole}
              thumbColor={colors.surface}
            />
          </View>
          {isSavingCinematics ? <AppText muted>Saving setting...</AppText> : null}
          {settingsError ? <AppText muted>{settingsError}</AppText> : null}
        </InfoCard>

        <InfoCard>
          <AppText variant="title">Avatar Style</AppText>
          <AppText muted>Pick one of 8 styles, then generate a 4-expression pack.</AppText>

          <View style={[styles.styleGrid, { gap: spacing.sm }]}>
            {AVATAR_STYLE_OPTIONS.map((style) => {
              const selected = style.id === selectedStyleId;
              return (
                <Pressable
                  key={style.id}
                  onPress={() => {
                    setSelectedStyleId(style.id);
                    setAvatarError(null);
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

          <PrimaryButton
            onPress={() => {
              void generateAvatarPack();
            }}
            disabled={isGeneratingAvatar || loadingRole || !familyId || !currentUserId}
          >
            {isGeneratingAvatar ? "Generating Avatar Pack..." : "Generate Avatar Pack"}
          </PrimaryButton>
          {isGeneratingAvatar && avatarProgress ? <AppText muted>{avatarProgress}</AppText> : null}

          {latestAvatarPack?.status === "ready" ? (
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
                        <AppText muted>Missing</AppText>
                      </View>
                    )}
                    <AppText variant="caption" muted>
                      {avatarExpressionLabel(expression)}
                    </AppText>
                  </View>
                );
              })}
            </View>
          ) : null}

          {latestAvatarPack ? (
            <View style={{ gap: 4 }}>
              <AppText variant="caption" muted>
                Latest avatar pack
              </AppText>
              <AppText muted>
                Style: {latestAvatarPack.styleId} | v{latestAvatarPack.version}
              </AppText>
              <AppText muted>Status: {latestAvatarPack.status}</AppText>
              <AppText muted>Updated: {new Date(latestAvatarPack.createdAt).toLocaleString()}</AppText>
            </View>
          ) : (
            <AppText muted>No avatar pack generated yet.</AppText>
          )}

          {avatarError ? <AppText muted>{avatarError}</AppText> : null}
        </InfoCard>

        <InfoCard>
          <AppText variant="title">Admin Member Provisioning</AppText>

          {loadingRole ? <AppText muted>Loading membership role...</AppText> : null}
          {!loadingRole && role !== "admin" ? (
            <AppText muted>Only admins can add family members.</AppText>
          ) : null}
          {adminError ? <AppText muted>{adminError}</AppText> : null}

          {!loadingRole && role === "admin" ? (
            <View style={{ gap: spacing.sm }}>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="member@example.com"
                placeholderTextColor={colors.textMuted}
                value={memberEmail}
                onChangeText={setMemberEmail}
                style={inputStyle}
              />
              <TextInput
                placeholder="Display name (optional)"
                placeholderTextColor={colors.textMuted}
                value={memberDisplayName}
                onChangeText={setMemberDisplayName}
                style={inputStyle}
              />
              <PrimaryButton onPress={() => void createFamilyMember()} disabled={isCreatingMember}>
                {isCreatingMember ? "Creating Member..." : "Add Family Member"}
              </PrimaryButton>
            </View>
          ) : null}

          {createdCredentials ? (
            <View style={{ gap: 6 }}>
              <AppText variant="caption" muted>
                Share these credentials securely:
              </AppText>
              <AppText>{createdCredentials.email}</AppText>
              <AppText>{createdCredentials.temporaryPassword}</AppText>
            </View>
          ) : null}
        </InfoCard>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
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
  previewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  previewCell: {
    width: 80,
    alignItems: "center",
    gap: 4,
  },
  previewImage: {
    width: 72,
    height: 72,
    borderRadius: 10,
    borderWidth: 1,
  },
  previewImagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
});
