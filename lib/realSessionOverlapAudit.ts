import { canonicalLibraryId } from "./libraryIdMigration.js";

export type RealSessionRecommendation = {
  id: string;
  title: string;
  source: string;
};

export type RealSessionReviewSwipeItem = {
  id: string;
  title: string;
  mediaType: string;
  imageUrl?: string;
  action: "like" | "dislike" | "skip";
};

export type RealSessionReviewRecommendation = {
  id: string;
  title: string;
  author: string;
  source: string;
  coverUrl?: string;
  matchedSignals: string[];
};

export type RealSessionReviewEvidence = {
  schemaVersion: "anonymous_review_evidence_v1";
  swipeEvidence: RealSessionReviewSwipeItem[];
  recommendationSlate: RealSessionReviewRecommendation[];
};

export type RealSessionTasteSignal = {
  value: string;
  weight: number;
};

export type RealSessionSearchIntent = {
  query: string;
  facets: string[];
  priority: number;
  rationale: string[];
};

export type RealSessionSearchPlan = {
  intents: RealSessionSearchIntent[];
  sourcePlans: Array<{
    source: string;
    enabled: boolean;
    status: string;
    intents: RealSessionSearchIntent[];
    skippedReason?: string;
  }>;
};

export type RealSessionOverlap = {
  auditId: string;
  patronHash: string;
  overlapCount: number;
  overlapPercent: number;
};

export type RealSessionAuditEvent = {
  auditId: string;
  libraryId: string;
  libraryScope: "default" | "hosted";
  patronHash: string;
  ageBand: string;
  likes: number;
  dislikes: number;
  skips: number;
  dominantTaste: {
    genreFamily: RealSessionTasteSignal[];
    tone: RealSessionTasteSignal[];
    themes: RealSessionTasteSignal[];
    avoidSignals: RealSessionTasteSignal[];
  };
  localQueries: string[];
  searchPlan: RealSessionSearchPlan;
  finalRecommendations: RealSessionRecommendation[];
  reviewEvidence?: RealSessionReviewEvidence;
};

export type RealSessionAuditRow = RealSessionAuditEvent & {
  recentOverlaps: RealSessionOverlap[];
  createdAt: string;
};

export type RealSessionAuditBlobMetadata = {
  pathname: string;
  uploadedAt: string;
};

export interface RealSessionAuditBlobStore {
  putJson(pathname: string, value: unknown): Promise<RealSessionAuditBlobMetadata>;
  list(prefix: string): Promise<RealSessionAuditBlobMetadata[]>;
  readJson(pathname: string): Promise<unknown | null>;
  delete(pathnames: string[]): Promise<void>;
}

const AUDIT_BLOB_PREFIX = "human-review/real-session-audits/v2/";
export const REAL_SESSION_AUDIT_RETENTION_LIMIT = 500;
const DASHBOARD_READ_LIMIT = 200;
const STORAGE_LOG_LIMIT = 5;
const STORAGE_LOG_WINDOW_MS = 60_000;

let storageLogWindowStartedAt = 0;
let storageLogCount = 0;

function cleanText(value: unknown, maxLength: number): string {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanCount(value: unknown): number {
  const count = Number(value);
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.min(500, Math.floor(count)));
}

function cleanSignals(value: unknown): RealSessionTasteSignal[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).map((signal) => ({
    value: cleanText((signal as any)?.value, 100),
    weight: Math.max(-100, Math.min(100, Number((signal as any)?.weight) || 0)),
  })).filter((signal) => signal.value);
}

function cleanSearchIntents(value: unknown): RealSessionSearchIntent[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).map((intent) => ({
    query: cleanText((intent as any)?.query, 300),
    facets: Array.isArray((intent as any)?.facets)
      ? (intent as any).facets.slice(0, 12).map((facet: unknown) => cleanText(facet, 100)).filter(Boolean)
      : [],
    priority: Math.max(-100, Math.min(100, Number((intent as any)?.priority) || 0)),
    rationale: Array.isArray((intent as any)?.rationale)
      ? (intent as any).rationale.slice(0, 12).map((reason: unknown) => cleanText(reason, 160)).filter(Boolean)
      : [],
  })).filter((intent) => intent.query);
}

