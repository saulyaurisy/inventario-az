/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node.js CLI invoked by Windows PowerShell. */
const fs = require("node:fs");
const path = require("node:path");

const { loadEnvConfig } = require("@next/env");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

loadEnvConfig(process.cwd());

const EXPECTED_PROJECT_ID = "inventario-az";
const OPERATIONAL_COLLECTIONS = [
  "products",
  "product_skus",
  "clients",
  "client_documents",
  "inventory",
  "inventory_movements",
  "replenishments",
  "sales",
  "sale_intents",
  "sale_payment_proofs",
  "payment_proof_uploads",
  "suppliers",
  "purchases",
];
const DELETE_ORDER = [
  "sale_payment_proofs",
  "payment_proof_uploads",
  "sales",
  "sale_intents",
  "replenishments",
  "purchases",
  "inventory_movements",
  "inventory",
  "product_skus",
  "products",
  "client_documents",
  "clients",
  "suppliers",
];
const OPERATIONAL_COUNTER_IDS = ["sales", "replenishments", "purchases"];
const KNOWN_COLLECTIONS = new Set([
  ...OPERATIONAL_COLLECTIONS,
  "system_counters",
  "users",
]);

let cachedGoogleToken = null;

function requiredEnvironmentVariable(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable de entorno requerida: ${name}`);
  return value;
}

function assertExpectedProject() {
  const projectId = requiredEnvironmentVariable("FIREBASE_ADMIN_PROJECT_ID");
  if (projectId === "azbel-corp") {
    throw new Error("Operación bloqueada explícitamente para azbel-corp.");
  }
  if (projectId !== EXPECTED_PROJECT_ID) {
    throw new Error(`Proyecto Firebase inesperado: ${projectId}`);
  }
  return projectId;
}

function getAdminApp() {
  const projectId = assertExpectedProject();
  if (getApps().length > 0) return getApps()[0];
  return initializeApp({
    credential: cert({
      projectId,
      clientEmail: requiredEnvironmentVariable("FIREBASE_ADMIN_CLIENT_EMAIL"),
      privateKey: requiredEnvironmentVariable("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n"),
    }),
  });
}

function serializeFirestoreValue(value) {
  if (value === null || value === undefined) return value ?? null;
  if (value instanceof Date) return { type: "date", value: value.toISOString() };
  if (typeof value?.toDate === "function" && Number.isFinite(value.seconds)) {
    return { type: "timestamp", value: value.toDate().toISOString() };
  }
  if (typeof value?.toBase64 === "function") {
    return { type: "bytes", value: value.toBase64() };
  }
  if (typeof value?.path === "string" && value.firestore) {
    return { type: "reference", value: value.path };
  }
  if (Number.isFinite(value?.latitude) && Number.isFinite(value?.longitude)) {
    return { type: "geopoint", latitude: value.latitude, longitude: value.longitude };
  }
  if (Array.isArray(value)) return value.map(serializeFirestoreValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serializeFirestoreValue(item)]),
    );
  }
  return value;
}

async function readCollection(db, collectionName) {
  const snapshot = await db.collection(collectionName).get();
  return snapshot.docs.map((document) => ({
    documentId: document.id,
    data: serializeFirestoreValue(document.data()),
  }));
}

async function listAuthUsers(auth) {
  const users = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(
      ...page.users.map((user) => ({
        uid: user.uid,
        email: user.email ?? null,
        disabled: user.disabled,
      })),
    );
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

async function getGoogleAccessToken() {
  if (cachedGoogleToken && cachedGoogleToken.expiresAt > Date.now() + 60_000) {
    return cachedGoogleToken.value;
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
  });
  if (!response.ok) throw new Error(`Google OAuth respondió HTTP ${response.status}`);
  const payload = await response.json();
  if (!payload.access_token) throw new Error("Google OAuth no devolvió access token.");
  cachedGoogleToken = {
    value: payload.access_token,
    expiresAt: Date.now() + Math.max(60, payload.expires_in ?? 3600) * 1000,
  };
  return cachedGoogleToken.value;
}

async function driveFetch(url, init = {}) {
  const token = await getGoogleAccessToken();
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
}

async function readDriveState() {
  const folderId = requiredEnvironmentVariable("GOOGLE_DRIVE_FOLDER_ID");
  const metadataResponse = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType,trashed,parents`,
  );
  if (!metadataResponse.ok) {
    throw new Error(`No se pudo consultar la carpeta Drive: HTTP ${metadataResponse.status}`);
  }
  const folder = await metadataResponse.json();
  if (folder.mimeType !== "application/vnd.google-apps.folder" || folder.trashed) {
    throw new Error("GOOGLE_DRIVE_FOLDER_ID no apunta a una carpeta activa.");
  }

  const permissionsResponse = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}/permissions?fields=permissions(id,type,role)`,
  );
  if (!permissionsResponse.ok) {
    throw new Error(`No se pudieron auditar permisos Drive: HTTP ${permissionsResponse.status}`);
  }
  const permissionPayload = await permissionsResponse.json();
  const permissions = permissionPayload.permissions ?? [];

  const files = [];
  let pageToken = "";
  do {
    const query = `'${folderId.replace(/'/g, "\\'")}' in parents and trashed=false`;
    const parameters = new URLSearchParams({
      q: query,
      spaces: "drive",
      pageSize: "1000",
      fields: "nextPageToken,files(id,name,mimeType,size,parents,appProperties,trashed)",
    });
    if (pageToken) parameters.set("pageToken", pageToken);
    const response = await driveFetch(
      `https://www.googleapis.com/drive/v3/files?${parameters.toString()}`,
    );
    if (!response.ok) {
      throw new Error(`No se pudieron listar archivos Drive: HTTP ${response.status}`);
    }
    const payload = await response.json();
    files.push(...(payload.files ?? []));
    pageToken = payload.nextPageToken ?? "";
  } while (pageToken);

  return {
    folder,
    files,
    permissions,
    isPrivate: !permissions.some((permission) => permission.type === "anyone"),
  };
}

