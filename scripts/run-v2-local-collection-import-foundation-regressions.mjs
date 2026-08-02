import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  module._compile(output, filename);
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const { importLocalCollectionCsv } = require(resolve(repoRoot, "lib", "localCollection", "index.ts"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runImport(csvText, sourceFilename = "fixture.csv") {
  return importLocalCollectionCsv({
    csvText,
    sourceFilename,
    importTimestamp: "2026-08-02T00:00:00.000Z",
    collectionName: "YVHS",
    libraryId: "yvhs",
  });
}

function hasRejectReason(result, reason) {
  return result.rejectedRecords.some((row) => row.reason === reason);
}

function check(name, fn) {
  fn();
  return { name, pass: true };
}

const originalFetch = globalThis.fetch;
globalThis.fetch = () => {
  throw new Error("network_fetch_not_allowed");
};

const checks = [];

checks.push(check("empty_file", () => {
  const result = runImport("");
  assert(result.summary.totalRows === 0, "empty_file_total_rows");
  assert(result.summary.acceptedTitles === 0, "empty_file_accepted");
  assert(result.summary.rejectedRows >= 1, "empty_file_rejected");
}));

checks.push(check("header_only_file", () => {
  const result = runImport("title,author,isbn\n");
  assert(result.summary.totalRows === 0, "header_only_total_rows");
  assert(result.summary.acceptedTitles === 0, "header_only_accepted");
}));

checks.push(check("malformed_csv", () => {
  const result = runImport("title,author\n\"Broken,Jane\n");
  assert(hasRejectReason(result, "malformed_row"), "malformed_row_reason_missing");
}));

checks.push(check("quoted_commas_and_escaped_quotes", () => {
  const result = runImport("title,author\n\"The \"\"Best\"\", Book\",\"Doe, Jane\"\n");
  assert(result.summary.totalRows === 1, "quoted_total_rows");
  assert(result.summary.acceptedTitles === 1, "quoted_accept");
}));

checks.push(check("duplicate_isbn_merges_copies", () => {
  const csv = [
    "title,author,isbn,copies",
    "Book A,Author A,9780439708180,1",
    "Book A Duplicate,Author A,9780439708180,2",
  ].join("\n");
  const result = runImport(csv);
  assert(result.summary.acceptedTitles === 1, "dup_isbn_accepted_count");
  assert(result.summary.mergedDuplicatesOrCopies === 1, "dup_isbn_merge_count");
  assert(result.acceptedRecords[0].copies === 3, "dup_isbn_copy_merge");
}));

checks.push(check("duplicate_title_author_without_isbn_merges", () => {
  const csv = [
    "title,author,copies",
    "The Last Map,Robin Lee,1",
    "The Last Map,Robin Lee,4",
  ].join("\n");
  const result = runImport(csv);
  assert(result.summary.acceptedTitles === 1, "dup_noisbn_accepted_count");
  assert(result.acceptedRecords[0].copies === 5, "dup_noisbn_copy_merge");
}));

checks.push(check("isbn_10_and_13_normalization", () => {
  const csv = [
    "title,author,isbn-10,isbn-13",
    "A,One,0439708184,978-0439708180",
  ].join("\n");
  const result = runImport(csv);
  const item = result.acceptedRecords[0];
  assert(item.isbn10 === "0439708184", "isbn10_normalization_failed");
  assert(item.isbn13 === "9780439708180", "isbn13_normalization_failed");
}));

checks.push(check("missing_title_rejected", () => {
  const csv = "title,author\n,Author\n";
  const result = runImport(csv);
  assert(hasRejectReason(result, "missing_title"), "missing_title_reason_missing");
}));

checks.push(check("missing_author_rejected", () => {
  const csv = "title,author\nTitle,\n";
  const result = runImport(csv);
  assert(hasRejectReason(result, "missing_or_untrustworthy_author"), "missing_author_reason_missing");
}));

checks.push(check("books_without_isbn_are_kept_with_warning", () => {
  const csv = "title,author\nNo Isbn Book,Author\n";
  const result = runImport(csv);
  assert(result.summary.acceptedTitles === 1, "no_isbn_rejected_unexpectedly");
  assert(result.summary.titlesMissingIsbns === 1, "no_isbn_warning_count_missing");
}));

checks.push(check("invalid_publication_year_warning", () => {
  const csv = "title,author,publication year\nYear Trouble,Author,banana\n";
  const result = runImport(csv);
  assert(result.warnings.some((w) => w.code === "invalid_publication_year"), "invalid_year_warning_missing");
}));

checks.push(check("missing_cover_summary_count", () => {
  const csv = "title,author,isbn\nNo Cover,Author,9780439708180\n";
  const result = runImport(csv);
  assert(result.summary.titlesMissingCovers === 1, "missing_cover_count");
}));

checks.push(check("mixed_age_shelf_labels_preserved", () => {
  const csv = "title,author,audience,shelving location,reading level\nA,B,Teen,YA Fiction,8\n";
  const result = runImport(csv);
  const row = result.acceptedRecords[0];
  assert(row.audience === "Teen", "audience_not_preserved");
  assert(row.shelvingLocation === "YA Fiction", "shelf_not_preserved");
  assert(row.readingLevel === "8", "reading_level_not_preserved");
}));

checks.push(check("deterministic_ids_across_repeated_imports", () => {
  const csv = "title,author,isbn\nStable,Author,9780439708180\n";
  const a = runImport(csv, "stable.csv");
  const b = runImport(csv, "stable.csv");
  assert(a.acceptedRecords[0].localId === b.acceptedRecords[0].localId, "local_id_not_stable");
}));

checks.push(check("stable_summary_counts", () => {
  const csv = [
    "book title,creator,isbn,copies,cover url",
    "One,Alpha,9780439708180,2,https://example.com/1.jpg",
    "One,Alpha,9780439708180,1,https://example.com/1.jpg",
    "Two,Beta,,1,",
  ].join("\n");
  const a = runImport(csv, "counts.csv");
  const b = runImport(csv, "counts.csv");
  assert(JSON.stringify(a.summary) === JSON.stringify(b.summary), "summary_not_stable");
  assert(a.deterministicContentHash === b.deterministicContentHash, "hash_not_stable");
}));

checks.push(check("no_recommender_local_adapter_activation", () => {
  const sourceIndexText = readFileSync(resolve(repoRoot, "app", "recommender-v2", "sources", "index.ts"), "utf8");
  assert(/localLibrary:\s*null/.test(sourceIndexText), "local_library_adapter_was_activated");
}));

globalThis.fetch = originalFetch;

console.log(JSON.stringify({
  pass: true,
  checkCount: checks.length,
  checks,
}, null, 2));
