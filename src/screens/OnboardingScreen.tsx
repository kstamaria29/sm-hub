import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { OnboardingGateState } from "../features/onboarding/useOnboardingGate";
import { AppText } from "../ui/primitives/AppText";
import { InfoCard } from "../ui/primitives/InfoCard";
import { PrimaryButton } from "../ui/primitives/PrimaryButton";
import { Screen } from "../ui/primitives/Screen";
import { useTheme } from "../ui/theme/ThemeProvider";

type OnboardingScreenProps = {
  gate: OnboardingGateState;
};

export function OnboardingScreen({ gate }: OnboardingScreenProps) {
  const { colors, radius, spacing } = useTheme();

  const [email, setEmail] = useState(gate.session?.user?.email ?? "");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const [displayName, setDisplayName] = useState(gate.profile?.display_name ?? "");
  const [familyName, setFamilyName] = useState("");

  useEffect(() => {
    if (gate.profile?.display_name && displayName.trim().length === 0) {
      setDisplayName(gate.profile.display_name);
    }
  }, [displayName, gate.profile?.display_name]);

  const inputStyle = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    color: colors.text,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
  } as const;

  const renderMisconfigured = () => (
    <InfoCard>
      <AppText variant="title">Supabase Env Missing</AppText>
      <AppText muted>
        Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`, then restart Expo.
      </AppText>
    </InfoCard>
  );

  const renderLoading = () => (
    <InfoCard>
      <View style={[styles.loadingRow, { gap: spacing.sm }]}>
        <ActivityIndicator color={colors.primary} />
        <AppText muted>Checking account access...</AppText>
      </View>
    </InfoCard>
  );

  const renderAuth = () => (
    <InfoCard>
      <AppText variant="title">Admin Sign In</AppText>
      <AppText muted>Use email and password. If this is your first time, create account first.</AppText>

      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        placeholder="you@example.com"
        placeholderTextColor={colors.textMuted}
        style={inputStyle}
        value={email}
        onChangeText={(value) => {
          gate.clearError();
          setEmail(value);
        }}
      />

      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        placeholder="Password (min 8 chars)"
        placeholderTextColor={colors.textMuted}
        style={inputStyle}
        value={password}
        onChangeText={(value) => {
          gate.clearError();
          setPassword(value);
        }}
      />

      <PrimaryButton
        onPress={() => {
          void gate.signUpWithEmail(email, password);
        }}
        disabled={gate.isSigningUp || email.trim().length === 0 || password.trim().length < 8}
      >
        {gate.isSigningUp ? "Creating Account..." : "Create Account"}
      </PrimaryButton>

      <PrimaryButton
        onPress={() => {
          void gate.signInWithEmail(email, password);
        }}
        disabled={gate.isSigningIn || email.trim().length === 0 || password.trim().length < 8}
      >
        {gate.isSigningIn ? "Signing In..." : "Sign In"}
      </PrimaryButton>
    </InfoCard>
  );

  const renderFamilySetup = () => (
    <View style={{ gap: spacing.md }}>
      <InfoCard>
        <AppText variant="title">Signed In</AppText>
        <AppText muted>{gate.session?.user?.email ?? "Authenticated user"}</AppText>
      </InfoCard>

      <InfoCard>
        <AppText variant="title">Create Family</AppText>
        <AppText muted>Create your private family space and default rooms.</AppText>
        <TextInput
          placeholder="Family name"
          placeholderTextColor={colors.textMuted}
          style={inputStyle}
          value={familyName}
          onChangeText={(value) => {
            gate.clearError();
            setFamilyName(value);
          }}
        />
        <TextInput
          placeholder="Display name (optional)"
          placeholderTextColor={colors.textMuted}
          style={inputStyle}
          value={displayName}
          onChangeText={(value) => {
            gate.clearError();
            setDisplayName(value);
          }}
        />
        <PrimaryButton
          onPress={() => {
            void gate.createFamily(familyName, displayName);
          }}
          disabled={gate.isCreatingFamily || familyName.trim().length === 0}
        >
          {gate.isCreatingFamily ? "Creating..." : "Create Family"}
        </PrimaryButton>
      </InfoCard>

      <PrimaryButton
        onPress={() => {
          void gate.signOut();
        }}
        disabled={gate.isSigningOut}
      >
        {gate.isSigningOut ? "Signing Out..." : "Sign Out"}
      </PrimaryButton>
    </View>
  );

  const renderPasswordReset = () => {
    const normalizedNewPassword = newPassword.trim();
    const passwordsMatch = normalizedNewPassword.length > 0 && newPassword === confirmNewPassword;
    const showMismatchHint = confirmNewPassword.trim().length > 0 && !passwordsMatch;

    return (
      <View style={{ gap: spacing.md }}>
        <InfoCard>
          <AppText variant="title">First Login Security Step</AppText>
          <AppText muted>
            Change your temporary password now. You do not need to enter your old password.
          </AppText>
          <AppText muted>{gate.session?.user?.email ?? "Authenticated user"}</AppText>

          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            placeholder="New password (min 8 chars)"
            placeholderTextColor={colors.textMuted}
            style={inputStyle}
            value={newPassword}
            onChangeText={(value) => {
              gate.clearError();
              setNewPassword(value);
            }}
          />

          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            placeholder="Confirm new password"
            placeholderTextColor={colors.textMuted}
            style={inputStyle}
            value={confirmNewPassword}
            onChangeText={(value) => {
              gate.clearError();
              setConfirmNewPassword(value);
            }}
          />

          {showMismatchHint ? <AppText muted>Passwords do not match.</AppText> : null}

          <PrimaryButton
            onPress={() => {
              void gate.updatePasswordForFirstLogin(newPassword);
            }}
            disabled={
              gate.isUpdatingPassword ||
              normalizedNewPassword.length < 8 ||
              !passwordsMatch
            }
          >
            {gate.isUpdatingPassword ? "Updating Password..." : "Update Password"}
          </PrimaryButton>
        </InfoCard>

        <PrimaryButton
          onPress={() => {
            void gate.signOut();
          }}
          disabled={gate.isSigningOut || gate.isUpdatingPassword}
        >
          {gate.isSigningOut ? "Signing Out..." : "Sign Out"}
        </PrimaryButton>
      </View>
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.content, { gap: spacing.md, paddingBottom: spacing.xl }]}>
        <AppText variant="heading">Family Hub Onboarding</AppText>

        {gate.error ? (
          <InfoCard>
            <AppText variant="title">Onboarding Error</AppText>
            <AppText muted>{gate.error}</AppText>
          </InfoCard>
        ) : null}

        {gate.stage === "misconfigured" ? renderMisconfigured() : null}
        {gate.stage === "loading" ? renderLoading() : null}
        {gate.stage === "needs_auth" ? renderAuth() : null}
        {gate.stage === "needs_password_reset" ? renderPasswordReset() : null}
        {gate.stage === "needs_family" ? renderFamilySetup() : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
  },
});
