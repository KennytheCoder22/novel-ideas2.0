import { MEDIA_MANIA_AGE_BANDS } from "../../features/recommendation-games/media-mania/mediaManiaCore.mjs";
import { CASCADE_LEVELS } from "../recommendationGames/alchemistsCascade";

export type GameId = "media_mania" | "the_last_bookshop" | "the_unwritten_map" | "the_alchemists_cascade";
export type EvidenceClass =
  | "direct_item_affinity"
  | "recommendation_reasoning"
  | "semantic_vector"
  | "controlled_semantic"
  | "neutral_non_preference";
export type PlaytestFilters = {
  games: GameId[]; startDate: string; endDate: string; ageBands: string[]; libraryIds: string[]; session: string;
};
export type EventPayload = Record<string, unknown>;
export type PlaytestEvent = {
  id: string; game: GameId; sessionId: string; playerId: string; libraryId: string | null;
  ageBand: string | null; occurredAt: string; type: string; payload: EventPayload; rawSchema: string;
};
export type ReplayCheckpoint = { at: string; label: string; detail: string; options?: string[]; choice?: string };
export type GamePlaytestGameRow = ReturnType<typeof metricRow>;
export type GamePlaytestReplay = {
  session: string; game: GameId; libraryId: string | null; checkpoints: ReplayCheckpoint[];
  totalCheckpointCount: number; truncated: boolean;
};
export type GamePlaytestReport = {
  filters: PlaytestFilters;
  inventory: { events: number; sessions: number; unscopedExcludedByLibraryFilter: number; malformedRecords: number };
  games: GamePlaytestGameRow[];
  evidenceClasses: { kind: EvidenceClass; count: number; usableSignalsPerMinute: number | null }[];
  replays: GamePlaytestReplay[];
};
export type GamePlaytestStorageGap = { game: string; detail: string };
/** Full contract returned by `GET /api/game-playtest-report`, reused by the API handler and the
 * owner dashboard so neither side needs to fall back to `any`. */
export type GamePlaytestApiResponse = GamePlaytestReport & {
  status: "ok";
  storage: Record<GameId, string>;
  storageGaps: GamePlaytestStorageGap[];
  storageTruncated: GameId[];
};

export const GAME_PLAYTEST_MAX_RECORDS = 5_000;
export const DEFAULT_PLAYTEST_FILTERS: PlaytestFilters = {
  games: [], startDate: "", endDate: "", ageBands: [], libraryIds: [], session: "",
};
export const GAME_IDS: GameId[] = [
  "media_mania", "the_last_bookshop", "the_unwritten_map", "the_alchemists_cascade",
];

const EVIDENCE_CLASSES: EvidenceClass[] = [
  "direct_item_affinity", "recommendation_reasoning", "semantic_vector", "controlled_semantic", "neutral_non_preference",
];
const MAX_SESSION_DURATION_MS = 8 * 3_600_000;
const MAX_FILTER_LIBRARY_IDS = 25;
const MEDIA_MANIA_AGE_BAND_LIST: readonly string[] = MEDIA_MANIA_AGE_BANDS;

function isRecord(value: unknown): value is EventPayload {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function record(value: unknown): EventPayload {
  return isRecord(value) ? value : {};
}
function text(value: unknown, fallback = ""): string {
  return typeof value === "string" || typeof value === "number" ? String(value).slice(0, 160) : fallback;
}
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : [];
}
function numberValue(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(number) ? number : null;
}
function choiceName(value: unknown): string {
  if (isRecord(value)) return text(value.title || value.label || value.id);
  return text(value);
}
function options(value: unknown): string[] {
  return Array.isArray(value) ? value.map(choiceName).filter(Boolean) : [];
}
function payloadOptions(payload: EventPayload): string[] {
  return options(payload.presentationOrder || payload.presentedOrder || payload.presentedOptions || payload.options || payload.presentedCandidateIds);
}
function asArray(value: unknown): string[] {
  return (Array.isArray(value) ? value : text(value).split(",")).map((item) => item.trim()).filter(Boolean);
}
function validDate(value: string): string {
  if (!value) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))) throw new Error("invalid_playtest_date");
  return value;
}
export function normalizeLibraryId(value: string): string {
  return value.trim().toLowerCase();
}
export function parsePlaytestFilters(params: Record<string, unknown>): PlaytestFilters {
  const requestedGames = asArray(params.games);
  const validGames = requestedGames.filter((game): game is GameId => GAME_IDS.includes(game as GameId));
  if (requestedGames.length !== validGames.length) throw new Error("invalid_playtest_game");
  const games = [...new Set(validGames)].slice(0, GAME_IDS.length);
  const startDate = validDate(text(params.startDate));
  const endDate = validDate(text(params.endDate));
  if (startDate && endDate && startDate > endDate) throw new Error("invalid_playtest_date_range");
  if (startDate && endDate && Date.parse(`${endDate}T23:59:59Z`) - Date.parse(`${startDate}T00:00:00Z`) > 366 * 86_400_000) throw new Error("playtest_date_range_too_large");
  const session = text(params.session);
  if (session.length > 128 || !/^[a-zA-Z0-9_-]*$/.test(session)) throw new Error("invalid_playtest_session");
  const requestedLibraryIds = asArray(params.libraryIds);
  if (requestedLibraryIds.some((id) => id.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(id))) throw new Error("invalid_playtest_library");
  const libraryIds = [...new Set(requestedLibraryIds.map(normalizeLibraryId))].slice(0, MAX_FILTER_LIBRARY_IDS);
  const requestedAgeBands = asArray(params.ageBands);
  const validAgeBands = requestedAgeBands.filter((band) => MEDIA_MANIA_AGE_BAND_LIST.includes(band));
  if (requestedAgeBands.length !== validAgeBands.length) throw new Error("invalid_playtest_age_band");
  const ageBands = [...new Set(validAgeBands)].slice(0, MEDIA_MANIA_AGE_BAND_LIST.length);
  return { games, startDate, endDate, ageBands, libraryIds, session };
}
export function serializePlaytestFilters(filters: PlaytestFilters): Record<string, string> {
  return Object.fromEntries(Object.entries(filters).flatMap(([key, value]) =>
    Array.isArray(value) ? (value.length ? [[key, value.join(",")]] : []) : (value ? [[key, value]] : []),
  ));
}
/**
 * Deterministic, collision-resistant session pseudonym. Combines three independently-seeded 32-bit
 * mixing functions (96 bits total) so casual collisions across distinct sessions are effectively
 * impossible, without depending on Node's crypto module (this file is also imported client-side).
 * No direct identifier (player id, IP, etc.) is used as input beyond the opaque session id.
 */
