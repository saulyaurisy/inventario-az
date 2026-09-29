import "server-only";

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

async function getGoogleAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requiredEnvironmentVariable("GOOGLE_CLIENT_ID"),
      client_secret: requiredEnvironmentVariable("GOOGLE_CLIENT_SECRET"),
      refresh_token: requiredEnvironmentVariable("GOOGLE_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Google OAuth token exchange failed");

  const data = await response.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("Google OAuth response did not include an access token");
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(60, data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

async function authorizedDriveFetch(url: string, init?: RequestInit): Promise<Response> {
  const accessToken = await getGoogleAccessToken();
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...init?.headers,
    },
    cache: "no-store",
  });
}

export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  parents?: string[];
  appProperties?: Record<string, string>;
  trashed?: boolean;
}

export function getDriveFolderId(): string {
  return requiredEnvironmentVariable("GOOGLE_DRIVE_FOLDER_ID");
}

export async function createDriveResumableSession(input: {
  fileName: string;
  mimeType: string;
  size: number;
  saleId: string;
  uploadId: string;
  uploadedBy: string;
}): Promise<string> {
  const response = await authorizedDriveFetch(
    `${DRIVE_UPLOAD_BASE}/files?uploadType=resumable&fields=id`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": input.mimeType,
        "X-Upload-Content-Length": String(input.size),
      },
      body: JSON.stringify({
        name: input.fileName,
        mimeType: input.mimeType,
        parents: [getDriveFolderId()],
        appProperties: {
          uploadId: input.uploadId,
          saleId: input.saleId,
          uploadedBy: input.uploadedBy,
        },
      }),
    },
  );
  if (!response.ok) throw new Error("Could not create Google Drive upload session");
  const location = response.headers.get("location");
  if (!location?.startsWith("https://www.googleapis.com/upload/drive/")) {
    throw new Error("Google Drive did not return a valid upload session URL");
  }
  return location;
}

export async function findDriveFileByUploadId(uploadId: string): Promise<DriveFileMetadata | null> {
  const query = `appProperties has { key='uploadId' and value='${uploadId}' } and trashed=false`;
  const fields = "files(id,name,mimeType,size,parents,appProperties,trashed)";
  const response = await authorizedDriveFetch(
    `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&spaces=drive&pageSize=2&fields=${encodeURIComponent(fields)}`,
  );
  if (!response.ok) throw new Error("Could not query Google Drive upload");
  const data = await response.json() as { files?: DriveFileMetadata[] };
  if (!data.files || data.files.length === 0) return null;
  if (data.files.length !== 1) throw new Error("Upload identifier is not unique in Google Drive");
  return data.files[0];
}

export async function getDriveFileMetadata(fileId: string): Promise<DriveFileMetadata> {
  const fields = "id,name,mimeType,size,parents,appProperties,trashed";
  const response = await authorizedDriveFetch(
    `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(fields)}`,
  );
  if (!response.ok) throw new Error("Could not read Google Drive file metadata");
  return response.json() as Promise<DriveFileMetadata>;
}

export async function downloadDriveFile(fileId: string): Promise<Response> {
  const response = await authorizedDriveFetch(
    `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`,
  );
  if (!response.ok || !response.body) throw new Error("Could not download Google Drive file");
  return response;
}

export async function deleteDriveFile(fileId: string): Promise<void> {
  const response = await authorizedDriveFetch(
    `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`,
    { method: "DELETE" },
  );
  if (!response.ok && response.status !== 404) throw new Error("Could not delete Google Drive file");
}
