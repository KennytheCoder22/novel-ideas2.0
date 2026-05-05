// /screens/recommenders/types.ts
export type EngineId = "googleBooks" | "openLibrary" | "kitsu" | "gcd";
export type DomainMode = "default" | "picture" | "earlyReader" | "chapterMiddle";
export type DeckKey = "k2" | "36" | "ms_hs" | "adult";
export type TagCounts = Record<string, number>;
export type TasteAxis = "warmth" | "darkness" | "humor" | "complexity" | "characterFocus" | "pacing" | "ideaDensity" | "realism";
export type TasteProfile = { axes: Partial<Record<TasteAxis, number>>; confidence?: number; };
export type CommercialSignals = {
  bestseller?: boolean;
  awards?: number;
  popularityTier?: number;
  sourceCount?: number;
};
export type RecommendationDoc = { key?: string; id?: string; title?: string; author_name?: string[]; first_publish_year?: number; cover_i?: number | string; subject?: string[]; subtitle?: string; description?: string; edition_count?: number; language?: string[]; ebook_access?: string; commercialSignals?: CommercialSignals; };
export type RecommendationItem = { kind: "open_library"; doc: RecommendationDoc; };
export type RecommendationResult = {
  debugRungStats?: RungDiagnostics;
  debugSourceStats?: Record<string, { rawFetched: number; postFilterCandidates: number; finalSelected: number; }>;
  debugCandidatePool?: any[];
  debugRawPool?: any[];
  debugFilterAudit?: any[];
  debugFilterAuditSummary?: { kept: number; rejected: number; reasons: Record<string, number>; };
  debugFinalRecommender?: {
    inputCount: number;
    dedupedCount: number;
    acceptedCount: number;
    rejectedCount: number;
    rejectionCounts: Record<string, number>;
    rejected: Array<{ id: string; title: string; author: string; source: EngineId; reason: string; detail?: string; }>;
  };
  sourceEnabled?: RecommendationSourceDiagnostics;
  sourceSkippedReason?: string[];
  debugRouterVersion?: string;
  debugGcdDispatchTrace?: {
    sourceEnabledGcd: boolean;
    includeGcd: boolean;
    buildGcdFacetRungsCalled: boolean;
    gcdRungsLength: number;
    mainRungQueriesLength: number;
    gcdFetchAttempted: boolean;
  };
  engineId: EngineId;
  engineLabel: string;
  deckKey: DeckKey;
  domainMode?: DomainMode;
  builtFromQuery: string;
  items: RecommendationItem[];
};
export type RecommenderProfileOverride = Record<string, number | undefined>;
export type SourceEnabledConfig = {
  googleBooks?: boolean;
  openLibrary?: boolean;
  localLibrary?: boolean;
  kitsu?: boolean;
  gcd?: boolean;
};
export type StructuredFetchRung = { rung: number; family?: string; primary: string | null; secondary: string | null; themes: string[]; audience: string; query: string; };
export type BucketPlan = { queries?: string[]; rungs?: StructuredFetchRung[]; bucketId?: string; domainMode?: DomainMode; preview?: string; strategy?: string; signals?: { genres?: string[]; tones?: string[]; textures?: string[]; scenarios?: string[]; }; };
export type RecommenderInput = { deckKey: DeckKey; tagCounts: TagCounts; tasteProfile?: TasteProfile; limit?: number; timeoutMs?: number; minCandidateFloor?: number; bucketPlan?: BucketPlan; domainModeOverride?: DomainMode; profileOverride?: RecommenderProfileOverride; priorRecommendedIds?: string[]; priorRecommendedKeys?: string[]; priorAuthors?: string[]; priorSeriesKeys?: string[]; priorRejectedIds?: string[]; priorRejectedKeys?: string[]; sourceEnabled?: SourceEnabledConfig; localLibrarySupported?: boolean; };


export type RungDiagnostics = {
  byRung: Record<string, number>;
  byRungSource: Record<string, Record<string, number>>;
  total: number;
};

export type RecommendationSourceDiagnostics = {
  googleBooks: boolean;
  openLibrary: boolean;
  localLibrary: boolean;
  kitsu: boolean;
  gcd: boolean;
};
