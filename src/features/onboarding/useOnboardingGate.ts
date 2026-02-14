import { useCallback, useEffect, useMemo, useState } from "react";
import { Session } from "@supabase/supabase-js";

import { getSupabaseClient, isSupabaseConfigured } from "../../lib/supabase";

type UserProfile = {
  user_id: string;
  family_id: string;
  display_name: string | null;
};

export type OnboardingStage = "misconfigured" | "loading" | "needs_auth" | "needs_family" | "ready";

export type OnboardingGateState = {
  stage: OnboardingStage;
  configured: boolean;
  session: Session | null;
  profile: UserProfile | null;
  error: string | null;
  isSendingOtp: boolean;
  isVerifyingOtp: boolean;
  isCreatingFamily: boolean;
  isJoiningFamily: boolean;
  isSigningOut: boolean;
  sendEmailOtp: (email: string) => Promise<boolean>;
  verifyEmailOtp: (email: string, otpCode: string) => Promise<boolean>;
  createFamily: (familyName: string, displayName?: string) => Promise<boolean>;
  joinFamily: (inviteToken: string, displayName?: string) => Promise<boolean>;
  signOut: () => Promise<boolean>;
  clearError: () => void;
  refresh: () => Promise<void>;
};

type ActionState = "send_otp" | "verify_otp" | "create_family" | "join_family" | "sign_out" | null;

function toErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }

  return fallback;
}

