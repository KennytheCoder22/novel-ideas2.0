// Same-origin senders for the shared game-recommendation contracts, mirroring the pattern already
// used by each game's own native-evidence sender (see e.g. `app/games/last-bookshop.tsx`'s
// `sendRecommendationGameEvent`): POST as `application/json`, treat anything other than HTTP 201
// with `{ status: "accepted" }` as a delivery failure so the durable local queue keeps the event
// for a later retry, and never throw out of the sender itself.
export type GameRecommendationHttpEnvironment = {
  isWeb: boolean;
  apiOrigin: string;
};

async function postJson(path: string, body: unknown, env: GameRecommendationHttpEnvironment): Promise<boolean> {
  if (!env.isWeb && !env.apiOrigin) return false;
  try {
    const response = await fetch(`${env.apiOrigin}${path}`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        ...(env.isWeb ? {} : { origin: env.apiOrigin }),
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    return response.status === 201 && payload?.status === "accepted";
  } catch {
    return false;
  }
}

export function sendGameRecommendationFeedbackEvent(
  event: unknown,
  env: GameRecommendationHttpEnvironment,
): Promise<boolean> {
  return postJson("/api/game-recommendation-feedback", event, env);
}

/** Best-effort only: a diagnostic delivery failure must never surface to the player or block
 * gameplay, so callers should not await this on the interactive path. */
export function sendGameRecommendationDiagnosticEvent(
  event: unknown,
  env: GameRecommendationHttpEnvironment,
): Promise<boolean> {
  return postJson("/api/game-recommendation-diagnostic", event, env);
}
