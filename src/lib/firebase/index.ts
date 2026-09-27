import "client-only";

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

import { firebaseConfig } from "./config";

export const firebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export function getFirebaseAuth(): Auth {
  return getAuth(firebaseApp);
}

export function getFirebaseDb(): Firestore {
  return getFirestore(firebaseApp);
}

export function getFirebaseStorage(): FirebaseStorage {
  return getStorage(firebaseApp);
}

export { firebaseConfig };