export function useOnboardingGate(): OnboardingGateState {
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [actionState, setActionState] = useState<ActionState>(null);

  const loadProfileForUser = useCallback(
    async (userId: string | null) => {
      if (!supabase || !userId) {
        setProfile(null);
        return;
      }

      setLoadingProfile(true);

      const { data, error: profileError } = await supabase
        .from("user_profiles")
        .select("user_id,family_id,display_name")
        .eq("user_id", userId)
        .maybeSingle();

      if (profileError) {
        setProfile(null);
        setError(profileError.message);
        setLoadingProfile(false);
        return;
      }

      if (!data?.family_id) {
        setProfile(null);
        setLoadingProfile(false);
        return;
      }

      setProfile(data as UserProfile);
      setLoadingProfile(false);
    },
    [supabase],
  );

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setInitializing(false);
      return;
    }

    let active = true;

    const bootstrapSession = async () => {
      setInitializing(true);
      setError(null);

      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!active) {
        return;
      }

      if (sessionError) {
        setError(sessionError.message);
        setSession(null);
        setProfile(null);
        setInitializing(false);
        return;
      }

      const currentSession = data.session ?? null;
      setSession(currentSession);
      await loadProfileForUser(currentSession?.user?.id ?? null);

      if (active) {
        setInitializing(false);
      }
    };

    void bootstrapSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) {
        return;
      }

      setSession(nextSession);
      void loadProfileForUser(nextSession?.user?.id ?? null);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [loadProfileForUser, supabase]);

  const runAction = useCallback(async (action: Exclude<ActionState, null>, fn: () => Promise<boolean>) => {
    setActionState(action);
    setError(null);
    try {
      return await fn();
    } catch (unknownError) {
      setError(toErrorMessage(unknownError));
      return false;
    } finally {
      setActionState(null);
    }
  }, []);

  const sendEmailOtp = useCallback(
    async (email: string) => {
      const normalizedEmail = email.trim().toLowerCase();

      if (!supabase || !isSupabaseConfigured) {
        setError("Supabase environment is not configured.");
        return false;
      }

      if (normalizedEmail.length === 0) {
        setError("Email is required.");
        return false;
      }

      return runAction("send_otp", async () => {
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email: normalizedEmail,
          options: {
            shouldCreateUser: true,
          },
        });

        if (otpError) {
          setError(otpError.message);
          return false;
        }

        return true;
      });
    },
    [runAction, supabase],
  );

  const verifyEmailOtp = useCallback(
    async (email: string, otpCode: string) => {
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedOtp = otpCode.trim();

      if (!supabase || !isSupabaseConfigured) {
        setError("Supabase environment is not configured.");
        return false;
      }

      if (normalizedEmail.length === 0 || normalizedOtp.length === 0) {
        setError("Email and OTP code are required.");
        return false;
      }

      return runAction("verify_otp", async () => {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          email: normalizedEmail,
          token: normalizedOtp,
          type: "email",
        });

        if (verifyError) {
          setError(verifyError.message);
          return false;
        }

        return true;
      });
    },
    [runAction, supabase],
  );

  const createFamily = useCallback(
    async (familyName: string, displayName?: string) => {
      const normalizedFamilyName = familyName.trim();
      const normalizedDisplayName = displayName?.trim() ?? "";
      const actorUserId = session?.user?.id ?? null;

      if (!supabase || !isSupabaseConfigured) {
        setError("Supabase environment is not configured.");
        return false;
      }

      if (!actorUserId) {
        setError("You must be signed in to create a family.");
        return false;
      }

      if (normalizedFamilyName.length === 0) {
        setError("Family name is required.");
        return false;
      }

      return runAction("create_family", async () => {
        const { error: invokeError } = await supabase.functions.invoke("family-bootstrap", {
          body: {
            familyName: normalizedFamilyName,
            displayName: normalizedDisplayName.length > 0 ? normalizedDisplayName : undefined,
          },
        });

        if (invokeError) {
          setError(invokeError.message);
          return false;
        }

        await loadProfileForUser(actorUserId);
        return true;
      });
    },
    [loadProfileForUser, runAction, session?.user?.id, supabase],
  );

  const joinFamily = useCallback(
    async (inviteToken: string, displayName?: string) => {
      const normalizedInviteToken = inviteToken.trim();
      const normalizedDisplayName = displayName?.trim() ?? "";
      const actorUserId = session?.user?.id ?? null;

      if (!supabase || !isSupabaseConfigured) {
        setError("Supabase environment is not configured.");
        return false;
      }

      if (!actorUserId) {
        setError("You must be signed in to join a family.");
        return false;
      }

      if (normalizedInviteToken.length === 0) {
        setError("Invite token is required.");
        return false;
      }

      return runAction("join_family", async () => {
        const { error: invokeError } = await supabase.functions.invoke("invite-accept", {
          body: {
            token: normalizedInviteToken,
            displayName: normalizedDisplayName.length > 0 ? normalizedDisplayName : undefined,
          },
        });

        if (invokeError) {
          setError(invokeError.message);
          return false;
        }

        await loadProfileForUser(actorUserId);
        return true;
      });
    },
    [loadProfileForUser, runAction, session?.user?.id, supabase],
  );

  const signOut = useCallback(async () => {
    if (!supabase || !isSupabaseConfigured) {
      setError("Supabase environment is not configured.");
      return false;
    }

    return runAction("sign_out", async () => {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        setError(signOutError.message);
        return false;
      }

      return true;
    });
  }, [runAction, supabase]);

  const refresh = useCallback(async () => {
    await loadProfileForUser(session?.user?.id ?? null);
  }, [loadProfileForUser, session?.user?.id]);

  const stage: OnboardingStage = useMemo(() => {
    if (!isSupabaseConfigured || !supabase) {
      return "misconfigured";
    }

    if (initializing || loadingProfile) {
      return "loading";
    }

    if (!session) {
      return "needs_auth";
    }

    if (!profile?.family_id) {
      return "needs_family";
    }

    return "ready";
  }, [initializing, loadingProfile, profile?.family_id, session, supabase]);

  return {
    stage,
    configured: isSupabaseConfigured,
    session,
    profile,
    error,
    isSendingOtp: actionState === "send_otp",
    isVerifyingOtp: actionState === "verify_otp",
    isCreatingFamily: actionState === "create_family",
    isJoiningFamily: actionState === "join_family",
    isSigningOut: actionState === "sign_out",
    sendEmailOtp,
    verifyEmailOtp,
    createFamily,
    joinFamily,
    signOut,
    clearError: () => setError(null),
    refresh,
  };
}