function cleanSearchPlan(value: unknown): RealSessionSearchPlan {
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
  return {
    intents: cleanSearchIntents(input.intents),
    sourcePlans: Array.isArray(input.sourcePlans)
      ? input.sourcePlans.slice(0, 12).map((plan: any) => ({
          source: cleanText(plan?.source, 60),
          enabled: plan?.enabled === true,
          status: cleanText(plan?.status, 60),
          intents: cleanSearchIntents(plan?.intents),
          ...(cleanText(plan?.skippedReason, 160) ? { skippedReason: cleanText(plan?.skippedReason, 160) } : {}),
        })).filter((plan: any) => plan.source)
      : [],
  };
}

function cleanRecommendations(value: unknown): RealSessionRecommendation[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.slice(0, 10).map((item) => ({
    id: cleanText((item as any)?.id, 300),
    title: cleanText((item as any)?.title, 300),
    source: cleanText((item as any)?.source, 60) || "unknown",
  })).filter((item) => {
    if (!item.id || !item.title || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function cleanUrl(value: unknown): string | undefined {
  const url = cleanText(value, 1000);
  if (!/^https:\/\//i.test(url)) return undefined;
  return url;
}

function cleanReviewEvidence(value: unknown): RealSessionReviewEvidence | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, any>;
  if (input.schemaVersion !== "anonymous_review_evidence_v1") return undefined;

  const swipeEvidence = Array.isArray(input.swipeEvidence)
    ? input.swipeEvidence.slice(0, 200).map((item: any) => {
        const action = cleanText(item?.action, 20).toLowerCase();
        return {
          id: cleanText(item?.id, 200),
          title: cleanText(item?.title, 300),
          mediaType: cleanText(item?.mediaType, 60) || "unknown",
          ...(cleanUrl(item?.imageUrl) ? { imageUrl: cleanUrl(item.imageUrl) } : {}),
          action,
        };
      }).filter((item: any): item is RealSessionReviewSwipeItem => (
        Boolean(item.id && item.title) && ["like", "dislike", "skip"].includes(item.action)
      ))
    : [];
  const recommendationSlate = Array.isArray(input.recommendationSlate)
    ? input.recommendationSlate.slice(0, 10).map((item: any) => ({
        id: cleanText(item?.id, 300),
        title: cleanText(item?.title, 300),
        author: cleanText(item?.author, 300) || "Unknown author",
        source: cleanText(item?.source, 60) || "unknown",
        ...(cleanUrl(item?.coverUrl) ? { coverUrl: cleanUrl(item.coverUrl) } : {}),
        matchedSignals: Array.isArray(item?.matchedSignals)
          ? item.matchedSignals.slice(0, 12).map((signal: unknown) => cleanText(signal, 100)).filter(Boolean)
          : [],
      })).filter((item: RealSessionReviewRecommendation) => item.id && item.title)
    : [];
  if (!swipeEvidence.length || !recommendationSlate.length) return undefined;
  return { schemaVersion: "anonymous_review_evidence_v1", swipeEvidence, recommendationSlate };
}

function safePathSegment(value: string): string {
  return value.toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100) || "unknown";
}

function readBlobReadWriteToken(): string {
  const raw = String(process.env.BLOB_READ_WRITE_TOKEN || "").replace(/\r?\n/g, "").trim();
  if (!raw) return "";
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1).trim();
  }

  return raw;
}

export function realSessionAuditBlobStorageConfigured(): boolean {
  return Boolean(readBlobReadWriteToken());
}

function safeStorageErrorCode(error: unknown): string {
  const code = cleanText((error as any)?.code, 80);
  if (code) return code.replace(/[^a-z0-9_-]/gi, "_");
  const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
  if (message.includes("token")) return "blob_token_error";
  if (message.includes("network") || message.includes("fetch")) return "blob_network_error";
  return "real_session_audit_storage_error";
}

export function logRealSessionAuditStorageFailure(stage: string, error: unknown): void {
  const now = Date.now();
  if (now - storageLogWindowStartedAt >= STORAGE_LOG_WINDOW_MS) {
    storageLogWindowStartedAt = now;
    storageLogCount = 0;
  }
  if (storageLogCount >= STORAGE_LOG_LIMIT) return;
  storageLogCount += 1;
  console.error("[real-session-audit][storage-failure]", {
    stage: cleanText(stage, 60),
    code: safeStorageErrorCode(error),
    occurrence: storageLogCount,
    windowMs: STORAGE_LOG_WINDOW_MS,
  });
}

async function readBlobText(result: unknown): Promise<string | null> {
  if (!result || typeof result !== "object") return null;
  const body = (result as any).stream ?? (result as any).body;
  if (!body) return null;
  try {
    return await new Response(body as BodyInit).text();
  } catch {
    return null;
  }
}

export function createVercelBlobRealSessionAuditStore(): RealSessionAuditBlobStore {
  const token = readBlobReadWriteToken();
  if (!token) throw new Error("real_session_audit_blob_unavailable");

  return {
    async putJson(pathname, value) {
      const { put } = await import("@vercel/blob");
      const blob = await put(pathname, JSON.stringify(value), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
        token,
      });
      return { pathname: blob.pathname, uploadedAt: new Date().toISOString() };
    },
    async list(prefix) {
      const { list } = await import("@vercel/blob");
      const blobs: RealSessionAuditBlobMetadata[] = [];
      let cursor: string | undefined;
      do {
        const page = await list({ prefix, limit: 1000, cursor, token });
        blobs.push(...page.blobs.map((blob) => ({
          pathname: blob.pathname,
          uploadedAt: new Date(blob.uploadedAt).toISOString(),
        })));
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return blobs;
    },
    async readJson(pathname) {
      const { get } = await import("@vercel/blob");
      const result = await get(pathname, { access: "private", token });
      if (!result) return null;
      const text = await readBlobText(result);
      if (text == null) throw new Error("real_session_audit_blob_read_failed");
      return JSON.parse(text);
    },
    async delete(pathnames) {
      if (!pathnames.length) return;
      const { del } = await import("@vercel/blob");
      await del(pathnames, { token });
    },
  };
}

export function parseRealSessionAuditEvent(value: unknown): RealSessionAuditEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_real_session_audit_event");
  }
  const input = value as Record<string, any>;
  const auditId = cleanText(input.auditId, 100);
  const rawLibraryId = canonicalLibraryId(cleanText(input.libraryId, 100).toLowerCase());
  const requestedScope = cleanText(input.libraryScope, 20).toLowerCase();
  const libraryScope = requestedScope === "hosted" || (rawLibraryId && rawLibraryId !== "default")
    ? "hosted"
    : "default";
  const libraryId = libraryScope === "default" ? "default" : rawLibraryId;
  const patronHash = cleanText(input.patronHash, 16).toLowerCase();
  const ageBand = cleanText(input.ageBand, 30).toLowerCase();
  const localQueries = Array.isArray(input.localQueries)
    ? input.localQueries.slice(0, 12).map((query: unknown) => cleanText(query, 300)).filter(Boolean)
    : [];
  const finalRecommendations = cleanRecommendations(input.finalRecommendations);

  if (!/^[a-z0-9-]{8,100}$/i.test(auditId)) throw new Error("invalid_real_session_audit_id");
  if (libraryScope === "hosted" && !/^[a-z0-9_-]{1,100}$/.test(libraryId)) {
    throw new Error("invalid_real_session_library");
  }
  if (!/^[0-9a-f]{8}$/.test(patronHash)) throw new Error("invalid_real_session_patron_hash");
  if (!["kids", "preteens", "teens", "adult"].includes(ageBand)) throw new Error("invalid_real_session_age_band");
  if (!finalRecommendations.length) throw new Error("missing_real_session_recommendations");

  return {
    auditId,
    libraryId,
    libraryScope,
    patronHash,
    ageBand,
    likes: cleanCount(input.likes),
    dislikes: cleanCount(input.dislikes),
    skips: cleanCount(input.skips),
    dominantTaste: {
      genreFamily: cleanSignals(input.dominantTaste?.genreFamily),
      tone: cleanSignals(input.dominantTaste?.tone),
      themes: cleanSignals(input.dominantTaste?.themes),
      avoidSignals: cleanSignals(input.dominantTaste?.avoidSignals),
    },
    localQueries,
    searchPlan: cleanSearchPlan(input.searchPlan),
    finalRecommendations,
    ...(cleanReviewEvidence(input.reviewEvidence) ? { reviewEvidence: cleanReviewEvidence(input.reviewEvidence) } : {}),
  };
}