export function pseudonym(value: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b1;
  let h3 = 5381;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 16777619);
    h2 = Math.imul(h2 ^ code, 2654435761);
    h3 = (Math.imul(h3, 33) ^ code) | 0;
  }
  return `s-${(h1 >>> 0).toString(36).padStart(7, "0")}${(h2 >>> 0).toString(36).padStart(7, "0")}${(h3 >>> 0).toString(36).padStart(7, "0")}`;
}
function median(values: number[]): number | null {
  if (!values.length) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return Math.round(ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2);
}
function percent(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Number(((numerator / denominator) * 100).toFixed(1));
}
function undoOriginalEventId(event: PlaytestEvent): string | null {
  if (event.type === "round_choice_undone") return text(event.payload.reversedEventId) || null;
  if (event.type === "choice_undone") return text(record(event.payload.originalEvidence).eventId) || null;
  return null;
}
function eventScope(event: PlaytestEvent): string {
  return `${event.game}\u001f${event.libraryId ? normalizeLibraryId(event.libraryId) : "unscoped"}\u001f${event.sessionId}`;
}
function scopedEventId(event: PlaytestEvent, id = event.id): string {
  return `${eventScope(event)}\u001f${id}`;
}
function reversedChoices(events: PlaytestEvent[]): Set<string> {
  return new Set(events.flatMap((event) => {
    const id = undoOriginalEventId(event);
    return id ? [scopedEventId(event, id)] : [];
  }));
}
function eventEvidence(event: PlaytestEvent, reversed: Set<string>): EvidenceClass {
  if (event.game === "media_mania") return event.type === "round_completed" && !reversed.has(scopedEventId(event)) ? "direct_item_affinity" : "neutral_non_preference";
  if (event.game === "the_last_bookshop") return event.type === "encounter_completed" ? "recommendation_reasoning" : "neutral_non_preference";
  if (event.game === "the_unwritten_map") return event.type === "choice_made" && !reversed.has(scopedEventId(event)) ? "semantic_vector" : "neutral_non_preference";
  return event.type === "catalyst_selected"
    && event.payload.preferenceInference === "eligible_balanced_semantic_choice"
    && record(event.payload.eligibility).eligible === true
    ? "controlled_semantic" : "neutral_non_preference";
}
function eventDetail(event: PlaytestEvent, fallback: string): string {
  const scenario = text(event.payload.scenarioId || event.payload.levelId || record(event.payload.gameContext).customerRole);
  return scenario ? `${fallback} · ${scenario}` : fallback;
}
function firstFamiliarityItem(payload: EventPayload): unknown {
  const actions = payload.familiarityActions;
  const first = Array.isArray(actions) ? actions[0] : null;
  return isRecord(first) ? first.item : null;
}

