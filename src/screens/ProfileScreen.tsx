import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, ScrollView, StyleSheet, Switch, TextInput, View } from "react-native";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";

import {
  buildAvatarOriginalPath,
  createSignedOriginalAvatarUrl,
  findExistingOriginalAvatarPath,
  resolveImageExtension,
} from "../features/avatar/avatarPack";
import { getSupabaseClient, isSupabaseConfigured } from "../lib/supabase";
import { RootTabParamList } from "../navigation/types";
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

function decodeBase64ToBytes(base64: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, "");
  const outputLength = Math.floor((clean.length * 3) / 4) - (clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0);
  const bytes = new Uint8Array(outputLength);

  let byteIndex = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = alphabet.indexOf(clean[i] ?? "A");
    const b = alphabet.indexOf(clean[i + 1] ?? "A");
    const c = clean[i + 2] === "=" ? 64 : alphabet.indexOf(clean[i + 2] ?? "A");
    const d = clean[i + 3] === "=" ? 64 : alphabet.indexOf(clean[i + 3] ?? "A");

    const triple = (a << 18) | (b << 12) | ((c & 63) << 6) | (d & 63);

    if (byteIndex < outputLength) {
      bytes[byteIndex] = (triple >> 16) & 0xff;
      byteIndex += 1;
    }
    if (c !== 64 && byteIndex < outputLength) {
      bytes[byteIndex] = (triple >> 8) & 0xff;
      byteIndex += 1;
    }
    if (d !== 64 && byteIndex < outputLength) {
      bytes[byteIndex] = triple & 0xff;
      byteIndex += 1;
    }
  }

  return bytes;
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
  const navigation = useNavigation<BottomTabNavigationProp<RootTabParamList>>();
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "member" | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [savedDisplayName, setSavedDisplayName] = useState("");
  const [isSavingDisplayName, setIsSavingDisplayName] = useState(false);
  const [cinematicsEnabled, setCinematicsEnabled] = useState(true);
  const [isSavingCinematics, setIsSavingCinematics] = useState(false);
  const [isUploadingOriginalPhoto, setIsUploadingOriginalPhoto] = useState(false);
  const [originalPhotoPath, setOriginalPhotoPath] = useState<string | null>(null);
  const [originalPhotoUrl, setOriginalPhotoUrl] = useState<string | null>(null);

  const [adminError, setAdminError] = useState<string | null>(null);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberDisplayName, setMemberDisplayName] = useState("");
  const [isCreatingMember, setIsCreatingMember] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string;
    temporaryPassword: string;
  } | null>(null);

  const loadRole = useCallback(async () => {
    if (!supabase || !isSupabaseConfigured) {
      setLoadingRole(false);
      setSettingsError("Supabase environment is not configured.");
      return;
    }

    setLoadingRole(true);
    setSettingsError(null);
    setPhotoError(null);
    setAdminError(null);

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
      setOriginalPhotoPath(null);
      setOriginalPhotoUrl(null);
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("user_profiles")
      .select("family_id,cinematics_enabled,display_name")
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
      setOriginalPhotoPath(null);
      setOriginalPhotoUrl(null);
      return;
    }

    const resolvedFamilyId = profileData.family_id;
    setFamilyId(resolvedFamilyId);

    const loadedDisplayName = profileData.display_name ?? "";
    setProfileDisplayName(loadedDisplayName);
    setSavedDisplayName(loadedDisplayName);
    setCinematicsEnabled(profileData.cinematics_enabled ?? true);

    const { data: membershipData, error: membershipError } = await supabase
      .from("family_members")
      .select("role")
      .eq("family_id", resolvedFamilyId)
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

    const existingOriginalPath = await findExistingOriginalAvatarPath(supabase, resolvedFamilyId, userId);
    setOriginalPhotoPath(existingOriginalPath);
    if (existingOriginalPath) {
      setOriginalPhotoUrl(await createSignedOriginalAvatarUrl(supabase, existingOriginalPath));
    } else {
      setOriginalPhotoUrl(null);
    }

    setLoadingRole(false);
  }, [supabase]);

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

  const saveOriginalPhotoAsset = useCallback(
    async (selectedAsset: { uri: string; mimeType?: string | null; fileName?: string | null; base64?: string | null }) => {
      if (!supabase || !familyId || !currentUserId) {
        setPhotoError("Family profile is not ready yet.");
        return;
      }

      setIsUploadingOriginalPhoto(true);
      try {
        const extension = resolveImageExtension(selectedAsset.mimeType, selectedAsset.fileName ?? null);
        const storagePath = buildAvatarOriginalPath(familyId, currentUserId, extension);
        let uploadBody: Blob | Uint8Array;
        let contentType = selectedAsset.mimeType ?? "image/jpeg";

        if (selectedAsset.base64 && selectedAsset.base64.length > 0) {
          uploadBody = decodeBase64ToBytes(selectedAsset.base64);
        } else {
          const imageResponse = await fetch(selectedAsset.uri);
          const imageBlob = await imageResponse.blob();
          uploadBody = imageBlob;
          contentType = selectedAsset.mimeType ?? imageBlob.type ?? "image/jpeg";
        }

        const { error: uploadError } = await supabase.storage
          .from("avatar-originals")
          .upload(storagePath, uploadBody, {
            contentType,
            upsert: true,
          });

        if (uploadError) {
          setPhotoError(uploadError.message);
          return;
        }

        if (originalPhotoPath && originalPhotoPath !== storagePath) {
          await supabase.storage.from("avatar-originals").remove([originalPhotoPath]);
        }

        setOriginalPhotoPath(storagePath);
        setOriginalPhotoUrl(await createSignedOriginalAvatarUrl(supabase, storagePath));
      } catch (error) {
        setPhotoError(error instanceof Error ? error.message : "Failed to upload original photo");
      } finally {
        setIsUploadingOriginalPhoto(false);
      }
    },
    [currentUserId, familyId, originalPhotoPath, supabase],
  );

  const uploadOriginalPhoto = async () => {
    if (!supabase || !familyId || !currentUserId) {
      setPhotoError("Family profile is not ready yet.");
      return;
    }

    setPhotoError(null);
    setSettingsError(null);

    const pickResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
      base64: true,
    });

    if (pickResult.canceled) {
      return;
    }

    const selectedAsset = pickResult.assets[0];
    if (!selectedAsset?.uri) {
      setPhotoError("No image selected.");
      return;
    }

    await saveOriginalPhotoAsset(selectedAsset);
  };

  const takeOriginalPhoto = async () => {
    if (!supabase || !familyId || !currentUserId) {
      setPhotoError("Family profile is not ready yet.");
      return;
    }

    setPhotoError(null);
    setSettingsError(null);

    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      setPhotoError("Camera permission is required to take a profile photo.");
      return;
    }

    const captureResult = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
      base64: true,
    });

    if (captureResult.canceled) {
      return;
    }

    const selectedAsset = captureResult.assets[0];
    if (!selectedAsset?.uri) {
      setPhotoError("No photo captured.");
      return;
    }

    await saveOriginalPhotoAsset(selectedAsset);
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
      <ScrollView contentContainerStyle={[styles.content, { gap: spacing.md, paddingBottom: spacing.xl }]}>
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
          <AppText variant="title">Profile Photo</AppText>
          <AppText muted>Upload your original photo once. Avatars are generated from this reference.</AppText>

          {originalPhotoUrl ? (
            <Image source={{ uri: originalPhotoUrl }} style={[styles.profilePhoto, { borderColor: colors.border }]} />
          ) : (
            <View style={[styles.profilePhotoPlaceholder, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <AppText muted>No profile photo uploaded yet.</AppText>
            </View>
          )}

          <PrimaryButton
            onPress={() => {
              void uploadOriginalPhoto();
            }}
            disabled={loadingRole || isUploadingOriginalPhoto || !familyId || !currentUserId}
          >
            {isUploadingOriginalPhoto ? "Uploading Photo..." : "Upload from Library"}
          </PrimaryButton>

          <PrimaryButton
            onPress={() => {
              void takeOriginalPhoto();
            }}
            disabled={loadingRole || isUploadingOriginalPhoto || !familyId || !currentUserId}
          >
            {isUploadingOriginalPhoto ? "Uploading Photo..." : originalPhotoPath ? "Take New Photo" : "Take Photo"}
          </PrimaryButton>

          <PrimaryButton
            onPress={() => {
              navigation.navigate("Avatars");
            }}
            disabled={loadingRole || !familyId || !currentUserId || !originalPhotoPath}
          >
            Avatars
          </PrimaryButton>

          {photoError ? <AppText muted>{photoError}</AppText> : null}
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
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
  },
  profilePhoto: {
    width: 180,
    height: 180,
    borderRadius: 14,
    borderWidth: 1,
  },
  profilePhotoPlaceholder: {
    width: 220,
    minHeight: 110,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
});
