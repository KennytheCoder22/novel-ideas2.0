import { deterministicHash } from "./hash";
import { adaptLocalCollectionSourceRecord, localCollectionDetailDescription } from "./presentation";
import type {
  LocalCollectionArtifact,
  LocalCollectionHealth,
  LocalCollectionPublishStatus,
  LocalCollectionSmokeIssue,
  LocalCollectionSmokeTest,
} from "./types";

type PresentationRecord = {
  localId?: string;
  title?: string;
  author?: string;
  description?: string;
  callNumber?: string;
  coverUrl?: string;
  isbn10?: string;
  isbn13?: string;
  sourceRows?: Array<{ raw?: Record<string, string> }>;
};

const NORMALIZATION_FIELD_ALIASES = {
  title: ["title", "book title", "name"],
  author: ["author", "authors", "creator", "creators", "primary author"],
  description: ["description", "summary", "annotation", "abstract", "book description"],
  callNumber: ["call number", "callnumber", "call no", "call #"],
  coverUrl: ["cover url", "cover image", "image url", "thumbnail"],
} as const;

function rawSourceValue(
  record: PresentationRecord,
  field: keyof typeof NORMALIZATION_FIELD_ALIASES,
): string {
  for (const sourceRow of record.sourceRows || []) {
    const normalized = new Map(
      Object.entries(sourceRow.raw || {}).map(([key, value]) => [key.toLowerCase().trim(), String(value || "").replace(/\s+/g, " ").trim()]),
    );
    for (const alias of NORMALIZATION_FIELD_ALIASES[field]) {
      const value = normalized.get(alias);
      if (value) return value;
    }
  }
  return "";
}

export function collectionContentChecksum(input: {
  libraryId?: string;
  records?: unknown[];
}): string {
  return `fnv1a32:${deterministicHash({
    libraryId: String(input.libraryId || ""),
    records: Array.isArray(input.records) ? input.records : [],
  })}`;
}

export function buildCollectionHealth(
  artifact: LocalCollectionArtifact,
  options: {
    artifactBytes?: number;
    compressedArtifactBytes?: number;
    publishStatus?: LocalCollectionPublishStatus;
    smokeTest?: LocalCollectionSmokeTest;
  } = {},
): LocalCollectionHealth {
  const summary = artifact.summary;
  const total = Math.max(0, Number(summary.totalRows || 0));
  const imported = Math.max(0, Number(summary.acceptedTitles || 0));
  const rejected = artifact.rejectedRecords.filter((record) => record.reason !== "duplicate_merged").length;
  const publishStatus = options.publishStatus || "not_published";
  const warnings: string[] = [];
  const failures: string[] = [];
  const coverage = (count: number) => imported > 0 ? count / imported : 0;

  if (imported === 0) {
    failures.push("No usable titles were imported.");
    const firstRejection = String(artifact.rejectedRecords[0]?.detail || "").trim();
    if (firstRejection) failures.push(firstRejection);
  }
  if (total > 0 && rejected / total > 0.5) failures.push("More than half of the source records were rejected.");
  else if (rejected > 0) warnings.push(`${rejected.toLocaleString()} source record(s) were safely rejected.`);
  if (Number(summary.titlesWithDescriptions || 0) === 0 && imported > 0) warnings.push("No descriptions were present.");
  if (coverage(Number(summary.titlesWithIsbns || 0)) < 0.5 && imported > 0) warnings.push("ISBN coverage is below 50%.");
  if (coverage(Number(summary.titlesWithAuthors || 0)) < 0.9 && imported > 0) warnings.push("Author coverage is below 90%.");
  if (coverage(Number(summary.titlesWithResolvableCovers || 0)) < 0.5 && imported > 0) warnings.push("Cover resolution coverage is below 50%.");
  if (summary.mergedDuplicatesOrCopies > 0) {
    warnings.push(`${summary.mergedDuplicatesOrCopies.toLocaleString()} duplicate record(s) were merged.`);
  }
  if (publishStatus === "failed") failures.push("Durable storage or read-back verification failed.");
  if (options.smokeTest && !options.smokeTest.passed) failures.push("Post-upload smoke testing found field loss.");

  const publishComplete = publishStatus === "verified" || publishStatus === "local_only";
  const status = failures.length
    ? "failed"
    : warnings.length || !publishComplete
      ? "ready_with_warnings"
      : "ready";
  return {
    status,
    publishStatus,
    metrics: {
      totalRecords: total,
      importedRecords: imported,
      rejectedRecords: rejected,
      usableTitles: imported,
      authorsPresent: Number(summary.titlesWithAuthors || 0),
      usableIsbns: Number(summary.titlesWithIsbns || 0),
      descriptionsPresent: Number(summary.titlesWithDescriptions || 0),
      coversResolvable: Number(summary.titlesWithResolvableCovers || 0),
      callNumbersPresent: Number(summary.titlesWithCallNumbers || 0),
      duplicateRecords: Number(summary.mergedDuplicatesOrCopies || 0),
      duplicateRate: Number(summary.duplicateRate || 0),
      audienceMetadataPresent: Number(summary.titlesWithAudienceOrShelfMetadata || 0),
    },
    warnings,
    failures,
    originalUploadBytes: Number(artifact.metadata.originalUploadBytes || 0),
    artifactBytes: Math.max(0, Number(options.artifactBytes || 0)),
    compressedArtifactBytes: Math.max(0, Number(options.compressedArtifactBytes || 0)),
    smokeTest: options.smokeTest,
  };
}

