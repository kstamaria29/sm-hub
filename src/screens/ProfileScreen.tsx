import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Switch, TextInput, View } from "react-native";

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

  const [familyId, setFamilyId] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "member" | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);
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
      setAdminError("Supabase environment is not configured.");
      return;
    }

    setLoadingRole(true);
    setAdminError(null);

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      setLoadingRole(false);
      setAdminError(sessionError.message);
      return;
    }

    const userId = sessionData.session?.user?.id ?? null;
    if (!userId) {
      setLoadingRole(false);
      setRole(null);
      setFamilyId(null);
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("user_profiles")
      .select("family_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError) {
      setLoadingRole(false);
      setAdminError(profileError.message);
      return;
    }

    if (!profileData?.family_id) {
      setLoadingRole(false);
      setRole(null);
      setFamilyId(null);
      return;
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
      setAdminError(membershipError.message);
      return;
    }

    if (!membershipData) {
      setFamilyId(null);
      setRole(null);
      setLoadingRole(false);
      return;
    }

    setFamilyId(profileData.family_id);
    setRole(membershipData.role === "admin" ? "admin" : "member");
    setLoadingRole(false);
  }, [supabase]);

  useEffect(() => {
    void loadRole();
  }, [loadRole]);

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

  return (
    <Screen>
      <View style={[styles.content, { gap: spacing.md }]}>
        <AppText variant="heading">Settings and Profile</AppText>
        <InfoCard>
          <AppText variant="title">Cinematics</AppText>
          <View style={styles.toggleRow}>
            <AppText muted>Board camera effects for dice, snake, and ladder moments.</AppText>
            <Switch value thumbColor={colors.surface} />
          </View>
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
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
});
