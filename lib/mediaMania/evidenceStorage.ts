import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const MEDIA_MANIA_DURABLE_SCHEMA_VERSION = "media_mania_durable_event_v1";
const EVIDENCE_PREFIX = "media-mania/evidence/v1";

export type MediaManiaEvidenceEvent = Record<string, unknown> & {
  schemaVersion: "media_mania_event_v2";
  gameId: "media_mania";
  gameVersion: 1;
  eventId: string;
  eventSequence: number;
  action: string;
  playerId: string;
  sessionId: string;
  libraryId: string;
  timestamp: string;
  evidenceTrust?: "anonymous_client_observation";
};

type EncryptedEvidenceEnvelope = {
  schemaVersion: typeof MEDIA_MANIA_DURABLE_SCHEMA_VERSION;
  keyId: string;
  eventHash: string;
  iv: string;
  authTag: string;
  ciphertext: string;
};

export interface MediaManiaEvidenceStore {
  read(pathname: string): Promise<unknown | null>;
  put(pathname: string, value: unknown): Promise<void>;
  list(prefix: string, maxRecords?: number): Promise<string[]>;
}

const ACTIONS = new Set([
  "session_started",
  "session_continued",
  "session_exited",
  "starting_source_selected",
  "age_band_changed",
  "round_presented",
  "round_completed",
  "candidate_marked_unknown",
  "basis_marked_unknown",
  "source_unlock_offered",
  "source_unlock_selected",
  "source_unlock_declined",
  "round_choice_undone",
]);

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function scope(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

function evidenceSecrets(): string[] {
  const current = String(process.env.MEDIA_MANIA_EVIDENCE_SECRET || process.env.ADMIN_SESSION_SECRET || process.env.BLOB_READ_WRITE_TOKEN || "");
  const previous = String(process.env.MEDIA_MANIA_EVIDENCE_PREVIOUS_SECRETS || "").split(",");
  const values = [current, ...previous]
    .map((value) => value.replace(/\r?\n/g, "").trim())
    .filter(Boolean);
  if (!values.length) throw new Error("media_mania_durable_storage_unavailable");
  return [...new Set(values)];
}

function encryptionKey(secret: string): Buffer {
  return createHash("sha256").update(`novelideas:media-mania:v1:${secret}`).digest();
}

function keyId(secret: string): string {
  return sha256(`novelideas:media-mania:key:${secret}`).slice(0, 16);
}

function encryptEvent(event: MediaManiaEvidenceEvent): EncryptedEvidenceEnvelope {
  const secret = evidenceSecrets()[0];
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const plaintext = stableStringify(event);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    schemaVersion: MEDIA_MANIA_DURABLE_SCHEMA_VERSION,
    keyId: keyId(secret),
    eventHash: sha256(plaintext),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function decryptEvent(value: unknown): MediaManiaEvidenceEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const envelope = value as EncryptedEvidenceEnvelope;
  if (
    envelope.schemaVersion !== MEDIA_MANIA_DURABLE_SCHEMA_VERSION ||
    typeof envelope.keyId !== "string" ||
    typeof envelope.eventHash !== "string" ||
    typeof envelope.iv !== "string" ||
    typeof envelope.authTag !== "string" ||
    typeof envelope.ciphertext !== "string"
  ) return null;
  try {
    const secret = evidenceSecrets().find((candidate) => keyId(candidate) === envelope.keyId);
    if (!secret) throw new Error("media_mania_evidence_key_unavailable");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), Buffer.from(envelope.iv, "base64"));
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
    if (sha256(plaintext) !== envelope.eventHash) return null;
    return JSON.parse(plaintext) as MediaManiaEvidenceEvent;
  } catch {
    return null;
  }
}

function eventPath(event: MediaManiaEvidenceEvent): string {
  const sequence = String(event.eventSequence).padStart(8, "0");
  const normalizedLibrary = scope(event.libraryId);
  const libraryScope = `${normalizedLibrary}-${sha256(normalizedLibrary).slice(0, 12)}`;
  const sessionScope = `${scope(event.sessionId)}-${sha256(event.sessionId).slice(0, 12)}`;
  return `${EVIDENCE_PREFIX}/libraries/${libraryScope}/sessions/${sessionScope}/${sequence}.json`;
}

function containsDirectIdentifier(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsDirectIdentifier);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => {
    const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, "");
    return [
      "email",
      "emailaddress",
      "studentid",
      "studentnumber",
      "ip",
      "ipaddress",
      "firstname",
      "lastname",
      "fullname",
    ].includes(normalizedKey) || containsDirectIdentifier(child);
  });
}

function isSnapshot(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" &&
    item.id.length > 0 &&
    item.id.length <= 200 &&
    typeof item.title === "string" &&
    item.title.length <= 500 &&
    typeof item.source === "string" &&
    item.source.length <= 200 &&
    typeof item.mediaSource === "string" &&
    item.mediaSource.length <= 40;
}

