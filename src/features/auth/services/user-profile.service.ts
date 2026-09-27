import { doc, getDoc, Timestamp } from "firebase/firestore";

import { getFirebaseDb } from "@/lib/firebase";

import type { UserProfile, UserRole } from "../types/auth.types";

export type UserProfileErrorReason = "missing" | "invalid";

export class UserProfileError extends Error {
  constructor(public readonly reason: UserProfileErrorReason) {
    super(reason === "missing" ? "User profile not found" : "Invalid user profile");
    this.name = "UserProfileError";
  }
}

function isUserRole(value: unknown): value is UserRole {
  return value === "admin" || value === "agent";
}

function isValidUserProfile(
  value: unknown,
  expectedUid: string,
): value is UserProfile {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const profile = value as Record<string, unknown>;

  return (
    profile.uid === expectedUid &&
    typeof profile.email === "string" &&
    typeof profile.displayName === "string" &&
    isUserRole(profile.role) &&
    typeof profile.active === "boolean" &&
    profile.createdAt instanceof Timestamp &&
    profile.updatedAt instanceof Timestamp
  );
}

export async function getUserProfile(uid: string): Promise<UserProfile> {
  const profileSnapshot = await getDoc(doc(getFirebaseDb(), "users", uid));

  if (!profileSnapshot.exists()) {
    throw new UserProfileError("missing");
  }

  const profileData = profileSnapshot.data();

  if (!isValidUserProfile(profileData, uid)) {
    throw new UserProfileError("invalid");
  }

  return profileData;
}
