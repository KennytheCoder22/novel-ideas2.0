import type { SourceAdapterV2, SourcePlan, SourceResult, TasteProfile } from "../types";

function nowIso(): string {
  return new Date().toISOString();
}

export const mockSourceAdapter: SourceAdapterV2 = {
  source: "mock",
  async search(plan: SourcePlan, context: { profile: TasteProfile; signal?: AbortSignal }): Promise<SourceResult> {
    const startedAt = nowIso();
    if (!plan.enabled) {
      return {
        source: "mock",
        status: "skipped",
        rawItems: [],
        diagnostics: {
          source: "mock",
          status: "skipped",
          planned: false,
          attempted: false,
          skippedReason: plan.skippedReason || "source_disabled",
          timedOut: false,
          startedAt,
          finishedAt: nowIso(),
          elapsedMs: 0,
          rawCount: 0,
          queries: [],
        },
      };
    }

    if (context.signal?.aborted) throw new Error("mock_source_aborted_before_start");
    const primaryIntent = plan.intents[0];
    const rawItems = [
      {
        id: "mock-1",
        title: "The Lantern Archive",
        creators: ["NovelIdeas V2 Mock"],
        description: `A ${context.profile.ageBand} ${primaryIntent?.query || "adventure"} with found-family stakes and atmospheric mystery.`,
        formats: ["book"],
        genres: context.profile.genreFamily.map((row) => row.value),
        tones: context.profile.tone.map((row) => row.value),
        themes: context.profile.themes.map((row) => row.value),
      },
      {
        id: "mock-2",
        title: "Signal in the Stacks",
        creators: ["NovelIdeas V2 Mock"],
        description: "A quiet fallback candidate used to prove diagnostics and scoring without real source calls.",
        formats: ["book"],
        genres: ["mystery"],
        tones: ["curious"],
        themes: ["friendship"],
      },
    ];
    const finishedAt = nowIso();
    return {
      source: "mock",
      status: rawItems.length ? "succeeded" : "empty",
      rawItems,
      diagnostics: {
        source: "mock",
        status: rawItems.length ? "succeeded" : "empty",
        planned: true,
        attempted: true,
        timedOut: false,
        startedAt,
        finishedAt,
        elapsedMs: Date.parse(finishedAt) - Date.parse(startedAt),
        rawCount: rawItems.length,
        queries: plan.intents.map((intent) => intent.query),
      },
    };
  },
};
