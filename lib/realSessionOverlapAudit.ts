export type RealSessionRecommendation = {
  id: string;
  title: string;
};

export type RealSessionTasteSignal = {
  value: string;
  weight: number;
};

export type RealSessionOverlap = {
  auditId: string;
  patronHash: string;
  overlapCount: number;
  overlapPercent: number;
};

export type RealSessionAuditEvent = {
  auditId: string;
  libraryId: "y";
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
  finalRecommendations: RealSessionRecommendation[];
};

export type RealSessionAuditRow = RealSessionAuditEvent & {
  recentOverlaps: RealSessionOverlap[];
  createdAt: string;
};

type SqlClient = (strings: TemplateStringsArray, ...values: any[]) => Promise<{ rows: any[]; rowCount: number }>;

let sqlClient: SqlClient | null = null;
let schemaReady: Promise<void> | null = null;

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

function cleanRecommendations(value: unknown): RealSessionRecommendation[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.slice(0, 10).map((item) => ({
    id: cleanText((item as any)?.id, 300),
    title: cleanText((item as any)?.title, 300),
  })).filter((item) => {
    if (!item.id || !item.title || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function parseRealSessionAuditEvent(value: unknown): RealSessionAuditEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_real_session_audit_event");
  }
  const input = value as Record<string, any>;
  const auditId = cleanText(input.auditId, 100);
  const libraryId = cleanText(input.libraryId, 30).toLowerCase();
  const patronHash = cleanText(input.patronHash, 16).toLowerCase();
  const ageBand = cleanText(input.ageBand, 30).toLowerCase();
  const localQueries = Array.isArray(input.localQueries)
    ? input.localQueries.slice(0, 5).map((query: unknown) => cleanText(query, 300)).filter(Boolean)
    : [];
  const finalRecommendations = cleanRecommendations(input.finalRecommendations);

  if (!/^[a-z0-9-]{8,100}$/i.test(auditId)) throw new Error("invalid_real_session_audit_id");
  if (libraryId !== "y") throw new Error("invalid_real_session_library");
  if (!/^[0-9a-f]{8}$/.test(patronHash)) throw new Error("invalid_real_session_patron_hash");
  if (!["kids", "preteens", "teens", "adult"].includes(ageBand)) throw new Error("invalid_real_session_age_band");
  if (!finalRecommendations.length) throw new Error("missing_real_session_recommendations");

  return {
    auditId,
    libraryId: "y",
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
    finalRecommendations,
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

async function getSQL(): Promise<SqlClient> {
  if (sqlClient) return sqlClient;
  if (!process.env.POSTGRES_URL) throw new Error("real_session_audit_storage_unavailable");
  const mod = await import("@vercel/postgres");
  sqlClient = mod.sql as SqlClient;
  return sqlClient;
}

async function ensureSchema(sql: SqlClient): Promise<void> {
  if (!schemaReady) {
    schemaReady = sql`
      CREATE TABLE IF NOT EXISTS real_session_overlap_audit (
        audit_id TEXT PRIMARY KEY,
        library_id TEXT NOT NULL,
        patron_hash TEXT NOT NULL,
        age_band TEXT NOT NULL,
        likes INTEGER NOT NULL,
        dislikes INTEGER NOT NULL,
        skips INTEGER NOT NULL,
        dominant_taste JSONB NOT NULL,
        local_queries JSONB NOT NULL,
        final_recommendations JSONB NOT NULL,
        recent_overlaps JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `.then(() => undefined).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

function parseJsonArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function recordRealSessionAudit(event: RealSessionAuditEvent): Promise<RealSessionAuditRow> {
  const sql = await getSQL();
  await ensureSchema(sql);
  const previous = await sql`
    SELECT audit_id, patron_hash, final_recommendations
    FROM real_session_overlap_audit
    WHERE library_id = ${event.libraryId}
      AND age_band = ${event.ageBand}
      AND patron_hash <> ${event.patronHash}
    ORDER BY created_at DESC
    LIMIT 5
  `;
  const recentOverlaps = previous.rows.map((row) => ({
    auditId: String(row.audit_id || ""),
    patronHash: String(row.patron_hash || ""),
    ...computeRecommendationOverlap(event.finalRecommendations, parseJsonArray(row.final_recommendations)),
  }));
  const dominantTasteJson = JSON.stringify(event.dominantTaste);
  const localQueriesJson = JSON.stringify(event.localQueries);
  const finalRecommendationsJson = JSON.stringify(event.finalRecommendations);
  const recentOverlapsJson = JSON.stringify(recentOverlaps);

  await sql`
    INSERT INTO real_session_overlap_audit
      (audit_id, library_id, patron_hash, age_band, likes, dislikes, skips, dominant_taste, local_queries, final_recommendations, recent_overlaps)
    VALUES
      (${event.auditId}, ${event.libraryId}, ${event.patronHash}, ${event.ageBand}, ${event.likes}, ${event.dislikes}, ${event.skips},
       CAST(${dominantTasteJson} AS JSONB), CAST(${localQueriesJson} AS JSONB), CAST(${finalRecommendationsJson} AS JSONB),
       CAST(${recentOverlapsJson} AS JSONB))
    ON CONFLICT (audit_id) DO NOTHING
  `;
  await sql`
    DELETE FROM real_session_overlap_audit
    WHERE audit_id IN (
      SELECT audit_id
      FROM real_session_overlap_audit
      WHERE library_id = ${event.libraryId}
      ORDER BY created_at DESC
      OFFSET 500
    )
  `;
  return { ...event, recentOverlaps, createdAt: new Date().toISOString() };
}

export async function listRealSessionAudits(): Promise<RealSessionAuditRow[]> {
  const sql = await getSQL();
  await ensureSchema(sql);
  const result = await sql`
    SELECT audit_id, library_id, patron_hash, age_band, likes, dislikes, skips,
           dominant_taste, local_queries, final_recommendations, recent_overlaps, created_at
    FROM real_session_overlap_audit
    WHERE library_id = 'y'
    ORDER BY created_at DESC
    LIMIT 200
  `;
  return result.rows.map((row) => ({
    auditId: String(row.audit_id || ""),
    libraryId: "y",
    patronHash: String(row.patron_hash || ""),
    ageBand: String(row.age_band || ""),
    likes: Number(row.likes || 0),
    dislikes: Number(row.dislikes || 0),
    skips: Number(row.skips || 0),
    dominantTaste: row.dominant_taste || {},
    localQueries: parseJsonArray(row.local_queries).map(String),
    finalRecommendations: parseJsonArray(row.final_recommendations),
    recentOverlaps: parseJsonArray(row.recent_overlaps),
    createdAt: new Date(row.created_at).toISOString(),
  })) as RealSessionAuditRow[];
}