export function computeRecommendationOverlap(
  current: RealSessionRecommendation[],
  previous: RealSessionRecommendation[],
): Pick<RealSessionOverlap, "overlapCount" | "overlapPercent"> {
  const previousIds = new Set(previous.map((item) => item.id));
  const overlapCount = current.filter((item) => previousIds.has(item.id)).length;
  const denominator = Math.min(current.length, previous.length);
  return {
    overlapCount,
    overlapPercent: denominator > 0 ? Math.round((overlapCount / denominator) * 1000) / 10 : 0,
  };
}

function auditScopeBlobPrefix(event: RealSessionAuditEvent): string {
  return `${AUDIT_BLOB_PREFIX}${event.libraryScope}/${safePathSegment(event.libraryId)}/${safePathSegment(event.ageBand)}/`;
}

function auditBlobPathname(event: RealSessionAuditEvent): string {
  return `${auditScopeBlobPrefix(event)}${safePathSegment(event.auditId)}.json`;
}

function sortNewestFirst(rows: RealSessionAuditBlobMetadata[]): RealSessionAuditBlobMetadata[] {
  return [...rows].sort((left, right) => (
    Date.parse(right.uploadedAt) - Date.parse(left.uploadedAt)
    || right.pathname.localeCompare(left.pathname)
  ));
}