function collectionCounts(collections) {
  return Object.fromEntries(
    Object.entries(collections).map(([name, documents]) => [name, documents.length]),
  );
}

async function collectState() {
  const app = getAdminApp();
  const db = getFirestore(app);
  const auth = getAuth(app);
  const rootCollections = (await db.listCollections())
    .map((collection) => collection.id)
    .sort();
  const names = [...new Set([...rootCollections, ...KNOWN_COLLECTIONS])].sort();
  const collections = {};
  for (const name of names) collections[name] = await readCollection(db, name);
  const authUsers = await listAuthUsers(auth);
  const drive = await readDriveState();
  const unknownCollections = rootCollections.filter((name) => !KNOWN_COLLECTIONS.has(name));
  return {
    projectId: EXPECTED_PROJECT_ID,
    rootCollections,
    unknownCollections,
    collections,
    authUsers,
    drive,
  };
}

function publicSummary(state) {
  const operationalCounters = state.collections.system_counters.filter((document) =>
    OPERATIONAL_COUNTER_IDS.includes(document.documentId),
  ).length;
  return {
    projectId: state.projectId,
    counts: collectionCounts(state.collections),
    operationalCounters,
    authUsers: state.authUsers.length,
    driveFiles: state.drive.files.length,
    drivePrivate: state.drive.isPrivate,
    unknownCollections: state.unknownCollections,
  };
}

function writeBackup(backupDirectory, state) {
  fs.mkdirSync(backupDirectory, { recursive: true });
  for (const [collectionName, documents] of Object.entries(state.collections)) {
    fs.writeFileSync(
      path.join(backupDirectory, `${collectionName}.json`),
      JSON.stringify({ collection: collectionName, documents }, null, 2),
      "utf8",
    );
  }
  fs.writeFileSync(
    path.join(backupDirectory, "auth-users.json"),
    JSON.stringify({ users: state.authUsers }, null, 2),
    "utf8",
  );
  fs.writeFileSync(
    path.join(backupDirectory, "drive-files.json"),
    JSON.stringify({
      folder: state.drive.folder,
      files: state.drive.files,
      permissions: state.drive.permissions,
    }, null, 2),
    "utf8",
  );
  fs.writeFileSync(
    path.join(backupDirectory, "manifest.json"),
    JSON.stringify({
      projectId: EXPECTED_PROJECT_ID,
      createdAt: new Date().toISOString(),
      rootCollections: state.rootCollections,
      counts: collectionCounts(state.collections),
    }, null, 2),
    "utf8",
  );
  const manifestPath = path.join(backupDirectory, "manifest.json");
  if (!fs.existsSync(manifestPath) || fs.statSync(manifestPath).size === 0) {
    throw new Error("El backup no pudo verificarse; se aborta antes de borrar.");
  }
}

