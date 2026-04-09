// PATCHED recommenderRouter.ts (engine-specific query handling added)

import type {
  EngineId,
  RecommenderInput,
  RecommendationResult,
  DomainMode,
  RecommendationDoc,
} from "./types";

import { getGoogleBooksRecommendations } from "./googleBooks/googleBooksRecommender";
import { getOpenLibraryRecommendations } from "./openLibrary/openLibraryRecommender";

// ... (rest of imports unchanged)

/* =========================
   🔥 ENGINE-SPECIFIC QUERY SPLIT
   ========================= */

function buildEngineQueries(bucketPlan: any) {
  const baseQueries: string[] = Array.isArray(bucketPlan?.queries)
    ? bucketPlan.queries
    : [];

  const googleBooksQueries = baseQueries
    .map(q => q.split(" ").slice(0, 3).join(" "))
    .slice(0, 3);

  const openLibraryQueries = baseQueries.slice(0, 8);

  return {
    googleBooksQueries,
    openLibraryQueries,
  };
}

/* =========================
   🔥 MODIFIED runEngine
   ========================= */

async function runEngine(engine: EngineId, input: any): Promise<RecommendationResult> {
  if (engine === "googleBooks") {
    return getGoogleBooksRecommendations({
      ...input,
      bucketPlan: {
        ...input.bucketPlan,
        queries: input.googleBooksQueries || input.bucketPlan?.queries,
      },
    });
  }

  if (engine === "openLibrary") {
    return getOpenLibraryRecommendations({
      ...input,
      bucketPlan: {
        ...input.bucketPlan,
        queries: input.openLibraryQueries || input.bucketPlan?.queries,
      },
    });
  }

  return engine === "kitsu"
    ? (await import("./kitsu/kitsuMangaRecommender")).getKitsuMangaRecommendations(input)
    : (await import("./gcd/gcdGraphicNovelRecommender")).getGcdGraphicNovelRecommendations(input);
}

/* =========================
   🔥 INJECTION POINT
   ========================= */

export async function getRecommendations(input: any): Promise<RecommendationResult> {
  const bucketPlan = input.bucketPlan;

  const engineQueries = buildEngineQueries(bucketPlan);

  const routedInput = {
    ...input,
    googleBooksQueries: engineQueries.googleBooksQueries,
    openLibraryQueries: engineQueries.openLibraryQueries,
  };

  return runEngine("googleBooks", routedInput); // simplified for patch
}
