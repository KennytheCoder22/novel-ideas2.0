function normalized(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean)));
}

function hasFictionCategory(categories) {
  const text = (Array.isArray(categories) ? categories : []).map((value) => normalized(value)).join(" | ");
  return /\b(fiction|novel|stories|young adult fiction|juvenile fiction|coming of age|literary fiction|contemporary fiction)\b/.test(text);
}

function hasCommercialNarrativePublisher(publisher) {
  const text = normalized(publisher);
  if (!text) return false;
  return /\b(penguin|random house|knopf|doubleday|viking|harper|macmillan|tor|simon|schuster|hachette|st martin|ballantine|minotaur|berkley|delacorte|del rey|orbit|ace|anchor|scribner|atria|wiley)\b/.test(text);
}

function contradictoryPublicationSignals(analysis) {
  const contradiction = [];
  const explicit = Array.isArray(analysis.explicitNonNarrativeIdentity)
    ? analysis.explicitNonNarrativeIdentity.map((value) => String(value || ""))
    : [];
  contradiction.push(...explicit);
  const evidence = Array.isArray(analysis.publicationShapeEvidence)
    ? analysis.publicationShapeEvidence.map((value) => String(value || ""))
    : [];
  for (const signal of evidence) {
    if (/critical|reference|guide|antholog|periodical|academic|commentary|history|survey|catalog|public_domain|nonfiction/.test(signal)) {
      contradiction.push(signal);
    }
  }
  if (String(analysis.publicationShape || "") === "anthology" || String(analysis.publicationShape || "") === "essay_collection") {
    contradiction.push(`shape:${analysis.publicationShape}`);
  }
  return unique(contradiction);
}

export function evaluateGeneralShadowAdmission(analysis) {
  const narrativeSignals = unique([
    ...(Array.isArray(analysis.storyLevelNarrativeEvidence) ? analysis.storyLevelNarrativeEvidence : []),
    ...(Array.isArray(analysis.unknownShapeEvidence) ? analysis.unknownShapeEvidence : []),
  ]);
  const evidenceFamilies = unique(Array.isArray(analysis.unknownStoryEvidenceFamilies) ? analysis.unknownStoryEvidenceFamilies : []);
  const contradictions = contradictoryPublicationSignals(analysis);
  const validIdentity = Boolean(String(analysis.title || "").trim()) && Array.isArray(analysis.authors) && analysis.authors.length > 0;
  const fictionCategory = hasFictionCategory(analysis.categories);
  const commercialPublisher = hasCommercialNarrativePublisher(analysis.publisher);
  const metadataShape = Boolean(analysis.isbnPresent) && Number(analysis.pageCount || 0) >= 120;
  const rejection = String(analysis.publicationShapeDropReason || "");
  const bundleChecks = {
    unknownRejection: rejection === "publication_shape_unknown_insufficient_narrative_identity",
    multipleNarrativeSignals: narrativeSignals.length >= 3,
    multipleNarrativeFamilies: evidenceFamilies.length >= 2,
    explicitFictionCategory: fictionCategory,
    noContradictions: contradictions.length === 0,
    publisherMetadataNarrativeShape: commercialPublisher || metadataShape,
    validTitleAuthorIdentity: validIdentity,
  };
  const allChecksPassed = Object.values(bundleChecks).every(Boolean);
  const confidence = allChecksPassed
    ? "high"
    : (bundleChecks.unknownRejection && bundleChecks.validTitleAuthorIdentity && (narrativeSignals.length >= 2 || evidenceFamilies.length >= 2))
      ? "medium"
      : "low";
  return {
    admit: allChecksPassed,
    confidence,
    corroboratingSignals: unique([
      ...narrativeSignals,
      ...evidenceFamilies.map((value) => `family:${value}`),
      fictionCategory ? "category_fiction" : "",
      commercialPublisher ? "publisher_mainstream_fiction" : "",
      metadataShape ? "metadata_book_shape" : "",
      validIdentity ? "identity_title_author_present" : "",
    ]),
    contradictorySignals: contradictions,
    bundleChecks,
  };
}

export function averageScore(items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return 0;
  const sum = list.reduce((running, item) => running + Number(item.score || 0), 0);
  return Number((sum / list.length).toFixed(3));
}

export function diversitySnapshot(items) {
  const list = Array.isArray(items) ? items : [];
  const uniqueAuthors = new Set(
    list.map((item) => String((Array.isArray(item.creators) ? item.creators[0] : "") || "").trim().toLowerCase()).filter(Boolean),
  ).size;
  const uniqueTitleRoots = new Set(
    list.map((item) => String(item.title || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\b(the|a|an|book|volume|vol|part)\b/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean),
  ).size;
  return { uniqueAuthors, uniqueTitleRoots };
}

