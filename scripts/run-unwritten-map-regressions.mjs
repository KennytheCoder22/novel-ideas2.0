import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  module._compile(output, filename);
};

const game = require(resolve(root, "lib/recommendationGames/unwrittenMap.ts"));
const evidence = require(resolve(root, "lib/recommendationGames/unwrittenMapEvidenceClient.ts"));

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function hashText(input) {
  let first = 2166136261;
  let second = 5381;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second, 33) ^ code;
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function resignV2(event) {
  const { eventId: _eventId, ...body } = event;
  return { ...body, eventId: `ume2-${hashText(JSON.stringify(body))}` };
}

function legacyChoiceEvent(save) {
  const body = {
    schemaVersion: game.UNWRITTEN_MAP_V1_EVENT_SCHEMA,
    gameId: "the_unwritten_map",
    gameVersion: game.UNWRITTEN_MAP_V1_GAME_VERSION,
    gameSessionId: "map-session-legacy-001",
    anonymousPlayerId: save.anonymousPlayerId,
    scenarioId: "lantern-fair",
    scenarioVersion: 1,
    occurredAt: "2025-01-01T00:00:03.000Z",
    presentedOptionIds: ["story-contest", "balcony-watch", "follow-music", "quiet-lane"],
    selectedOptionId: "story-contest",
    rejectedOptionIds: ["balcony-watch", "follow-music", "quiet-lane"],
    responseTimeMs: 4_000,
    gameContext: { mapX: 2, mapY: 1, completedScenarioCount: 0 },
  };
  return { ...body, eventId: `ume-${hashText(JSON.stringify(body))}` };
}

class MemoryStorage {
  values = new Map();
  async getItem(key) { return this.values.get(key) ?? null; }
  async setItem(key, value) { this.values.set(key, value); }
}

class CommitFaultStorage extends MemoryStorage {
  failNextCommit = true;
  async setItem(key, value) {
    if (this.failNextCommit && key.startsWith(game.UNWRITTEN_MAP_EVENT_QUEUE_KEY)) {
      const entries = JSON.parse(value);
      if (entries.some((entry) => entry.committed)) {
        this.failNextCommit = false;
        throw new Error("injected_commit_write_failure");
      }
    }
    return super.setItem(key, value);
  }
}

function baseSave(now = "2026-09-01T00:00:00.000Z") {
  return game.createInitialUnwrittenMapSave(game.createUnwrittenMapPlayerId(1_700_000_000_000, 0.25), now, "north-library");
}

function presentation(save, scenario, attempt = 1) {
  const choices = game.orderedChoices(scenario, save.anonymousPlayerId, attempt);
  return { choices, attempt };
}

function choiceEvent(save, scenario, attempt = 1, selectedSlot = 1) {
  const { choices } = presentation(save, scenario, attempt);
  return game.createChoiceMadeEvent({
    save: { ...save, position: scenario.position },
    scenario,
    presentedChoices: choices,
    selectedOptionId: choices[selectedSlot].id,
    attempt,
    gameSessionId: "map-session-test-001",
    startedAtMs: 1_000,
    nowMs: 9_000,
    occurredAt: "2026-09-01T00:00:03.000Z",
    stepsThisSession: 17,
  });
}

function reachableScenarioIds() {
  const queue = [game.UNWRITTEN_MAP_START];
  const visited = new Set([`${game.UNWRITTEN_MAP_START.x},${game.UNWRITTEN_MAP_START.y}`]);
  while (queue.length) {
    const current = queue.shift();
    for (const direction of ["up", "down", "left", "right"]) {
      const next = game.moveOnMap(current, direction);
      const key = `${next.x},${next.y}`;
      if (!visited.has(key)) {
        visited.add(key);
        queue.push(next);
      }
    }
  }
  return game.UNWRITTEN_MAP_SCENARIOS.filter((scenario) =>
    visited.has(`${scenario.position.x},${scenario.position.y}`)).map((scenario) => scenario.id);
}

