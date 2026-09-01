export const MEDIA_MANIA_GAME_ID = "media_mania";
export const MEDIA_MANIA_GAME_VERSION = 1;
export const MEDIA_MANIA_EVENT_SCHEMA_VERSION = "media_mania_event_v2";
export const MEDIA_MANIA_STATE_SCHEMA_VERSION = "media_mania_state_v1";
export const MEDIA_MANIA_UNLOCK_SCORE = 60;
export const MEDIA_MANIA_SOURCES = Object.freeze(["books", "movies", "tv", "games", "youtube", "anime", "podcasts"]);
export const MEDIA_MANIA_SOURCE_LABELS = Object.freeze({ books: "Books", movies: "Movies", tv: "TV", games: "Games", youtube: "YouTube", anime: "Anime", podcasts: "Podcasts" });
export const MEDIA_MANIA_AGE_BANDS = Object.freeze(["kids", "preteens", "teens", "adults"]);
export const MEDIA_MANIA_AGE_BAND_LABELS = Object.freeze({ kids: "Kids", preteens: "Pre-Teens", teens: "Teens", adults: "Adults" });
export const MEDIA_MANIA_SCORE_RULES = Object.freeze({ like: 10, dislike: 12, crossMediaBonus: 3, unfamiliarity: 0 });

const CANDIDATE_COUNT = 3;
const CONTEXT_COUNT = 2;
const STRATEGY_ID = "trait_neighborhood_mix_v1";
const unique = (values) => [...new Set(values)];
const snap = (item) => ({ id: item.id, source: item.source, mediaSource: item.mediaSource, title: item.title, creator: item.creator || "" });
const byId = (catalog, id) => catalog.find((item) => item.id === id) || null;
const randomIndex = (length, random) => length ? Math.min(length - 1, Math.floor(random() * length)) : -1;

function shuffle(values, random) {
  const result = values.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1, random);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function assertSource(source) {
  if (!MEDIA_MANIA_SOURCES.includes(source)) throw new Error(`Unsupported Media Mania source: ${source}`);
}

function assertAgeBand(ageBand) {
  if (!MEDIA_MANIA_AGE_BANDS.includes(ageBand)) throw new Error(`Unsupported Media Mania age band: ${ageBand}`);
}

export function eligibleMediaManiaCatalog(catalog, ageBand) {
  assertAgeBand(ageBand);
  return catalog.filter((item) => Array.isArray(item.ageBands) && item.ageBands.includes(ageBand));
}

export function availableMediaManiaSources(catalog, ageBand) {
  const eligibleCatalog = eligibleMediaManiaCatalog(catalog, ageBand);
  return MEDIA_MANIA_SOURCES.filter((source) => eligibleCatalog.filter((item) => item.mediaSource === source).length >= 4);
}

function validateCatalog(catalog, sources, ageBand) {
  const availableSources = availableMediaManiaSources(catalog, ageBand);
  for (const source of sources) {
    if (!availableSources.includes(source)) throw new Error(`Media Mania needs at least four ${source} items for ${ageBand}.`);
  }
}

function overlap(item, basis) {
  const traits = new Set(item.traitKeys || []);
  return basis.reduce((total, basisItem) => total + (basisItem.traitKeys || []).filter((trait) => traits.has(trait)).length, 0);
}

function poolFor(state, catalog, basis, extraExcluded = []) {
  const excluded = new Set([...basis.map((item) => item.id), ...state.positiveItemIds, ...state.negativeItemIds, ...extraExcluded]);
  return eligibleMediaManiaCatalog(catalog, state.ageBand).filter((item) => state.activeSources.includes(item.mediaSource) && !excluded.has(item.id));
}