function hasRoundEvidence(event: MediaManiaEvidenceEvent): boolean {
  return typeof event.roundId === "string" &&
    Number.isInteger(event.roundNumber) &&
    (event.roundType === "LIKE" || event.roundType === "DISLIKE") &&
    Array.isArray(event.candidates) &&
    event.candidates.length === 3 &&
    event.candidates.every(isSnapshot) &&
    Array.isArray(event.presentationOrder) &&
    event.presentationOrder.length === 3 &&
    event.presentationOrder.every((id) => typeof id === "string") &&
    Array.isArray(event.activeMediaSources) &&
    typeof event.activeAgeBand === "string";
}

function hasActionEvidence(event: MediaManiaEvidenceEvent): boolean {
  switch (event.action) {
    case "round_presented":
      return hasRoundEvidence(event);
    case "round_completed":
      return hasRoundEvidence(event) &&
        isSnapshot(event.selectedItem) &&
        typeof event.tasteScoreBefore === "number" &&
        typeof event.tasteScoreAfter === "number" &&
        typeof event.scoreDelta === "number";
    case "candidate_marked_unknown":
      return hasRoundEvidence(event) &&
        typeof event.replacedCandidateId === "string" &&
        isSnapshot(event.replacementItem) &&
        event.scoreDelta === 0;
    case "basis_marked_unknown":
      return hasRoundEvidence(event) &&
        Boolean(event.replacementRound) &&
        event.scoreDelta === 0;
    case "source_unlock_offered":
      return Array.isArray(event.offeredMediaSources) && event.scoreDelta === 0;
    case "source_unlock_selected":
      return Array.isArray(event.offeredMediaSources) &&
        typeof event.selectedMediaSource === "string" &&
        event.scoreDelta === 0;
    case "source_unlock_declined":
      return Array.isArray(event.offeredMediaSources) &&
        event.selectedMediaSource === null &&
        event.scoreDelta === 0;
    case "round_choice_undone":
      return typeof event.reversedEventId === "string" &&
        typeof event.scoreDelta === "number" &&
        typeof event.tasteScoreBefore === "number" &&
        typeof event.tasteScoreAfter === "number";
    case "starting_source_selected":
      return typeof event.selectedMediaSource === "string" && event.scoreDelta === 0;
    case "age_band_changed":
      return typeof event.previousAgeBand === "string" &&
        typeof event.selectedAgeBand === "string" &&
        event.scoreDelta === 0;
    default:
      return event.scoreDelta === 0;
  }
}

export function validateMediaManiaEvidenceEvent(
  value: unknown,
  expectedLibraryId: string,
): MediaManiaEvidenceEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const event = value as MediaManiaEvidenceEvent;
  const serialized = JSON.stringify(event);
  if (
    serialized.length > 64_000 ||
    event.schemaVersion !== "media_mania_event_v2" ||
    event.gameId !== "media_mania" ||
    event.gameVersion !== 1 ||
    !ACTIONS.has(event.action) ||
    !event.eventId ||
    event.eventId.length > 200 ||
    event.eventId !== `${event.sessionId}:event:${event.eventSequence}` ||
    !event.playerId ||
    event.playerId.length > 160 ||
    !/^(?:patron-[a-z0-9-]{8,}|media-mania-player)$/i.test(event.playerId) ||
    !event.sessionId ||
    event.sessionId.length > 160 ||
    !/^mm-[a-z0-9-]{8,}$/i.test(event.sessionId) ||
    !event.libraryId ||
    event.libraryId.length > 160 ||
    scope(event.libraryId) !== scope(expectedLibraryId) ||
    !Number.isInteger(event.eventSequence) ||
    event.eventSequence < 1 ||
    !Number.isFinite(Date.parse(event.timestamp)) ||
    !scope(event.playerId) ||
    !scope(event.sessionId) ||
    !scope(event.libraryId) ||
    containsDirectIdentifier(event) ||
    !hasActionEvidence(event)
  ) return null;
  return event;
}

async function readBlobBody(value: unknown): Promise<string | null> {
  if (!value || typeof value !== "object") return null;
  const body = (value as { stream?: BodyInit; body?: BodyInit }).stream || (value as { body?: BodyInit }).body;
  return body ? new Response(body).text() : null;
}