function representativeSample(records: PresentationRecord[], limit: number): PresentationRecord[] {
  if (records.length <= limit) return records;
  const selected = new Map<string, PresentationRecord>();
  const add = (record: PresentationRecord | undefined) => {
    if (record?.localId) selected.set(record.localId, record);
  };
  add(records[0]);
  add(records[records.length - 1]);
  add(records.find((record) => record.description));
  add(records.find((record) => record.callNumber));
  add(records.find((record) => record.coverUrl));
  add(records.find((record) => record.isbn10 || record.isbn13));
  const remaining = Math.max(1, limit - selected.size);
  const step = Math.max(1, Math.floor(records.length / remaining));
  for (let index = 0; index < records.length && selected.size < limit; index += step) add(records[index]);
  return Array.from(selected.values()).slice(0, limit);
}

export function runCollectionSmokeTest(
  sourceRecords: PresentationRecord[],
  adaptedRecords: PresentationRecord[],
  readBackRecords: PresentationRecord[],
  sampleLimit: number = 20,
): LocalCollectionSmokeTest {
  const adaptedById = new Map(adaptedRecords.map((record) => [String(record.localId || ""), record]));
  const readBackById = new Map(readBackRecords.map((record) => [String(record.localId || ""), record]));
  const issues: LocalCollectionSmokeIssue[] = [];
  const sample = representativeSample(sourceRecords, sampleLimit);
  const compare = (
    source: PresentationRecord,
    candidate: PresentationRecord | undefined,
    stage: LocalCollectionSmokeIssue["stage"],
  ) => {
    const localId = String(source.localId || "unknown");
    if (!candidate) {
      issues.push({ localId, field: "title", stage, message: "Sampled record is missing." });
      return;
    }
    for (const field of ["title", "author", "description", "callNumber"] as const) {
      const expected = String(source[field] || "").trim();
      if (expected && String(candidate[field] || "").trim() !== expected) {
        issues.push({ localId, field, stage, message: `${field} was lost or changed.` });
      }
    }
    if (source.coverUrl && !String(candidate.coverUrl || "").trim()) {
      issues.push({ localId, field: "cover", stage, message: "Explicit cover URL was lost." });
    }
  };

  for (const source of sample) {
    for (const field of ["title", "author", "description", "callNumber", "coverUrl"] as const) {
      const expected = rawSourceValue(source, field);
      if (expected && String(source[field] || "").trim() !== expected) {
        issues.push({
          localId: String(source.localId || "unknown"),
          field: field === "coverUrl" ? "cover" : field,
          stage: "normalization",
          message: `${field} was present in the source but lost or changed during normalization.`,
        });
      }
    }
    const adapted = adaptedById.get(String(source.localId || ""));
    const adaptedSourceItem = adapted ? adaptLocalCollectionSourceRecord(adapted) : undefined;
    compare(source, adaptedSourceItem ? {
      localId: String(adaptedSourceItem.sourceId || ""),
      title: String(adaptedSourceItem.title || ""),
      author: Array.isArray(adaptedSourceItem.authors) ? String(adaptedSourceItem.authors[0] || "") : "",
      description: localCollectionDetailDescription(adaptedSourceItem),
      callNumber: String(adaptedSourceItem.callNumber || ""),
      coverUrl: String(adaptedSourceItem.coverUrl || ""),
    } : undefined, "artifact_adapter");
    const readBack = readBackById.get(String(source.localId || ""));
    compare(adapted || source, readBack, "published_readback");
    const expectedDescription = String(source.description || "").trim();
    const readBackSourceItem = readBack ? adaptLocalCollectionSourceRecord(readBack) : {};
    if (expectedDescription && localCollectionDetailDescription(readBackSourceItem) !== expectedDescription) {
      issues.push({
        localId: String(source.localId || "unknown"),
        field: "description",
        stage: "detail_adapter",
        message: "The detail view cannot access the imported description.",
      });
    }
  }
  return { sampleSize: sample.length, passed: issues.length === 0, issues };
}
