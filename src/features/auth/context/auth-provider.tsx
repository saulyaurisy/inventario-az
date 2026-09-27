"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  configureAuthPersistence,
  observeAuthState,
  signInWithEmail,
  signOutUser,
} from "../services/auth.service";
import {
  getUserProfile,
  UserProfileError,
} from "../services/user-profile.service";
import type {
  AuthState,
  AuthStatus,
  UserRole,
} from "../types/auth.types";
import { getAuthErrorMessage } from "../utils/auth-errors";
import { hasRole as profileHasRole } from "../utils/roles";
import { AuthContext } from "./auth-context";

const INITIAL_STATE: AuthState = {
  user: null,
  profile: null,
  status: "loading",
  error: null,
};

const INACTIVE_MESSAGE =
  "Tu cuenta se encuentra deshabilitada. Contacta al administrador.";
const MISSING_PROFILE_MESSAGE =
  "Tu cuenta no está configurada correctamente. Contacta al administrador.";

type RejectedSession = {
  status: Extract<AuthStatus, "inactive" | "missing-profile" | "error">;
  error: string;
};

export function AuthProvider({ children }: React.PropsWithChildren) {
  const [state, setState] = useState<AuthState>(INITIAL_STATE);
  const rejectedSessionRef = useRef<RejectedSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    let authChangeId = 0;
    let unsubscribe: (() => void) | undefined;

    async function startAuthObserver() {
      try {
        await configureAuthPersistence();
      } catch (error) {
        if (!cancelled) {
          setState({
            user: null,
            profile: null,
            status: "error",
            error: getAuthErrorMessage(error),
          });
        }
        return;
      }

      if (cancelled) {
        return;
      }

      unsubscribe = observeAuthState(
        async (firebaseUser) => {
          const currentAuthChangeId = ++authChangeId;

          if (!firebaseUser) {
            const rejectedSession = rejectedSessionRef.current;
            setState({
              user: null,
              profile: null,
              status: rejectedSession?.status ?? "unauthenticated",
              error: rejectedSession?.error ?? null,
            });
            return;
          }

          setState({
            user: firebaseUser,
            profile: null,
            status: "loading",
            error: null,
          });

          try {
            const profile = await getUserProfile(firebaseUser.uid);

            if (cancelled || currentAuthChangeId !== authChangeId) {
              return;
            }

            if (!profile.active) {
              rejectedSessionRef.current = {
                status: "inactive",
                error: INACTIVE_MESSAGE,
              };
              await signOutUser();
              return;
            }

            rejectedSessionRef.current = null;
            setState({
              user: firebaseUser,
              profile,
              status: "authenticated",
              error: null,
            });
          } catch (error) {
            if (cancelled || currentAuthChangeId !== authChangeId) {
              return;
            }

            if (error instanceof UserProfileError) {
              rejectedSessionRef.current = {
                status: "missing-profile",
                error: MISSING_PROFILE_MESSAGE,
              };
              await signOutUser();
              return;
            }

            rejectedSessionRef.current = {
              status: "error",
              error: getAuthErrorMessage(error),
            };
            await signOutUser();
          }
        },
        (error) => {
          if (!cancelled) {
            setState({
              user: null,
              profile: null,
              status: "error",
              error: getAuthErrorMessage(error),
            });
          }
        },
      );
    }

    void startAuthObserver();

    return () => {
      cancelled = true;
      authChangeId += 1;
      unsubscribe?.();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    rejectedSessionRef.current = null;
    setState({
      user: null,
      profile: null,
      status: "loading",
      error: null,
    });

    try {
      await signInWithEmail(email, password);
    } catch (error) {
      setState({
        user: null,
        profile: null,
        status: "unauthenticated",
        error: getAuthErrorMessage(error),
      });
    }
  }, []);

  const signOut = useCallback(async () => {
    rejectedSessionRef.current = null;
    setState((currentState) => ({
      ...currentState,
      status: "loading",
      error: null,
    }));

    try {
      await signOutUser();
      setState({
        user: null,
        profile: null,
        status: "unauthenticated",
        error: null,
      });
    } catch (error) {
      setState((currentState) => ({
        ...currentState,
        status: currentState.user ? "authenticated" : "error",
        error: getAuthErrorMessage(error),
      }));
    }
  }, []);

  const clearError = useCallback(() => {
    rejectedSessionRef.current = null;
    setState((currentState) => ({ ...currentState, error: null }));
  }, []);

  const hasRole = useCallback(
    (role: UserRole) => profileHasRole(state.profile, role),
    [state.profile],
  );

  const contextValue = useMemo(
    () => ({
      ...state,
      loading: state.status === "loading",
      isAuthenticated:
        state.status === "authenticated" && state.profile !== null,
      isAdmin: profileHasRole(state.profile, "admin"),
      isAgent: profileHasRole(state.profile, "agent"),
      hasRole,
      signIn,
      signOut,
      clearError,
    }),
    [clearError, hasRole, signIn, signOut, state],
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}