async function main() {
  const checks = [];
  const routeSource = readFileSync(resolve(root, "app/games/unwritten-map.tsx"), "utf8");
  const hubSource = readFileSync(resolve(root, "app/games/index.tsx"), "utf8");
  const layoutSource = readFileSync(resolve(root, "app/_layout.tsx"), "utf8");
  const contractSource = readFileSync(resolve(root, "lib/recommendationGames/unwrittenMap.ts"), "utf8");
  const evidenceSource = readFileSync(resolve(root, "lib/recommendationGames/unwrittenMapEvidenceClient.ts"), "utf8");
  const apiSource = readFileSync(resolve(root, "api/unwritten-map-event.ts"), "utf8");

  assert(hubSource.includes("The Unwritten Map") && hubSource.includes('route: "/games/unwritten-map"'), "games hub card missing");
  assert(hubSource.includes("router.push({ pathname: game.route, params: forwardedParams }"), "games hub route/context forwarding missing");
  assert(layoutSource.includes('name="games/unwritten-map"'), "map game route is not registered");
  assert(routeSource.includes('document.title = "The Unwritten Map"'), "browser title must preserve game fiction");
  assert(routeSource.includes('router.replace({') && routeSource.includes('...(params.playerId ? { playerId: params.playerId } : {})')
    && routeSource.includes('...(params.libraryId ? { libraryId: params.libraryId } : {})'),
  "exit route must preserve active player and library scope");
  checks.push("route_and_games_hub");

  assert(game.UNWRITTEN_MAP_WIDTH >= 25 && game.UNWRITTEN_MAP_HEIGHT >= 19, "V2 overworld must be at least 25x19");
  assert(game.UNWRITTEN_MAP_TILES.length === game.UNWRITTEN_MAP_HEIGHT, "world height constant mismatch");
  assert(game.UNWRITTEN_MAP_TILES.every((row) => row.length === game.UNWRITTEN_MAP_WIDTH), "world rows must have stable width");
  assert(new Set(game.UNWRITTEN_MAP_TILES.join("")).size >= 6, "world needs distinct terrain");
  assert(reachableScenarioIds().length === game.UNWRITTEN_MAP_SCENARIOS.length, "every landmark must be reachable");
  for (const position of [
    { x: 0, y: 0 },
    game.UNWRITTEN_MAP_START,
    { x: game.UNWRITTEN_MAP_WIDTH - 1, y: game.UNWRITTEN_MAP_HEIGHT - 1 },
  ]) {
    const origin = game.cameraOrigin(position, 9, 7);
    assert(origin.x >= 0 && origin.y >= 0, "camera origin cannot be negative");
    assert(origin.x + 9 <= game.UNWRITTEN_MAP_WIDTH && origin.y + 7 <= game.UNWRITTEN_MAP_HEIGHT, "camera cannot reveal beyond world");
  }
  assert(game.samePosition(game.moveOnMap({ x: 0, y: 0 }, "left"), { x: 0, y: 0 }), "blocked movement must preserve position");
  checks.push("large_world_camera_and_movement");

  assert(game.UNWRITTEN_MAP_SCENARIOS.length >= 12, "V2 requires at least twelve encounters");
  assert(new Set(game.UNWRITTEN_MAP_SCENARIOS.map((item) => item.regionId)).size >= 5, "encounters must span multiple regions");
  assert(new Set(game.UNWRITTEN_MAP_SCENARIOS.map((item) => item.type)).size >= 5, "encounters must span multiple types");
  const axisUses = Object.fromEntries(game.UNWRITTEN_MAP_TAXONOMY.map((axis) => [axis, 0]));
  for (const scenario of game.UNWRITTEN_MAP_SCENARIOS) {
    assert(game.regionAt(scenario.position).id === scenario.regionId, `${scenario.id} must be positioned in its declared region`);
    assert(scenario.choices.length === 4, `${scenario.id} must have four equal-value options`);
    for (const option of scenario.choices) {
      const axes = Object.keys(option.tasteVector);
      assert(axes.length >= 1 && axes.length <= 2, `${scenario.id}/${option.id} needs a sparse taste vector`);
      assert(option.tags.length >= 1, `${scenario.id}/${option.id} needs semantic tags`);
      for (const axis of axes) axisUses[axis] += 1;
    }
  }
  assert(Object.values(axisUses).every((count) => count >= 4), "every taxonomy axis must be revisited under multiple frames");
  checks.push("authored_encounters_and_taxonomy");

  const save = baseSave();
  const scenario = game.UNWRITTEN_MAP_SCENARIOS[0];
  const order1 = game.orderedChoices(scenario, save.anonymousPlayerId, 1).map((item) => item.id);
  const order1Again = game.orderedChoices(scenario, save.anonymousPlayerId, 1).map((item) => item.id);
  const order2 = game.orderedChoices(scenario, save.anonymousPlayerId, 2).map((item) => item.id);
  assert(JSON.stringify(order1) === JSON.stringify(order1Again), "counterbalancing must be deterministic");
  assert(JSON.stringify(order1) !== JSON.stringify(order2), "repeat attempts must rotate presentation order");
  const event = choiceEvent(save, scenario);
  assert(game.isUnwrittenMapEventV2(event), "generated V2 choice event must validate");
  assert(event.presentedOptions.length === 4 && event.selectedSlot === 1, "event must retain order and selected slot");
  assert(JSON.stringify(event.chosenOption) === JSON.stringify(event.presentedOptions[1]), "chosen snapshot must be complete");
  assert(event.nonSelectedOptions.length === 3 && !("rejectedOptionIds" in event), "alternatives are comparison context, never rejected");
  assert(event.presentedOptions.every((item) => item.label && item.taxonomyVersion && item.tags.length), "snapshots must be self-describing");
  assert(!("responseTimeMs" in event) && event.latencyCategory === "considered",
    "V2 evidence must retain only a bounded response-pace category");
  assert(!game.normalizeUnwrittenMapEventV2(resignV2({ ...event, responseTimeMs: 8_000 })),
    "exact response milliseconds must be rejected from V2 evidence");
  assert(event.explorationContext.preferenceInference === "none_from_exploration", "movement must be explicitly non-preference telemetry");
  assert(!game.normalizeUnwrittenMapEventV2({ ...event, email: "not-allowed@example.com" }), "event allowlist must reject personal/unknown fields");
  assert(!game.isUnwrittenMapEventV2({ ...event, chosenOption: { ...event.chosenOption, label: "changed" } }), "snapshots are identity-bound");
  checks.push("semantic_choice_evidence_and_counterbalancing");

  const { choices } = presentation(save, scenario);
  const skipped = game.createEncounterSkippedEvent({
    save: { ...save, position: scenario.position },
    scenario,
    presentedChoices: choices,
    attempt: 1,
    gameSessionId: "map-session-test-001",
    startedAtMs: 0,
    nowMs: 200_000,
    occurredAt: "2026-09-01T00:00:04.000Z",
  });
  assert(game.isUnwrittenMapEventV2(skipped), "skip event must validate");
  assert(skipped.preferenceEffect === "none" && skipped.skipMeaning === "keep_exploring", "skip must be explicitly neutral");
  assert(!("chosenOption" in skipped) && !("nonSelectedOptions" in skipped), "skip cannot imply selection or rejection");
  const skippedSave = game.applyMapOutcome(
    game.startEncounterAttempt(save, scenario.id),
    {
      scenarioId: scenario.id,
      kind: "skip",
      optionId: null,
      outcomeEvidence: {
        kind: "durable_event",
        schemaVersion: game.UNWRITTEN_MAP_EVENT_SCHEMA,
        eventId: skipped.eventId,
      },
      presentationId: skipped.presentationId, attempt: 1, occurredAt: skipped.occurredAt,
    },
  );
  const undoEvent = game.createChoiceUndoneEvent({
    save: skippedSave,
    decision: skippedSave.decisions[0],
    gameSessionId: "map-session-test-001",
    occurredAt: "2026-09-01T00:00:05.000Z",
  });
  const correctedWithoutLedger = game.undoMostRecentOutcome(skippedSave, undoEvent.eventId, "2026-09-01T00:00:05.000Z");
  const corrected = game.recordDurableUnwrittenMapEvent(
    game.recordDurableUnwrittenMapEvent(correctedWithoutLedger, skipped.eventId),
    undoEvent.eventId,
  );
  assert(undoEvent.originalEvidence.kind === "durable_event"
    && undoEvent.originalEvidence.schemaVersion === game.UNWRITTEN_MAP_EVENT_SCHEMA
    && undoEvent.originalEvidence.eventId === skipped.eventId
    && undoEvent.restoredEncounter, "undo must link to original durable event with its schema");
  assert(corrected.decisions.length === 0 && corrected.undoneDecisions.length === 1, "undo must restore encounter availability and effective count");
  assert(corrected.undoneDecisions[0].correctionEventId === undoEvent.eventId, "save must retain correction lineage");
  checks.push("skip_neutrality_and_undo");

  const sessionKinds = ["session_started", "session_continued", "session_exited", "session_completed"];
  for (const eventType of sessionKinds) {
    const sessionSave = eventType === "session_completed"
      ? {
        ...save,
        discoveredScenarioIds: game.UNWRITTEN_MAP_SCENARIOS.map((item) => item.id),
        decisions: game.UNWRITTEN_MAP_SCENARIOS.map((item) => ({ scenarioId: item.id })),
      }
      : save;
    const sessionEvent = game.createSessionEvent({
      save: sessionSave, gameSessionId: "map-session-test-001", eventType, playSessionCount: 1,
      occurredAt: "2026-09-01T00:00:06.000Z",
    });
    assert(game.isUnwrittenMapEventV2(sessionEvent), `${eventType} must validate`);
  }
  const presented = game.createEncounterPresentedEvent({
    save: { ...save, position: scenario.position }, scenario, presentedChoices: choices, attempt: 1,
    gameSessionId: "map-session-test-001", occurredAt: "2026-09-01T00:00:07.000Z",
  });
  assert(game.isUnwrittenMapEventV2(presented), "encounter_presented must validate");
  const authoredSnapshot = presented.presentedOptions[0];
  const forgedSnapshot = { ...authoredSnapshot, label: `${authoredSnapshot.label}!` };
  const forgedSnapshots = presented.presentedOptions.map((item, index) => index === 0 ? forgedSnapshot : item);
  assert(!game.isUnwrittenMapEventV2(resignV2({ ...presented, presentedOptions: forgedSnapshots })),
    "re-signed option snapshots must remain bound to all authored fields");
  const reversedSnapshots = [...presented.presentedOptions].reverse();
  assert(!game.isUnwrittenMapEventV2(resignV2({
    ...presented,
    presentedOptions: reversedSnapshots,
    presentationId: game.presentationIdFor(save.anonymousPlayerId, scenario.id, 1, reversedSnapshots.map((item) => item.id)),
  })), "presented snapshots must retain the canonical counterbalanced order");
  assert(!game.isUnwrittenMapEventV2(resignV2({
    ...presented,
    explorationContext: { ...presented.explorationContext, mapX: scenario.position.x + 1 },
  })), "encounter exploration position must be bound to the scenario");
  assert(!game.isUnwrittenMapEventV2(resignV2({
    ...event,
    selectedSlot: 0,
  })), "selected slot and selected snapshot must remain bound");
  assert(!game.isUnwrittenMapEventV2(resignV2({
    ...event,
    explorationContext: {
      ...event.explorationContext,
      mapX: 0,
      mapY: 0,
      regionId: game.regionAt({ x: 0, y: 0 }).id,
    },
  })), "all event positions, including session positions, must be walkable");
  assert(!game.isUnwrittenMapEventV2(resignV2({
    ...event,
    explorationContext: {
      ...event.explorationContext,
      effectiveCompletedCount: game.UNWRITTEN_MAP_SCENARIOS.length + 1,
      discoveredCount: game.UNWRITTEN_MAP_SCENARIOS.length + 1,
    },
  })), "event completion and discovery counts must be scenario-bounded");
  assert(!game.isUnwrittenMapEventV2(resignV2({
    ...undoEvent,
    originalEvidence: { ...undoEvent.originalEvidence, eventId: "" },
  })) && !game.isUnwrittenMapEventV2(resignV2({
    ...undoEvent,
    originalEvidence: {
      ...undoEvent.originalEvidence,
      schemaVersion: game.UNWRITTEN_MAP_V1_EVENT_SCHEMA,
    },
  })), "undo durable lineage must pair its schema with a canonical event ID");
  assert(!game.isUnwrittenMapEventV2(resignV2({
    ...undoEvent,
    originalEvidence: {
      kind: "migrated_local_without_durable_event",
      eventId: skipped.eventId,
    },
  })), "migration correction marker must reject fabricated or extra original IDs");
  const incompleteCompletion = game.createSessionEvent({
    save,
    gameSessionId: "map-session-test-001",
    eventType: "session_completed",
    playSessionCount: 1,
    occurredAt: "2026-09-01T00:00:06.000Z",
  });
  assert(!game.isUnwrittenMapEventV2(incompleteCompletion), "completion events require every scenario to be complete");
  const excessiveSession = resignV2({
    ...game.createSessionEvent({
      save,
      gameSessionId: "map-session-test-001",
      eventType: "session_continued",
      playSessionCount: 1,
      occurredAt: "2026-09-01T00:00:06.000Z",
    }),
    playSessionCount: game.UNWRITTEN_MAP_MAX_PLAY_SESSIONS + 1,
  });
  assert(!game.isUnwrittenMapEventV2(excessiveSession), "session counts must be bounded");
  assert(contractSource.includes('"choice_undone"') && contractSource.includes('"encounter_skipped"'), "required V2 union actions missing");
  checks.push("strict_canonical_event_contract");

  const roundTrip = game.restoreUnwrittenMapSave(JSON.stringify(corrected), "north-library");
  assert(JSON.stringify(roundTrip) === JSON.stringify(corrected), "V2 save must survive exact round trip");
  assert(game.restoreUnwrittenMapSave(JSON.stringify(corrected), "south-library") === null,
    "a V2 save embedded for one normalized library must never restore in another");
  assert(JSON.stringify(game.restoreUnwrittenMapSave(JSON.stringify(corrected), " North Library "))
    === JSON.stringify(corrected), "requested library scope must be normalized before comparison");
  assert(game.restoreUnwrittenMapSave(JSON.stringify({
    ...corrected,
    position: { x: 0, y: 0 },
  }), "north-library") === null, "save positions must be walkable");
  assert(game.restoreUnwrittenMapSave(JSON.stringify({
    ...corrected,
    undoneDecisions: [{ ...corrected.undoneDecisions[0], correctionEventId: "" }],
  }), "north-library") === null, "save correction lineage must use canonical event IDs");
  assert(game.restoreUnwrittenMapSave(JSON.stringify({
    ...corrected,
    undoneDecisions: [{
      ...corrected.undoneDecisions[0],
      outcomeEvidence: {
        kind: "migrated_local_without_durable_event",
        eventId: skipped.eventId,
      },
    }],
  }), "north-library") === null, "save migration lineage marker must be an exact strict variant");
  assert(game.restoreUnwrittenMapSave(JSON.stringify({
    ...corrected,
    undoneDecisions: [{ ...corrected.undoneDecisions[0], presentationId: "not-a-presentation" }],
  }), "north-library") === null, "save presentation lineage must be canonical");
  assert(game.restoreUnwrittenMapSave(JSON.stringify({
    ...corrected,
    playSessionCount: game.UNWRITTEN_MAP_MAX_PLAY_SESSIONS + 1,
  }), "north-library") === null, "save session counts must be bounded");
  assert(game.restoreUnwrittenMapSave(JSON.stringify({
    ...corrected,
    discoveredScenarioIds: [],
  }), "north-library") === null, "save discovery, outcomes, and corrections must be mutually plausible");
  checks.push("strict_embedded_library_scope_restore");

  const futureTime = "2036-01-01T00:00:00.000Z";
  const rolledBackTime = "2020-01-01T00:00:00.000Z";
  const rollbackScenario = game.UNWRITTEN_MAP_SCENARIOS[0];
  let rollbackSave = game.updateMapPosition(
    baseSave(futureTime),
    rollbackScenario.position,
    "right",
    rolledBackTime,
  );
  rollbackSave = game.startEncounterAttempt(rollbackSave, rollbackScenario.id, rolledBackTime);
  const rollbackChoices = game.orderedChoices(rollbackScenario, rollbackSave.anonymousPlayerId, 1);
  const rollbackOutcome = game.createChoiceMadeEvent({
    save: rollbackSave,
    scenario: rollbackScenario,
    presentedChoices: rollbackChoices,
    selectedOptionId: rollbackChoices[0].id,
    attempt: 1,
    gameSessionId: "map-session-clock-rollback",
    startedAtMs: 10,
    nowMs: 5,
    occurredAt: rolledBackTime,
  });
  rollbackSave = game.applyMapOutcome(rollbackSave, {
    scenarioId: rollbackScenario.id,
    kind: "choice",
    optionId: rollbackOutcome.chosenOption.id,
    outcomeEvidence: {
      kind: "durable_event",
      schemaVersion: game.UNWRITTEN_MAP_EVENT_SCHEMA,
      eventId: rollbackOutcome.eventId,
    },
    presentationId: rollbackOutcome.presentationId,
    attempt: 1,
    occurredAt: rolledBackTime,
  });
  const rollbackUndo = game.createChoiceUndoneEvent({
    save: rollbackSave,
    decision: rollbackSave.decisions[0],
    gameSessionId: "map-session-clock-rollback",
    occurredAt: rolledBackTime,
  });
  rollbackSave = game.undoMostRecentOutcome(
    game.recordDurableUnwrittenMapEvent(rollbackSave, rollbackOutcome.eventId),
    rollbackUndo.eventId,
    rolledBackTime,
  );
  rollbackSave = game.recordDurableUnwrittenMapEvent(rollbackSave, rollbackUndo.eventId);
  const rollbackLifecycle = game.createSessionEvent({
    save: rollbackSave,
    gameSessionId: "map-session-clock-rollback",
    eventType: "session_exited",
    playSessionCount: 1,
    occurredAt: rolledBackTime,
  });
  assert(rollbackOutcome.occurredAt === futureTime
    && rollbackSave.updatedAt === futureTime
    && rollbackSave.undoneDecisions[0].undoneAt === futureTime
    && rollbackLifecycle.occurredAt === futureTime
    && game.restoreUnwrittenMapSave(JSON.stringify(rollbackSave), "north-library"),
  "movement, outcomes, undo, and lifecycle evidence must clamp a rolled-back clock to durable history");
  const rollbackStorage = new MemoryStorage();
  const rollbackScope = game.storageScopeKey("North", "clock-rollback");
  await rollbackStorage.setItem(game.scopedSaveKey(rollbackScope), JSON.stringify(rollbackSave));
  const rollbackLifecycleSave = await evidence.transactUnwrittenMapEvent(
    rollbackStorage,
    rollbackScope,
    rollbackSave.libraryScopeId,
    "clock-rollback-lifecycle",
    (current) => ({
      event: game.createSessionEvent({
        save: current,
        gameSessionId: "map-session-clock-rollback",
        eventType: "session_exited",
        playSessionCount: 1,
        occurredAt: rolledBackTime,
      }),
      nextSave: current,
    }),
  );
  const beforeRejectedRollback = await rollbackStorage.getItem(game.scopedSaveKey(rollbackScope));
  let rejectedRollback = "";
  try {
    await evidence.transactUnwrittenMapEvent(
      rollbackStorage,
      rollbackScope,
      rollbackSave.libraryScopeId,
      "clock-rollback-invalid-save",
      (current) => ({
        event: game.createSessionEvent({
          save: current,
          gameSessionId: "map-session-clock-rollback",
          eventType: "session_exited",
          playSessionCount: 1,
          occurredAt: rolledBackTime,
        }),
        nextSave: { ...current, updatedAt: rolledBackTime },
      }),
    );
  } catch (error) {
    rejectedRollback = error instanceof Error ? error.message : String(error);
  }
  assert(rollbackLifecycleSave.updatedAt === futureTime
    && rejectedRollback === "unwritten_map_timestamp_rollback"
    && await rollbackStorage.getItem(game.scopedSaveKey(rollbackScope)) === beforeRejectedRollback,
  "durable lifecycle mutation must clamp rollback and reject an invalid chronology before any write");
  const rollbackReset = await evidence.resetUnwrittenMapJourney(
    rollbackStorage,
    rollbackScope,
    rollbackSave.libraryScopeId,
    game.createInitialUnwrittenMapSave(game.createUnwrittenMapPlayerId(1, 0.2), rolledBackTime, rollbackSave.libraryScopeId),
  );
  assert(rollbackReset.startedAt === futureTime && rollbackReset.updatedAt === futureTime
    && game.restoreUnwrittenMapSave(JSON.stringify(rollbackReset), rollbackSave.libraryScopeId),
  "reset must preserve monotonic durable chronology when the system clock moves backward");
  checks.push("monotonic_clock_rollback_mutations");

  let boundedHistory = baseSave();
  const stableScenario = game.UNWRITTEN_MAP_SCENARIOS[0];
  const stableAttempted = game.startEncounterAttempt(boundedHistory, stableScenario.id);
  const stableEvent = choiceEvent(stableAttempted, stableScenario);
  boundedHistory = game.applyMapOutcome(stableAttempted, {
    scenarioId: stableScenario.id,
    kind: "choice",
    optionId: stableEvent.chosenOption.id,
    outcomeEvidence: {
      kind: "durable_event",
      schemaVersion: game.UNWRITTEN_MAP_EVENT_SCHEMA,
      eventId: stableEvent.eventId,
    },
    presentationId: stableEvent.presentationId,
    attempt: 1,
    occurredAt: stableEvent.occurredAt,
  });
  boundedHistory = game.recordDurableUnwrittenMapEvent(boundedHistory, stableEvent.eventId);
  const churnScenario = game.UNWRITTEN_MAP_SCENARIOS[1];
  let latestCorrection;
  for (let index = 0; index < game.UNWRITTEN_MAP_MAX_UNDONE_DECISIONS + 25; index += 1) {
    const attempted = game.startEncounterAttempt(boundedHistory, churnScenario.id);
    const attempt = attempted.encounterAttempts[churnScenario.id];
    const choicesForAttempt = game.orderedChoices(churnScenario, attempted.anonymousPlayerId, attempt);
    const outcomeAt = new Date(Date.parse("2026-09-01T00:01:00.000Z") + index * 2_000).toISOString();
    const churnEvent = game.createChoiceMadeEvent({
      save: { ...attempted, position: churnScenario.position },
      scenario: churnScenario,
      presentedChoices: choicesForAttempt,
      selectedOptionId: choicesForAttempt[0].id,
      attempt,
      gameSessionId: "map-session-retention-001",
      startedAtMs: 0,
      nowMs: 2_000,
      occurredAt: outcomeAt,
    });
    boundedHistory = game.applyMapOutcome(attempted, {
      scenarioId: churnScenario.id,
      kind: "choice",
      optionId: churnEvent.chosenOption.id,
      outcomeEvidence: {
        kind: "durable_event",
        schemaVersion: game.UNWRITTEN_MAP_EVENT_SCHEMA,
        eventId: churnEvent.eventId,
      },
      presentationId: churnEvent.presentationId,
      attempt,
      occurredAt: outcomeAt,
    });
    boundedHistory = game.recordDurableUnwrittenMapEvent(boundedHistory, churnEvent.eventId);
    const undoneAt = new Date(Date.parse(outcomeAt) + 1_000).toISOString();
    latestCorrection = game.createChoiceUndoneEvent({
      save: boundedHistory,
      decision: boundedHistory.decisions[boundedHistory.decisions.length - 1],
      gameSessionId: "map-session-retention-001",
      occurredAt: undoneAt,
    });
    boundedHistory = game.undoMostRecentOutcome(boundedHistory, latestCorrection.eventId, undoneAt);
    boundedHistory = game.recordDurableUnwrittenMapEvent(boundedHistory, latestCorrection.eventId);
  }
  const boundedRoundTrip = game.restoreUnwrittenMapSave(JSON.stringify(boundedHistory), "north-library");
  assert(boundedHistory.undoneDecisions.length === game.UNWRITTEN_MAP_MAX_UNDONE_DECISIONS,
    "undo history must retain no more than the restorable bound");
  assert(boundedRoundTrip && JSON.stringify(boundedRoundTrip) === JSON.stringify(boundedHistory),
    "a save created after more than 500 undo cycles must round trip");
  assert(boundedRoundTrip.decisions.length === 1
    && boundedRoundTrip.decisions[0].scenarioId === stableScenario.id
    && boundedRoundTrip.decisions[0].outcomeEvidence.eventId === stableEvent.eventId,
  "bounded correction retention must not corrupt effective decisions");
  assert(boundedRoundTrip.undoneDecisions.at(-1).correctionEventId === latestCorrection.eventId,
    "bounded correction retention must preserve the newest correction lineage");
  checks.push("bounded_undo_retention_roundtrip");

  const v1 = {
    schemaVersion: "unwritten_map_save_v1",
    anonymousPlayerId: save.anonymousPlayerId,
    position: { x: 12, y: 9 },
    decisions: [{ scenarioId: "old-lighthouse", optionId: "repair-lens" }],
    discoveredScenarioIds: ["old-lighthouse", "missing"],
    startedAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-02T00:00:00.000Z",
  };
  const migrated = game.restoreUnwrittenMapSave(JSON.stringify(v1), "migration-library");
  assert(migrated?.schemaVersion === "unwritten_map_save_v2", "V1 save must migrate to V2");
  assert(migrated.decisions.length === 1
    && migrated.decisions[0].outcomeEvidence.kind === "migrated_local_without_durable_event",
  "V1 progress without recoverable evidence must explicitly retain local-only migration lineage");
  const migratedUndo = game.createChoiceUndoneEvent({
    save: migrated,
    decision: migrated.decisions[0],
    gameSessionId: "map-session-migration-001",
    occurredAt: "2025-01-02T00:00:01.000Z",
  });
  assert(game.isUnwrittenMapEventV2(migratedUndo)
    && migratedUndo.originalEvidence.kind === "migrated_local_without_durable_event"
    && !("originalEventId" in migratedUndo),
  "undoing local-only migrated progress must not fabricate a V2 original event");
  assert(game.isWalkable(migrated.position), "invalid old position must safely fall back");
  const legacyMappings = {
    "lantern-fair": {
      "story-contest": "take-stage", "balcony-watch": "balcony-view",
      "follow-music": "hidden-melody", "quiet-lane": "help-lanterns",
    },
    "whisper-orchard": {
      "call-out": "call-light", "follow-silently": "trail-light",
      "study-echoes": "decode-trees", "gather-fruit": "taste-fruit",
    },
    "old-lighthouse": {
      "repair-lens": "repair-lens", "read-journals": "keeper-journals",
      "climb-roof": "storm-roof", "listen-to-sea": "sea-listen",
    },
    "rain-camp": {
      "share-table": "crowded-table", "paint-storm": "paint-storm",
      "organize-supplies": "sort-supplies", "walk-in-rain": "rain-walk",
    },
  };
  for (const [scenarioId, mappings] of Object.entries(legacyMappings)) {
    for (const [legacyId, currentId] of Object.entries(mappings)) {
      assert(game.mapLegacyUnwrittenMapOptionId(scenarioId, legacyId) === currentId,
        `legacy choice ${scenarioId}/${legacyId} must migrate explicitly`);
    }
  }
  assert(game.restoreUnwrittenMapSave('{"schemaVersion":"wrong"}', "north-library") === null, "unknown saves must never crash or restore");
  checks.push("v1_migration_and_save_roundtrip");

  const migrationStorage = new MemoryStorage();
  const migrationScopeA = game.storageScopeKey("North", "patron-a");
  const migrationScopeB = game.storageScopeKey("North", "patron-b");
  const legacyEvent = legacyChoiceEvent(save);
  await migrationStorage.setItem(game.UNWRITTEN_MAP_V1_SAVE_KEY, JSON.stringify({
    ...v1,
    position: { x: 2, y: 1 },
    decisions: [{ scenarioId: "lantern-fair", optionId: "story-contest" }],
  }));
  await migrationStorage.setItem(game.UNWRITTEN_MAP_V1_EVENT_QUEUE_KEY,
    JSON.stringify([{ event: legacyEvent, committed: false }]));
  await migrationStorage.setItem(game.scopedSaveKey(migrationScopeA),
    JSON.stringify(game.createInitialUnwrittenMapSave(game.createUnwrittenMapPlayerId(1_700_000_000_001, 0.5), undefined, "north")));
  const claimed = await evidence.migrateLegacyUnwrittenMapSaveForScope(migrationStorage, migrationScopeA, "north");
  assert(claimed?.decisions.length === 1 && claimed.anonymousPlayerId === save.anonymousPlayerId,
    "active scope must replace a pristine buggy-rollout V2 save with its global V1 claim");
  assert(claimed.decisions[0].outcomeEvidence.kind === "durable_event"
    && claimed.decisions[0].outcomeEvidence.schemaVersion === game.UNWRITTEN_MAP_V1_EVENT_SCHEMA
    && claimed.decisions[0].outcomeEvidence.eventId === legacyEvent.eventId,
  "migration must recover the exact queued V1 evidence identity when available");
  const restoredClaim = game.restoreUnwrittenMapSave(
    await migrationStorage.getItem(game.scopedSaveKey(migrationScopeA)),
    "north",
  );
  assert(restoredClaim?.decisions[0].outcomeEvidence.eventId === legacyEvent.eventId,
    "a migrated save with recovered V1 evidence must remain restorable");
  const legacyUndo = game.createChoiceUndoneEvent({
    save: claimed,
    decision: claimed.decisions[0],
    gameSessionId: "map-session-migration-002",
    occurredAt: "2025-01-02T00:00:01.000Z",
  });
  assert(game.isUnwrittenMapEventV2(legacyUndo)
    && legacyUndo.originalEvidence.schemaVersion === game.UNWRITTEN_MAP_V1_EVENT_SCHEMA
    && legacyUndo.originalEvidence.eventId === legacyEvent.eventId,
  "correction analytics must distinguish a known durable V1 source from a local migration reset");
  assert(await migrationStorage.getItem(game.scopedSaveKey(migrationScopeA)), "migration must persist into the scoped V2 key");
  assert(await evidence.migrateLegacyUnwrittenMapSaveForScope(migrationStorage, migrationScopeB, "north") === null,
    "one global legacy save must never duplicate into a second scope");
  const migrationOwner = JSON.parse(await migrationStorage.getItem(game.UNWRITTEN_MAP_V1_MIGRATION_KEY));
  assert(migrationOwner.ownerScopeKey === migrationScopeA && migrationOwner.status === "complete",
    "migration ownership must be durably marked");
  assert(routeSource.includes("migrateLegacyUnwrittenMapSaveForScope") && !routeSource.includes("!params.playerId &&"),
    "normal player-scoped routes must attempt the one-time legacy claim");
  checks.push("ownership_safe_scoped_v1_migration");

  const mergedMigrationStorage = new MemoryStorage();
  const mergedScope = game.storageScopeKey("North", "merged-patron");
  const existingStartedAt = "2026-01-01T00:00:00.000Z";
  let existingProgress = game.createInitialUnwrittenMapSave(
    save.anonymousPlayerId,
    existingStartedAt,
    "north",
  );
  const existingScenario = game.UNWRITTEN_MAP_SCENARIOS[1];
  existingProgress = game.startEncounterAttempt(existingProgress, existingScenario.id, existingStartedAt);
  const existingChoices = game.orderedChoices(existingScenario, existingProgress.anonymousPlayerId, 1);
  const existingEvent = game.createChoiceMadeEvent({
    save: { ...existingProgress, position: existingScenario.position },
    scenario: existingScenario,
    presentedChoices: existingChoices,
    selectedOptionId: existingChoices[0].id,
    attempt: 1,
    gameSessionId: "map-session-merged-migration",
    startedAtMs: 0,
    nowMs: 1_000,
    occurredAt: "2026-01-02T00:00:00.000Z",
  });
  existingProgress = game.applyMapOutcome(existingProgress, {
    scenarioId: existingScenario.id,
    kind: "choice",
    optionId: existingEvent.chosenOption.id,
    outcomeEvidence: { kind: "durable_event", schemaVersion: game.UNWRITTEN_MAP_EVENT_SCHEMA, eventId: existingEvent.eventId },
    presentationId: existingEvent.presentationId,
    attempt: 1,
    occurredAt: existingEvent.occurredAt,
  });
  existingProgress = game.recordDurableUnwrittenMapEvent(existingProgress, existingEvent.eventId);
  await mergedMigrationStorage.setItem(game.scopedSaveKey(mergedScope), JSON.stringify(existingProgress));
  await mergedMigrationStorage.setItem(game.UNWRITTEN_MAP_V1_SAVE_KEY, JSON.stringify({
    ...v1,
    anonymousPlayerId: save.anonymousPlayerId,
    decisions: [{ scenarioId: "lantern-fair", optionId: "story-contest" }],
  }));
  const mergedProgress = await evidence.migrateLegacyUnwrittenMapSaveForScope(
    mergedMigrationStorage,
    mergedScope,
    "north",
  );
  assert(mergedProgress?.decisions.length === 2
    && new Set(mergedProgress.decisions.map((decision) => decision.scenarioId)).size === 2,
  "merging older V1 progress into progressed V2 must preserve both progress sets");
  assert(mergedProgress.startedAt === v1.startedAt
    && mergedProgress.updatedAt === existingEvent.occurredAt,
  "merged migration must span the earliest start and latest history timestamp");
  assert(game.restoreUnwrittenMapSave(
    await mergedMigrationStorage.getItem(game.scopedSaveKey(mergedScope)),
    "north",
  )?.decisions.length === 2, "chronologically merged V1/V2 progress must remain restorable");
  checks.push("chronological_progressed_v2_migration_merge");

  const duplicateMigrationStorage = new MemoryStorage();
  const duplicateScope = game.storageScopeKey("North", "duplicate-v1");
  const firstDuplicate = legacyChoiceEvent(save);
  const { eventId: _duplicateId, ...secondDuplicateBody } = {
    ...firstDuplicate,
    occurredAt: "2025-01-01T00:00:04.000Z",
  };
  const secondDuplicate = {
    ...secondDuplicateBody,
    eventId: `ume-${hashText(JSON.stringify(secondDuplicateBody))}`,
  };
  await duplicateMigrationStorage.setItem(game.UNWRITTEN_MAP_V1_SAVE_KEY, JSON.stringify({
    ...v1,
    anonymousPlayerId: save.anonymousPlayerId,
    decisions: [{ scenarioId: "lantern-fair", optionId: "story-contest" }],
  }));
  await duplicateMigrationStorage.setItem(game.UNWRITTEN_MAP_V1_EVENT_QUEUE_KEY, JSON.stringify([
    { event: firstDuplicate, committed: false },
    { event: secondDuplicate, committed: false },
  ]));
  const duplicateMigration = await evidence.migrateLegacyUnwrittenMapSaveForScope(
    duplicateMigrationStorage, duplicateScope, "north",
  );
  const duplicateQueue = JSON.parse(
    await duplicateMigrationStorage.getItem(game.UNWRITTEN_MAP_V1_EVENT_QUEUE_KEY),
  );
  assert(duplicateMigration.decisions[0].outcomeEvidence.eventId === secondDuplicate.eventId
    && duplicateQueue[0].committed === false
    && duplicateQueue[1].committed === true,
  "migration must commit only the exact linked legacy event, not every matching player/scenario/option event");

  class MigrationRaceStorage extends MemoryStorage {
    injected = false;
    async setItem(key, value) {
      await super.setItem(key, value);
      if (!this.injected && key === game.UNWRITTEN_MAP_V1_MIGRATION_KEY
        && JSON.parse(value).status === "claimed") {
        this.injected = true;
        await super.setItem(this.scopeSaveKey, JSON.stringify(this.newerSave));
      }
    }
  }
  const migrationRaceStorage = new MigrationRaceStorage();
  const migrationRaceScope = game.storageScopeKey("North", "migration-race");
  const migrationRaceInitial = baseSave();
  const migrationRaceNewer = game.updateMapPosition(
    { ...migrationRaceInitial, revision: 1, lastOperationId: "newer-tab-operation" },
    game.moveOnMap(migrationRaceInitial.position, "right"),
    "right",
    "2026-09-01T00:00:30.000Z",
  );
  migrationRaceStorage.scopeSaveKey = game.scopedSaveKey(migrationRaceScope);
  migrationRaceStorage.newerSave = migrationRaceNewer;
  await migrationRaceStorage.setItem(migrationRaceStorage.scopeSaveKey, JSON.stringify(migrationRaceInitial));
  await migrationRaceStorage.setItem(game.UNWRITTEN_MAP_V1_SAVE_KEY, JSON.stringify({
    ...v1,
    anonymousPlayerId: save.anonymousPlayerId,
  }));
  let migrationRaceError = "";
  try {
    await evidence.migrateLegacyUnwrittenMapSaveForScope(
      migrationRaceStorage, migrationRaceScope, migrationRaceInitial.libraryScopeId,
    );
  } catch (error) {
    migrationRaceError = error instanceof Error ? error.message : String(error);
  }
  const migrationRaceDurable = game.restoreUnwrittenMapSave(
    await migrationRaceStorage.getItem(migrationRaceStorage.scopeSaveKey),
    migrationRaceInitial.libraryScopeId,
  );
  assert(migrationRaceError === "unwritten_map_save_revision_conflict"
    && migrationRaceDurable.lastOperationId === "newer-tab-operation"
    && game.samePosition(migrationRaceDurable.position, migrationRaceNewer.position),
  "migration CAS must detect a newer revision and never overwrite newer progress");
  checks.push("exact_v1_lineage_and_migration_cas");

  class PreparedMigrationStorage extends MemoryStorage {
    failPreparedSave = false;
    async setItem(key, value) {
      if (this.failPreparedSave && key === this.scopeSaveKey
        && JSON.parse(value).lastOperationId === "crash-before-migration") {
        this.failPreparedSave = false;
        throw new Error("injected_prepared_save_crash");
      }
      return super.setItem(key, value);
    }
  }
  const preparedMigrationStorage = new PreparedMigrationStorage();
  const preparedMigrationScope = game.storageScopeKey("North", "prepared-migration");
  const preparedMigrationInitial = baseSave();
  preparedMigrationStorage.scopeSaveKey = game.scopedSaveKey(preparedMigrationScope);
  await preparedMigrationStorage.setItem(
    preparedMigrationStorage.scopeSaveKey,
    JSON.stringify(preparedMigrationInitial),
  );
  await preparedMigrationStorage.setItem(game.UNWRITTEN_MAP_V1_SAVE_KEY, JSON.stringify({
    ...v1,
    anonymousPlayerId: preparedMigrationInitial.anonymousPlayerId,
    decisions: [{ scenarioId: "lantern-fair", optionId: "story-contest" }],
  }));
  preparedMigrationStorage.failPreparedSave = true;
  let preparedCrash = "";
  try {
    await evidence.transactUnwrittenMapEvent(
      preparedMigrationStorage,
      preparedMigrationScope,
      preparedMigrationInitial.libraryScopeId,
      "crash-before-migration",
      (current) => {
        const occurredAt = game.monotonicUnwrittenMapTimestamp(current, "2026-09-01T00:00:40.000Z");
        const next = {
          ...current,
          playSessionCount: 1,
          lastSessionId: "map-session-before-migration",
          updatedAt: occurredAt,
        };
        return {
          event: game.createSessionEvent({
            save: next,
            gameSessionId: next.lastSessionId,
            eventType: "session_started",
            playSessionCount: 1,
            occurredAt,
          }),
          nextSave: next,
        };
      },
    );
  } catch (error) {
    preparedCrash = error instanceof Error ? error.message : String(error);
  }
  const preparedWal = JSON.parse(
    await preparedMigrationStorage.getItem(game.scopedQueueKey(preparedMigrationScope)),
  );
  assert(preparedCrash === "injected_prepared_save_crash"
    && preparedWal.length === 1 && !preparedWal[0].committed && preparedWal[0].preparedSave,
  "fixture must strand a prepared WAL transaction before its save revision advances");
  const afterPreparedMigration = await evidence.migrateLegacyUnwrittenMapSaveForScope(
    preparedMigrationStorage,
    preparedMigrationScope,
    preparedMigrationInitial.libraryScopeId,
  );
  const recoveredWal = JSON.parse(
    await preparedMigrationStorage.getItem(game.scopedQueueKey(preparedMigrationScope)),
  );
  assert(afterPreparedMigration.revision === 2
    && afterPreparedMigration.playSessionCount === 1
    && afterPreparedMigration.decisions.length === 1
    && recoveredWal[0].committed,
  "migration must recover a crash-prepared scoped WAL transaction before advancing its revision");

  const postMigrationReset = await evidence.resetUnwrittenMapJourney(
    preparedMigrationStorage,
    preparedMigrationScope,
    preparedMigrationInitial.libraryScopeId,
    game.createInitialUnwrittenMapSave(
      game.createUnwrittenMapPlayerId(1_900_000_000_000, 0.4),
      "2020-01-01T00:00:00.000Z",
      preparedMigrationInitial.libraryScopeId,
    ),
  );
  const afterTerminalMigrationRetry = await evidence.migrateLegacyUnwrittenMapSaveForScope(
    preparedMigrationStorage,
    preparedMigrationScope,
    preparedMigrationInitial.libraryScopeId,
  );
  assert(afterTerminalMigrationRetry.revision === postMigrationReset.revision
    && afterTerminalMigrationRetry.anonymousPlayerId === postMigrationReset.anonymousPlayerId
    && afterTerminalMigrationRetry.decisions.length === 0,
  "a complete migration marker must be terminal and never resurrect legacy progress after reset");
  checks.push("prepared_wal_migration_and_terminal_reset");

  assert(game.isUnwrittenMapChoiceEventV1(legacyEvent), "strict legacy V1 event fixture must validate");
  assert(!game.isUnwrittenMapChoiceEventV1({ ...legacyEvent, email: "not-allowed@example.com" }),
    "legacy drain must reject unknown identifying fields");
  const legacyQueued = await evidence.readQueuedUnwrittenMapEvents(migrationStorage, migrationScopeA);
  assert(legacyQueued.some((item) => item.schemaVersion === game.UNWRITTEN_MAP_V1_EVENT_SCHEMA),
    "client must read the legacy V1 queue during rollout");
  const drainedSchemas = [];
  let legacyFlush = await evidence.flushUnwrittenMapEvents(migrationStorage, async (item) => {
    drainedSchemas.push(item.schemaVersion);
    return true;
  }, migrationScopeA);
  assert(legacyFlush.sent === 1 && drainedSchemas[0] === game.UNWRITTEN_MAP_V1_EVENT_SCHEMA,
    "durable legacy V1 evidence must drain without reinterpretation as V2");
  checks.push("strict_v1_queue_rollout_drain");

  const storage = new MemoryStorage();
  const scopeA = game.storageScopeKey("North / Branch", "patron-a");
  const scopeB = game.storageScopeKey("South Branch", "patron-a");
  assert(scopeA !== scopeB && game.scopedSaveKey(scopeA) !== game.scopedSaveKey(scopeB), "library save scopes must be isolated");
  await storage.setItem(game.scopedSaveKey(scopeA), JSON.stringify(save));
  await evidence.queueUnwrittenMapEvent(storage, event, scopeA);
  await evidence.queueUnwrittenMapEvent(storage, event, scopeA);
  assert((await evidence.readQueuedUnwrittenMapEvents(storage, scopeA)).length === 1, "queue must deduplicate idempotent local events");
  assert((await evidence.readQueuedUnwrittenMapEvents(storage, scopeB)).length === 0, "queues must not leak across libraries");
  let flush = await evidence.flushUnwrittenMapEvents(storage, async () => true, scopeA);
  assert(flush.sent === 0 && flush.remaining === 1, "uncommitted evidence must never deliver");
  let nonDurableCommitError = "";
  try {
    await evidence.commitUnwrittenMapEvent(storage, event.eventId, scopeA);
  } catch (error) {
    nonDurableCommitError = error instanceof Error ? error.message : String(error);
  }
  assert(nonDurableCommitError === "unwritten_map_event_not_durable",
    "queue commitment must require proof in the durable save ledger");
  const eventLedgerSave = game.recordDurableUnwrittenMapEvent(save, event.eventId);
  await storage.setItem(game.scopedSaveKey(scopeA), JSON.stringify(eventLedgerSave));
  await evidence.commitUnwrittenMapEvent(storage, event.eventId, scopeA);
  flush = await evidence.flushUnwrittenMapEvents(storage, async () => false, scopeA);
  assert(flush.sent === 0 && flush.remaining === 1, "failed delivery must remain queued");
  flush = await evidence.flushUnwrittenMapEvents(storage, async () => { throw new Error("network"); }, scopeA);
  assert(flush.remaining === 1, "thrown delivery failure must remain queued");
  flush = await evidence.flushUnwrittenMapEvents(storage, async () => true, scopeA);
  assert(flush.sent === 1 && flush.remaining === 0, "retry success must clear queue");

  const reconcileStorage = new MemoryStorage();
  await evidence.queueUnwrittenMapEvent(reconcileStorage, skipped, scopeA);
  const durableSkippedSave = game.recordDurableUnwrittenMapEvent(skippedSave, skipped.eventId);
  await reconcileStorage.setItem(game.scopedSaveKey(scopeA), JSON.stringify(durableSkippedSave));
  await evidence.reconcileUnwrittenMapEvents(reconcileStorage, durableSkippedSave, scopeA);
  flush = await evidence.flushUnwrittenMapEvents(reconcileStorage, async () => true, scopeA);
  assert(flush.sent === 1, "save/queue reconciliation must commit durable outcomes after interrupted atomic flow");

  const abortedPresentationStorage = new MemoryStorage();
  await abortedPresentationStorage.setItem(game.scopedSaveKey(scopeA), JSON.stringify(save));
  await evidence.queueUnwrittenMapEvent(abortedPresentationStorage, presented, scopeA);
  await evidence.reconcileUnwrittenMapEvents(abortedPresentationStorage, save, scopeA);
  let abortedPresentationSends = 0;
  flush = await evidence.flushUnwrittenMapEvents(abortedPresentationStorage, async () => {
    abortedPresentationSends += 1;
    return true;
  }, scopeA);
  assert(abortedPresentationSends === 0 && flush.remaining === 0,
    "an encounter queued before an aborted save must never upload after restart");
  checks.push("durable_ledger_atomic_reconciliation");

  const transactionStorage = new MemoryStorage();
  const transactionScope = game.storageScopeKey("North", "transaction-patron");
  const transactionInitial = baseSave();
  await transactionStorage.setItem(game.scopedSaveKey(transactionScope), JSON.stringify(transactionInitial));
  let serializedOperation = 0;
  const sessionTransaction = () => evidence.transactUnwrittenMapEvent(
    transactionStorage,
    transactionScope,
    transactionInitial.libraryScopeId,
    `test-serialized-${++serializedOperation}`,
    (current) => {
      const playSessionCount = current.playSessionCount + 1;
      const occurredAt = new Date(Date.parse(current.updatedAt) + 1_000).toISOString();
      const next = {
        ...current,
        playSessionCount,
        lastSessionId: "map-session-serialized-001",
        updatedAt: occurredAt,
      };
      return {
        event: game.createSessionEvent({
          save: next,
          gameSessionId: next.lastSessionId,
          eventType: playSessionCount === 1 ? "session_started" : "session_continued",
          playSessionCount,
          occurredAt,
        }),
        nextSave: next,
      };
    },
  );
  const serializedSessions = await Promise.all([sessionTransaction(), sessionTransaction()]);
  const serializedDurable = game.restoreUnwrittenMapSave(
    await transactionStorage.getItem(game.scopedSaveKey(transactionScope)),
    transactionInitial.libraryScopeId,
  );
  assert(serializedSessions[0].playSessionCount === 1
    && serializedSessions[1].playSessionCount === 2
    && serializedDurable?.playSessionCount === 2,
  "concurrent transactions must derive serially from the latest durable save");
  const serializedFlush = await evidence.flushUnwrittenMapEvents(transactionStorage, async () => true, transactionScope);
  assert(serializedFlush.sent === 2 && serializedFlush.remaining === 0,
    "serialized queue/save/commit transactions must commit both exact events");
  checks.push("latest_save_full_transaction_mutex");

  let staleUndoDurable = baseSave();
  for (let index = 0; index < 2; index += 1) {
    const staleScenario = game.UNWRITTEN_MAP_SCENARIOS[index];
    const occurredAt = new Date(Date.parse(staleUndoDurable.updatedAt) + 1_000).toISOString();
    staleUndoDurable = game.startEncounterAttempt(
      game.updateMapPosition(staleUndoDurable, staleScenario.position, "right", occurredAt),
      staleScenario.id,
      occurredAt,
    );
    const staleChoices = game.orderedChoices(staleScenario, staleUndoDurable.anonymousPlayerId, 1);
    const staleEvent = game.createChoiceMadeEvent({
      save: staleUndoDurable,
      scenario: staleScenario,
      presentedChoices: staleChoices,
      selectedOptionId: staleChoices[0].id,
      attempt: 1,
      gameSessionId: "map-session-stale-undo",
      startedAtMs: 0,
      nowMs: 1,
      occurredAt,
    });
    staleUndoDurable = game.recordDurableUnwrittenMapEvent(game.applyMapOutcome(staleUndoDurable, {
      scenarioId: staleScenario.id,
      kind: "choice",
      optionId: staleEvent.chosenOption.id,
      outcomeEvidence: {
        kind: "durable_event",
        schemaVersion: game.UNWRITTEN_MAP_EVENT_SCHEMA,
        eventId: staleEvent.eventId,
      },
      presentationId: staleEvent.presentationId,
      attempt: 1,
      occurredAt,
    }), staleEvent.eventId);
  }
  const capturedStaleDecision = staleUndoDurable.decisions[0];
  const staleUndoStorage = new MemoryStorage();
  const staleUndoScope = game.storageScopeKey("North", "stale-undo");
  await staleUndoStorage.setItem(game.scopedSaveKey(staleUndoScope), JSON.stringify(staleUndoDurable));
  const staleUndoBefore = await staleUndoStorage.getItem(game.scopedSaveKey(staleUndoScope));
  let staleUndoError = "";
  try {
    await evidence.transactUnwrittenMapEvent(
      staleUndoStorage,
      staleUndoScope,
      staleUndoDurable.libraryScopeId,
      "stale-undo-operation",
      (current) => {
        const latest = current.decisions.at(-1);
        if (!latest || !game.sameUnwrittenMapDecisionIdentity(capturedStaleDecision, latest)) {
          throw new Error("unwritten_map_stale_undo");
        }
        throw new Error("unexpected_matching_stale_undo");
      },
    );
  } catch (error) {
    staleUndoError = error instanceof Error ? error.message : String(error);
  }
  assert(staleUndoError === "unwritten_map_stale_undo"
    && await staleUndoStorage.getItem(game.scopedSaveKey(staleUndoScope)) === staleUndoBefore
    && await staleUndoStorage.getItem(game.scopedQueueKey(staleUndoScope)) === null,
  "a stale tab must compare the displayed decision's full identity and never mutate a newer durable decision");

  const concurrentOutcomeStorage = new MemoryStorage();
  const concurrentOutcomeScope = game.storageScopeKey("North", "stale-outcome");
  await concurrentOutcomeStorage.setItem(
    game.scopedSaveKey(concurrentOutcomeScope),
    JSON.stringify(staleUndoDurable),
  );
  const concurrentOutcomeBefore = await concurrentOutcomeStorage.getItem(
    game.scopedSaveKey(concurrentOutcomeScope),
  );
  let concurrentOutcomeError = "";
  try {
    await evidence.transactUnwrittenMapEvent(
      concurrentOutcomeStorage,
      concurrentOutcomeScope,
      staleUndoDurable.libraryScopeId,
      "stale-outcome-operation",
      (current) => {
        const completedScenario = game.UNWRITTEN_MAP_SCENARIOS[0];
        const currentAttempt = current.encounterAttempts[completedScenario.id];
        const currentChoices = game.orderedChoices(completedScenario, current.anonymousPlayerId, currentAttempt);
        const staleEvent = game.createChoiceMadeEvent({
          save: current,
          scenario: completedScenario,
          presentedChoices: currentChoices,
          selectedOptionId: currentChoices[0].id,
          attempt: currentAttempt,
          gameSessionId: "map-session-stale-outcome",
          startedAtMs: 0,
          nowMs: 1,
        });
        return {
          event: staleEvent,
          nextSave: game.applyMapOutcome(current, {
            scenarioId: completedScenario.id,
            kind: "choice",
            optionId: staleEvent.chosenOption.id,
            outcomeEvidence: {
              kind: "durable_event",
              schemaVersion: game.UNWRITTEN_MAP_EVENT_SCHEMA,
              eventId: staleEvent.eventId,
            },
            presentationId: staleEvent.presentationId,
            attempt: currentAttempt,
          }),
        };
      },
    );
  } catch (error) {
    concurrentOutcomeError = error instanceof Error ? error.message : String(error);
  }
  assert(concurrentOutcomeError === "scenario_already_completed"
    && await concurrentOutcomeStorage.getItem(game.scopedSaveKey(concurrentOutcomeScope)) === concurrentOutcomeBefore
    && await concurrentOutcomeStorage.getItem(game.scopedQueueKey(concurrentOutcomeScope)) === null,
  "a concurrent stale outcome must be rejected before enqueueing or changing the completed encounter");
  checks.push("stale_undo_and_concurrent_outcome_guards");

  let staleCompletionSave = {
    ...baseSave(),
    playSessionCount: 1,
    lastSessionId: "map-session-cross-tab-completion",
  };
  for (const completionScenario of game.UNWRITTEN_MAP_SCENARIOS) {
    const positionedAt = new Date(Date.parse(staleCompletionSave.updatedAt) + 1_000).toISOString();
    const positioned = game.updateMapPosition(
      staleCompletionSave,
      completionScenario.position,
      "right",
      positionedAt,
    );
    const attemptedAt = new Date(Date.parse(positioned.updatedAt) + 1_000).toISOString();
    const attempted = game.startEncounterAttempt(positioned, completionScenario.id, attemptedAt);
    const completedAt = new Date(Date.parse(attempted.updatedAt) + 1_000).toISOString();
    const completionChoices = game.orderedChoices(
      completionScenario,
      attempted.anonymousPlayerId,
      1,
    );
    const completionChoice = game.createChoiceMadeEvent({
      save: attempted,
      scenario: completionScenario,
      presentedChoices: completionChoices,
      selectedOptionId: completionChoices[0].id,
      attempt: 1,
      gameSessionId: "map-session-cross-tab-completion",
      startedAtMs: 0,
      nowMs: 1,
      occurredAt: completedAt,
    });
    staleCompletionSave = game.recordDurableUnwrittenMapEvent(game.applyMapOutcome(attempted, {
      scenarioId: completionScenario.id,
      kind: "choice",
      optionId: completionChoice.chosenOption.id,
      outcomeEvidence: {
        kind: "durable_event",
        schemaVersion: game.UNWRITTEN_MAP_EVENT_SCHEMA,
        eventId: completionChoice.eventId,
      },
      presentationId: completionChoice.presentationId,
      attempt: 1,
      occurredAt: completedAt,
    }), completionChoice.eventId);
  }
  assert(game.isUnwrittenMapJourneyComplete(staleCompletionSave),
    "cross-tab completion fixture must begin with every effective decision");
  const staleCompletionStorage = new MemoryStorage();
  const staleCompletionScope = game.storageScopeKey("North", "stale-completion");
  await staleCompletionStorage.setItem(
    game.scopedSaveKey(staleCompletionScope),
    JSON.stringify(staleCompletionSave),
  );
  const crossTabUndo = evidence.transactUnwrittenMapEvent(
    staleCompletionStorage,
    staleCompletionScope,
    staleCompletionSave.libraryScopeId,
    "cross-tab-final-undo",
    (current) => {
      const decision = current.decisions.at(-1);
      assert(decision, "cross-tab undo requires the final effective decision");
      const occurredAt = new Date(Date.parse(current.updatedAt) + 1_000).toISOString();
      const correction = game.createChoiceUndoneEvent({
        save: current,
        decision,
        gameSessionId: "map-session-cross-tab-completion",
        occurredAt,
      });
      return {
        event: correction,
        nextSave: game.undoMostRecentOutcome(current, correction.eventId, occurredAt),
      };
    },
  );
  let staleCompletionDerivations = 0;
  const staleCompletionAttempt = evidence.transactUnwrittenMapCompletion(
    staleCompletionStorage,
    staleCompletionScope,
    staleCompletionSave.libraryScopeId,
    "stable-cross-tab-completion",
    (latest) => {
      staleCompletionDerivations += 1;
      return game.createSessionEvent({
        save: latest,
        gameSessionId: "map-session-cross-tab-completion",
        eventType: "session_completed",
        playSessionCount: latest.playSessionCount,
      });
    },
  );
  const [, staleCompletionResult] = await Promise.allSettled([
    crossTabUndo,
    staleCompletionAttempt,
  ]);
  const staleCompletionDurable = await evidence.loadDurableUnwrittenMapJourney(
    staleCompletionStorage,
    staleCompletionScope,
    staleCompletionSave.libraryScopeId,
  );
  const staleCompletionQueue = await evidence.readQueuedUnwrittenMapEvents(
    staleCompletionStorage,
    staleCompletionScope,
  );
  assert(staleCompletionResult.status === "rejected"
    && staleCompletionResult.reason instanceof Error
    && staleCompletionResult.reason.message === "unwritten_map_stale_completion"
    && staleCompletionDerivations === 0,
  "completion queued behind another tab's undo must recheck the latest durable save before deriving");
  assert(!game.isUnwrittenMapJourneyComplete(staleCompletionDurable)
    && staleCompletionDurable.lastOperationId === "cross-tab-final-undo"
    && staleCompletionQueue.every((queued) => queued.eventType !== "session_completed"),
  "stale completion must not advance its stable operation or queue an invalid completion event");
  checks.push("cross_tab_stale_completion_transaction_guard");

  const resumableCases = ["begin", "choice", "skip", "undo", "completion", "exit"];
  for (const kind of resumableCases) {
    const faultStorage = new CommitFaultStorage();
    const faultScope = game.storageScopeKey("North", `fault-${kind}`);
    const faultSession = `map-session-fault-${kind}`;
    let faultSave = baseSave();
    const faultScenario = game.UNWRITTEN_MAP_SCENARIOS[0];
    if (kind === "completion" || kind === "exit") {
      faultSave = {
        ...faultSave,
        playSessionCount: 1,
        lastSessionId: faultSession,
      };
    }
    if (kind === "choice" || kind === "skip") {
      faultSave = game.startEncounterAttempt(
        game.updateMapPosition(faultSave, faultScenario.position),
        faultScenario.id,
      );
    } else if (kind === "undo") {
      const attempted = game.startEncounterAttempt(
        game.updateMapPosition(faultSave, faultScenario.position),
        faultScenario.id,
      );
      const prior = choiceEvent(attempted, faultScenario);
      faultSave = game.recordDurableUnwrittenMapEvent(game.applyMapOutcome(attempted, {
        scenarioId: faultScenario.id,
        kind: "choice",
        optionId: prior.chosenOption.id,
        outcomeEvidence: {
          kind: "durable_event",
          schemaVersion: game.UNWRITTEN_MAP_EVENT_SCHEMA,
          eventId: prior.eventId,
        },
        presentationId: prior.presentationId,
        attempt: 1,
        occurredAt: prior.occurredAt,
      }), prior.eventId);
    }
    await faultStorage.setItem(game.scopedSaveKey(faultScope), JSON.stringify(faultSave));
    let deriveCount = 0;
    const operationId = `fault-operation-${kind}`;
    const derive = (current) => {
      deriveCount += 1;
      if (kind === "choice" || kind === "skip") {
        const choicesForFault = game.orderedChoices(faultScenario, current.anonymousPlayerId, 1);
        const outcome = kind === "choice"
          ? game.createChoiceMadeEvent({
            save: current,
            scenario: faultScenario,
            presentedChoices: choicesForFault,
            selectedOptionId: choicesForFault[0].id,
            attempt: 1,
            gameSessionId: faultSession,
            startedAtMs: 0,
            nowMs: 2_000,
            occurredAt: "2026-09-01T00:00:10.000Z",
          })
          : game.createEncounterSkippedEvent({
            save: current,
            scenario: faultScenario,
            presentedChoices: choicesForFault,
            attempt: 1,
            gameSessionId: faultSession,
            startedAtMs: 0,
            nowMs: 2_000,
            occurredAt: "2026-09-01T00:00:10.000Z",
          });
        return {
          event: outcome,
          nextSave: game.applyMapOutcome(current, {
            scenarioId: faultScenario.id,
            kind,
            optionId: kind === "choice" ? outcome.chosenOption.id : null,
            outcomeEvidence: {
              kind: "durable_event",
              schemaVersion: game.UNWRITTEN_MAP_EVENT_SCHEMA,
              eventId: outcome.eventId,
            },
            presentationId: outcome.presentationId,
            attempt: 1,
            occurredAt: outcome.occurredAt,
          }),
        };
      }
      if (kind === "undo") {
        const decision = current.decisions.at(-1);
        const correction = game.createChoiceUndoneEvent({
          save: current,
          decision,
          gameSessionId: faultSession,
          occurredAt: "2026-09-01T00:00:11.000Z",
        });
        return {
          event: correction,
          nextSave: game.undoMostRecentOutcome(current, correction.eventId, correction.occurredAt),
        };
      }
      const playSessionCount = kind === "begin" ? current.playSessionCount + 1 : current.playSessionCount;
      const nextSave = kind === "begin" ? {
        ...current,
        playSessionCount,
        lastSessionId: faultSession,
        updatedAt: "2026-09-01T00:00:12.000Z",
      } : current;
      const eventSave = kind === "completion" ? {
        ...nextSave,
        discoveredScenarioIds: game.UNWRITTEN_MAP_SCENARIOS.map((item) => item.id),
        decisions: game.UNWRITTEN_MAP_SCENARIOS.map((item) => ({ scenarioId: item.id })),
      } : nextSave;
      return {
        event: game.createSessionEvent({
          save: eventSave,
          gameSessionId: faultSession,
          eventType: kind === "begin" ? "session_started"
            : kind === "completion" ? "session_completed" : "session_exited",
          playSessionCount: kind === "begin" ? 1 : current.playSessionCount,
          occurredAt: "2026-09-01T00:00:12.000Z",
        }),
        nextSave,
      };
    };
    let injected = "";
    try {
      await evidence.transactUnwrittenMapEvent(
        faultStorage, faultScope, faultSave.libraryScopeId, operationId, derive,
      );
    } catch (error) {
      injected = error instanceof Error ? error.message : String(error);
    }
    assert(injected === "injected_commit_write_failure", `${kind} must reach the exact commit-write fault`);
    const resumed = await evidence.transactUnwrittenMapEvent(
      faultStorage, faultScope, faultSave.libraryScopeId, operationId, derive,
    );
    const faultQueue = JSON.parse(await faultStorage.getItem(game.scopedQueueKey(faultScope)));
    assert(deriveCount === 1 && resumed.revision === faultSave.revision + 1
      && faultQueue.length === 1 && faultQueue[0].committed,
    `${kind} retry must finish the prepared transaction without deriving or mutating twice`);
  }
  checks.push("resumable_faulted_ui_transactions");

  class PreEnqueueFaultStorage extends MemoryStorage {
    failNextQueue = true;
    async setItem(key, value) {
      if (this.failNextQueue && key.startsWith(game.UNWRITTEN_MAP_EVENT_QUEUE_KEY)) {
        this.failNextQueue = false;
        throw new Error("injected_pre_enqueue_failure");
      }
      return super.setItem(key, value);
    }
  }
  const completionRetryStorage = new PreEnqueueFaultStorage();
  const completionRetryScope = game.storageScopeKey("North", "completion-retry");
  const completionRetrySave = {
    ...baseSave(),
    playSessionCount: 1,
    lastSessionId: "map-session-completion-retry",
  };
  await completionRetryStorage.setItem(
    game.scopedSaveKey(completionRetryScope),
    JSON.stringify(completionRetrySave),
  );
  const completionOperationId = "stable-completion-retry-operation";
  let completionDerivations = 0;
  const deriveCompletion = (current) => {
    completionDerivations += 1;
    const eventSave = {
      ...current,
      discoveredScenarioIds: game.UNWRITTEN_MAP_SCENARIOS.map((item) => item.id),
      decisions: game.UNWRITTEN_MAP_SCENARIOS.map((item) => ({ scenarioId: item.id })),
    };
    return {
      event: game.createSessionEvent({
        save: eventSave,
        gameSessionId: "map-session-completion-retry",
        eventType: "session_completed",
        playSessionCount: 1,
        occurredAt: "2026-09-01T00:00:50.000Z",
      }),
      nextSave: current,
    };
  };
  let preEnqueueError = "";
  try {
    await evidence.transactUnwrittenMapEvent(
      completionRetryStorage,
      completionRetryScope,
      completionRetrySave.libraryScopeId,
      completionOperationId,
      deriveCompletion,
    );
  } catch (error) {
    preEnqueueError = error instanceof Error ? error.message : String(error);
  }
  const completionRetryResult = await evidence.transactUnwrittenMapEvent(
    completionRetryStorage,
    completionRetryScope,
    completionRetrySave.libraryScopeId,
    completionOperationId,
    deriveCompletion,
  );
  const completionRetryQueue = JSON.parse(
    await completionRetryStorage.getItem(game.scopedQueueKey(completionRetryScope)),
  );
  assert(preEnqueueError === "injected_pre_enqueue_failure"
    && completionDerivations === 2
    && completionRetryResult.lastOperationId === completionOperationId
    && completionRetryQueue.length === 1
    && completionRetryQueue[0].operationId === completionOperationId
    && completionRetryQueue[0].committed,
  "completion pre-enqueue failure must explicitly retry with the same stable operation ID");
  checks.push("stable_completion_pre_enqueue_retry");

  class ReconcileGateStorage extends MemoryStorage {
    queueWritten;
    releaseQueue;
    pauseQueue = true;
    constructor() {
      super();
      this.queueWritten = new Promise((resolve) => { this.markQueueWritten = resolve; });
      this.queueGate = new Promise((resolve) => { this.releaseQueue = resolve; });
    }
    async setItem(key, value) {
      await super.setItem(key, value);
      if (this.pauseQueue && key.startsWith(game.UNWRITTEN_MAP_EVENT_QUEUE_KEY)
        && JSON.parse(value).some((entry) => entry.preparedSave)) {
        this.pauseQueue = false;
        this.markQueueWritten();
        await this.queueGate;
      }
    }
  }
  const interleaveStorage = new ReconcileGateStorage();
  const interleaveScope = game.storageScopeKey("North", "reconcile-interleave");
  await interleaveStorage.setItem(game.scopedSaveKey(interleaveScope), JSON.stringify(baseSave()));
  const interleaveTransaction = evidence.transactUnwrittenMapEvent(
    interleaveStorage,
    interleaveScope,
    "north-library",
    "interleave-operation",
    (current) => {
      const next = {
        ...current,
        playSessionCount: 1,
        lastSessionId: "map-session-interleave",
        updatedAt: "2026-09-01T00:00:20.000Z",
      };
      return {
        event: game.createSessionEvent({
          save: next,
          gameSessionId: next.lastSessionId,
          eventType: "session_started",
          playSessionCount: 1,
          occurredAt: next.updatedAt,
        }),
        nextSave: next,
      };
    },
  );
  await interleaveStorage.queueWritten;
  const reconcileDuringWal = evidence.reconcileUnwrittenMapEvents(
    interleaveStorage, baseSave(), interleaveScope,
  );
  const reconciledTooSoon = await Promise.race([
    reconcileDuringWal.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 20)),
  ]);
  assert(!reconciledTooSoon, "reconciliation must wait behind the scoped queue/save transaction");
  interleaveStorage.releaseQueue();
  await Promise.all([interleaveTransaction, reconcileDuringWal]);
  const interleavedQueue = JSON.parse(await interleaveStorage.getItem(game.scopedQueueKey(interleaveScope)));
  assert(interleavedQueue.length === 1 && interleavedQueue[0].committed,
    "reconciliation between enqueue and save must not delete the prepared payload");
  checks.push("scoped_reconcile_enqueue_interleaving");

  const rapidStorage = new MemoryStorage();
  const rapidScope = game.storageScopeKey("North", "rapid-movement");
  const rapidScenario = game.UNWRITTEN_MAP_SCENARIOS[0];
  const directionOffsets = {
    up: { x: 0, y: 1 },
    down: { x: 0, y: -1 },
    left: { x: 1, y: 0 },
    right: { x: -1, y: 0 },
  };
  const rapidEntry = Object.entries(directionOffsets).map(([direction, offset]) => ({
    direction,
    position: {
      x: rapidScenario.position.x + offset.x,
      y: rapidScenario.position.y + offset.y,
    },
  })).find((candidate) =>
    game.samePosition(game.moveOnMap(candidate.position, candidate.direction), rapidScenario.position));
  assert(rapidEntry, "landmark fixture must have a walkable approach");
  const rapidInitial = game.updateMapPosition(baseSave(), rapidEntry.position, rapidEntry.direction);
  await rapidStorage.setItem(game.scopedSaveKey(rapidScope), JSON.stringify(rapidInitial));
  const rapidMoves = await Promise.all([
    evidence.transactUnwrittenMapMovement(
      rapidStorage, rapidScope, rapidInitial.libraryScopeId, "rapid-held-1",
      rapidEntry.direction, "map-session-rapid-held", 0,
    ),
    evidence.transactUnwrittenMapMovement(
      rapidStorage, rapidScope, rapidInitial.libraryScopeId, "rapid-held-2",
      rapidEntry.direction, "map-session-rapid-held", 1,
    ),
  ]);
  const rapidDurable = rapidMoves[1];
  const rapidQueue = await evidence.readQueuedUnwrittenMapEvents(rapidStorage, rapidScope);
  assert(game.samePosition(rapidDurable.position, rapidScenario.position)
    && rapidDurable.encounterAttempts[rapidScenario.id] === 1
    && rapidQueue.filter((item) => item.eventType === "encounter_presented").length === 1,
  "rapid held movement must stop durably on the landmark with exactly one persisted presentation");
  checks.push("atomic_rapid_landmark_movement");

  const churnStorage = new MemoryStorage();
  const churnScope = game.storageScopeKey("North", "ledger-churn-patron");
  const churnLibrary = "north-library";
  const ledgerScenario = game.UNWRITTEN_MAP_SCENARIOS[0];
  await churnStorage.setItem(game.scopedSaveKey(churnScope), JSON.stringify(baseSave()));
  let newestCorrectionId = "";
  for (let index = 0; index < 705; index += 1) {
    const outcomeAt = new Date(Date.parse("2026-09-02T00:00:00.000Z") + index * 2_000).toISOString();
    await evidence.transactUnwrittenMapEvent(churnStorage, churnScope, churnLibrary, `test-choice-${index}`, (current) => {
      const attempted = game.startEncounterAttempt(current, ledgerScenario.id, outcomeAt);
      const attempt = attempted.encounterAttempts[ledgerScenario.id];
      const choices = game.orderedChoices(ledgerScenario, attempted.anonymousPlayerId, attempt);
      const outcomeEvent = game.createChoiceMadeEvent({
        save: { ...attempted, position: ledgerScenario.position },
        scenario: ledgerScenario,
        presentedChoices: choices,
        selectedOptionId: choices[index % choices.length].id,
        attempt,
        gameSessionId: "map-session-ledger-churn",
        startedAtMs: 0,
        nowMs: 1_000,
        occurredAt: outcomeAt,
      });
      return {
        event: outcomeEvent,
        nextSave: game.applyMapOutcome(attempted, {
          scenarioId: ledgerScenario.id,
          kind: "choice",
          optionId: outcomeEvent.chosenOption.id,
          outcomeEvidence: {
            kind: "durable_event",
            schemaVersion: game.UNWRITTEN_MAP_EVENT_SCHEMA,
            eventId: outcomeEvent.eventId,
          },
          presentationId: outcomeEvent.presentationId,
          attempt,
          occurredAt: outcomeAt,
        }),
      };
    });
    let cycleFlush = await evidence.flushUnwrittenMapEvents(churnStorage, async () => true, churnScope);
    assert(cycleFlush.sent === 1 && cycleFlush.remaining === 0,
      `choice transaction ${index + 1} must commit only its queued evidence`);
    const undoneAt = new Date(Date.parse(outcomeAt) + 1_000).toISOString();
    await evidence.transactUnwrittenMapEvent(churnStorage, churnScope, churnLibrary, `test-undo-${index}`, (current) => {
      const decision = current.decisions.at(-1);
      assert(decision, `choice transaction ${index + 1} must be effective before undo`);
      const correction = game.createChoiceUndoneEvent({
        save: current,
        decision,
        gameSessionId: "map-session-ledger-churn",
        occurredAt: undoneAt,
      });
      newestCorrectionId = correction.eventId;
      return {
        event: correction,
        nextSave: game.undoMostRecentOutcome(current, correction.eventId, undoneAt),
      };
    });
    cycleFlush = await evidence.flushUnwrittenMapEvents(churnStorage, async () => true, churnScope);
    assert(cycleFlush.sent === 1 && cycleFlush.remaining === 0,
      `undo transaction ${index + 1} must commit only its queued evidence`);
  }
  const churnRaw = await churnStorage.getItem(game.scopedSaveKey(churnScope));
  const churnRestored = game.restoreUnwrittenMapSave(churnRaw, churnLibrary);
  assert(churnRestored?.decisions.length === 0
    && churnRestored.undoneDecisions.length === game.UNWRITTEN_MAP_MAX_UNDONE_DECISIONS
    && churnRestored.undoneDecisions.at(-1).correctionEventId === newestCorrectionId,
  "more than 700 real choice/undo transactions must preserve effective state and newest lineage");
  assert(churnRestored.committedEventIds.length <= game.UNWRITTEN_MAP_MAX_UNDONE_DECISIONS * 2,
    "ledger compaction must discard IDs whose queue and retained lineage no longer require them");
  const futureSave = await evidence.transactUnwrittenMapEvent(
    churnStorage, churnScope, churnLibrary, "test-after-churn", (current) => {
    const occurredAt = new Date(Date.parse(current.updatedAt) + 1_000).toISOString();
    const next = { ...current, playSessionCount: 1, lastSessionId: "map-session-after-churn", updatedAt: occurredAt };
    return {
      event: game.createSessionEvent({
        save: next,
        gameSessionId: next.lastSessionId,
        eventType: "session_started",
        playSessionCount: 1,
        occurredAt,
      }),
      nextSave: next,
    };
    },
  );
  await evidence.prepareUnwrittenMapQueueForReset(churnStorage, futureSave.committedEventIds, churnScope);
  const resetSave = game.createInitialUnwrittenMapSave(game.createUnwrittenMapPlayerId(1_800_000_000_000, 0.5), undefined, churnLibrary);
  await churnStorage.setItem(game.scopedSaveKey(churnScope), JSON.stringify(resetSave));
  const resetFlush = await evidence.flushUnwrittenMapEvents(churnStorage, async () => true, churnScope);
  assert(resetSave.committedEventIds.length === 0 && resetFlush.sent === 1 && resetFlush.remaining === 0,
    "reset must begin a fresh ledger while previously durable queued evidence remains deliverable");
  checks.push("bounded_ledger_compaction_after_700_transactions");

  const concurrentStorage = new MemoryStorage();
  const concurrentSave = game.recordDurableUnwrittenMapEvent(save, event.eventId);
  await concurrentStorage.setItem(game.scopedSaveKey(scopeA), JSON.stringify(concurrentSave));
  await evidence.queueUnwrittenMapEvent(concurrentStorage, event, scopeA);
  await evidence.commitUnwrittenMapEvent(concurrentStorage, event.eventId, scopeA);
  let releaseSend;
  let markSendStarted;
  const sendStarted = new Promise((resolveStarted) => { markSendStarted = resolveStarted; });
  const sendGate = new Promise((resolveSend) => { releaseSend = resolveSend; });
  const flushingOutsideLock = evidence.flushUnwrittenMapEvents(concurrentStorage, async () => {
    markSendStarted();
    await sendGate;
    return true;
  }, scopeA);
  await sendStarted;
  const concurrentEvent = game.createSessionEvent({
    save,
    gameSessionId: "map-session-test-001",
    eventType: "session_continued",
    playSessionCount: 1,
    occurredAt: "2026-09-01T00:00:08.000Z",
  });
  const queuedDuringSend = await Promise.race([
    evidence.queueUnwrittenMapEvent(concurrentStorage, concurrentEvent, scopeA).then(() => true),
    new Promise((resolveRace) => setTimeout(() => resolveRace(false), 250)),
  ]);
  assert(queuedDuringSend, "network sends must not hold the global queue mutation chain");
  releaseSend();
  await flushingOutsideLock;
  const afterConcurrentFlush = await evidence.readQueuedUnwrittenMapEvents(concurrentStorage, scopeA);
  assert(afterConcurrentFlush.length === 1 && afterConcurrentFlush[0].eventId === concurrentEvent.eventId,
    "flush merge must remove only sent IDs and preserve concurrently queued events");

  const overlappingStorage = new MemoryStorage();
  await overlappingStorage.setItem(game.scopedSaveKey(scopeA), JSON.stringify(concurrentSave));
  await evidence.queueUnwrittenMapEvent(overlappingStorage, event, scopeA);
  await evidence.commitUnwrittenMapEvent(overlappingStorage, event.eventId, scopeA);
  let releaseOverlap;
  let markOverlapStarted;
  let overlapSendCount = 0;
  const overlapStarted = new Promise((resolveStarted) => { markOverlapStarted = resolveStarted; });
  const overlapGate = new Promise((resolveSend) => { releaseOverlap = resolveSend; });
  const firstOverlapFlush = evidence.flushUnwrittenMapEvents(overlappingStorage, async () => {
    overlapSendCount += 1;
    markOverlapStarted();
    await overlapGate;
    return true;
  }, scopeA);
  await overlapStarted;
  const secondOverlapFlush = await evidence.flushUnwrittenMapEvents(overlappingStorage, async () => {
    overlapSendCount += 1;
    return true;
  }, scopeA);
  assert(secondOverlapFlush.sent === 0, "overlapping flushes must not send an in-flight event twice");
  releaseOverlap();
  await firstOverlapFlush;
  assert(overlapSendCount === 1, "one committed event must have only one concurrent sender");

  const batchStorage = new MemoryStorage();
  const batchEntries = Array.from({ length: evidence.UNWRITTEN_MAP_FLUSH_BATCH_SIZE + 3 }, (_, index) => ({
    event: game.createSessionEvent({
      save,
      gameSessionId: "map-session-batch-001",
      eventType: "session_continued",
      playSessionCount: 1,
      occurredAt: new Date(Date.UTC(2026, 8, 1, 0, 1, index)).toISOString(),
    }),
    committed: true,
  }));
  await batchStorage.setItem(game.scopedQueueKey(scopeA), JSON.stringify(batchEntries));
  let batchSendCount = 0;
  const batchFlush = await evidence.flushUnwrittenMapEvents(batchStorage, async () => {
    batchSendCount += 1;
    return true;
  }, scopeA);
  assert(batchSendCount === evidence.UNWRITTEN_MAP_FLUSH_BATCH_SIZE
    && batchFlush.remaining === 3,
  "each flush must send one bounded batch and retain the exact unsent tail");
  let timeoutAborted = false;
  try {
    await evidence.sendUnwrittenMapEventRequest(event, "https://example.invalid", {}, 1, async (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          timeoutAborted = true;
          reject(new Error("aborted"));
        }, { once: true });
      }));
  } catch {
    // The send layer surfaces its timeout; flush owns retry retention.
  }
  assert(timeoutAborted, "the send layer must deterministically abort a stalled fetch");
  checks.push("bounded_concurrent_flush_merge");

  const capacityStorage = new MemoryStorage();
  const capacityKey = game.scopedQueueKey(scopeA);
  const capacityEntries = Array.from({ length: evidence.UNWRITTEN_MAP_EVENT_QUEUE_CAPACITY - 2 }, (_, index) => {
    const occurredAt = new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
    return {
      event: game.createSessionEvent({
        save, gameSessionId: "map-session-capacity-001", eventType: "session_started",
        playSessionCount: 1, occurredAt,
      }),
      committed: false,
    };
  });
  await capacityStorage.setItem(capacityKey, JSON.stringify(capacityEntries));
  const beforeOverflow = await capacityStorage.getItem(capacityKey);
  const overflowEvent = game.createSessionEvent({
    save, gameSessionId: "map-session-capacity-001", eventType: "session_started",
    playSessionCount: 1, occurredAt: "2027-01-01T00:00:00.000Z",
  });
  let overflowError = "";
  try {
    await evidence.queueUnwrittenMapEvent(capacityStorage, overflowEvent, scopeA);
  } catch (error) {
    overflowError = error instanceof Error ? error.message : String(error);
  }
  assert(overflowError === "unwritten_map_event_queue_capacity_exceeded",
    "queue overflow must surface an explicit capacity error");
  assert(await capacityStorage.getItem(capacityKey) === beforeOverflow,
    "queue overflow must not mutate or discard pending evidence");
  const completedCapacitySave = {
    ...save,
    discoveredScenarioIds: game.UNWRITTEN_MAP_SCENARIOS.map((item) => item.id),
    decisions: game.UNWRITTEN_MAP_SCENARIOS.map((item) => ({ scenarioId: item.id })),
  };
  const terminalCompletion = game.createSessionEvent({
    save: completedCapacitySave,
    gameSessionId: "map-session-capacity-001",
    eventType: "session_completed",
    playSessionCount: 1,
    occurredAt: "2027-01-01T00:00:01.000Z",
  });
  const terminalExit = game.createSessionEvent({
    save,
    gameSessionId: "map-session-capacity-001",
    eventType: "session_exited",
    playSessionCount: 1,
    occurredAt: "2027-01-01T00:00:02.000Z",
  });
  await evidence.queueUnwrittenMapEvent(capacityStorage, terminalCompletion, scopeA);
  await evidence.queueUnwrittenMapEvent(capacityStorage, terminalExit, scopeA);
  assert((await evidence.readQueuedUnwrittenMapEvents(capacityStorage, scopeA)).length
    === evidence.UNWRITTEN_MAP_EVENT_QUEUE_CAPACITY,
  "reserved terminal capacity must admit completion and exit after ordinary evidence is full");
  checks.push("lossless_queue_with_terminal_reserve");

  assert(apiSource.includes("recommendation-games/the-unwritten-map/v2/${library}"), "API namespace must be V2 and library isolated");
  assert(apiSource.includes("recommendation-games/the-unwritten-map/v1/${player}")
    && apiSource.includes("normalizeUnwrittenMapChoiceEventV1"), "API must strictly accept legacy events into V1 only");
  assert(apiSource.includes('allowOverwrite: false'), "Blob writes must prohibit silent overwrite");
  assert(apiSource.includes("unwritten_map_event_id_conflict") && apiSource.includes("idempotentReplay"), "API needs conflict detection and replay semantics");
  assert(apiSource.includes('access: "private"') && apiSource.includes("requestOriginMatchesHost"), "API needs private storage and origin checks");
  assert(apiSource.includes("normalizeUnwrittenMapEventV2") && apiSource.includes("event_too_large"), "API needs strict V2 allowlist and payload bound");
  assert(game.normalizeLibraryScope("../../A Weird/Library") === "a-weird-library", "library path segments must be normalized");
  checks.push("durable_api_isolation_and_idempotency");

  assert(routeSource.includes('document.addEventListener("keydown"') && routeSource.includes('document.addEventListener("keyup"'), "held keyboard controls missing");
  assert(routeSource.includes("setInterval") && routeSource.includes("MOVE_CADENCE_MS"), "movement cadence must not use browser repeat");
  assert(routeSource.includes("mapFocusedRef.current") && routeSource.includes("event.preventDefault()"), "keyboard scroll must only be suppressed during active play");
  assert(routeSource.includes("onPressIn") && routeSource.includes("onPressOut"), "touch D-pad hold controls missing");
  assert(routeSource.includes('accessibilityLabel={`Move ${direction}`}') && routeSource.includes('accessibilityRole="button"'), "movement accessibility buttons missing");
  assert(routeSource.includes("walkingFrame") && routeSource.includes("bumpDirection"), "walking animation and bump feedback missing");
  assert(routeSource.includes("NONE OF THESE · KEEP EXPLORING") && routeSource.includes("What the map remembers"), "skip/privacy UX missing");
  assert(routeSource.includes("window.confirm") && routeSource.includes("UNDO LATEST NOTE"), "reset confirmation or journal undo missing");
  assert(routeSource.includes('window.addEventListener("blur"') && routeSource.includes('"visibilitychange"')
    && routeSource.includes('AppState.addEventListener("change"'), "web and native lifecycle movement cancellation missing");
  assert(routeSource.includes("useEffect(() => () => clearMovementState(false)")
    && routeSource.includes("heldKeysRef.current.clear()"), "unmount must clear native and web held movement state");
  assert(routeSource.includes("const nextGameSessionId = createGameSessionId()")
    && routeSource.includes("gameSessionIdRef.current = nextGameSessionId")
    && routeSource.includes("completionEmittedRef.current = false")
    && routeSource.includes("stepsThisSessionRef.current = 0"), "new maps must reset every session identity/counter");
  const beginSource = routeSource.slice(routeSource.indexOf("const beginJourney"), routeSource.indexOf("const recordOutcome"));
  const leaveSource = routeSource.slice(routeSource.indexOf("const leaveJourney"), routeSource.indexOf("const resetJourney"));
  assert(beginSource.indexOf("lifecyclePendingRef.current = true") < beginSource.indexOf("await ")
    && leaveSource.indexOf("lifecyclePendingRef.current = true") < leaveSource.indexOf("await "),
  "begin and leave must synchronously acquire the ref-backed lifecycle mutex");
  assert(routeSource.includes("beginning={operationPending}") && routeSource.includes("leaving={operationPending}")
    && routeSource.includes("disabled={beginning}") && routeSource.includes("disabled={leaving}"),
  "lifecycle controls must be disabled while their transaction is pending");
  assert(leaveSource.indexOf("await queueSaveCommit") < leaveSource.indexOf("router.replace")
    && leaveSource.includes("Stay on this map and retry Exit"),
  "exit navigation must wait for local queue/save/commit and expose a clear retry on failure");
  const completionSource = routeSource.slice(routeSource.indexOf("const queueCompletionEvent"), routeSource.indexOf("useEffect(() =>"));
  const continueSource = routeSource.slice(routeSource.indexOf("const continueFromResult"), routeSource.indexOf("const retryCompletion"));
  assert(completionSource.indexOf("await transactUnwrittenMapCompletion") < completionSource.indexOf("completionEmittedRef.current = true")
    && evidenceSource.includes("if (!isUnwrittenMapJourneyComplete(current))")
    && evidenceSource.includes('throw new Error("unwritten_map_stale_completion")'),
    "completion emission state must change only after the durable transaction");
  assert(continueSource.indexOf("await queueCompletionEvent()") < continueSource.indexOf('setPhase("complete")')
    && !continueSource.includes('const current = saveRef.current;\n    setPhase("complete")')
    && routeSource.includes("loadDurableUnwrittenMapJourney")
    && routeSource.includes("reloadAfterStaleCompletion")
    && routeSource.includes("This map changed in another session before completion"),
  "result continuation must recheck durable completion before entering complete and reload a stale session");
  assert(routeSource.includes("RETRY FINAL FIELD NOTE")
    && routeSource.includes("completionPendingRef.current")
    && routeSource.includes("updateCompletionPending(true)")
    && routeSource.includes("await queueCompletionEvent()")
    && routeSource.includes("resolvePendingCompletionForTerminalAction")
    && routeSource.includes("clearStaleCompletionState")
    && routeSource.includes("DRAW A NEW MAP")
    && !routeSource.includes("disabled={props.busy || props.completionPending}"),
  "completion retry must stay explicit while stale retry state cannot trap reset or exit");
  assert(routeSource.includes("sameUnwrittenMapDecisionIdentity(latestDecision, decision)")
    && routeSource.includes("unwritten_map_stale_undo")
    && routeSource.includes("Nothing was undone; the latest field notes are now shown"),
  "undo must reject a stale displayed decision, reload durable state, and explain the stale session");
  assert(routeSource.includes('error.message === "scenario_already_completed"')
    && routeSource.includes("This landmark was already completed in another session")
    && routeSource.includes("reloadDurableJourney"),
  "a concurrently completed encounter must reload and reconcile without retrying the stale choice");
  assert(contractSource.includes("libraryScopeId: string")
    && contractSource.includes("value.libraryScopeId !== normalizeLibraryScope(libraryScopeId)")
    && !contractSource.includes("restoreUnwrittenMapSave(raw: string | null, libraryScopeId ="),
  "V2 restore must require and enforce the requested normalized library scope");
  assert(routeSource.includes("transactUnwrittenMapEvent")
    && evidenceSource.includes("serializeUnwrittenMapTransaction")
    && evidenceSource.includes("preparedSave")
    && evidenceSource.includes("await queueOperation(storage, scopeKey")
    && evidenceSource.includes("await writeSaveRevision(storage, scopedSaveKey(scopeKey), durableSave")
    && evidenceSource.includes("await commitQueueEntry(storage, transaction.event.eventId"),
  "queue WAL, revisioned save, and queue commit must share one resumable serialized transaction");
  assert(routeSource.includes("operationPendingRef.current = true")
    && routeSource.includes("resetUnwrittenMapJourney")
    && !routeSource.includes("committedEventIds: [...(saveRef.current"),
  "outcome/lifecycle guards and reset must synchronously exclude incompatible operations and rotate the ledger");
  assert(evidenceSource.includes("new AbortController()") && evidenceSource.includes("UNWRITTEN_MAP_SEND_TIMEOUT_MS")
    && evidenceSource.includes("signal: controller.signal"),
  "evidence fetches need an explicit abort timeout");
  checks.push("lifecycle_mutex_terminal_retry_and_send_timeout");

  assert(!contractSource.includes("TasteFeedbackEvent") && !contractSource.includes("personality"), "V2 cannot write derived recommender/personality truth");
  assert(!contractSource.includes("email") && !contractSource.includes("student") && !contractSource.includes("ipAddress"), "event contract must exclude identifying fields");
  assert(contractSource.includes('preferenceInference: "none_from_exploration"'), "route/order telemetry must be explicitly non-preference");
  assert(routeSource.includes("a broad response-pace category") && !routeSource.includes("response-time range"),
    "privacy copy must describe category-only response timing");
  assert(legacyEvent.responseTimeMs === 4_000 && game.isUnwrittenMapChoiceEventV1(legacyEvent),
    "historical V1 exact timing must remain supported unchanged");
  checks.push("privacy_category_only_v2_and_legacy_v1");

  console.log(JSON.stringify({
    name: "the-unwritten-map-v2-regressions",
    status: "pass",
    checks,
    count: checks.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
