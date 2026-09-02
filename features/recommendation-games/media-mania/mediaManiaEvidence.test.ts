import assert from "node:assert/strict";
import test from "node:test";
import {
  MEDIA_MANIA_AGE_BANDS,
  MEDIA_MANIA_SOURCES,
  chooseMediaManiaCandidate,
  createMediaManiaState,
  markMediaManiaCandidateUnknown,
  recordMediaManiaSessionContinued,
  recordMediaManiaSessionStarted,
  resolveMediaManiaUnlock,
  startMediaMania,
  undoLastMediaManiaChoice,
  type MediaManiaEvent,
  type MediaManiaState,
} from "./mediaManiaCore.mjs";
import {
  appendMediaManiaEvidence,
  listMediaManiaEvidence,
  type MediaManiaEvidenceStore,
} from "../../../lib/mediaMania/evidenceStorage";
import { syncMediaManiaEvents } from "./mediaManiaEvidenceClient";

process.env.MEDIA_MANIA_EVIDENCE_SECRET = "deterministic-test-secret";

const random = () => 0;
const catalog = MEDIA_MANIA_SOURCES.flatMap((mediaSource) =>
  Array.from({ length: 14 }, (_, index) => ({
    id: `${mediaSource}-${index}`,
    source: `fixture:${mediaSource}`,
    mediaSource,
    title: `${mediaSource} ${index}`,
    creator: `creator ${index}`,
    ageBands: [...MEDIA_MANIA_AGE_BANDS],
    traitKeys: [`tone:${index % 3}`, `pace:${index % 2}`],
  })),
);

class MemoryEvidenceStore implements MediaManiaEvidenceStore {
  readonly values = new Map<string, unknown>();
  failWrites = false;

  async read(pathname: string) {
    return this.values.get(pathname) || null;
  }

  async put(pathname: string, value: unknown) {
    if (this.failWrites) throw new Error("simulated_write_failure");
    if (this.values.has(pathname)) throw new Error("already_exists");
    this.values.set(pathname, value);
  }

  async list(prefix: string) {
    return [...this.values.keys()].filter((pathname) => pathname.startsWith(prefix));
  }
}

function deterministicSession() {
  let state!: MediaManiaState;
  const events: MediaManiaEvent[] = [];
  const apply = (result: { state: MediaManiaState; events: MediaManiaEvent[] }) => {
    state = result.state;
    events.push(...result.events);
  };

  apply(recordMediaManiaSessionStarted(createMediaManiaState({
    playerId: "patron-test-player",
    sessionId: "mm-session-e2e",
    libraryId: "library-a",
    ageBand: "teens",
    nowMs: 1_000,
  }), { nowMs: 1_001 }));
  apply(startMediaMania(state!, "movies", catalog, { random, nowMs: 2_000 }));
  apply(chooseMediaManiaCandidate(state!, state!.currentRound!.candidates[0].id, catalog, { random, nowMs: 3_000 }));
  const unknownId = state!.currentRound!.candidates[1].id;
  apply(markMediaManiaCandidateUnknown(state!, unknownId, catalog, { random, nowMs: 3_500 }));
  apply(chooseMediaManiaCandidate(state!, state!.currentRound!.candidates[0].id, catalog, { random, nowMs: 4_000 }));
  apply(chooseMediaManiaCandidate(state!, state!.currentRound!.candidates[0].id, catalog, { random, nowMs: 5_000 }));
  assert.equal(state!.currentRound!.roundType, "DISLIKE");
  apply(chooseMediaManiaCandidate(state!, state!.currentRound!.candidates[0].id, catalog, { random, nowMs: 6_000 }));
  while (state!.unlockStatus !== "offered") {
    apply(chooseMediaManiaCandidate(state!, state!.currentRound!.candidates[0].id, catalog, {
      random,
      nowMs: 7_000 + state!.completedRoundCount,
    }));
  }
  apply(resolveMediaManiaUnlock(state!, state!.unlockOptions[0], catalog, { random, nowMs: 8_000 }));
  assert.equal(state!.currentRound!.isCrossMedia, true);
  apply(chooseMediaManiaCandidate(state!, state!.currentRound!.candidates[0].id, catalog, { random, nowMs: 9_000 }));
  apply(undoLastMediaManiaChoice(state!, { nowMs: 9_100 }));
  return { state: state!, events, unknownId };
}

