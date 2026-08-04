export interface HumanReviewDashboardFilters {
  startDate: string;
  endDate: string;
  ageBands: string[];
  sources: string[];
  libraryIds: string[];
  lanes: string[];
  profileQuery: string;
  snapshotQuery: string;
  titleQuery: string;
  authorQuery: string;
  reviewerQuery: string;
  ranks: string[];
  familiarity: string[];
  expectedEnjoyments: string[];
  tasteFits: string[];
  novelties: string[];
  confidences: string[];
  decisions: string[];
  concernTags: string[];
  slateDecisions: string[];
  rubricVersions: string[];
  schemaVersions: string[];
  datasets: string[];
  completionStates: string[];
}

export const DEFAULT_HUMAN_REVIEW_DASHBOARD_FILTERS: HumanReviewDashboardFilters = {
  startDate: "",
  endDate: "",
  ageBands: [],
  sources: [],
  libraryIds: [],
  lanes: [],
  profileQuery: "",
  snapshotQuery: "",
  titleQuery: "",
  authorQuery: "",
  reviewerQuery: "",
  ranks: [],
  familiarity: [],
  expectedEnjoyments: [],
  tasteFits: [],
  novelties: [],
  confidences: [],
  decisions: [],
  concernTags: [],
  slateDecisions: [],
  rubricVersions: [],
  schemaVersions: [],
  datasets: [],
  completionStates: [],
};

const MULTI_KEYS = [
  "ageBands",
  "sources",
  "libraryIds",
  "lanes",
  "ranks",
  "familiarity",
  "expectedEnjoyments",
  "tasteFits",
  "novelties",
  "confidences",
  "decisions",
  "concernTags",
  "slateDecisions",
  "rubricVersions",
  "schemaVersions",
  "datasets",
  "completionStates",
 ] as const satisfies ReadonlyArray<keyof HumanReviewDashboardFilters>;

const TEXT_KEYS = [
  "startDate",
  "endDate",
  "profileQuery",
  "snapshotQuery",
  "titleQuery",
  "authorQuery",
  "reviewerQuery",
 ] as const satisfies ReadonlyArray<keyof HumanReviewDashboardFilters>;

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => String(entry || "").split(",")).map((entry) => entry.trim()).filter(Boolean);
  }
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function toLowerArray(values: string[]): string[] {
  return values.map((value) => value.toLowerCase());
}

function maybeNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function average(numbers: number[]): number | null {
  if (!numbers.length) return null;
  return Number((numbers.reduce((sum, value) => sum + value, 0) / numbers.length).toFixed(2));
}

