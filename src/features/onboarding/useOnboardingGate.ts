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
  isSigningUp: boolean;
  isSigningIn: boolean;
  isCreatingFamily: boolean;
  isSigningOut: boolean;
  signUpWithEmail: (email: string, password: string) => Promise<boolean>;
  signInWithEmail: (email: string, password: string) => Promise<boolean>;
  createFamily: (familyName: string, displayName?: string) => Promise<boolean>;
  signOut: () => Promise<boolean>;
  clearError: () => void;
  refresh: () => Promise<void>;
};

type ActionState = "sign_up" | "sign_in" | "create_family" | "sign_out" | null;

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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
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

  const signUpWithEmail = useCallback(
    async (email: string, password: string) => {
      const normalizedEmail = normalizeEmail(email);
      const normalizedPassword = password.trim();

      if (!supabase || !isSupabaseConfigured) {
        setError("Supabase environment is not configured.");
        return false;
      }

      if (normalizedEmail.length === 0) {
        setError("Email is required.");
        return false;
      }

      if (normalizedPassword.length < 8) {
        setError("Password must be at least 8 characters.");
        return false;
      }

      return runAction("sign_up", async () => {
        const { error: signUpError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password: normalizedPassword,
        });

        if (signUpError) {
          setError(signUpError.message);
          return false;
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: normalizedPassword,
        });

        if (signInError) {
          if (signInError.message.toLowerCase().includes("email not confirmed")) {
            setError(
              "Account created, but email confirmation is enabled in Supabase Auth. Disable confirmation for local testing.",
            );
            return false;
          }

          setError(signInError.message);
          return false;
        }

        return true;
      });
    },
    [runAction, supabase],
  );

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      const normalizedEmail = normalizeEmail(email);
      const normalizedPassword = password.trim();

      if (!supabase || !isSupabaseConfigured) {
        setError("Supabase environment is not configured.");
        return false;
      }

      if (normalizedEmail.length === 0) {
        setError("Email is required.");
        return false;
      }

      if (normalizedPassword.length < 8) {
        setError("Password must be at least 8 characters.");
        return false;
      }

      return runAction("sign_in", async () => {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: normalizedPassword,
        });

        if (signInError) {
          setError(signInError.message);
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
        const { data: refreshData } = await supabase.auth.refreshSession();
        let accessToken = refreshData.session?.access_token ?? null;

        if (!accessToken) {
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) {
            setError(sessionError.message);
            return false;
          }

          accessToken = sessionData.session?.access_token ?? null;
        }

        if (!accessToken) {
          setError("Your session is invalid or expired. Please sign out and sign in again.");
          return false;
        }

        const { data: currentUserData, error: currentUserError } = await supabase.auth.getUser(accessToken);
        if (currentUserError || !currentUserData.user) {
          setError("Session token could not be verified. Sign out and sign in again.");
          return false;
        }

        const requestBody = {
          familyName: normalizedFamilyName,
          displayName: normalizedDisplayName.length > 0 ? normalizedDisplayName : undefined,
        };

        const { error: invokeError } = await supabase.functions.invoke("family-bootstrap", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: requestBody,
        });

        if (invokeError) {
          const resolvedMessage = await parseFunctionInvokeError(invokeError as { message: string; context?: Response });
          if (resolvedMessage.toLowerCase().includes("invalid jwt")) {
            const { error: retryError } = await supabase.functions.invoke("family-bootstrap", {
              body: requestBody,
            });

            if (!retryError) {
              await loadProfileForUser(actorUserId);
              return true;
            }

            const retryMessage = await parseFunctionInvokeError(retryError as { message: string; context?: Response });
            if (retryMessage.toLowerCase().includes("invalid jwt")) {
              const identity = currentUserData.user.email ?? currentUserData.user.id;
              setError(
                `JWT rejected by Functions gateway for ${identity}. Check .env.local Supabase URL/anon key pair, then restart Expo with \`npx expo start -c\` and sign in again.`,
              );
              return false;
            }
          }

          setError(resolvedMessage);
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
    isSigningUp: actionState === "sign_up",
    isSigningIn: actionState === "sign_in",
    isCreatingFamily: actionState === "create_family",
    isSigningOut: actionState === "sign_out",
    signUpWithEmail,
    signInWithEmail,
    createFamily,
    signOut,
    clearError: () => setError(null),
    refresh,
  };
}