function allReplayCheckpoints(events: PlaytestEvent[], reversed: Set<string>): ReplayCheckpoint[] {
  const mapPresentationCounts = new Map<string, number>();
  for (const event of events) if (event.game === "the_unwritten_map" && event.type === "encounter_presented") {
    const scenario = text(event.payload.scenarioId);
    if (scenario) mapPresentationCounts.set(scenario, (mapPresentationCounts.get(scenario) || 0) + 1);
  }
  return [...events].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id)).flatMap((event) => {
    const payload = event.payload;
    if (event.game === "the_last_bookshop" && event.type === "encounter_completed") {
      const context = record(payload.gameContext);
      const presented = strings(payload.presentedCandidateIds);
      const selected = strings(payload.selectedOrder || payload.selectedCandidateIds);
      const charm = strings(payload.reasonTags)[0];
      return [{
        at: event.occurredAt, label: "Visitor encounter resolved",
        detail: `Visitor ${text(context.customerRole || context.customerId, "unknown")} · scenario ${text(payload.scenarioId)} · shelf six${presented.length ? ` (${presented.join(", ")})` : ""} · selected ${selected.join(" → ")} · predicted ${text(payload.predictedCustomerChoiceId)} · ${charm ? `Pitch Charm ${charm} · ` : ""}confidence ${text(payload.confidence)} · chose ${text(payload.simulatedCustomerChoiceId)} · ${record(payload.outcome).predictionCorrect === true ? "prediction correct" : "prediction missed"}`,
        options: presented.length ? presented : payloadOptions(payload), choice: selected.join(" → "),
      }];
    }
    if (event.type === "round_presented" || event.type === "encounter_presented" || event.type === "catalyst_presented" || event.type === "board_presented") {
      const extra = event.type === "catalyst_presented" ? ` · eligibility ${record(payload.eligibility).eligible === true ? "balanced" : "not balanced"}` : "";
      const mapScenario = text(payload.scenarioId);
      const label = event.type === "board_presented" ? "Level board presented"
        : event.type === "encounter_presented" && mapPresentationCounts.get(mapScenario)! > 1 ? "Encounter revisited"
          : "Options presented";
      return [{ at: event.occurredAt, label, detail: `${eventDetail(event, event.game.replaceAll("_", " "))}${extra}`, options: payloadOptions(payload) }];
    }
    if (event.type === "round_completed" || event.type === "choice_made" || event.type === "catalyst_selected") {
      const choice = choiceName(payload.selectedItem || payload.chosenOption || payload.selectedOption);
      const response = numberValue(payload.responseTimeMs);
      const order = payload.selectedSlot != null ? ` · option ${text(payload.selectedSlot)}` : "";
      const vector = event.game === "the_unwritten_map"
        ? Object.entries(record(payload.chosenOption).tasteVector || {}).map(([axis, weight]) => `${axis}:${text(weight)}`).join(", ")
        : "";
      return [{ at: event.occurredAt, label: reversed.has(scopedEventId(event)) ? "Choice later undone" : "Choice", detail: `${eventDetail(event, event.type === "round_completed" ? `${text(payload.roundType)} round` : event.game.replaceAll("_", " "))}${order}${vector ? ` · vector ${vector}` : ""}${response == null ? "" : ` · ${Math.round(response / 1000)}s`}`, choice, options: payloadOptions(payload) }];
    }
    if (event.type === "choice_undone") return [{ at: event.occurredAt, label: "Undo checkpoint", detail: `Restored ${text(payload.scenarioId, "encounter")} · reversed ${text(record(payload.originalEvidence).eventId, "unrecorded evidence")}` }];
    if (event.type === "round_choice_undone") return [{ at: event.occurredAt, label: "Undo checkpoint", detail: `Reversed ${text(payload.reversedEventId, "previous round")}` }];
    if (event.type === "candidate_marked_unknown") {
      const replacedName = choiceName(firstFamiliarityItem(payload)) || text(payload.replacedCandidateId, "candidate");
      const replacementName = choiceName(payload.replacementItem) || "a new candidate";
      return [{ at: event.occurredAt, label: "Unknown replacement", detail: `${replacedName} marked unknown → replaced with ${replacementName}.` }];
    }
    if (event.type === "basis_marked_unknown") {
      const replacedName = choiceName(firstFamiliarityItem(payload)) || "basis item";
      const replacementBasis = options(record(payload.replacementRound).basisItems).join(", ") || "a new basis";
      return [{ at: event.occurredAt, label: "Unknown replacement", detail: `${replacedName} marked unknown → new round built from ${replacementBasis}.` }];
    }
    if (event.type === "source_unlock_offered" || event.type === "source_unlock_selected" || event.type === "source_unlock_declined") {
      const offered = strings(payload.offeredMediaSources);
      const selected = event.type === "source_unlock_selected" ? text(payload.selectedMediaSource) : "";
      const outcome = event.type === "source_unlock_offered" ? "offered" : event.type === "source_unlock_selected" ? `accepted ${selected}` : "declined";
      return [{ at: event.occurredAt, label: "Source unlock", detail: `${outcome}${offered.length ? ` · options ${offered.join(", ")}` : ""}`, options: offered, choice: selected || undefined }];
    }
    if (event.type === "encounter_skipped" || event.type === "catalyst_skipped") return [{ at: event.occurredAt, label: "Neutral skip", detail: `${eventDetail(event, "No preference signal recorded.")} · ${text(payload.skipMeaning || payload.preferenceInference)}` }];
    if (event.type === "move_applied" || event.type === "cascade_resolved" || event.type === "dead_board_reshuffled" || event.type === "level_retried") return [{ at: event.occurredAt, label: event.type.replaceAll("_", " "), detail: eventDetail(event, "Gameplay milestone") }];
    if (event.type === "session_exited" || event.type === "level_failed") return [{ at: event.occurredAt, label: event.type === "level_failed" ? "Level failed" : "Session exited", detail: eventDetail(event, "Incomplete exit") }];
    if (event.type === "session_completed" || event.type === "level_completed" || event.type === "level_started") return [{ at: event.occurredAt, label: event.type.replaceAll("_", " "), detail: eventDetail(event, event.type === "level_completed" ? `${text(payload.stars, "0")} stars` : "Lifecycle milestone") }];
    return [];
  });
}
export function buildReplay(events: PlaytestEvent[]): ReplayCheckpoint[] {
  return allReplayCheckpoints(events, reversedChoices(events)).slice(-80);
}