function percent(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function dateOnly(value: unknown): string {
  const text = String(value || "");
  return text.length >= 10 ? text.slice(0, 10) : "";
}

function isWithinDays(iso: string, days: number): boolean {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return false;
  return parsed >= Date.now() - days * 24 * 60 * 60 * 1000;
}

function includesQuery(values: unknown[], query: string): boolean {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return true;
  return values.some((value) => String(value || "").toLowerCase().includes(needle));
}

function intersects(values: string[], selected: string[]): boolean {
  if (!selected.length) return true;
  const haystack = new Set(toLowerArray(values));
  return selected.some((entry) => haystack.has(entry.toLowerCase()));
}

function parseLaneFromSignals(signals: unknown): string {
  if (!Array.isArray(signals)) return "";
  for (const raw of signals) {
    const text = String(raw || "");
    const genrePrefix = "genreFacetMatch:";
    if (text.startsWith(genrePrefix)) return text.slice(genrePrefix.length).trim();
  }
  for (const raw of signals) {
    const text = String(raw || "");
    const tastePrefix = "positiveTasteMatch:";
    if (text.startsWith(tastePrefix)) return text.slice(tastePrefix.length).trim();
  }
  return "";
}

function normalizeSlateDecision(summary: Record<string, any>): string {
  const explicit = String(summary?.wouldUseSlateDecision || "").trim().toLowerCase();
  if (explicit) return explicit;
  if (summary?.wouldUseSlate === true) return "yes";
  if (summary?.wouldUseSlate === false) return "no";
  return "unsure";
}

function classifyDataset(snapshot: Record<string, any>, review: Record<string, any>): "real" | "synthetic" {
  if (review?.reviewScope?.studyId) return "synthetic";
  if (String(snapshot?.profileId || "").startsWith("runtime-")) return "real";
  const recommendationItems = Array.isArray(snapshot?.recommendationItems) ? snapshot.recommendationItems : [];
  if (recommendationItems.some((item) => String(item?.source || "").toLowerCase() === "mock")) return "synthetic";
  return "synthetic";
}

function deriveAgeBand(snapshot: Record<string, any>, review: Record<string, any>): string {
  const fromReview = String(review?.reviewScope?.ageBand || "").trim();
  if (fromReview) return fromReview;
  const fromSnapshot = String(snapshot?.ageBand || "").trim();
  if (fromSnapshot) return fromSnapshot;
  const profileId = String(snapshot?.profileId || "");
  if (profileId.startsWith("kids-")) return "kids";
  if (profileId.startsWith("preteens-")) return "preteens";
  if (profileId.startsWith("teens-")) return "teens";
  if (profileId.startsWith("adult-")) return "adult";
  return "unknown";
}

function maskReviewerId(value: unknown): string {
  const text = String(value || "").trim();
  if (!text) return "Anonymous reviewer";
  if (text.length <= 4) return "Reviewer ••••";
  return `Reviewer •••${text.slice(-4)}`;
}

function titleOutcomeKey(title: string, author: string): string {
  const safeTitle = String(title || "").trim().toLowerCase();
  const safeAuthor = String(author || "").trim().toLowerCase();
  return `${safeTitle}::${safeAuthor}`;
}

export function parseHumanReviewDashboardFilters(params: Record<string, unknown>): HumanReviewDashboardFilters {
  const next: HumanReviewDashboardFilters = { ...DEFAULT_HUMAN_REVIEW_DASHBOARD_FILTERS };
  for (const key of MULTI_KEYS) {
    next[key] = toArray(params[key]);
  }
  for (const key of TEXT_KEYS) {
    next[key] = String(params[key] || "").trim();
  }
  return next;
}

export function serializeHumanReviewDashboardFilters(filters: HumanReviewDashboardFilters): Record<string, string> {
  const params: Record<string, string> = {};
  for (const key of MULTI_KEYS) {
    if (filters[key].length) params[key] = filters[key].join(",");
  }
  for (const key of TEXT_KEYS) {
    if (filters[key]) params[key] = filters[key];
  }
  return params;
}

export function buildHumanReviewDashboardData(args: {
  filters: HumanReviewDashboardFilters;
  snapshots: Array<Record<string, any>>;
  reviews: Array<Record<string, any>>;
}) {
  const snapshotById = new Map(
    (Array.isArray(args.snapshots) ? args.snapshots : []).map((snapshot) => [String(snapshot?.snapshotId || ""), snapshot])
  );

  const itemRows: any[] = [];
  const slateRows: any[] = [];

  for (const review of Array.isArray(args.reviews) ? args.reviews : []) {
    const snapshot = snapshotById.get(String(review?.snapshotId || ""));
    if (!snapshot) continue;

    const itemReviews = Array.isArray(review?.itemReviews) ? review.itemReviews : [];
    const snapshotItems = Array.isArray(snapshot?.recommendationItems) ? snapshot.recommendationItems : [];
    const summary = review?.summary && typeof review.summary === "object" ? review.summary : {};
    const dataset = classifyDataset(snapshot, review);
    const ageBand = deriveAgeBand(snapshot, review);
    const swipeSignals = Array.isArray(snapshot?.swipeSignals) ? snapshot.swipeSignals : [];
    const sessionLikeCount = swipeSignals.filter((row) => row?.action === "like").length;
    const sessionDislikeCount = swipeSignals.filter((row) => row?.action === "dislike").length;
    const sessionSkipCount = swipeSignals.filter((row) => row?.action === "skip").length;
    const slateDecision = normalizeSlateDecision(summary);
    const slateConcernTags = Array.isArray(summary?.slateConcernTags) ? summary.slateConcernTags.map((tag: unknown) => String(tag || "")).filter(Boolean) : [];
    const sources = new Set<string>();
    const lanes = new Set<string>();
    const allConcernTags = new Set<string>(slateConcernTags);
    const titlePreview: string[] = [];

    for (const item of itemReviews) {
      const rank = maybeNumber(item?.rank);
      const snapshotItem =
        snapshotItems.find((candidate) => maybeNumber(candidate?.rank) === rank) ||
        snapshotItems.find((candidate) => String(candidate?.title || "").trim() === String(item?.title || "").trim()) ||
        null;
      const source = String(snapshotItem?.source || "unknown").trim() || "unknown";
      const author = String(snapshotItem?.author || item?.author || "").trim();
      const matchedSignals = Array.isArray(snapshotItem?.matchedSignals)
        ? snapshotItem.matchedSignals.map((signal: unknown) => String(signal || "")).filter(Boolean)
        : [];
      const lane = parseLaneFromSignals(matchedSignals);
      const concernTags = Array.isArray(item?.concernTags)
        ? item.concernTags.map((tag: unknown) => String(tag || "")).filter(Boolean)
        : [];
      const schemaVersions = uniqueSorted([String(review?.schemaVersion || ""), String(snapshot?.schemaVersion || "")]);
      const libraryId =
        String(snapshotItem?.libraryId || snapshotItem?.sourceId || snapshot?.libraryId || "").trim();

      sources.add(source);
      if (lane) lanes.add(lane);
      for (const tag of concernTags) allConcernTags.add(tag);
      titlePreview.push(String(item?.title || "").trim());

      itemRows.push({
        reviewId: String(review?.reviewId || ""),
        snapshotId: String(review?.snapshotId || ""),
        profileId: String(review?.profileId || snapshot?.profileId || ""),
        reviewerId: String(review?.reviewerId || ""),
        reviewerLabel: maskReviewerId(review?.reviewerId),
        createdAt: String(review?.createdAt || ""),
        dataset,
        ageBand,
        title: String(item?.title || "").trim(),
        author,
        rank: rank == null ? null : String(rank),
        source,
        libraryId,
        lane,
        familiarity: String(item?.familiarity || "").trim(),
        expectedEnjoyment: item?.expectedEnjoyment == null ? null : String(item.expectedEnjoyment),
        tasteFit: maybeNumber(item?.criteriaRatings?.taste_alignment),
        novelty: maybeNumber(item?.criteriaRatings?.novelty),
        confidence: maybeNumber(item?.criteriaRatings?.confidence),
        overallScore: maybeNumber(item?.overallScore),
        decision: String(item?.decision || "").trim(),
        concernTags,
        notes: String(item?.notes || "").trim(),
        uncertaintyLevel: String(item?.uncertainty?.level || "").trim(),
        uncertaintyNote: String(item?.uncertainty?.note || "").trim(),
        matchedSignals,
        rubricVersion: String(review?.rubricVersion || snapshot?.rubricVersion || ""),
        schemaVersions,
        slateDecision,
        slateWouldUse: summary?.wouldUseSlate,
        slateNotes: String(summary?.notes || "").trim(),
        sessionLikeCount,
        sessionDislikeCount,
        sessionSkipCount,
      });
    }

    slateRows.push({
      reviewId: String(review?.reviewId || ""),
      snapshotId: String(review?.snapshotId || ""),
      profileId: String(review?.profileId || snapshot?.profileId || ""),
      reviewerId: String(review?.reviewerId || ""),
      reviewerLabel: maskReviewerId(review?.reviewerId),
      createdAt: String(review?.createdAt || ""),
      dataset,
      ageBand,
      sources: uniqueSorted(Array.from(sources)),
      lanes: uniqueSorted(Array.from(lanes)),
      titlePreview: uniqueSorted(titlePreview).slice(0, 6),
      itemCount: itemReviews.length,
      slateDecision,
      slateWouldUse: summary?.wouldUseSlate,
      slateNotes: String(summary?.notes || "").trim(),
      concernTags: uniqueSorted(Array.from(allConcernTags)),
      rubricVersion: String(review?.rubricVersion || snapshot?.rubricVersion || ""),
      schemaVersions: uniqueSorted([String(review?.schemaVersion || ""), String(snapshot?.schemaVersion || "")]),
      capturedSlateVerdict:
        String(summary?.slateVerdict || summary?.overallVerdict || "").trim(),
    });
  }

  const allDatasetOptions = uniqueSorted(slateRows.map((row) => row.dataset));
  const effectiveDatasets =
    args.filters.datasets.length > 0
      ? args.filters.datasets
      : allDatasetOptions.includes("real")
        ? ["real"]
        : [];

  const appliedFilters: HumanReviewDashboardFilters = {
    ...args.filters,
    datasets: effectiveDatasets,
  };

  const filteredItemRows = itemRows.filter((row) => {
    if (appliedFilters.startDate && dateOnly(row.createdAt) < appliedFilters.startDate) return false;
    if (appliedFilters.endDate && dateOnly(row.createdAt) > appliedFilters.endDate) return false;
    if (!intersects([row.ageBand], appliedFilters.ageBands)) return false;
    if (!intersects([row.source], appliedFilters.sources)) return false;
    if (!intersects([row.libraryId], appliedFilters.libraryIds)) return false;
    if (!intersects([row.lane], appliedFilters.lanes)) return false;
    if (!includesQuery([row.profileId], appliedFilters.profileQuery)) return false;
    if (!includesQuery([row.snapshotId], appliedFilters.snapshotQuery)) return false;
    if (!includesQuery([row.title], appliedFilters.titleQuery)) return false;
    if (!includesQuery([row.author], appliedFilters.authorQuery)) return false;
    if (!includesQuery([row.reviewerId], appliedFilters.reviewerQuery)) return false;
    if (!intersects([row.rank], appliedFilters.ranks)) return false;
    if (!intersects([row.familiarity], appliedFilters.familiarity)) return false;
    if (!intersects([row.expectedEnjoyment], appliedFilters.expectedEnjoyments)) return false;
    if (!intersects([String(row.tasteFit ?? "")], appliedFilters.tasteFits)) return false;
    if (!intersects([String(row.novelty ?? "")], appliedFilters.novelties)) return false;
    if (!intersects([String(row.confidence ?? "")], appliedFilters.confidences)) return false;
    if (!intersects([row.decision], appliedFilters.decisions)) return false;
    if (!intersects(row.concernTags, appliedFilters.concernTags)) return false;
    if (!intersects([row.slateDecision], appliedFilters.slateDecisions)) return false;
    if (!intersects([row.rubricVersion], appliedFilters.rubricVersions)) return false;
    if (!intersects(row.schemaVersions, appliedFilters.schemaVersions)) return false;
    if (!intersects([row.dataset], appliedFilters.datasets)) return false;
    if (!intersects(["completed"], appliedFilters.completionStates)) return false;
    return true;
  });

  const filteredReviewIds = new Set(filteredItemRows.map((row) => row.reviewId));
  const filteredSlateRows = slateRows.filter((row) => filteredReviewIds.has(row.reviewId));

  const completedReviews = filteredSlateRows.length;
  const reviewedItems = filteredItemRows.length;
  const uniqueReviewers = uniqueSorted(filteredSlateRows.map((row) => row.reviewerId)).length;
  const uniqueSnapshots = uniqueSorted(filteredSlateRows.map((row) => row.snapshotId)).length;

  const expectedEnjoymentValues = filteredItemRows
    .map((row) => maybeNumber(row.expectedEnjoyment))
    .filter((value): value is number => value != null);
  const tasteFitValues = filteredItemRows
    .map((row) => maybeNumber(row.tasteFit))
    .filter((value): value is number => value != null);
  const noveltyValues = filteredItemRows
    .map((row) => maybeNumber(row.novelty))
    .filter((value): value is number => value != null);
  const confidenceValues = filteredItemRows
    .map((row) => maybeNumber(row.confidence))
    .filter((value): value is number => value != null);

  const decisionCounts = {
    recommend: filteredItemRows.filter((row) => row.decision === "recommend").length,
    weakRecommend: filteredItemRows.filter((row) => row.decision === "weak_recommend").length,
    notRecommended: filteredItemRows.filter((row) => row.decision === "not_recommended").length,
  };
  const wouldUseKnown = filteredSlateRows.filter((row) => row.slateDecision === "yes" || row.slateDecision === "no");
  const slateWouldUseYes = filteredSlateRows.filter((row) => row.slateDecision === "yes").length;

  const discoveryIndicators = [
    {
      key: "promising_discoveries",
      label: "Promising discoveries",
      definition: "Reviewer had never heard of the book and rated expected enjoyment 4-5.",
      count: filteredItemRows.filter(
        (row) => row.familiarity === "never_heard_of_it" && ["4", "5"].includes(String(row.expectedEnjoyment || ""))
      ).length,
    },
    {
      key: "never_heard_recommend",
      label: "Never heard of it + Recommend",
      definition: "Reviewer had never heard of the book and marked it Recommend.",
      count: filteredItemRows.filter((row) => row.familiarity === "never_heard_of_it" && row.decision === "recommend").length,
    },
    {
      key: "already_read_recommend",
      label: "Already read + Recommend",
      definition: "Reviewer reported already reading the book and still marked it Recommend.",
      count: filteredItemRows.filter((row) => row.familiarity === "read_it" && row.decision === "recommend").length,
    },
    {
      key: "tried_but_not_finished",
      label: "Tried but did not finish",
      definition: "Reviewer reported trying the book without finishing it.",
      count: filteredItemRows.filter((row) => row.familiarity === "tried_but_did_not_finish").length,
    },
    {
      key: "known_not_recommended",
      label: "Known title + Not Recommended",
      definition: "Reviewer already knew the title and marked it Not Recommended.",
      count: filteredItemRows.filter(
        (row) => row.familiarity && row.familiarity !== "never_heard_of_it" && row.decision === "not_recommended"
      ).length,
    },
  ];

  function buildComparison(rows: any[], key: "ageBand" | "source") {
    const buckets = new Map<string, any>();
    for (const row of rows) {
      const bucketKey = String(row[key] || "unknown");
      const bucket = buckets.get(bucketKey) || {
        key: bucketKey,
        reviewIds: new Set<string>(),
        titles: 0,
        expected: [] as number[],
        taste: [] as number[],
        novelty: [] as number[],
        confidence: [] as number[],
        recommend: 0,
        discoveries: 0,
      };
      bucket.reviewIds.add(row.reviewId);
      bucket.titles += 1;
      if (row.expectedEnjoyment != null) bucket.expected.push(Number(row.expectedEnjoyment));
      if (row.tasteFit != null) bucket.taste.push(Number(row.tasteFit));
      if (row.novelty != null) bucket.novelty.push(Number(row.novelty));
      if (row.confidence != null) bucket.confidence.push(Number(row.confidence));
      if (row.decision === "recommend") bucket.recommend += 1;
      if (row.familiarity === "never_heard_of_it" && ["4", "5"].includes(String(row.expectedEnjoyment || ""))) bucket.discoveries += 1;
      buckets.set(bucketKey, bucket);
    }
    return Array.from(buckets.values())
      .map((bucket) => ({
        key: bucket.key,
        reviewedSlates: bucket.reviewIds.size,
        reviewedItems: bucket.titles,
        avgExpectedEnjoyment: average(bucket.expected),
        avgTasteFit: average(bucket.taste),
        avgNovelty: average(bucket.novelty),
        avgConfidence: average(bucket.confidence),
        recommendRate: percent(bucket.recommend, bucket.titles),
        promisingDiscoveries: bucket.discoveries,
      }))
      .sort((a, b) => String(a.key).localeCompare(String(b.key)));
  }

  const concernBuckets = new Map<string, any>();
  for (const row of filteredItemRows) {
    for (const tag of row.concernTags) {
      const key = `${row.ageBand}::${tag}`;
      const bucket = concernBuckets.get(key) || {
        ageBand: row.ageBand,
        tag,
        count: 0,
        sources: new Set<string>(),
      };
      bucket.count += 1;
      bucket.sources.add(row.source);
      concernBuckets.set(key, bucket);
    }
  }

  const topConcernTags = Array.from(concernBuckets.values())
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 12)
    .map((bucket) => ({
      ageBand: bucket.ageBand,
      tag: bucket.tag,
      count: bucket.count,
      sources: uniqueSorted(Array.from(bucket.sources)),
    }));

  const disagreementBuckets = new Map<string, any>();
  for (const row of filteredItemRows) {
    const key = `${row.snapshotId}::${row.rank}::${row.title}`;
    const bucket = disagreementBuckets.get(key) || {
      snapshotId: row.snapshotId,
      profileId: row.profileId,
      title: row.title,
      author: row.author,
      rank: row.rank,
      ageBand: row.ageBand,
      decisions: new Set<string>(),
      slateDecisions: new Set<string>(),
      reviewers: new Set<string>(),
      scores: [] as number[],
    };
    bucket.decisions.add(row.decision);
    bucket.slateDecisions.add(row.slateDecision);
    bucket.reviewers.add(row.reviewerId);
    if (row.overallScore != null) bucket.scores.push(Number(row.overallScore));
    disagreementBuckets.set(key, bucket);
  }

  const disagreementSnapshots = Array.from(disagreementBuckets.values())
    .filter((bucket) => bucket.reviewers.size > 1 && (bucket.decisions.size > 1 || bucket.slateDecisions.size > 1))
    .sort((a, b) => b.reviewers.size - a.reviewers.size || a.title.localeCompare(b.title))
    .slice(0, 12)
    .map((bucket) => ({
      snapshotId: bucket.snapshotId,
      profileId: bucket.profileId,
      title: bucket.title,
      author: bucket.author,
      rank: bucket.rank,
      ageBand: bucket.ageBand,
      reviewerCount: bucket.reviewers.size,
      itemDecisions: uniqueSorted(Array.from(bucket.decisions)),
      slateDecisions: uniqueSorted(Array.from(bucket.slateDecisions)),
      scoreRange:
        bucket.scores.length > 1
          ? `${Math.min(...bucket.scores)}-${Math.max(...bucket.scores)}`
          : bucket.scores.length === 1
            ? String(bucket.scores[0])
            : "",
    }));

  const titleBuckets = new Map<string, any>();
  for (const row of filteredItemRows) {
    const key = titleOutcomeKey(row.title, row.author);
    const bucket = titleBuckets.get(key) || {
      title: row.title,
      author: row.author,
      source: row.source,
      reviewIds: new Set<string>(),
      count: 0,
      expected: [] as number[],
      taste: [] as number[],
      recommend: 0,
      notRecommended: 0,
      concernTags: new Set<string>(),
    };
    bucket.reviewIds.add(row.reviewId);
    bucket.count += 1;
    if (row.expectedEnjoyment != null) bucket.expected.push(Number(row.expectedEnjoyment));
    if (row.tasteFit != null) bucket.taste.push(Number(row.tasteFit));
    if (row.decision === "recommend") bucket.recommend += 1;
    if (row.decision === "not_recommended") bucket.notRecommended += 1;
    for (const tag of row.concernTags) bucket.concernTags.add(tag);
    titleBuckets.set(key, bucket);
  }

  const titleOutcomes = Array.from(titleBuckets.values())
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
    .slice(0, 20)
    .map((bucket) => ({
      title: bucket.title,
      author: bucket.author,
      source: bucket.source,
      reviewCount: bucket.reviewIds.size,
      itemReviewCount: bucket.count,
      avgExpectedEnjoyment: average(bucket.expected),
      avgTasteFit: average(bucket.taste),
      recommendRate: percent(bucket.recommend, bucket.count),
      notRecommendedRate: percent(bucket.notRecommended, bucket.count),
      concernTags: uniqueSorted(Array.from(bucket.concernTags)).slice(0, 6),
    }));

  const recentSubmissions = filteredSlateRows
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 24)
    .map((row) => ({
      reviewId: row.reviewId,
      snapshotId: row.snapshotId,
      profileId: row.profileId,
      reviewerId: row.reviewerId,
      reviewerLabel: row.reviewerLabel,
      createdAt: row.createdAt,
      ageBand: row.ageBand,
      dataset: row.dataset,
      sources: row.sources,
      lanes: row.lanes,
      titlePreview: row.titlePreview,
      slateDecision: row.slateDecision,
      itemCount: row.itemCount,
      concernTags: row.concernTags.slice(0, 6),
      notes: row.slateNotes,
    }));

  const filterOptions = {
    ageBands: uniqueSorted(itemRows.map((row) => row.ageBand)),
    sources: uniqueSorted(itemRows.map((row) => row.source)),
    libraryIds: uniqueSorted(itemRows.map((row) => row.libraryId)),
    lanes: uniqueSorted(itemRows.map((row) => row.lane)),
    ranks: uniqueSorted(itemRows.map((row) => row.rank)),
    familiarity: uniqueSorted(itemRows.map((row) => row.familiarity)),
    expectedEnjoyments: uniqueSorted(itemRows.map((row) => row.expectedEnjoyment)),
    tasteFits: uniqueSorted(itemRows.map((row) => String(row.tasteFit ?? ""))),
    novelties: uniqueSorted(itemRows.map((row) => String(row.novelty ?? ""))),
    confidences: uniqueSorted(itemRows.map((row) => String(row.confidence ?? ""))),
    decisions: uniqueSorted(itemRows.map((row) => row.decision)),
    concernTags: uniqueSorted(itemRows.flatMap((row) => row.concernTags)),
    slateDecisions: uniqueSorted(itemRows.map((row) => row.slateDecision)),
    rubricVersions: uniqueSorted(itemRows.map((row) => row.rubricVersion)),
    schemaVersions: uniqueSorted(itemRows.flatMap((row) => row.schemaVersions)),
    datasets: uniqueSorted(itemRows.map((row) => row.dataset)),
    completionStates: ["completed"],
  };

  const fieldAvailability = {
    localLibraryIdsAvailable: filterOptions.libraryIds.length > 0,
    capturedSlateVerdicts: filteredSlateRows.some((row) => Boolean(row.capturedSlateVerdict)),
    incompleteRecordsStored: false,
    reviewerUncertaintyCaptured: filteredItemRows.some((row) => row.uncertaintyLevel || row.uncertaintyNote),
  };

  const evidenceNotes: string[] = [];
  if (allDatasetOptions.includes("synthetic") && appliedFilters.datasets.includes("real")) {
    evidenceNotes.push("Synthetic certification and baseline-study fixtures exist in the evidence store and are excluded from the default view.");
  } else if (allDatasetOptions.includes("synthetic") && !allDatasetOptions.includes("real")) {
    evidenceNotes.push("Only synthetic certification or study fixtures are currently available in the evidence store.");
  }
  if (!fieldAvailability.capturedSlateVerdicts) {
    evidenceNotes.push("Excellent/Good/Mixed/Weak/Failed slate verdicts are not present in the current stored record schema, so the dashboard does not fabricate them.");
  }
  if (!fieldAvailability.incompleteRecordsStored) {
    evidenceNotes.push("Incomplete or abandoned reviews are not currently persisted by the Human Review repository, so completion rate is shown only when a reliable denominator exists.");
  }

  return {
    appliedFilters,
    filterOptions,
    summary: {
      completedReviewSubmissions: completedReviews,
      reviewedRecommendationItems: reviewedItems,
      uniqueAnonymousReviewers: uniqueReviewers,
      uniqueReviewedSnapshots: uniqueSnapshots,
      completionRate: null,
      completionRateNote: "Reliable incomplete-review denominator unavailable in current repository.",
      avgExpectedEnjoyment: average(expectedEnjoymentValues),
      avgTasteFit: average(tasteFitValues),
      avgNovelty: average(noveltyValues),
      avgConfidence: average(confidenceValues),
      recommendRate: percent(decisionCounts.recommend, reviewedItems),
      weakRecommendRate: percent(decisionCounts.weakRecommend, reviewedItems),
      notRecommendedRate: percent(decisionCounts.notRecommended, reviewedItems),
      wouldUseSlateRate: percent(slateWouldUseYes, wouldUseKnown.length),
      reviewsLast7Days: filteredSlateRows.filter((row) => isWithinDays(row.createdAt, 7)).length,
      reviewsLast30Days: filteredSlateRows.filter((row) => isWithinDays(row.createdAt, 30)).length,
      reviewsLast90Days: filteredSlateRows.filter((row) => isWithinDays(row.createdAt, 90)).length,
      capturedSlateVerdictDistribution: {
        excellent: 0,
        good: 0,
        mixed: 0,
        weak: 0,
        failed: 0,
      },
    },
    discoveryIndicators,
    ageBandComparison: buildComparison(filteredItemRows, "ageBand"),
    sourceComparison: buildComparison(filteredItemRows, "source"),
    topConcernTags,
    hypothesisClusters: topConcernTags.map((entry) => ({
      key: `${entry.ageBand}::${entry.tag}`,
      ageBand: entry.ageBand,
      tag: entry.tag,
      count: entry.count,
      summary: `${entry.ageBand} evidence repeatedly flags ${entry.tag} (${entry.count} item-level mentions).`,
      sources: entry.sources,
    })),
    disagreementSnapshots,
    titleOutcomes,
    recentSubmissions,
    evidenceNotes,
    fieldAvailability,
    datasetInventory: {
      realReviews: slateRows.filter((row) => row.dataset === "real").length,
      syntheticReviews: slateRows.filter((row) => row.dataset === "synthetic").length,
    },
  };
}
