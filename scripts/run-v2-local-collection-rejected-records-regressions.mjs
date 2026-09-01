import { createRequire } from "node:module";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const source = readFileSync(filename, "utf8");
  module._compile(ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText, filename);
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { importLocalCollectionCsv } = require(resolve(ROOT, "lib/localCollection/index.ts"));
const {
  rejectedRecordsReportPages,
  rejectedRecordsReportChecksum,
  rejectedRecordsReportToCsv,
} = require(resolve(ROOT, "lib/localCollection/rejectedRecords.ts"));
const { buildRecommendationArtifact } = require(resolve(ROOT, "lib/localCollection/storage.ts"));
const {
  loadSharedLibraryCollectionPayload,
  loadSharedLibraryCollectionRejectedRecordsPage,
  saveSharedLibraryCollectionRejectedRecordsPage,
  saveSharedLibraryCollection,
} = require(resolve(ROOT, "lib/librarySharing/storage.ts"));

function check(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

const libraryId = `rejected-report-${process.pid}`;
const otherLibraryId = `${libraryId}-other`;
const artifact = importLocalCollectionCsv({
  libraryId,
  sourceFilename: "destiny-rejections.csv",
  importTimestamp: "2026-09-01T19:00:00.000Z",
  csvText: [
    "Title,Author,ISBN,Call Number,Control Number,Source ID",
    "Valid Book,Writer One,9780306406157,FIC ONE,bib-valid,copy-valid",
    "Valid Book,Writer One,9780306406157,FIC ONE,bib-duplicate,copy-duplicate",
    ",Writer Missing Title,9780140328721,FIC MISS,bib-missing-title,copy-missing-title",
    "Missing Author,,9780439554930,FIC AUTH,bib-missing-author,copy-missing-author",
  ].join("\n"),
});
const recommendation = buildRecommendationArtifact(artifact, { publishStatus: "verified" });
const report = recommendation.adminRejectedRecordsReport;

check(Boolean(report), "recommendation artifact carries an admin-only rejected-record report");
check(report.artifactId === recommendation.collectionVersion.artifactId, "report is bound to the exact collection artifact version");
check(report.libraryId === libraryId, "report is bound to the importing library");
check(report.rejectedCount === 2, "only true rejects are included in the report");
check(report.duplicatesMerged === 1, "merged duplicates are reported separately");
check(!report.records.some((record) => record.reasonCode === "duplicate_merged"), "duplicates never appear as rejected records");

const missingTitle = report.records.find((record) => record.reasonCode === "missing_title");
check(
  missingTitle?.author === "Writer Missing Title" &&
    missingTitle?.isbn === "9780140328721" &&
    missingTitle?.callNumber === "FIC MISS" &&
    missingTitle?.controlNumber === "bib-missing-title",
  "rejected records retain useful catalog provenance",
);
check(
  missingTitle?.sourceIdentifier === "copy-missing-title" &&
    missingTitle?.fixability === "fixable_in_catalog",
  "report provides a source locator and fixability status",
);

const missingAuthor = report.records.find((record) => record.reasonCode === "missing_or_untrustworthy_author");
check(
  missingAuthor?.title === "Missing Author" && !missingAuthor?.author,
  "records with unavailable optional report fields render gracefully",
);
check(
  missingTitle?.reasonLabel === "Missing title" &&
    missingAuthor?.reasonLabel === "Missing usable author",
  "rejection reason taxonomy is stable and librarian-readable",
);

const csv = rejectedRecordsReportToCsv(report);
for (const header of [
  "Title",
  "Author",
  "ISBN",
  "Control Number",
  "Call Number",
  "Source Identifier",
  "Rejection Reason",
  "Reason Code",
  "Fixability / Status",
  "Artifact ID",
  "Library ID",
]) {
  check(csv.split("\r\n")[0].includes(header), `CSV includes ${header}`);
}
check(
  csv.includes("bib-missing-title") &&
    csv.includes("missing_title") &&
    csv.includes(recommendation.collectionVersion.artifactId),
  "CSV contains expected provenance, reason, and version values",
);
const formulaSafeCsv = rejectedRecordsReportToCsv({
  ...report,
  records: [{ ...report.records[0], title: "=1+1" }],
});
check(formulaSafeCsv.includes("\r\n'=1+1,"), "CSV neutralizes spreadsheet formula injection");
const oversizedRecords = Array.from({ length: 101 }, (_, index) => ({
  ...report.records[0],
  recordId: `large-${index}`,
  rawDetails: Object.fromEntries(
    Array.from({ length: 40 }, (_unused, fieldIndex) => [`field-${fieldIndex}`, "é".repeat(500)]),
  ),
}));
const oversizedReportBase = {
  ...report,
  rejectedCount: oversizedRecords.length,
  records: oversizedRecords,
};
delete oversizedReportBase.reportChecksum;
const oversizedReport = {
  ...oversizedReportBase,
  reportChecksum: rejectedRecordsReportChecksum(oversizedReportBase),
};
const oversizedPages = rejectedRecordsReportPages(oversizedReport);
check(
  oversizedPages.length > 1 &&
    oversizedPages.every((page) => new TextEncoder().encode(JSON.stringify(page)).byteLength <= 3 * 1024 * 1024),
  "Unicode-heavy diagnostics are split below the bounded page byte limit",
);
check(
  oversizedPages.reduce((count, page) => count + page.records.length, 0) === oversizedRecords.length &&
    oversizedPages.every((page, index) =>
      page.offset === oversizedPages.slice(0, index).reduce((count, prior) => count + prior.records.length, 0)
    ),
  "adaptive pages preserve every record with contiguous offsets",
);

const collectionPath = resolve(ROOT, "scripts/output/library-sharing/collections", `${libraryId}.json`);
const diagnosticsPath = resolve(
  ROOT,
  "scripts/output/library-sharing/collection-diagnostics",
  libraryId,
  `${recommendation.collectionVersion.artifactId}-0.json`,
);
try {
  const pages = rejectedRecordsReportPages(report);
  check(pages.length === 1 && pages[0].offset === 0, "small reports produce a checksummed first page");
  await saveSharedLibraryCollectionRejectedRecordsPage(libraryId, pages[0]);
  await saveSharedLibraryCollection(libraryId, recommendation);
  const publicArtifact = await loadSharedLibraryCollectionPayload(libraryId);
  check(!publicArtifact?.adminRejectedRecordsReport, "public patron artifact excludes rejected-record diagnostics");
  const storedReport = await loadSharedLibraryCollectionRejectedRecordsPage(
    libraryId,
    recommendation.collectionVersion.artifactId,
    0,
  );
  check(
    storedReport?.reportChecksum === report.reportChecksum &&
      storedReport?.artifactId === recommendation.collectionVersion.artifactId,
    "stored report remains tied to the activated artifact version",
  );
  const crossLibraryReport = await loadSharedLibraryCollectionRejectedRecordsPage(
    otherLibraryId,
    recommendation.collectionVersion.artifactId,
    0,
  );
  check(crossLibraryReport === null, "Library A diagnostics are inaccessible through Library B storage scope");
  const corruptedReport = JSON.parse(readFileSync(diagnosticsPath, "utf8"));
  corruptedReport.pageChecksum = "fnv1a32:corrupted";
  writeFileSync(diagnosticsPath, JSON.stringify(corruptedReport), "utf8");
  check(
    await loadSharedLibraryCollectionRejectedRecordsPage(libraryId, recommendation.collectionVersion.artifactId, 0) === null,
    "stored page checksum corruption is rejected on read",
  );
} finally {
  if (existsSync(collectionPath)) unlinkSync(collectionPath);
  if (existsSync(diagnosticsPath)) unlinkSync(diagnosticsPath);
}

const apiSource = readFileSync(resolve(ROOT, "api/local-collection-diagnostics.ts"), "utf8");
check(
  apiSource.includes("hasAuthorizedAdminSession") &&
    apiSource.includes("library_config_unavailable") &&
    apiSource.includes("saveSharedLibraryCollectionRejectedRecordsPage") &&
    apiSource.includes("loadSharedLibraryCollectionRejectedRecordsPage"),
  "hosted diagnostics endpoint fails closed and reads or writes bounded report pages",
);
const sharedStorageSource = readFileSync(resolve(ROOT, "lib/librarySharing/storage.ts"), "utf8");
check(
  sharedStorageSource.includes("encryptCollectionDiagnostics") &&
    sharedStorageSource.includes("putBlobJson(") &&
    sharedStorageSource.includes("encrypted_collection_diagnostics_v1"),
  "hosted diagnostics are encrypted without requiring a private Blob store",
);
const sharingClientSource = readFileSync(resolve(ROOT, "lib/librarySharing/client.ts"), "utf8");
check(
  sharingClientSource.includes('url.searchParams.set("offset"') &&
    sharingClientSource.includes("rejectedRecordsReportChecksum") &&
    sharingClientSource.includes("rejectedRecordsReportPages") &&
    sharingClientSource.includes("delete publicArtifact.adminRejectedRecordsReport") &&
    sharingClientSource.indexOf("prepareHostedCollectionArtifact") <
      sharingClientSource.indexOf('postCollection(url, { libraryId, artifact: prepared.artifact }'),
  "client uploads bounded diagnostics before activation, strips them publicly, and verifies assembled reports",
);

const adminSource = readFileSync(resolve(ROOT, "app/app_admin-web.tsx"), "utf8");
check(
  adminSource.includes("Rejected Records") &&
    adminSource.includes("Download Rejected Records CSV") &&
    adminSource.includes("Duplicates merged:") &&
    adminSource.includes("loadSharedLibraryCollection(adminDraftScopeId)") &&
    adminSource.includes("hostedVersion?.artifactId === report.artifactId"),
  "Librarian Settings exposes report controls and refreshes stale local artifact metadata",
);

console.log("Local Collection rejected-record regressions passed.");