async function deleteDocuments(db, collectionName, documentIds) {
  for (let offset = 0; offset < documentIds.length; offset += 400) {
    const batch = db.batch();
    for (const documentId of documentIds.slice(offset, offset + 400)) {
      batch.delete(db.collection(collectionName).doc(documentId));
    }
    await batch.commit();
  }
}

async function assertCollectionsUnchanged(db, beforeState) {
  for (const collectionName of OPERATIONAL_COLLECTIONS) {
    const currentIds = (await readCollection(db, collectionName))
      .map((document) => document.documentId)
      .sort();
    const backedUpIds = beforeState.collections[collectionName]
      .map((document) => document.documentId)
      .sort();
    if (JSON.stringify(currentIds) !== JSON.stringify(backedUpIds)) {
      throw new Error(`La colección ${collectionName} cambió después del backup; se aborta.`);
    }
  }
}

async function executeReset(backupDirectory) {
  if (!backupDirectory) throw new Error("Se requiere la ruta de backup.");
  const before = await collectState();
  const populatedUnknownCollections = before.unknownCollections.filter(
    (name) => before.collections[name]?.length > 0,
  );
  if (populatedUnknownCollections.length > 0) {
    throw new Error(
      `Hay colecciones no reconocidas con datos: ${populatedUnknownCollections.join(", ")}. Actualiza la lista segura antes de borrar.`,
    );
  }
  if (!before.drive.isPrivate) {
    throw new Error("La carpeta Drive tiene acceso público; se aborta antes del borrado.");
  }

  writeBackup(backupDirectory, before);
  const db = getFirestore(getAdminApp());
  await assertCollectionsUnchanged(db, before);

  const saleIds = new Set(before.collections.sales.map((document) => document.documentId));
  const uploadIds = new Set(
    before.collections.payment_proof_uploads.map((document) => document.documentId),
  );
  const attachmentIds = new Set(
    before.collections.sale_payment_proofs
      .map((document) => document.data?.attachment?.fileId)
      .filter(Boolean),
  );
  const driveTargets = before.drive.files.filter(
    (file) =>
      attachmentIds.has(file.id)
      || saleIds.has(file.appProperties?.saleId)
      || uploadIds.has(file.appProperties?.uploadId),
  );

  for (const file of driveTargets) {
    const response = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}`,
      { method: "DELETE" },
    );
    if (!response.ok && response.status !== 404) {
      throw new Error(`No se pudo eliminar un comprobante Drive: HTTP ${response.status}`);
    }
  }

  for (const collectionName of DELETE_ORDER) {
    const ids = before.collections[collectionName].map((document) => document.documentId);
    await deleteDocuments(db, collectionName, ids);
  }
  const counterIds = before.collections.system_counters
    .map((document) => document.documentId)
    .filter((documentId) => OPERATIONAL_COUNTER_IDS.includes(documentId));
  await deleteDocuments(db, "system_counters", counterIds);

  const after = await collectState();
  const nonEmptyOperational = OPERATIONAL_COLLECTIONS.filter(
    (name) => after.collections[name].length > 0,
  );
  const remainingOperationalCounters = after.collections.system_counters.filter((document) =>
    OPERATIONAL_COUNTER_IDS.includes(document.documentId),
  );
  if (nonEmptyOperational.length > 0 || remainingOperationalCounters.length > 0) {
    throw new Error("La verificación posterior encontró datos operativos restantes.");
  }
  if (after.collections.users.length !== before.collections.users.length) {
    throw new Error("Cambió el número de perfiles users; la verificación falló.");
  }
  if (after.authUsers.length !== before.authUsers.length) {
    throw new Error("Cambió el número de usuarios Auth; la verificación falló.");
  }
  if (!after.drive.isPrivate) {
    throw new Error("La carpeta Drive dejó de ser privada; la verificación falló.");
  }

  return {
    backupDirectory,
    before: publicSummary(before),
    after: publicSummary(after),
    deletedDriveFiles: driveTargets.length,
    resetCounters: counterIds.sort(),
  };
}

async function main() {
  const [mode, backupDirectory] = process.argv.slice(2);
  if (mode === "audit") {
    process.stdout.write(JSON.stringify(publicSummary(await collectState())));
    return;
  }
  if (mode === "execute") {
    process.stdout.write(JSON.stringify(await executeReset(backupDirectory)));
    return;
  }
  throw new Error("Modo inválido. Usa audit o execute.");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