function sessionGroups(events: PlaytestEvent[]): PlaytestEvent[][] {
  const groups = new Map<string, PlaytestEvent[]>();
  for (const event of events) {
    const key = eventScope(event);
    groups.set(key, [...(groups.get(key) || []), event]);
  }
  return [...groups.values()];
}
function ordered(events: PlaytestEvent[]): PlaytestEvent[] {
  return [...events].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id));
}
function validInterval(start: number, end: number): number | null {
  const duration = end - start;
  return duration > 0 && duration <= MAX_SESSION_DURATION_MS ? duration : null;
}
/** Count only explicitly closed visits. A later start/continue supersedes an unclosed visit. */
function activeSessionDuration(session: PlaytestEvent[]): number | null {
  let startedAt: number | null = null;
  const intervals: number[] = [];
  for (const event of ordered(session)) {
    const at = Date.parse(event.occurredAt);
    if (!Number.isFinite(at)) continue;
    if (event.type === "session_started" || event.type === "session_continued") startedAt = at;
    if ((event.type === "session_exited" || event.type === "session_completed") && startedAt != null) {
      const duration = validInterval(startedAt, at);
      if (duration != null) intervals.push(duration);
      startedAt = null;
    }
  }
  return intervals.length ? intervals.reduce((sum, duration) => sum + duration, 0) : null;
}
type CascadeAttempt = {
  start: PlaytestEvent; levelId: string; attempt: number; outcome: PlaytestEvent | null;
};
function cascadeAttempts(events: PlaytestEvent[]): CascadeAttempt[] {
  const attempts: CascadeAttempt[] = [];
  const active = new Map<string, CascadeAttempt>();
  const latestAttempt = new Map<string, number>();
  for (const event of ordered(events)) {
    const levelId = text(event.payload.levelId);
    if (!levelId) continue;
    const key = `${eventScope(event)}\u001f${levelId}`;
    if (event.type === "level_started" || event.type === "level_retried") {
      const attempt = numberValue(event.payload.attempt) ?? (event.type === "level_started" ? 1 : (latestAttempt.get(key) || 0) + 1);
      const current = { start: event, levelId, attempt, outcome: null };
      attempts.push(current);
      active.set(key, current);
      latestAttempt.set(key, attempt);
    } else if ((event.type === "level_completed" || event.type === "level_failed") && active.has(key)) {
      const current = active.get(key)!;
      current.outcome = event;
      active.delete(key);
    }
  }
  return attempts;
}
function cascadeAttemptDuration(attempt: CascadeAttempt): number | null {
  if (!attempt.outcome) return null;
  return validInterval(Date.parse(attempt.start.occurredAt), Date.parse(attempt.outcome.occurredAt));
}
function activeDurations(game: GameId, events: PlaytestEvent[]): number[] {
  if (game === "the_last_bookshop") return [];
  if (game === "the_alchemists_cascade") return cascadeAttempts(events)
    .map(cascadeAttemptDuration).filter((duration): duration is number => duration != null);
  return sessionGroups(events).map(activeSessionDuration).filter((duration): duration is number => duration != null);
}
function efficiencyDuration(classEvents: PlaytestEvent[], sessionEvents: PlaytestEvent[]): number | null {
  const durations: number[] = [];
  for (const game of GAME_IDS) {
    const gameEvents = sessionEvents.filter((event) => event.game === game);
    const gameClassEvents = classEvents.filter((event) => event.game === game);
    if (!gameClassEvents.length) continue;
    if (game === "the_last_bookshop") {
      durations.push(...gameClassEvents.map((event) => numberValue(event.payload.responseTimeMs))
        .filter((duration): duration is number => duration != null && duration >= 0));
      continue;
    }
    const relevantScopes = new Set(gameClassEvents.map(eventScope));
    durations.push(...activeDurations(game, gameEvents.filter((event) => relevantScopes.has(eventScope(event)))));
  }
  return durations.length ? durations.reduce((sum, duration) => sum + duration, 0) : null;
}
function records(value: unknown): EventPayload[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}
function topEntryLabel(counts: Map<string, number>): string | null {
  const top = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
  return top ? `${top[0]} ×${top[1]}` : null;
}
function distributionLabel(counts: Map<string, number>): string | null {
  return [...counts.entries()].sort((left, right) => right[1] - left[1]).map(([key, count]) => `${key}:${count}`).join(", ") || null;
}
/** Counts undo events that immediately follow (the very next event, chronologically, within the
 * same session) the action they reverse — a strong signal of an accidental or reflexive tap rather
 * than a considered change of mind. */