export function createMediaManiaBlobStore(): MediaManiaEvidenceStore {
  const token = String(process.env.BLOB_READ_WRITE_TOKEN || "").replace(/\r?\n/g, "").trim();
  if (!token) throw new Error("media_mania_durable_storage_unavailable");
  return {
    async read(pathname) {
      const { get } = await import("@vercel/blob");
      for (const access of ["public", "private"] as const) {
        try {
          const result = await get(pathname, { access, token });
          if (!result) continue;
          const text = await readBlobBody(result);
          return text ? JSON.parse(text) : null;
        } catch {
          continue;
        }
      }
      return null;
    },
    async put(pathname, value) {
      const { put } = await import("@vercel/blob");
      let firstError: unknown;
      for (const access of ["public", "private"] as const) {
        try {
          await put(pathname, JSON.stringify(value), {
            access,
            addRandomSuffix: false,
            contentType: "application/json",
            token,
          });
          return;
        } catch (error) {
          firstError = firstError || error;
        }
      }
      throw firstError || new Error("media_mania_blob_write_failed");
    },
    async list(prefix, maxRecords = Number.MAX_SAFE_INTEGER) {
      const { list } = await import("@vercel/blob");
      const paths: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await list({ prefix, limit: Math.min(1000, maxRecords - paths.length), cursor, token });
        paths.push(...page.blobs.map((blob) => blob.pathname).slice(0, maxRecords - paths.length));
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor && paths.length < maxRecords);
      return paths;
    },
  };
}

/** Owner analysis only: decrypts bounded records without exposing envelopes to the client. A single
 * corrupt or undecryptable record is counted as malformed rather than failing the whole read, and
 * hitting `maxRecords` is reported as `truncated` so callers never imply complete coverage. */
export async function listMediaManiaEvidenceForAnalysis(
  maxRecords: number,
  store: MediaManiaEvidenceStore = createMediaManiaBlobStore(),
): Promise<{ events: MediaManiaEvidenceEvent[]; malformedRecords: number; truncated: boolean }> {
  const paths = await store.list(`${EVIDENCE_PREFIX}/`, maxRecords);
  const events: MediaManiaEvidenceEvent[] = [];
  let malformedRecords = 0;
  for (const pathname of paths) {
    const raw = await store.read(pathname).catch(() => null);
    const event = raw ? decryptEvent(raw) : null;
    if (!event) { malformedRecords += 1; continue; }
    events.push(event);
  }
  return {
    events: events.sort((left, right) => left.timestamp.localeCompare(right.timestamp) || left.eventId.localeCompare(right.eventId)),
    malformedRecords,
    truncated: maxRecords > 0 && paths.length >= maxRecords,
  };
}

export async function appendMediaManiaEvidence(
  libraryId: string,
  values: unknown[],
  store: MediaManiaEvidenceStore = createMediaManiaBlobStore(),
): Promise<{ accepted: number; duplicates: number }> {
  let accepted = 0;
  let duplicates = 0;
  for (const value of values) {
    const event = validateMediaManiaEvidenceEvent(value, libraryId);
    if (!event) throw new Error("invalid_media_mania_event");
    const durableEvent: MediaManiaEvidenceEvent = {
      ...event,
      evidenceTrust: "anonymous_client_observation",
    };
    const pathname = eventPath(durableEvent);
    const existingRaw = await store.read(pathname);
    const existing = decryptEvent(existingRaw);
    if (existingRaw && !existing) throw new Error("media_mania_evidence_decryption_failed");
    if (existing) {
      if (stableStringify(existing) !== stableStringify(durableEvent)) {
        throw new Error("media_mania_event_identity_conflict");
      }
      duplicates += 1;
      continue;
    }
    const encrypted = encryptEvent(durableEvent);
    try {
      await store.put(pathname, encrypted);
      accepted += 1;
    } catch (error) {
      const racedRaw = await store.read(pathname);
      const raced = decryptEvent(racedRaw);
      if (racedRaw && !raced) throw new Error("media_mania_evidence_decryption_failed");
      if (raced && stableStringify(raced) === stableStringify(durableEvent)) {
        duplicates += 1;
        continue;
      }
      throw error;
    }
  }
  return { accepted, duplicates };
}

export async function listMediaManiaEvidence(
  libraryId: string,
  sessionId?: string,
  store: MediaManiaEvidenceStore = createMediaManiaBlobStore(),
): Promise<MediaManiaEvidenceEvent[]> {
  const normalizedLibrary = scope(libraryId);
  const libraryScope = `${normalizedLibrary}-${sha256(normalizedLibrary).slice(0, 12)}`;
  const sessionScope = sessionId ? `${scope(sessionId)}-${sha256(sessionId).slice(0, 12)}` : "";
  const prefix = `${EVIDENCE_PREFIX}/libraries/${libraryScope}/sessions/${sessionScope ? `${sessionScope}/` : ""}`;
  const paths = await store.list(prefix);
  const events: MediaManiaEvidenceEvent[] = [];
  for (const pathname of paths) {
    const raw = await store.read(pathname);
    if (!raw) throw new Error("media_mania_evidence_read_failed");
    const event = decryptEvent(raw);
    if (raw && !event) throw new Error("media_mania_evidence_decryption_failed");
    if (event && scope(event.libraryId) === normalizedLibrary) events.push(event);
  }
  return events.sort((left, right) =>
    left.sessionId.localeCompare(right.sessionId) || left.eventSequence - right.eventSequence
  );
}
