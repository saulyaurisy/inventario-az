import type { User } from "firebase/auth";
import type { Timestamp } from "firebase/firestore";

export type UserRole = "admin" | "agent";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type AuthStatus =
  | "loading"
  | "unauthenticated"
  | "authenticated"
  | "inactive"
  | "missing-profile"
  | "error";

export interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  status: AuthStatus;
  error: string | null;
}

export interface AuthContextValue extends AuthState {
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isAgent: boolean;
  hasRole: (role: UserRole) => boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}
