import { useCallback, useMemo, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from "react-native";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";

import {
  buildAvatarOriginalPath,
  createSignedAvatarUrl,
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

type FamilyMemberListItem = {
  userId: string;
  role: "admin" | "member";
  status: string;
  displayName: string | null;
  joinedAt: string | null;
  isCurrentUser: boolean;
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
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isUploadingOriginalPhoto, setIsUploadingOriginalPhoto] = useState(false);
  const [originalPhotoPath, setOriginalPhotoPath] = useState<string | null>(null);
  const [originalPhotoUrl, setOriginalPhotoUrl] = useState<string | null>(null);
  const [neutralAvatarUrl, setNeutralAvatarUrl] = useState<string | null>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const [adminError, setAdminError] = useState<string | null>(null);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberDisplayName, setMemberDisplayName] = useState("");
  const [isCreatingMember, setIsCreatingMember] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string;
    temporaryPassword: string;
  } | null>(null);
  const [familyMembers, setFamilyMembers] = useState<FamilyMemberListItem[]>([]);
  const [isDeletingMemberId, setIsDeletingMemberId] = useState<string | null>(null);
  const [memberDeleteError, setMemberDeleteError] = useState<string | null>(null);
  const [memberDeleteSuccess, setMemberDeleteSuccess] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

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
    setSignOutError(null);
    setMemberDeleteError(null);
    setMemberDeleteSuccess(null);
    setPasswordError(null);
    setPasswordSuccess(null);

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
      setNeutralAvatarUrl(null);
      setFamilyMembers([]);
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("user_profiles")
      .select("family_id,cinematics_enabled,display_name,avatar_style_id")
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
      setNeutralAvatarUrl(null);
      setFamilyMembers([]);
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
      setFamilyMembers([]);
      setLoadingRole(false);
      return;
    }

    const isAdmin = membershipData.role === "admin";
    setRole(isAdmin ? "admin" : "member");

    if (isAdmin) {
      const { data: memberRows, error: memberRowsError } = await supabase
        .from("family_members")
        .select("user_id,role,status,joined_at")
        .eq("family_id", resolvedFamilyId)
        .eq("status", "active");

      if (memberRowsError) {
        setLoadingRole(false);
        setSettingsError(memberRowsError.message);
        return;
      }

      const memberUserIds = (memberRows ?? []).map((row) => row.user_id);
      let displayNamesByUserId = new Map<string, string>();

      if (memberUserIds.length > 0) {
        const { data: memberProfiles, error: memberProfilesError } = await supabase
          .from("user_profiles")
          .select("user_id,display_name")
          .eq("family_id", resolvedFamilyId)
          .in("user_id", memberUserIds);

        if (memberProfilesError) {
          setLoadingRole(false);
          setSettingsError(memberProfilesError.message);
          return;
        }

        displayNamesByUserId = new Map(
          (memberProfiles ?? [])
            .filter((profile) => typeof profile.display_name === "string" && profile.display_name.trim().length > 0)
            .map((profile) => [profile.user_id, (profile.display_name ?? "").trim()]),
        );
      }

      const listItems = (memberRows ?? [])
        .map((row) => ({
          userId: row.user_id,
          role: (row.role === "admin" ? "admin" : "member") as "admin" | "member",
          status: row.status,
          joinedAt: row.joined_at,
          displayName: displayNamesByUserId.get(row.user_id) ?? null,
          isCurrentUser: row.user_id === userId,
        }))
        .sort((left, right) => {
          if (left.role !== right.role) {
            return left.role === "admin" ? -1 : 1;
          }

          const leftLabel = (left.displayName ?? left.userId).toLowerCase();
          const rightLabel = (right.displayName ?? right.userId).toLowerCase();
          return leftLabel.localeCompare(rightLabel);
        });

      setFamilyMembers(listItems);
    } else {
      setFamilyMembers([]);
    }

    const existingOriginalPath = await findExistingOriginalAvatarPath(supabase, resolvedFamilyId, userId);
    setOriginalPhotoPath(existingOriginalPath);
    if (existingOriginalPath) {
      setOriginalPhotoUrl(await createSignedOriginalAvatarUrl(supabase, existingOriginalPath));
    } else {
      setOriginalPhotoUrl(null);
    }

    const preferredStyleId = profileData.avatar_style_id ?? null;
    let neutralBasePath: string | null = null;

    if (preferredStyleId) {
      const { data: preferredPack } = await supabase
        .from("avatar_packs")
        .select("base_path")
        .eq("family_id", resolvedFamilyId)
        .eq("user_id", userId)
        .eq("status", "ready")
        .eq("style_id", preferredStyleId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      neutralBasePath = preferredPack?.base_path ?? null;
    }

    if (!neutralBasePath) {
      const { data: fallbackPack } = await supabase
        .from("avatar_packs")
        .select("base_path")
        .eq("family_id", resolvedFamilyId)
        .eq("user_id", userId)
        .eq("status", "ready")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      neutralBasePath = fallbackPack?.base_path ?? null;
    }

    if (neutralBasePath) {
      setNeutralAvatarUrl(await createSignedAvatarUrl(supabase, `${neutralBasePath}/neutral.png`));
    } else {
      setNeutralAvatarUrl(null);
    }

    setLoadingRole(false);
  }, [supabase]);

  useFocusEffect(
    useCallback(() => {
      void loadRole();
      return undefined;
    }, [loadRole]),
  );

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
    await loadRole();
  };

  const getFunctionAccessToken = useCallback(async (): Promise<string | null> => {
    if (!supabase) {
      return null;
    }

    const { data: refreshData } = await supabase.auth.refreshSession();
    let accessToken = refreshData.session?.access_token ?? null;

    if (accessToken) {
      return accessToken;
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      return null;
    }

    accessToken = sessionData.session?.access_token ?? null;
    return accessToken;
  }, [supabase]);

  const deleteFamilyMember = useCallback(
    async (member: FamilyMemberListItem) => {
      if (!supabase || !familyId || role !== "admin") {
        return;
      }

      setMemberDeleteError(null);
      setMemberDeleteSuccess(null);
      setIsDeletingMemberId(member.userId);

      const accessToken = await getFunctionAccessToken();
      if (!accessToken) {
        setMemberDeleteError("Your session is invalid or expired. Please sign out and sign in again.");
        setIsDeletingMemberId(null);
        return;
      }

      const requestBody = {
        familyId,
        memberUserId: member.userId,
      };

      const { error } = await supabase.functions.invoke("family-member-delete", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: requestBody,
      });

      if (error) {
        const resolvedMessage = await parseFunctionInvokeError(error as { message: string; context?: Response });
        if (resolvedMessage.toLowerCase().includes("invalid jwt")) {
          const { error: retryError } = await supabase.functions.invoke("family-member-delete", {
            body: requestBody,
          });

          if (!retryError) {
            setMemberDeleteSuccess("Family member deleted.");
            setFamilyMembers((currentMembers) => currentMembers.filter((current) => current.userId !== member.userId));
            setIsDeletingMemberId(null);
            await loadRole();
            return;
          }

          const retryMessage = await parseFunctionInvokeError(retryError as { message: string; context?: Response });
          setMemberDeleteError(retryMessage);
          setIsDeletingMemberId(null);
          return;
        }

        setMemberDeleteError(resolvedMessage);
        setIsDeletingMemberId(null);
        return;
      }

      setMemberDeleteSuccess("Family member deleted.");
      setFamilyMembers((currentMembers) => currentMembers.filter((current) => current.userId !== member.userId));
      setIsDeletingMemberId(null);
      await loadRole();
    },
    [familyId, getFunctionAccessToken, loadRole, role, supabase],
  );

  const confirmDeleteMember = useCallback(
    (member: FamilyMemberListItem) => {
      Alert.alert(
        "Delete family member?",
        "This permanently deletes the member account, profile data, profile photo, and avatar packs. This cannot be undone.",
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              void deleteFamilyMember(member);
            },
          },
        ],
      );
    },
    [deleteFamilyMember],
  );

  const changePassword = async () => {
    if (!supabase || !isSupabaseConfigured) {
      setPasswordError("Supabase environment is not configured.");
      return;
    }

    const nextPassword = newPassword.trim();
    const confirmNextPassword = confirmPassword.trim();

    if (nextPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      setPasswordSuccess(null);
      return;
    }

    if (nextPassword !== confirmNextPassword) {
      setPasswordError("New password and confirm password must match.");
      setPasswordSuccess(null);
      return;
    }

    setIsChangingPassword(true);
    setPasswordError(null);
    setPasswordSuccess(null);

    const { error } = await supabase.auth.updateUser({
      password: nextPassword,
      data: {
        must_change_password: false,
      },
    });

    if (error) {
      setPasswordError(error.message);
      setIsChangingPassword(false);
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    setPasswordSuccess("Password changed successfully.");
    setIsChangingPassword(false);
  };

  const signOutUser = async () => {
    if (!supabase || !isSupabaseConfigured) {
      setSignOutError("Supabase environment is not configured.");
      return;
    }

    setIsSigningOut(true);
    setSignOutError(null);

    const { error } = await supabase.auth.signOut();
    if (error) {
      setSignOutError(error.message);
    }

    setIsSigningOut(false);
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
  const resolveMemberLabel = (member: FamilyMemberListItem) => {
    const trimmedDisplayName = member.displayName?.trim() ?? "";
    if (trimmedDisplayName.length > 0) {
      return member.isCurrentUser ? `${trimmedDisplayName} (You)` : trimmedDisplayName;
    }

    const fallback = `User ${member.userId.slice(0, 8)}`;
    return member.isCurrentUser ? `${fallback} (You)` : fallback;
  };

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

          <View style={[styles.profileMediaRow, { gap: spacing.sm }]}>
            <View style={styles.profileMediaCell}>
              <AppText variant="caption" muted>
                Original
              </AppText>
              {originalPhotoUrl ? (
                <Image source={{ uri: originalPhotoUrl }} style={[styles.profilePhoto, { borderColor: colors.border }]} />
              ) : (
                <View style={[styles.profilePhotoPlaceholder, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <AppText muted>No profile photo uploaded yet.</AppText>
                </View>
              )}
            </View>

            <View style={styles.profileMediaCell}>
              <AppText variant="caption" muted>
                Neutral Avatar
              </AppText>
              {neutralAvatarUrl ? (
                <Image source={{ uri: neutralAvatarUrl }} style={[styles.profilePhoto, { borderColor: colors.border }]} />
              ) : (
                <View style={[styles.profilePhotoPlaceholder, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <AppText muted>No neutral avatar yet.</AppText>
                </View>
              )}
            </View>
          </View>

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
          <AppText variant="title">Change Password</AppText>
          <AppText muted>Set a new password for this account. Old password is not required.</AppText>
          <TextInput
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="New password"
            placeholderTextColor={colors.textMuted}
            value={newPassword}
            onChangeText={setNewPassword}
            style={inputStyle}
          />
          <TextInput
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Confirm new password"
            placeholderTextColor={colors.textMuted}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            style={inputStyle}
          />
          <PrimaryButton
            onPress={() => {
              void changePassword();
            }}
            disabled={isChangingPassword}
          >
            {isChangingPassword ? "Saving Password..." : "Change Password"}
          </PrimaryButton>
          {passwordError ? <AppText muted>{passwordError}</AppText> : null}
          {passwordSuccess ? <AppText muted>{passwordSuccess}</AppText> : null}
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
              <AppText variant="caption" muted>
                Member must change this temporary password on first login.
              </AppText>
            </View>
          ) : null}
        </InfoCard>

        <PrimaryButton
          onPress={() => {
            void signOutUser();
          }}
          disabled={isSigningOut}
        >
          {isSigningOut ? "Signing Out..." : "Sign Out"}
        </PrimaryButton>

        {signOutError ? <AppText muted>{signOutError}</AppText> : null}

        {role === "admin" ? (
          <InfoCard>
            <AppText variant="title">Family Members</AppText>
            <AppText muted>Delete member accounts and their related data.</AppText>

            {familyMembers.length === 0 ? (
              <AppText muted>No active family members found.</AppText>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {familyMembers.map((member) => {
                  const canDelete = member.role === "member" && !member.isCurrentUser;
                  const isDeleting = isDeletingMemberId === member.userId;

                  return (
                    <View
                      key={member.userId}
                      style={[
                        styles.familyMemberRow,
                        {
                          borderColor: colors.border,
                          backgroundColor: colors.background,
                        },
                      ]}
                    >
                      <View style={styles.familyMemberDetails}>
                        <AppText>{resolveMemberLabel(member)}</AppText>
                        <AppText variant="caption" muted>
                          {member.role === "admin" ? "Admin" : "Member"} - {member.userId.slice(0, 8)}
                        </AppText>
                      </View>

                      {canDelete ? (
                        <Pressable
                          onPress={() => {
                            confirmDeleteMember(member);
                          }}
                          disabled={isDeleting}
                          style={({ pressed }) => [
                            styles.deleteMemberButton,
                            {
                              borderColor: "#ef4444",
                              backgroundColor: isDeleting ? "#fca5a5" : "#fef2f2",
                              opacity: pressed ? 0.8 : 1,
                            },
                          ]}
                        >
                          <AppText style={styles.deleteMemberIcon}>{"\u{1F5D1}"}</AppText>
                        </Pressable>
                      ) : (
                        <View style={styles.memberRoleTag}>
                          <AppText variant="caption" muted>
                            {member.isCurrentUser ? "You" : "Admin"}
                          </AppText>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {memberDeleteError ? <AppText muted>{memberDeleteError}</AppText> : null}
            {memberDeleteSuccess ? <AppText muted>{memberDeleteSuccess}</AppText> : null}
          </InfoCard>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
  },
  profileMediaRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "flex-start",
  },
  profileMediaCell: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  profilePhoto: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: 1,
  },
  profilePhotoPlaceholder: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 14,
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
  familyMemberRow: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  familyMemberDetails: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  deleteMemberButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteMemberIcon: {
    color: "#b42318",
    fontSize: 16,
    lineHeight: 18,
  },
  memberRoleTag: {
    minWidth: 46,
    alignItems: "flex-end",
  },
});
