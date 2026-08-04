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
const { importLocalCollectionCsv, importLocalCollectionMarc } = require(resolve(repoRoot, "lib", "localCollection", "index.ts"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runImport(csvText, sourceFilename = "fixture.csv", importTimestamp = "2026-08-02T00:00:00.000Z") {
  return importLocalCollectionCsv({
    csvText,
    sourceFilename,
    importTimestamp,
    collectionName: "YVHS",
    libraryId: "yvhs",
  });
}

function buildMarcRecord({ control001, title, author, isbn13, pubYear, audience, readingLevel, holdings = [], localPlacement }) {
  const fieldTerm = "\x1e";
  const recordTerm = "\x1d";
  const sub = "\x1f";
  const fields = [];
  const encoder = new TextEncoder();

  const pushControl = (tag, value) => {
    fields.push({ tag, data: `${value}${fieldTerm}` });
  };
  const pushData = (tag, ind1 = " ", ind2 = " ", subfields = []) => {
    const payload = subfields.map(([code, value]) => `${sub}${code}${value}`).join("");
    fields.push({ tag, data: `${ind1}${ind2}${payload}${fieldTerm}` });
  };

  pushControl("001", control001);
  pushControl("003", "MDUSD");
  pushControl("005", "20260802120000.0");
  pushControl("008", "260802s2026    cau           000 1 eng d");
  pushData("020", " ", " ", [["a", isbn13]]);
  pushData("100", "1", " ", [["a", author]]);
  pushData("245", "1", "0", [["a", title]]);
  pushData("260", " ", " ", [["c", pubYear]]);
  if (readingLevel) {
    pushData("521", "0", " ", [["a", readingLevel], ["b", "Follett Library Resources"]]);
  }
  if (audience) {
    pushData("521", "2", " ", [["a", audience], ["b", "Follett Library Resources"]]);
  }
  for (const holding of holdings) {
    const holdingSubfields = [];
    if (holding.copyId) holdingSubfields.push(["p", holding.copyId]);
    if (holding.locationCode) holdingSubfields.push(["a", holding.locationCode]);
    if (holding.collection) holdingSubfields.push(["b", holding.collection]);
    if (holding.callNumber) holdingSubfields.push(["h", holding.callNumber]);
    if (holding.packed) holdingSubfields.push(["x", holding.packed]);
    pushData("852", " ", " ", holdingSubfields);
  }
  if (localPlacement) {
    pushData("900", " ", " ", [["a", localPlacement]]);
  }

  const directoryEntries = [];
  let dataOffset = 0;
  const fieldBytes = [];
  for (const field of fields) {
    const bytes = encoder.encode(field.data);
    fieldBytes.push(bytes);
    const length = String(bytes.length).padStart(4, "0");
    const start = String(dataOffset).padStart(5, "0");
    directoryEntries.push(`${field.tag}${length}${start}`);
    dataOffset += bytes.length;
  }

  const directory = `${directoryEntries.join("")}${fieldTerm}`;
  const leader = Array.from("00000nam a2200000 a 4500");
  const baseAddress = 24 + directory.length;
  const recordLength = baseAddress + dataOffset + 1;
  leader.splice(0, 5, ...String(recordLength).padStart(5, "0"));
  leader.splice(12, 5, ...String(baseAddress).padStart(5, "0"));
  const leaderText = leader.join("");

  const recordBytes = new Uint8Array(recordLength);
  let cursor = 0;
  recordBytes.set(encoder.encode(leaderText), cursor); cursor += 24;
  recordBytes.set(encoder.encode(directory), cursor); cursor += directory.length;
  for (const bytes of fieldBytes) {
    recordBytes.set(bytes, cursor);
    cursor += bytes.length;
  }
  recordBytes[cursor] = recordTerm.charCodeAt(0);
  return recordBytes;
}

function concatUint8(chunks) {
  const total = chunks.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of chunks) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function runMarcImport(marcBinary, sourceFilename = "fixture.001", importTimestamp = "2026-08-02T00:00:00.000Z") {
  return importLocalCollectionMarc({
    marcBinary,
    sourceFilename,
    importTimestamp,
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

checks.push(check("stable_hash_and_ids_across_different_import_timestamps", () => {
  const csv = "title,author,isbn\nStable,Author,9780439708180\n";
  const a = runImport(csv, "stable.csv", "2026-08-02T00:00:00.000Z");
  const b = runImport(csv, "stable.csv", "2026-08-03T00:00:00.000Z");
  assert(a.acceptedRecords[0].localId === b.acceptedRecords[0].localId, "local_id_changed_with_timestamp");
  assert(a.deterministicContentHash === b.deterministicContentHash, "hash_changed_with_timestamp");
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

checks.push(check("artifact_is_self_contained_for_export_or_inspection", () => {
  const csv = "title,author,isbn\nInspectable,Author,9780439708180\n";
  const result = runImport(csv, "inspect.csv");
  const exported = JSON.parse(JSON.stringify(result));
  assert(Array.isArray(exported.acceptedRecords), "accepted_records_missing");
  assert(Array.isArray(exported.rejectedRecords), "rejected_records_missing");
  assert(typeof exported.summary?.acceptedTitles === "number", "summary_missing");
  assert(typeof exported.deterministicContentHash === "string" && exported.deterministicContentHash.length > 0, "hash_missing");
}));

checks.push(check("recommender_local_adapter_is_activated", () => {
  const sourceIndexText = readFileSync(resolve(repoRoot, "app", "recommender-v2", "sources", "index.ts"), "utf8");
  assert(!/localLibrary:\s*null/.test(sourceIndexText), "local_library_adapter_not_activated");
}));

checks.push(check("import_does_not_auto_enable_local_collection_source", () => {
  const adminWebText = readFileSync(resolve(repoRoot, "app", "app_admin-web.tsx"), "utf8");
  assert(
    !adminWebText.includes("setPath([\"recommendations\", \"sourceEnabled\", \"localLibrary\"], true)"),
    "import_flow_auto_enabled_local_collection_source"
  );
}));

checks.push(check("import_does_not_overwrite_legacy_local_collection_key", () => {
  const adminWebText = readFileSync(resolve(repoRoot, "app", "app_admin-web.tsx"), "utf8");
  assert(
    !adminWebText.includes("localStorage.setItem(\"novelideas_local_collection\","),
    "legacy_local_collection_key_overwritten"
  );
}));

checks.push(check("marc_import_maps_852_collection_and_multi_copy_counts", () => {
  const record = buildMarcRecord({
    control001: "fol00118715",
    title: "Number the stars",
    author: "Lowry, Lois.",
    isbn13: "9780395510605",
    pubYear: "1989",
    audience: "5-8",
    readingLevel: "4.5",
    holdings: [
      {
        copyId: "379467",
        locationCode: "YVHS",
        collection: "Historical Fiction",
        callNumber: "FIC Low",
        packed: "FSC@aAll Regular@c20000330",
      },
      {
        copyId: "384313",
        locationCode: "YVHS",
        collection: "Historical Fiction",
        callNumber: "FIC Low",
        packed: "FSC@aAll Regular@c20020411",
      },
    ],
    localPlacement: "CLASSROOM",
  });
  const result = runMarcImport(record);
  assert(result.summary.totalRows === 1, "marc_total_rows");
  assert(result.summary.acceptedTitles === 1, "marc_accepted_titles");
  const accepted = result.acceptedRecords[0];
  assert(accepted.copies === 2, "marc_copies_from_852_count");
  assert(accepted.shelvingLocation === "Historical Fiction", "marc_collection_from_852b");
  assert(accepted.localPlacement === "CLASSROOM", "marc_local_placement_from_900a");
  assert(accepted.marcRecordControlNumber === "fol00118715", "marc_001_not_preserved");
  assert(Array.isArray(accepted.marcHoldings) && accepted.marcHoldings.length === 2, "marc_holdings_not_preserved");
  assert(accepted.marcHoldings[0].rawPacked === "FSC@aAll Regular@c20000330", "marc_852x_not_preserved");
}));

checks.push(check("marc_import_missing_852b_keeps_record_with_warning_path", () => {
  const record = buildMarcRecord({
    control001: "fol00999999",
    title: "Collection Unknown",
    author: "Writer, Alex.",
    isbn13: "9780439708180",
    pubYear: "2001",
    holdings: [
      {
        copyId: "C1",
        locationCode: "YVHS",
        callNumber: "FIC Wri",
        packed: "FSC@aAll Regular@c20010101",
      },
    ],
  });
  const result = runMarcImport(record);
  assert(result.summary.acceptedTitles === 1, "marc_missing_852b_should_not_reject");
  const accepted = result.acceptedRecords[0];
  assert(!accepted.shelvingLocation, "marc_missing_852b_should_leave_shelving_empty");
}));

globalThis.fetch = originalFetch;

console.log(JSON.stringify({
  pass: true,
  checkCount: checks.length,
  checks,
}, null, 2));
