// filterCandidates.ts

type Candidate = {
  id?: string;
  title?: string;
  authors?: string[];
  source?: string;
  rating?: number;
  ratingsCount?: number;
  pageCount?: number;
  categories?: string[];
  description?: string;
  maturityRating?: string;
  language?: string;
  publishedDate?: string;
  queryText?: string;
  queryRung?: number;
  lane?: string;
};

type FilterDiagnostics = {
  raw: number;
  filtered: number;
  rejects: Record<string, number>;
  sources: Record<string, number>;
};

const BLOCK_TERMS = [
  "annotated",
  "illustrated",
  "study guide",
  "analysis",
  "summary",
  "workbook",
  "teacher",
  "student",
  "edition",
  "companion"
];

function containsBlockedTerm(text: string): boolean {
  const lower = text.toLowerCase();
  return BLOCK_TERMS.some(term => lower.includes(term));
}

function isFictionCandidate(c: Candidate): boolean {
  const cats = (c.categories || []).join(" ").toLowerCase();
  const desc = (c.description || "").toLowerCase();

  return (
    cats.includes("fiction") ||
    desc.includes("novel") ||
    desc.includes("story")
  );
}

function isValidStructure(c: Candidate): boolean {
  return !!(
    c.title &&
    c.authors &&
    c.authors.length > 0 &&
    c.language === "en"
  );
}

function passesLengthFilter(c: Candidate): boolean {
  if (!c.pageCount) return true;
  return c.pageCount >= 80; // avoids pamphlets / junk
}

function passesRatingGate(c: Candidate): boolean {
  // 🚨 KEY FIX: Open Library bypasses rating gate
  if (c.source === "openLibrary") return true;

  if (!c.rating || !c.ratingsCount) return false;

  return c.rating >= 3.5 && c.ratingsCount >= 20;
}

function isBlockedContent(c: Candidate): boolean {
  const text = `${c.title || ""} ${(c.description || "")}`;
  return containsBlockedTerm(text);
}

function normalizeSource(source?: string): string {
  if (!source) return "unknown";
  if (source.toLowerCase().includes("open")) return "openLibrary";
  if (source.toLowerCase().includes("google")) return "googleBooks";
  return source;
}

export function filterCandidates(candidates: Candidate[]) {
  const diagnostics: FilterDiagnostics = {
    raw: candidates.length,
    filtered: 0,
    rejects: {},
    sources: {}
  };

  const filtered: Candidate[] = [];

  for (const c of candidates) {
    const source = normalizeSource(c.source);
    diagnostics.sources[source] = (diagnostics.sources[source] || 0) + 1;

    // 1. Structure check
    if (!isValidStructure(c)) {
      diagnostics.rejects["structure"] = (diagnostics.rejects["structure"] || 0) + 1;
      continue;
    }

    // 2. Language
    if (c.language !== "en") {
      diagnostics.rejects["language"] = (diagnostics.rejects["language"] || 0) + 1;
      continue;
    }

    // 3. Content block (annotated / spam)
    if (isBlockedContent(c)) {
      diagnostics.rejects["blocked_terms"] = (diagnostics.rejects["blocked_terms"] || 0) + 1;
      continue;
    }

    // 4. Fiction enforcement
    if (!isFictionCandidate(c)) {
      diagnostics.rejects["non_fiction"] = (diagnostics.rejects["non_fiction"] || 0) + 1;
      continue;
    }

    // 5. Length sanity
    if (!passesLengthFilter(c)) {
      diagnostics.rejects["too_short"] = (diagnostics.rejects["too_short"] || 0) + 1;
      continue;
    }

    // 6. Rating gate (WITH Open Library bypass)
    if (!passesRatingGate(c)) {
      diagnostics.rejects["ratings"] = (diagnostics.rejects["ratings"] || 0) + 1;
      continue;
    }

    filtered.push({
      ...c,
      source
    });
  }

  diagnostics.filtered = filtered.length;

  console.log("[NovelIdeas] FILTER DIAGNOSTICS", diagnostics);

  return {
    candidates: filtered,
    diagnostics
  };
}