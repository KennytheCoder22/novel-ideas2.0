import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
type LibrarySharingStorageMode = "durable_postgres" | "local_filesystem";

type CoreModule = {
  stableStringify: (value: unknown) => string;
};

let cachedCore: CoreModule | null = null;
let ensureTablesPromise: Promise<void> | null = null;

async function loadCore(): Promise<CoreModule> {
  if (cachedCore) return cachedCore;
  const corePath = resolve(process.cwd(), "scripts", "human-review", "lib", "human-review-core.mjs");
  cachedCore = (await import(pathToFileURL(corePath).toString())) as unknown as CoreModule;
  return cachedCore;
}

function storageMode(): LibrarySharingStorageMode {
  if (process.env.LIBRARY_SHARING_STORAGE_MODE === "local_filesystem") return "local_filesystem";
  if (process.env.POSTGRES_URL) return "durable_postgres";
  return "local_filesystem";
}

function fileRoot(): string {
  return resolve(process.cwd(), "scripts", "output", "library-sharing");
}

function ensureDir(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function safeLibraryFileName(libraryId: string): string {
  return encodeURIComponent(String(libraryId || "").trim());
}

function writeJson(path: string, value: unknown): void {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function filePath(kind: "config" | "collection", libraryId: string): string {
  return resolve(fileRoot(), kind === "config" ? "configs" : "collections", `${safeLibraryFileName(libraryId)}.json`);
}

async function ensurePostgresTables(): Promise<void> {
  if (!process.env.POSTGRES_URL) return;
  if (!ensureTablesPromise) {
    ensureTablesPromise = (async () => {
      const { sql } = await import("@vercel/postgres");
      await sql`
        CREATE TABLE IF NOT EXISTS library_configs (
          library_id TEXT NOT NULL PRIMARY KEY,
          content_sha256 TEXT NOT NULL,
          payload_json JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS library_collections (
          library_id TEXT NOT NULL PRIMARY KEY,
          content_sha256 TEXT NOT NULL,
          payload_json JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
    })();
  }
  await ensureTablesPromise;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function savePostgresConfig(libraryId: string, payload: Record<string, unknown>): Promise<void> {
  await ensurePostgresTables();
  const { sql } = await import("@vercel/postgres");
  const core = await loadCore();
  const stableJson = core.stableStringify(payload);
  const contentSha256 = sha256(stableJson);
  await sql`
    INSERT INTO library_configs (library_id, content_sha256, payload_json, updated_at)
    VALUES (${libraryId}, ${contentSha256}, ${JSON.stringify(payload)}::jsonb, NOW())
    ON CONFLICT (library_id) DO UPDATE
      SET content_sha256 = EXCLUDED.content_sha256,
          payload_json = EXCLUDED.payload_json,
          updated_at = NOW()
  `;
}

async function loadPostgresConfig(libraryId: string): Promise<Record<string, unknown> | null> {
  await ensurePostgresTables();
  const { sql } = await import("@vercel/postgres");
  const result = await sql`
    SELECT payload_json FROM library_configs WHERE library_id = ${libraryId}
  `;
  const payload = result.rows[0]?.payload_json;
  if (!payload) return null;
  if (typeof payload === "string") return JSON.parse(payload) as Record<string, unknown>;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) return payload as Record<string, unknown>;
  return null;
}

async function savePostgresCollection(libraryId: string, payload: Record<string, unknown>): Promise<void> {
  await ensurePostgresTables();
  const { sql } = await import("@vercel/postgres");
  const core = await loadCore();
  const stableJson = core.stableStringify(payload);
  const contentSha256 = sha256(stableJson);
  await sql`
    INSERT INTO library_collections (library_id, content_sha256, payload_json, updated_at)
    VALUES (${libraryId}, ${contentSha256}, ${JSON.stringify(payload)}::jsonb, NOW())
    ON CONFLICT (library_id) DO UPDATE
      SET content_sha256 = EXCLUDED.content_sha256,
          payload_json = EXCLUDED.payload_json,
          updated_at = NOW()
  `;
}

async function loadPostgresCollection(libraryId: string): Promise<Record<string, unknown> | null> {
  await ensurePostgresTables();
  const { sql } = await import("@vercel/postgres");
  const result = await sql`
    SELECT payload_json FROM library_collections WHERE library_id = ${libraryId}
  `;
  const payload = result.rows[0]?.payload_json;
  if (!payload) return null;
  if (typeof payload === "string") return JSON.parse(payload) as Record<string, unknown>;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) return payload as Record<string, unknown>;
  return null;
}

async function saveFileAsset(kind: "config" | "collection", libraryId: string, payload: Record<string, unknown>): Promise<void> {
  const now = new Date().toISOString();
  writeJson(filePath(kind, libraryId), { libraryId, updatedAt: now, payload });
}

function loadFileAsset(kind: "config" | "collection", libraryId: string): Record<string, unknown> | null {
  const value = readJson<{ payload?: Record<string, unknown> }>(filePath(kind, libraryId));
  if (!value || !value.payload || typeof value.payload !== "object" || Array.isArray(value.payload)) return null;
  return value.payload;
}

export async function saveSharedLibraryConfig(libraryId: string, payload: Record<string, unknown>): Promise<void> {
  const id = String(libraryId || "").trim();
  if (!id) throw new Error("missing_library_id");
  if (storageMode() === "durable_postgres") {
    await savePostgresConfig(id, payload);
    return;
  }
  await saveFileAsset("config", id, payload);
}

export async function loadSharedLibraryConfigPayload(libraryId: string): Promise<Record<string, unknown> | null> {
  const id = String(libraryId || "").trim();
  if (!id) return null;
  const payload = storageMode() === "durable_postgres"
    ? await loadPostgresConfig(id)
    : loadFileAsset("config", id);
  return payload || null;
}

export async function saveSharedLibraryCollection(libraryId: string, payload: Record<string, unknown>): Promise<void> {
  const id = String(libraryId || "").trim();
  if (!id) throw new Error("missing_library_id");
  if (storageMode() === "durable_postgres") {
    await savePostgresCollection(id, payload);
    return;
  }
  await saveFileAsset("collection", id, payload);
}

export async function loadSharedLibraryCollectionPayload(libraryId: string): Promise<Record<string, unknown> | null> {
  const id = String(libraryId || "").trim();
  if (!id) return null;
  const payload = storageMode() === "durable_postgres"
    ? await loadPostgresCollection(id)
    : loadFileAsset("collection", id);
  return payload || null;
}