test("deterministic evidence reconstructs gameplay without misclassifying unknown or undo", () => {
  const session = deterministicSession();
  assert.deepEqual(session.events.map((event) => event.eventSequence), session.events.map((_event, index) => index + 1));
  assert.ok(session.events.every((event) => event.libraryId === "library-a" && event.activeAgeBand === "teens"));
  assert.ok(session.events.some((event) => event.action === "session_started"));
  assert.ok(session.events.some((event) => event.action === "starting_source_selected"));
  assert.ok(session.events.some((event) => event.action === "round_presented"));
  const unknown = session.events.find((event) => event.action === "candidate_marked_unknown");
  assert.equal(unknown?.scoreDelta, 0);
  assert.equal(unknown?.replacedCandidateId, session.unknownId);
  assert.ok((unknown?.replacementItem as { id?: string })?.id);
  assert.ok(!session.state.negativeItemIds.includes(session.unknownId));
  const dislike = session.events.find((event) => event.action === "round_completed" && event.roundType === "DISLIKE");
  assert.ok((dislike?.selectedItem as { id?: string })?.id);
  const unlock = session.events.find((event) => event.action === "source_unlock_selected");
  assert.ok(Array.isArray(unlock?.offeredMediaSources) && unlock?.selectedMediaSource);
  const crossMedia = session.events.filter((event) => event.action === "round_completed").find((event) => event.isCrossMedia);
  assert.ok(crossMedia);
  assert.ok(new Set((crossMedia?.candidates as Array<{ mediaSource: string }>).map((item) => item.mediaSource)).size > 1);
  const undo = session.events.find((event) => event.action === "round_choice_undone");
  assert.ok(undo?.reversedEventId);
  assert.equal(undo?.tasteScoreAfter, session.state.tasteScore);
});

test("durable evidence is encrypted, idempotent, retrievable, and library isolated", async () => {
  const store = new MemoryEvidenceStore();
  const session = deterministicSession();
  const first = await appendMediaManiaEvidence("library-a", session.events, store);
  assert.equal(first.accepted, session.events.length);
  const second = await appendMediaManiaEvidence("library-a", session.events, store);
  assert.equal(second.accepted, 0);
  assert.equal(second.duplicates, session.events.length);
  assert.ok(!JSON.stringify([...store.values.values()]).includes("patron-test-player"));
  const libraryA = await listMediaManiaEvidence("library-a", "mm-session-e2e", store);
  const libraryB = await listMediaManiaEvidence("library-b", "mm-session-e2e", store);
  assert.equal(libraryA.length, session.events.length);
  assert.ok(libraryA.every((event) => event.evidenceTrust === "anonymous_client_observation"));
  assert.equal(libraryB.length, 0);
});

test("durable write failures surface and continuation preserves the session identity", async () => {
  const store = new MemoryEvidenceStore();
  store.failWrites = true;
  const session = deterministicSession();
  await assert.rejects(
    appendMediaManiaEvidence("library-a", [session.events[0]], store),
    /simulated_write_failure/,
  );
  const continued = recordMediaManiaSessionContinued(session.state, { nowMs: 10_000 });
  assert.equal(continued.state.sessionId, session.state.sessionId);
  assert.equal(continued.events[0].action, "session_continued");
  assert.equal(continued.events[0].resumedRoundId, session.state.currentRound?.id);
  assert.equal(continued.events[0].activeAgeBand, "teens");
});

test("durable validation rejects direct identifiers and conflicting duplicate event IDs", async () => {
  const store = new MemoryEvidenceStore();
  const event = deterministicSession().events[0];
  await assert.rejects(
    appendMediaManiaEvidence("library-a", [{ ...event, studentId: "12345" }], store),
    /invalid_media_mania_event/,
  );
  await appendMediaManiaEvidence("library-a", [event], store);
  await assert.rejects(
    appendMediaManiaEvidence("library-a", [{ ...event, action: "session_continued" }], store),
    /media_mania_event_identity_conflict/,
  );
});

test("client synchronization reports durable persistence failures without reclassifying events", async () => {
  const events = deterministicSession().events;
  const failed = await syncMediaManiaEvents("library-a", events, {
    endpoint: "https://example.test/api/media-mania-events",
    request: async () => new Response(
      JSON.stringify({ error: "media_mania_evidence_write_failed" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    ),
  });
  assert.deepEqual(failed, { synced: false, error: "media_mania_evidence_write_failed" });
  assert.ok(events.some((event) => event.action === "candidate_marked_unknown" && event.scoreDelta === 0));
});

test("versioned encryption keys keep evidence readable during secret rotation", async () => {
  const store = new MemoryEvidenceStore();
  const event = deterministicSession().events[0];
  process.env.MEDIA_MANIA_EVIDENCE_SECRET = "old-evidence-secret";
  await appendMediaManiaEvidence("library-a", [event], store);
  process.env.MEDIA_MANIA_EVIDENCE_SECRET = "new-evidence-secret";
  process.env.MEDIA_MANIA_EVIDENCE_PREVIOUS_SECRETS = "old-evidence-secret";
  assert.equal((await listMediaManiaEvidence("library-a", "mm-session-e2e", store)).length, 1);
  delete process.env.MEDIA_MANIA_EVIDENCE_PREVIOUS_SECRETS;
  await assert.rejects(
    listMediaManiaEvidence("library-a", "mm-session-e2e", store),
    /media_mania_evidence_decryption_failed/,
  );
  process.env.MEDIA_MANIA_EVIDENCE_SECRET = "deterministic-test-secret";
});
