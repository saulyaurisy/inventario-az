import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type NextOrObserver,
  type User,
} from "firebase/auth";

import { getFirebaseAuth } from "@/lib/firebase";

export function configureAuthPersistence(): Promise<void> {
  return setPersistence(getFirebaseAuth(), browserLocalPersistence);
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<User> {
  const credential = await signInWithEmailAndPassword(
    getFirebaseAuth(),
    email,
    password,
  );
  return credential.user;
}

export function signOutUser(): Promise<void> {
  return firebaseSignOut(getFirebaseAuth());
}

export function observeAuthState(
  onNext: NextOrObserver<User>,
  onError?: (error: Error) => void,
) {
  return onAuthStateChanged(getFirebaseAuth(), onNext, onError);
}