function parseStoredAuditRow(value: unknown): RealSessionAuditRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const input = value as Record<string, any>;
    const event = parseRealSessionAuditEvent(input);
    const createdAt = new Date(input.createdAt);
    const recentOverlaps = Array.isArray(input.recentOverlaps)
      ? input.recentOverlaps.slice(0, 5).map((overlap: any) => ({
          auditId: cleanText(overlap?.auditId, 100),
          patronHash: cleanText(overlap?.patronHash, 16).toLowerCase(),
          overlapCount: cleanCount(overlap?.overlapCount),
          overlapPercent: Math.max(0, Math.min(100, Number(overlap?.overlapPercent) || 0)),
        })).filter((overlap: RealSessionOverlap) => overlap.auditId && /^[0-9a-f]{8}$/.test(overlap.patronHash))
      : [];
    return {
      ...event,
      recentOverlaps,
      createdAt: Number.isFinite(createdAt.getTime()) ? createdAt.toISOString() : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

async function loadRecentRows(
  store: RealSessionAuditBlobStore,
  metadata: RealSessionAuditBlobMetadata[],
  limit: number,
  include: (row: RealSessionAuditRow) => boolean = () => true,
): Promise<RealSessionAuditRow[]> {
  const rows: RealSessionAuditRow[] = [];
  for (let offset = 0; offset < metadata.length && rows.length < limit; offset += 25) {
    const batch = metadata.slice(offset, offset + 25);
    const values = await Promise.allSettled(batch.map((blob) => store.readJson(blob.pathname)));
    for (const result of values) {
      if (result.status === "rejected") {
        logRealSessionAuditStorageFailure("read-record", result.reason);
        continue;
      }
      const value = result.value;
      const row = parseStoredAuditRow(value);
      if (row && include(row)) rows.push(row);
      if (rows.length >= limit) break;
    }
  }
  return rows.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export async function recordRealSessionAudit(
  event: RealSessionAuditEvent,
  store: RealSessionAuditBlobStore = createVercelBlobRealSessionAuditStore(),
): Promise<RealSessionAuditRow> {
  let recentOverlaps: RealSessionOverlap[] = [];
  try {
    const scopeMetadata = sortNewestFirst(await store.list(auditScopeBlobPrefix(event)));
    const recentRows = await loadRecentRows(
      store,
      scopeMetadata,
      5,
      (row) => row.patronHash !== event.patronHash,
    );
    recentOverlaps = recentRows.map((row) => ({
      auditId: row.auditId,
      patronHash: row.patronHash,
      ...computeRecommendationOverlap(event.finalRecommendations, row.finalRecommendations),
    }));
  } catch (error) {
    logRealSessionAuditStorageFailure("overlap-read", error);
  }
  const row: RealSessionAuditRow = {
    ...event,
    recentOverlaps,
    createdAt: new Date().toISOString(),
  };

  await store.putJson(auditBlobPathname(event), row);

  try {
    const metadataAfter = sortNewestFirst(await store.list(AUDIT_BLOB_PREFIX));
    const expired = metadataAfter.slice(REAL_SESSION_AUDIT_RETENTION_LIMIT).map((blob) => blob.pathname);
    await store.delete(expired);
  } catch (error) {
    logRealSessionAuditStorageFailure("retention", error);
  }
  return row;
}

export async function listRealSessionAudits(options: {
  limit?: number;
  store?: RealSessionAuditBlobStore;
} = {}): Promise<RealSessionAuditRow[]> {
  const store = options.store || createVercelBlobRealSessionAuditStore();
  const limit = Math.max(1, Math.min(REAL_SESSION_AUDIT_RETENTION_LIMIT, Number(options.limit) || DASHBOARD_READ_LIMIT));
  const metadata = sortNewestFirst(await store.list(AUDIT_BLOB_PREFIX));
  return loadRecentRows(store, metadata, limit);
}