function chooseCandidates(state, catalog, basis, random, extraExcluded = []) {
  const pool = poolFor(state, catalog, basis, extraExcluded);
  const familiar = pool.filter((item) => state.familiarItemIds.includes(item.id));
  const preferred = familiar.length >= CANDIDATE_COUNT ? familiar : pool;
  const neighborhood = preferred
    .map((item) => ({ item, score: overlap(item, basis) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((entry) => entry.item);
  const chosen = [];
  if (state.activeSources.length > 1) {
    for (const source of state.activeSources) {
      const sourcePool = neighborhood.filter((item) => item.mediaSource === source && !chosen.some((choice) => choice.id === item.id));
      if (!sourcePool.length) {
        sourcePool.push(...preferred.filter((item) => item.mediaSource === source && !chosen.some((choice) => choice.id === item.id)));
      }
      if (!sourcePool.length) {
        sourcePool.push(...pool.filter((item) => item.mediaSource === source && !chosen.some((choice) => choice.id === item.id)));
      }
      if (sourcePool.length) chosen.push(sourcePool[randomIndex(sourcePool.length, random)]);
    }
  }
  chosen.push(...shuffle(neighborhood.filter((item) => !chosen.some((choice) => choice.id === item.id)), random).slice(0, 3 - chosen.length));
  if (chosen.length < 3) chosen.push(...shuffle(pool.filter((item) => !chosen.some((choice) => choice.id === item.id)), random).slice(0, 3 - chosen.length));
  if (chosen.length < 3) throw new Error("Media Mania could not generate three distinct candidates.");
  return shuffle(chosen, random);
}

function makeRound(state, catalog, random, nowMs, excludedBasisIds = []) {
  validateCatalog(catalog, state.activeSources, state.ageBand);
  const eligibleCatalog = eligibleMediaManiaCatalog(catalog, state.ageBand);
  const positiveContext = state.positiveItemIds.slice(-CONTEXT_COUNT).map((id) => byId(catalog, id)).filter(Boolean);
  let basisItems = positiveContext;
  if (!basisItems.length) {
    const excluded = new Set([...state.unknownItemIds, ...excludedBasisIds]);
    const pool = eligibleCatalog.filter((item) => item.mediaSource === state.startingSource && !excluded.has(item.id));
    const familiar = pool.filter((item) => state.familiarItemIds.includes(item.id));
    const preferred = familiar.length ? familiar : pool;
    if (!preferred.length) throw new Error("Media Mania could not find a starting point.");
    basisItems = [preferred[randomIndex(preferred.length, random)]];
  }
  const candidates = chooseCandidates(state, catalog, basisItems, random);
  const roundNumber = state.completedRoundCount + 1;
  return {
    id: `${state.sessionId}:round:${roundNumber}:${nowMs}`,
    roundNumber,
    roundType: state.completedRoundCount > 0 && roundNumber % 4 === 0 ? "DISLIKE" : "LIKE",
    startedAtMs: nowMs,
    activeSources: state.activeSources.slice(),
    ageBand: state.ageBand,
    basisItems,
    visiblePositiveContext: positiveContext.map(snap),
    visibleNegativeContext: state.negativeItemIds.slice(-CONTEXT_COUNT).map((id) => byId(catalog, id)).filter(Boolean).map(snap),
    candidates,
    presentationOrder: candidates.map((item) => item.id),
    candidateStrategyId: STRATEGY_ID,
    isCrossMedia: state.activeSources.length > 1 && unique([...basisItems, ...candidates].map((item) => item.mediaSource)).length > 1,
  };
}

function baseEvent(state, action, timestampMs) {
  return {
    schemaVersion: MEDIA_MANIA_EVENT_SCHEMA_VERSION,
    gameId: MEDIA_MANIA_GAME_ID,
    gameVersion: MEDIA_MANIA_GAME_VERSION,
    eventId: `${state.sessionId}:event:${state.nextEventSequence}`,
    eventSequence: state.nextEventSequence,
    action,
    playerId: state.playerId,
    sessionId: state.sessionId,
    libraryId: state.libraryId || "default",
    startingMediaSource: state.startingSource,
    activeMediaSources: state.activeSources.slice(),
    activeAgeBand: state.ageBand,
    timestamp: new Date(timestampMs).toISOString(),
    tasteScore: state.tasteScore,
  };
}

function roundEvidence(round) {
  return {
    roundId: round.id,
    roundNumber: round.roundNumber,
    roundType: round.roundType,
    responseTimeMs: null,
    visiblePositiveContext: round.visiblePositiveContext,
    visibleNegativeContext: round.visibleNegativeContext,
    basisItems: round.basisItems.map(snap),
    candidates: round.candidates.map(snap),
    presentationOrder: round.presentationOrder.slice(),
    selectedItem: null,
    familiarityActions: [],
    candidateStrategyId: round.candidateStrategyId,
    isCrossMedia: round.isCrossMedia,
  };
}

function roundPresentedEvent(state, round, timestampMs) {
  return {
    ...baseEvent(state, "round_presented", timestampMs),
    ...roundEvidence(round),
    scoreDelta: 0,
  };
}

function withEvents(state, events, timestampMs) {
  return { ...state, nextEventSequence: state.nextEventSequence + events.length, updatedAt: new Date(timestampMs).toISOString() };
}

export function createMediaManiaState({ playerId, sessionId, libraryId = "default", ageBand = "teens", nowMs = Date.now() }) {
  if (!playerId || !sessionId) throw new Error("Media Mania requires playerId and sessionId.");
  assertAgeBand(ageBand);
  const timestamp = new Date(nowMs).toISOString();
  return {
    schemaVersion: MEDIA_MANIA_STATE_SCHEMA_VERSION, gameId: MEDIA_MANIA_GAME_ID, gameVersion: MEDIA_MANIA_GAME_VERSION,
    playerId, sessionId, libraryId, ageBand, startingSource: null, activeSources: [], positiveItemIds: [], negativeItemIds: [],
    familiarItemIds: [], unknownItemIds: [], tasteScore: 0, completedRoundCount: 0,
    unlockStatus: "locked", unlockOptions: [], currentRound: null, lastChoiceUndo: null, nextEventSequence: 1,
    createdAt: timestamp, updatedAt: timestamp,
  };
}

export function recordMediaManiaSessionStarted(state, options = {}) {
  const nowMs = options.nowMs ?? Date.now();
  const event = { ...baseEvent(state, "session_started", nowMs), scoreDelta: 0 };
  return { state: withEvents(state, [event], nowMs), events: [event] };
}

export function recordMediaManiaSessionContinued(state, options = {}) {
  const nowMs = options.nowMs ?? Date.now();
  const event = {
    ...baseEvent(state, "session_continued", nowMs),
    resumedRoundId: state.currentRound?.id || null,
    completedRoundCount: state.completedRoundCount,
    scoreDelta: 0,
  };
  return { state: withEvents(state, [event], nowMs), events: [event] };
}

export function recordMediaManiaSessionExited(state, options = {}) {
  const nowMs = options.nowMs ?? Date.now();
  const event = {
    ...baseEvent(state, "session_exited", nowMs),
    activeRoundId: state.currentRound?.id || null,
    completedRoundCount: state.completedRoundCount,
    scoreDelta: 0,
  };
  return { state: withEvents(state, [event], nowMs), events: [event] };
}

export function startMediaMania(state, source, catalog, options = {}) {
  assertSource(source);
  const random = options.random || Math.random;
  const nowMs = options.nowMs ?? Date.now();
  validateCatalog(catalog, [source], state.ageBand);
  const started = { ...state, startingSource: source, activeSources: [source] };
  const event = { ...baseEvent(started, "starting_source_selected", nowMs), selectedMediaSource: source, scoreDelta: 0 };
  const next = withEvents(started, [event], nowMs);
  const currentRound = makeRound(next, catalog, random, nowMs + 1);
  const presented = roundPresentedEvent(next, currentRound, nowMs + 1);
  return {
    state: { ...withEvents(next, [presented], nowMs + 1), currentRound },
    events: [event, presented],
  };
}

export function changeMediaManiaAgeBand(state, ageBand, catalog, options = {}) {
  assertAgeBand(ageBand);
  if (ageBand === state.ageBand) return { state, events: [] };
  const random = options.random || Math.random;
  const nowMs = options.nowMs ?? Date.now();
  const previousAgeBand = state.ageBand;
  const availableSources = availableMediaManiaSources(catalog, ageBand);
  const startingSource = availableSources.includes(state.startingSource) ? state.startingSource : null;
  const reset = {
    ...state,
    ageBand,
    startingSource,
    activeSources: startingSource ? [startingSource] : [],
    positiveItemIds: [],
    negativeItemIds: [],
    familiarItemIds: [],
    unknownItemIds: [],
    tasteScore: 0,
    completedRoundCount: 0,
    unlockStatus: "locked",
    unlockOptions: [],
    currentRound: null,
    lastChoiceUndo: null,
  };
  const event = {
    ...baseEvent(reset, "age_band_changed", nowMs),
    previousAgeBand,
    selectedAgeBand: ageBand,
    scoreDelta: 0,
  };
  let next = withEvents(reset, [event], nowMs);
  const events = [event];
  if (next.startingSource) {
    const currentRound = makeRound(next, catalog, random, nowMs + 1);
    const presented = roundPresentedEvent(next, currentRound, nowMs + 1);
    next = { ...withEvents(next, [presented], nowMs + 1), currentRound };
    events.push(presented);
  }
  return { state: next, events };
}

export function chooseMediaManiaCandidate(state, candidateId, catalog, options = {}) {
  const round = state.currentRound;
  if (!round) throw new Error("Media Mania has no active round.");
  const selected = round.candidates.find((candidate) => candidate.id === candidateId);
  if (!selected) throw new Error("Selected candidate is not in this round.");
  const random = options.random || Math.random;
  const nowMs = options.nowMs ?? Date.now();
  const isDislike = round.roundType === "DISLIKE";
  const scoreDelta = (isDislike ? MEDIA_MANIA_SCORE_RULES.dislike : MEDIA_MANIA_SCORE_RULES.like) + (round.isCrossMedia ? MEDIA_MANIA_SCORE_RULES.crossMediaBonus : 0);
  const tasteScore = state.tasteScore + scoreDelta;
  const event = {
    ...baseEvent({ ...state, tasteScore }, "round_completed", nowMs),
    ...roundEvidence(round),
    responseTimeMs: Math.max(0, nowMs - round.startedAtMs),
    selectedItem: snap(selected),
    scoreDelta,
    tasteScoreBefore: state.tasteScore,
    tasteScoreAfter: tasteScore,
    tasteScore,
  };
  const nextState = {
    ...state,
    lastChoiceUndo: {
      completedEventId: event.eventId,
      round,
      selectedItem: snap(selected),
      roundType: round.roundType,
      scoreDelta,
      priorPositiveItemIds: state.positiveItemIds.slice(),
      priorNegativeItemIds: state.negativeItemIds.slice(),
      priorFamiliarItemIds: state.familiarItemIds.slice(),
      priorTasteScore: state.tasteScore,
      priorCompletedRoundCount: state.completedRoundCount,
      priorUnlockStatus: state.unlockStatus,
      priorUnlockOptions: state.unlockOptions.slice(),
    },
    positiveItemIds: isDislike ? state.positiveItemIds.slice() : unique([...state.positiveItemIds, selected.id]),
    negativeItemIds: isDislike ? unique([...state.negativeItemIds, selected.id]) : state.negativeItemIds.slice(),
    familiarItemIds: unique([...state.familiarItemIds, ...round.basisItems.map((item) => item.id), selected.id]),
    tasteScore, completedRoundCount: state.completedRoundCount + 1, currentRound: null,
  };
  const events = [event];
  if (tasteScore >= MEDIA_MANIA_UNLOCK_SCORE && nextState.unlockStatus === "locked") {
    const eligible = availableMediaManiaSources(catalog, state.ageBand)
      .filter((source) => !nextState.activeSources.includes(source));
    nextState.unlockStatus = "offered";
    nextState.unlockOptions = shuffle(eligible, random).slice(0, 3);
    events.push({ ...baseEvent({ ...nextState, nextEventSequence: state.nextEventSequence + 1 }, "source_unlock_offered", nowMs), roundId: round.id, eligibleMediaSources: eligible, offeredMediaSources: nextState.unlockOptions.slice(), scoreDelta: 0, tasteScore });
  }
  let persisted = withEvents(nextState, events, nowMs);
  if (persisted.unlockStatus !== "offered") {
    const currentRound = makeRound(persisted, catalog, random, nowMs + 1);
    const presented = roundPresentedEvent(persisted, currentRound, nowMs + 1);
    persisted = { ...withEvents(persisted, [presented], nowMs + 1), currentRound };
    events.push(presented);
  }
  return { state: persisted, events };
}

export function markMediaManiaCandidateUnknown(state, candidateId, catalog, options = {}) {
  const round = state.currentRound;
  if (!round) throw new Error("Media Mania has no active round.");
  const candidateIndex = round.candidates.findIndex((item) => item.id === candidateId);
  if (candidateIndex < 0) throw new Error("Unknown candidate is not in this round.");
  const random = options.random || Math.random;
  const nowMs = options.nowMs ?? Date.now();
  const unknownItemIds = unique([...state.unknownItemIds, candidateId]);
  const displayed = round.candidates.map((item) => item.id);
  const replacements = poolFor({ ...state, unknownItemIds }, catalog, round.basisItems, displayed).filter((item) => !displayed.includes(item.id));
  if (!replacements.length) throw new Error("Media Mania could not replace the unknown candidate.");
  const candidates = round.candidates.slice();
  candidates[candidateIndex] = replacements[randomIndex(replacements.length, random)];
  const replacementItem = candidates[candidateIndex];
  const event = {
    ...baseEvent(state, "candidate_marked_unknown", nowMs),
    ...roundEvidence(round),
    responseTimeMs: Math.max(0, nowMs - round.startedAtMs),
    familiarityActions: [{ item: snap(round.candidates[candidateIndex]), familiarity: "unknown" }],
    replacedCandidateId: candidateId,
    replacementItem: snap(replacementItem),
    replacementPresentationOrder: candidates.map((item) => item.id),
    scoreDelta: 0,
  };
  const next = withEvents({ ...state, unknownItemIds, lastChoiceUndo: null }, [event], nowMs);
  return { state: { ...next, currentRound: { ...round, candidates, presentationOrder: candidates.map((item) => item.id) } }, events: [event] };
}

export function markMediaManiaBasisUnknown(state, basisItemId, catalog, options = {}) {
  const round = state.currentRound;
  if (!round) throw new Error("Media Mania has no active round.");
  const basis = round.basisItems.find((item) => item.id === basisItemId);
  if (!basis) throw new Error("Unknown basis item is not in this round.");
  const random = options.random || Math.random;
  const nowMs = options.nowMs ?? Date.now();
  const changed = { ...state, unknownItemIds: unique([...state.unknownItemIds, basisItemId]), lastChoiceUndo: null };
  const nextRound = makeRound(changed, catalog, random, nowMs + 1, [basisItemId]);
  const event = {
    ...baseEvent(state, "basis_marked_unknown", nowMs),
    ...roundEvidence(round),
    responseTimeMs: Math.max(0, nowMs - round.startedAtMs),
    familiarityActions: [{ item: snap(basis), familiarity: "unknown" }],
    replacementRound: roundEvidence(nextRound),
    scoreDelta: 0,
  };
  const next = withEvents(changed, [event], nowMs);
  const presented = roundPresentedEvent(next, nextRound, nowMs + 1);
  return {
    state: { ...withEvents(next, [presented], nowMs + 1), currentRound: nextRound },
    events: [event, presented],
  };
}

export function resolveMediaManiaUnlock(state, selectedSource, catalog, options = {}) {
  if (state.unlockStatus !== "offered") throw new Error("Media Mania has no pending unlock.");
  const random = options.random || Math.random;
  const nowMs = options.nowMs ?? Date.now();
  if (selectedSource !== null) {
    assertSource(selectedSource);
    if (!state.unlockOptions.includes(selectedSource)) throw new Error("Selected source was not offered.");
  }
  const accepted = selectedSource !== null;
  const nextState = { ...state, activeSources: accepted ? unique([...state.activeSources, selectedSource]) : state.activeSources.slice(), unlockStatus: accepted ? "accepted" : "declined", unlockOptions: [], lastChoiceUndo: null };
  if (accepted) validateCatalog(catalog, nextState.activeSources, state.ageBand);
  const event = { ...baseEvent(nextState, accepted ? "source_unlock_selected" : "source_unlock_declined", nowMs), offeredMediaSources: state.unlockOptions.slice(), selectedMediaSource: selectedSource, scoreDelta: 0 };
  const persisted = withEvents(nextState, [event], nowMs);
  const currentRound = makeRound(persisted, catalog, random, nowMs + 1);
  const presented = roundPresentedEvent(persisted, currentRound, nowMs + 1);
  return {
    state: { ...withEvents(persisted, [presented], nowMs + 1), currentRound },
    events: [event, presented],
  };
}

export function undoLastMediaManiaChoice(state, options = {}) {
  const undo = state.lastChoiceUndo;
  if (!undo) throw new Error("Media Mania has no choice to undo.");
  const nowMs = options.nowMs ?? Date.now();
  const restored = {
    ...state,
    positiveItemIds: undo.priorPositiveItemIds.slice(),
    negativeItemIds: undo.priorNegativeItemIds.slice(),
    familiarItemIds: undo.priorFamiliarItemIds.slice(),
    tasteScore: undo.priorTasteScore,
    completedRoundCount: undo.priorCompletedRoundCount,
    unlockStatus: undo.priorUnlockStatus,
    unlockOptions: undo.priorUnlockOptions.slice(),
    currentRound: { ...undo.round, startedAtMs: nowMs },
    lastChoiceUndo: null,
  };
  const event = {
    ...baseEvent(restored, "round_choice_undone", nowMs),
    reversedEventId: undo.completedEventId,
    roundId: undo.round.id,
    roundNumber: undo.round.roundNumber,
    roundType: undo.roundType,
    selectedItem: undo.selectedItem,
    familiarityActions: [],
    responseTimeMs: null,
    scoreDelta: -undo.scoreDelta,
    tasteScoreBefore: state.tasteScore,
    tasteScoreAfter: restored.tasteScore,
    tasteScore: restored.tasteScore,
    restoredRound: roundEvidence(restored.currentRound),
  };
  const next = withEvents(restored, [event], nowMs);
  const presented = roundPresentedEvent(next, restored.currentRound, nowMs);
  return {
    state: withEvents(next, [presented], nowMs),
    events: [event, presented],
  };
}
export function serializeMediaManiaEvent(event) {
  if (!["media_mania_event_v1", MEDIA_MANIA_EVENT_SCHEMA_VERSION].includes(event?.schemaVersion)) {
    throw new Error("Invalid Media Mania event schema.");
  }
  return JSON.stringify(event);
}

export function restoreMediaManiaState(value) {
  if (!value || value.schemaVersion !== MEDIA_MANIA_STATE_SCHEMA_VERSION) return null;
  if (value.gameId !== MEDIA_MANIA_GAME_ID || value.gameVersion !== MEDIA_MANIA_GAME_VERSION) return null;
  if (MEDIA_MANIA_AGE_BANDS.includes(value.ageBand)) {
    return { ...value, libraryId: value.libraryId || "default" };
  }
  return {
    ...value,
    libraryId: value.libraryId || "default",
    ageBand: "teens",
    startingSource: null,
    activeSources: [],
    positiveItemIds: [],
    negativeItemIds: [],
    familiarItemIds: [],
    unknownItemIds: [],
    tasteScore: 0,
    completedRoundCount: 0,
    unlockStatus: "locked",
    unlockOptions: [],
    currentRound: null,
    lastChoiceUndo: null,
  };
}
