import { FirebaseError } from "firebase/app";

const DEFAULT_AUTH_ERROR =
  "No se pudo completar la operación. Intenta nuevamente.";

const AUTH_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  "auth/invalid-api-key":
    "La autenticación no está configurada correctamente. Contacta al administrador.",
  "auth/invalid-credential": "Correo o contraseña incorrectos.",
  "auth/invalid-email": "Ingresa un correo electrónico válido.",
  "auth/network-request-failed":
    "No se pudo conectar. Revisa tu conexión e intenta nuevamente.",
  "auth/too-many-requests":
    "Demasiados intentos. Intenta nuevamente más tarde.",
  "auth/user-disabled":
    "Tu cuenta se encuentra deshabilitada. Contacta al administrador.",
  "auth/user-not-found": "Correo o contraseña incorrectos.",
  "auth/wrong-password": "Correo o contraseña incorrectos.",
};

export function getAuthErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    if (
      error.code === "auth/invalid-api-key" &&
      process.env.NODE_ENV === "development"
    ) {
      return "Firebase no está configurado. Revisa las variables de entorno.";
    }

    return AUTH_ERROR_MESSAGES[error.code] ?? DEFAULT_AUTH_ERROR;
  }

  return DEFAULT_AUTH_ERROR;
}