function immediatelyReversedCount(sessions: PlaytestEvent[][]): number {
  let count = 0;
  for (const session of sessions) {
    const ordered = [...session].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id));
    const indexById = new Map(ordered.map((event, index) => [event.id, index]));
    for (let index = 0; index < ordered.length; index += 1) {
      const targetId = undoOriginalEventId(ordered[index]);
      const targetIndex = targetId == null ? undefined : indexById.get(targetId);
      if (targetIndex != null && index === targetIndex + 1) count += 1;
    }
  }
  return count;
}
function signedVectorDistribution(vectors: EventPayload[]): string | null {
  const totals = new Map<string, number>();
  for (const vector of vectors) for (const [axis, weight] of Object.entries(vector)) {
    totals.set(axis, (totals.get(axis) || 0) + (numberValue(weight) || 0));
  }
  return [...totals.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([axis, total]) => `${axis}:${total > 0 ? "+" : ""}${total}`).join(", ") || null;
}
function metricRow(game: GameId, events: PlaytestEvent[], reversed: Set<string>) {
  const sessions = sessionGroups(events);
  const canTrackSessionStarts = game === "media_mania" || game === "the_unwritten_map";
  const lifecycleCompletable = game === "the_unwritten_map";
  const hasSessionLifecycleEvents = game !== "the_last_bookshop";
  const starts = sessions.filter((session) => session.some((event) => event.type === "session_started"));
  const completed = sessions.filter((session) => session.some((event) => event.type === "session_completed"));
  const explicitExits = sessions.filter((session) => session.some((event) => event.type === "session_exited"));
  const inferredIncomplete = sessions.filter((session) => lifecycleCompletable
    && session.some((event) => event.type === "session_started" || event.type === "session_continued")
    && !session.some((event) => event.type === "session_completed" || event.type === "session_exited"));
  const points = new Map<string, number>();
  for (const session of explicitExits) {
    const exit = session.filter((event) => event.type === "session_exited").sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)).at(-1);
    const point = text(exit?.payload.levelId || exit?.payload.roundNumber || exit?.payload.scenarioId || record(exit?.payload.explorationContext).regionId) || null;
    if (point) points.set(point, (points.get(point) || 0) + 1);
  }
  const topExit = [...points.entries()].sort((left, right) => right[1] - left[1])[0];
  const evidence = events.filter((event) => eventEvidence(event, reversed) !== "neutral_non_preference");
  const continuations = events.filter((event) => event.type === "session_continued").length;
  const details: Record<string, number | string | null> = {};
  const resumeRate = hasSessionLifecycleEvents
    ? percent(continuations, sessions.length)
    : "Unavailable: Bookshop records only completed encounters, not session lifecycle events.";
  if (game === "media_mania") {
    const completedRounds = events.filter((event) => event.type === "round_completed" && !reversed.has(scopedEventId(event)));
    details.likeRounds = completedRounds.filter((event) => event.payload.roundType === "LIKE").length;
    details.dislikeRounds = completedRounds.filter((event) => event.payload.roundType === "DISLIKE").length;
    details.completedRounds = completedRounds.length;
    const candidateUnknown = events.filter((event) => event.type === "candidate_marked_unknown");
    const basisUnknown = events.filter((event) => event.type === "basis_marked_unknown");
    details.unknownItemCount = candidateUnknown.length;
    details.unknownItemRate = percent(candidateUnknown.length, completedRounds.length + candidateUnknown.length);
    details.replacementCount = basisUnknown.length;
    details.replacementRate = percent(basisUnknown.length, completedRounds.length + basisUnknown.length);
    // Count distinct cross-media rounds via round_completed only; round_presented carries the same
    // flag and would otherwise double-count every cross-media round.
    const crossMediaRounds = new Set(completedRounds.filter((event) => event.payload.isCrossMedia === true).map((event) => text(event.payload.roundId) || event.id));
    details.crossMediaRounds = crossMediaRounds.size;
    details.crossMediaRoundRate = percent(crossMediaRounds.size, completedRounds.length);
    const unlockAccepted = events.filter((event) => event.type === "source_unlock_selected").length;
    const unlockDeclined = events.filter((event) => event.type === "source_unlock_declined").length;
    details.unlockOffered = events.filter((event) => event.type === "source_unlock_offered").length;
    details.unlockAccepted = unlockAccepted;
    details.unlockDeclined = unlockDeclined;
    details.unlockAcceptanceRate = percent(unlockAccepted, unlockAccepted + unlockDeclined);
    const undo = events.filter((event) => event.type === "round_choice_undone").length;
    details.undo = undo;
    details.undoRate = percent(undo, completedRounds.length + undo);
    const scores = completedRounds.map((event) => numberValue(event.payload.tasteScoreAfter)).filter((value): value is number => value != null);
    details.scoreProgressionMin = scores.length ? Math.min(...scores) : null;
    details.scoreProgressionMax = scores.length ? Math.max(...scores) : null;
    const finalScoresBySession = sessions.map((session) => {
      const lastRound = session.filter((event) => event.type === "round_completed" && !reversed.has(scopedEventId(event)))
        .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)).at(-1);
      return lastRound ? numberValue(lastRound.payload.tasteScoreAfter) : null;
    }).filter((value): value is number => value != null);
    details.scoreProgressionMedianFinal = median(finalScoresBySession);
    const unknownCombos = new Map<string, number>();
    for (const event of candidateUnknown) {
      const replaced = records(event.payload.candidates).find((item) => item.id === event.payload.replacedCandidateId);
      const source = replaced ? text(replaced.mediaSource || replaced.source, "unknown-source") : "unknown-source";
      unknownCombos.set(`${text(event.payload.replacedCandidateId, "unknown-candidate")} (${source})`, (unknownCombos.get(`${text(event.payload.replacedCandidateId, "unknown-candidate")} (${source})`) || 0) + 1);
    }
    details.topUnknownCandidateSource = topEntryLabel(unknownCombos);
    details.progressionDepth = events.reduce((max, event) => Math.max(max, numberValue(event.payload.roundNumber) || 0), 0);
    details.retriesOrFailures = "Unavailable: Media Mania has no retry or failure events.";
    details.immediatelyReversed = immediatelyReversedCount(sessions);
    details.resumeRate = resumeRate;
  } else if (game === "the_last_bookshop") {
    const encounters = events.filter((event) => event.type === "encounter_completed");
    details.completedEncounters = encounters.length;
    const violated = encounters.filter((event) => strings(record(event.payload.outcome).boundaryViolations).length > 0);
    details.boundaryViolationCount = encounters.reduce((sum, event) => sum + strings(record(event.payload.outcome).boundaryViolations).length, 0);
    details.boundaryViolationRate = percent(violated.length, encounters.length);
    details.predictionAccuracy = percent(encounters.filter((event) => record(event.payload.outcome).predictionCorrect === true).length, encounters.length);
    const byConfidence = new Map<string, { correct: number; total: number }>();
    for (const event of encounters) {
      const level = text(event.payload.confidence, "unknown");
      const bucket = byConfidence.get(level) || { correct: 0, total: 0 };
      bucket.total += 1;
      if (record(event.payload.outcome).predictionCorrect === true) bucket.correct += 1;
      byConfidence.set(level, bucket);
    }
    for (const level of ["low", "medium", "high"] as const) {
      const bucket = byConfidence.get(level);
      details[`predictionAccuracyConfidence_${level}`] = bucket ? percent(bucket.correct, bucket.total) : "Unavailable: no encounters recorded at this confidence level.";
    }
    const charmCounts = new Map<string, number>();
    for (const event of encounters) for (const tag of strings(event.payload.reasonTags)) charmCounts.set(tag, (charmCounts.get(tag) || 0) + 1);
    details.pitchCharmDistribution = distributionLabel(charmCounts);
    const slateKeys = encounters.map((event) => [...strings(event.payload.selectedOrder || event.payload.selectedCandidateIds)].sort().join(","));
    details.diverseSlateRate = percent(new Set(slateKeys).size, slateKeys.length);
    details.repeatedSlateRate = percent(slateKeys.length - new Set(slateKeys).size, slateKeys.length);
    details.meanSlateDiversity = encounters.length ? Number((encounters.reduce((sum, event) => sum + (numberValue(record(event.payload.outcome).selectionDiversity) || 0), 0) / encounters.length).toFixed(2)) : null;
    const renownEarned = encounters.map((event) => numberValue(record(event.payload.outcome).reputationEarned)).filter((value): value is number => value != null);
    details.renownEarnedTotal = renownEarned.length ? renownEarned.reduce((sum, value) => sum + value, 0) : 0;
    details.renownProgressionMedian = median(renownEarned);
    details.progressionDepth = encounters.reduce((max, event) => Math.max(max, numberValue(record(event.payload.gameContext).night) || 0), 0);
    details.shelfVsCounterSplit = "Unavailable: Bookshop records one combined encounter event; shelf-viewing and counter-selection are not separately timestamped.";
    details.sessionTime = "Unavailable: Bookshop records encounter response time, not session lifecycle.";
    details.abandonmentByNightOrEncounter = "Unavailable: Bookshop has no exit or session lifecycle events to attribute abandonment to a night or encounter.";
    details.retriesOrFailures = "Unavailable: Bookshop has no retry or failure events.";
    details.immediatelyReversed = "Unavailable: Bookshop has no undo events.";
    details.resumeRate = resumeRate;
  } else if (game === "the_unwritten_map") {
    const choices = events.filter((event) => event.type === "choice_made" && !reversed.has(scopedEventId(event)));
    const skips = events.filter((event) => event.type === "encounter_skipped" && !reversed.has(scopedEventId(event)));
    const undo = events.filter((event) => event.type === "choice_undone").length;
    details.discovered = events.reduce((max, event) => Math.max(max, numberValue(record(event.payload.explorationContext).discoveredCount) || 0), 0);
    details.completed = choices.length;
    details.skips = skips.length;
    details.skipRate = percent(skips.length, choices.length + skips.length);
    details.undo = undo;
    details.undoRate = percent(undo, choices.length + skips.length + undo);
    const presented = events.filter((event) => event.type === "encounter_presented");
    const revisits = Math.max(0, presented.length - new Set(presented.map((event) => text(event.payload.scenarioId)).filter(Boolean)).size);
    details.revisits = revisits;
    details.revisitRate = percent(revisits, presented.length);
    const regionCounts = new Map<string, number>();
    for (const event of choices) {
      const region = text(record(event.payload.explorationContext).regionId);
      if (region) regionCounts.set(region, (regionCounts.get(region) || 0) + 1);
    }
    details.regions = regionCounts.size;
    details.regionDistribution = distributionLabel(regionCounts);
    const axes = new Map<string, number>();
    for (const event of choices) for (const axis of Object.keys(record(event.payload.chosenOption).tasteVector || {})) axes.set(axis, (axes.get(axis) || 0) + 1);
    details.axisCoverage = axes.size;
    details.axisDistribution = distributionLabel(axes);
    details.axisSignedDistribution = signedVectorDistribution(choices.map((event) => record(record(event.payload.chosenOption).tasteVector)));
    const latencyCounts = new Map<string, number>();
    for (const event of [...choices, ...skips]) {
      const latency = text(event.payload.latencyCategory);
      if (latency) latencyCounts.set(latency, (latencyCounts.get(latency) || 0) + 1);
    }
    details.latencyCategoryDistribution = distributionLabel(latencyCounts);
    details.progressionDepth = details.discovered;
    details.retriesOrFailures = "Unavailable: The Unwritten Map has no retry or failure events; skip and undo are captured separately.";
    details.immediatelyReversed = immediatelyReversedCount(sessions);
    details.resumeRate = resumeRate;
    details.movement = "Excluded: movement is never taste.";
  } else {
    const levelAttempts = cascadeAttempts(events);
    const levelsStartedEvents = events.filter((event) => event.type === "level_started");
    const resolvedAttempts = levelAttempts.filter((attempt) => attempt.outcome);
    const completedAttempts = resolvedAttempts.filter((attempt) => attempt.outcome?.type === "level_completed");
    const failedAttempts = resolvedAttempts.filter((attempt) => attempt.outcome?.type === "level_failed");
    const levelsCompletedEvents = completedAttempts.map((attempt) => attempt.outcome!);
    const levelsFailedEvents = failedAttempts.map((attempt) => attempt.outcome!);
    const levelRetries = events.filter((event) => event.type === "level_retried").length;
    details.levelsStarted = levelsStartedEvents.length;
    details.levelAttempts = levelAttempts.length;
    details.levelsCompleted = levelsCompletedEvents.length;
    details.levelsFailed = levelsFailedEvents.length;
    details.levelAttemptCompletionRate = percent(completedAttempts.length, levelAttempts.length);
    details.levelAttemptFailureRate = percent(failedAttempts.length, levelAttempts.length);
    details.levelRetries = levelRetries;
    details.levelRetryRate = percent(levelRetries, levelAttempts.length);
    const moves = events.filter((event) => event.type === "move_applied").length;
    details.moves = moves;
    details.invalidMoves = events.filter((event) => event.type === "move_invalid").length;
    const cascadesResolved = events.filter((event) => event.type === "cascade_resolved").length;
    details.cascades = cascadesResolved;
    details.cascadeActivityRate = percent(cascadesResolved, moves);
    const cascadeDepths = events
      .filter((event) => (event.type === "move_applied" || event.type === "cascade_resolved") && Array.isArray(event.payload.cascadeSteps))
      .map((event) => (event.payload.cascadeSteps as unknown[]).length);
    details.meanCascadeDepth = cascadeDepths.length ? Number((cascadeDepths.reduce((sum, value) => sum + value, 0) / cascadeDepths.length).toFixed(2)) : null;
    details.deadBoardReshuffles = events.filter((event) => event.type === "dead_board_reshuffled").length;
    const movesUsedPerCompletedLevel = levelsCompletedEvents.map((event) => {
      const config = CASCADE_LEVELS.find((level) => level.id === text(event.payload.levelId));
      const remaining = numberValue(event.payload.movesRemaining);
      return config && remaining != null ? config.moves - remaining : null;
    }).filter((value): value is number => value != null);
    details.movesUsedPerCompletedLevelMedian = median(movesUsedPerCompletedLevel);
    const starCounts = new Map<string, number>();
    for (const event of levelsCompletedEvents) {
      const stars = text(event.payload.stars, "unknown");
      starCounts.set(stars, (starCounts.get(stars) || 0) + 1);
    }
    details.starsDistribution = distributionLabel(starCounts);
    const catalystPresented = events.filter((event) => event.type === "catalyst_presented");
    const catalystSelected = events.filter((event) => event.type === "catalyst_selected");
    const catalystSkipped = events.filter((event) => event.type === "catalyst_skipped");
    details.catalystPresented = catalystPresented.length;
    details.catalystSelected = catalystSelected.length;
    details.catalystSkipped = catalystSkipped.length;
    details.catalystSelectRate = percent(catalystSelected.length, catalystPresented.length);
    details.catalystSkipRate = percent(catalystSkipped.length, catalystPresented.length);
    details.mechanicallyEligibleCatalysts = catalystPresented.filter((event) => record(event.payload.eligibility).eligible === true).length;
    details.validatedEligibleCatalysts = events.filter((event) => eventEvidence(event, reversed) === "controlled_semantic").length;
    details.semanticAxisSignedDistribution = signedVectorDistribution(
      events.filter((event) => eventEvidence(event, reversed) === "controlled_semantic").map((event) => record(record(event.payload.selectedOption).tasteVector)),
    );
    details.progressionDepth = events.reduce((max, event) => {
      const config = CASCADE_LEVELS.find((level) => level.id === text(event.payload.levelId));
      return config ? Math.max(max, config.number) : max;
    }, 0);
    const incompleteLevels = new Map<string, number>();
    for (const attempt of levelAttempts.filter((attempt) => !attempt.outcome)) {
      const config = CASCADE_LEVELS.find((level) => level.id === attempt.levelId);
      const key = config ? `${attempt.levelId} (${config.realmId})` : attempt.levelId;
      incompleteLevels.set(key, (incompleteLevels.get(key) || 0) + 1);
    }
    details.incompleteLevelAttempts = [...incompleteLevels.values()].reduce((sum, value) => sum + value, 0);
    details.abandonmentByLevelOrRealm = topEntryLabel(incompleteLevels);
    details.retriesOrFailures = `${levelRetries} retries / ${levelsFailedEvents.length} failures`;
    details.immediatelyReversed = "Unavailable: The Alchemist's Cascade has no undo events.";
    details.resumeRate = resumeRate;
    details.gameplay = "Excluded: ordinary gameplay is never taste.";
  }
  return {
    game,
    sessionsStarted: canTrackSessionStarts ? starts.length : null,
    sessionsObserved: sessions.length,
    sessionsCompleted: lifecycleCompletable ? completed.length : null,
    completionRate: lifecycleCompletable && starts.length > 0 ? percent(completed.length, starts.length) : null,
    medianDurationMs: median(activeDurations(game, events)),
    medianDecisionMs: median(events.map((event) => numberValue(event.payload.responseTimeMs)).filter((value): value is number => value != null)),
    longPauses: events.filter((event) => event.payload.latencyCategory === "returned" || event.payload.timingBucket === "returned").length,
    continuations: hasSessionLifecycleEvents ? continuations : null,
    exits: hasSessionLifecycleEvents ? explicitExits.length : null,
    exitPoint: hasSessionLifecycleEvents && topExit ? `${topExit[0]} (${topExit[1]})` : null,
    usableSignals: evidence.length,
    details: {
      ...details,
      explicitExits: hasSessionLifecycleEvents ? explicitExits.length : null,
      inferredIncompleteObservedSessions: lifecycleCompletable ? inferredIncomplete.length : null,
    },
  };
}
export function buildPlaytestReport(events: PlaytestEvent[], filters: PlaytestFilters, malformedRecords = 0): GamePlaytestReport {
  const deduped = [...events].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id))
    .filter((event, index, all) => all.findIndex((candidate) =>
      eventScope(candidate) === eventScope(event)
      && candidate.id === event.id,
    ) === index);
  const reversed = reversedChoices(deduped);
  const normalizedLibraries = new Set(filters.libraryIds.map(normalizeLibraryId));
  const filtered = deduped.filter((event) => {
    const date = event.occurredAt.slice(0, 10);
    return (!filters.games.length || filters.games.includes(event.game))
      && (!filters.startDate || date >= filters.startDate) && (!filters.endDate || date <= filters.endDate)
      && (!filters.ageBands.length || Boolean(event.ageBand && filters.ageBands.includes(event.ageBand)))
      && (!filters.libraryIds.length || Boolean(event.libraryId && normalizedLibraries.has(normalizeLibraryId(event.libraryId))))
      && (!filters.session || pseudonym(event.sessionId) === filters.session);
  });
  const evidenceClasses = EVIDENCE_CLASSES.map((kind) => {
    const classEvents = filtered.filter((event) => eventEvidence(event, reversed) === kind);
    const duration = kind === "neutral_non_preference" ? null : efficiencyDuration(classEvents, filtered);
    return { kind, count: classEvents.length, usableSignalsPerMinute: duration && duration > 0 ? Number((classEvents.length / (duration / 60_000)).toFixed(3)) : null };
  });
  const sessions = new Map<string, PlaytestEvent[]>();
  for (const event of filtered) {
    const key = `${event.game}:${event.libraryId || "unscoped"}:${event.sessionId}`;
    sessions.set(key, [...(sessions.get(key) || []), event]);
  }
  return {
    filters,
    inventory: { events: filtered.length, sessions: sessions.size, malformedRecords, unscopedExcludedByLibraryFilter: filters.libraryIds.length ? deduped.filter((event) => !event.libraryId).length : 0 },
    games: GAME_IDS.filter((game) => !filters.games.length || filters.games.includes(game)).map((game) => metricRow(game, filtered.filter((event) => event.game === game), reversed)),
    evidenceClasses,
    replays: [...sessions.values()].sort((left, right) => left[0].sessionId.localeCompare(right[0].sessionId)).slice(0, 100).map((sessionEvents) => {
      const checkpoints = allReplayCheckpoints(sessionEvents, reversed);
      return {
        session: pseudonym(sessionEvents[0].sessionId), game: sessionEvents[0].game, libraryId: sessionEvents[0].libraryId,
        checkpoints: checkpoints.slice(-80), totalCheckpointCount: checkpoints.length, truncated: checkpoints.length > 80,
      };
    }),
  };
}
