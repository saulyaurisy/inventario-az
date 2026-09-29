import "server-only";

import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

export function getFirebaseAdminApp() {
  if (getApps().length > 0) return getApp();

  return initializeApp({
    credential: cert({
      projectId: requiredEnvironmentVariable("FIREBASE_ADMIN_PROJECT_ID"),
      clientEmail: requiredEnvironmentVariable("FIREBASE_ADMIN_CLIENT_EMAIL"),
      privateKey: requiredEnvironmentVariable("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n"),
    }),
  });
}

export function getFirebaseAdminAuth() {
  return getAuth(getFirebaseAdminApp());
}

export function getFirebaseAdminDb() {
  return getFirestore(getFirebaseAdminApp());
}
