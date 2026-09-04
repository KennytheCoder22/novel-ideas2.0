import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import {
  UNWRITTEN_MAP_SCENARIOS,
  applyMapOutcome,
  cameraOrigin,
  createChoiceMadeEvent,
  createChoiceUndoneEvent,
  createEncounterSkippedEvent,
  createInitialUnwrittenMapSave,
  createSessionEvent,
  createUnwrittenMapPlayerId,
  isUnwrittenMapJourneyComplete,
  monotonicUnwrittenMapTimestamp,
  orderedChoices,
  regionAt,
  restoreUnwrittenMapSave,
  sameUnwrittenMapDecisionIdentity,
  samePosition,
  scenarioAt,
  scopedSaveKey,
  storageScopeKey,
  tileAt,
  undoMostRecentOutcome,
  type MapChoice,
  type MapDirection,
  type MapScenario,
  type UnwrittenMapEvent,
  type UnwrittenMapEventV2,
  type UnwrittenMapSaveV2,
} from "../../lib/recommendationGames/unwrittenMap";
import {
  flushUnwrittenMapEvents,
  initializeUnwrittenMapJourney,
  loadDurableUnwrittenMapJourney,
  migrateLegacyUnwrittenMapSaveForScope,
  reconcileUnwrittenMapEvents,
  resetUnwrittenMapJourney,
  sendUnwrittenMapEventRequest,
  transactUnwrittenMapEvent,
  transactUnwrittenMapCompletion,
  transactUnwrittenMapMovement,
} from "../../lib/recommendationGames/unwrittenMapEvidenceClient";
import type { AsyncKeyValueStorage } from "../../lib/recommendationGames/evidenceClient";
import { GameRecommendationReward } from "../../components/GameRecommendationReward";
import { useGameRecommendationMilestone } from "../../hooks/useGameRecommendationMilestone";
import { adaptUnwrittenMapChoiceToSignal, UNWRITTEN_MAP_EVIDENCE_MODE } from "../../lib/recommendationGames/gameRecommendationEvidenceAdapters";
import { unwrittenMapMilestone } from "../../lib/recommendationGames/gameRecommendationMilestones";
import { buildGameRouteSourceParams, parseGameRouteConfig, type GameRouteParams } from "../../lib/recommendationGames/gameRecommendationRouteConfig";

type GamePhase = "title" | "map" | "encounter" | "result" | "complete";

const webStorage: AsyncKeyValueStorage = {
  async getItem(key) {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  },
  async setItem(key, value) {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  },
};

const gameStorage: AsyncKeyValueStorage = Platform.OS === "web" ? webStorage : AsyncStorage;
const nativeApiOrigin = String(process.env.EXPO_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
const MOVE_CADENCE_MS = 135;

function createGameSessionId(): string {
  return `map-session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function createOperationId(kind: string): string {
  const label = kind.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 24);
  return `umo-${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

async function sendUnwrittenMapEvent(event: UnwrittenMapEvent): Promise<boolean> {
  if (Platform.OS !== "web" && !nativeApiOrigin) return false;
  return sendUnwrittenMapEventRequest(
    event,
    `${nativeApiOrigin}/api/unwritten-map-event`,
    Platform.OS !== "web" ? { origin: nativeApiOrigin } : {},
  );
}

function PlayerSprite({ facing, walkingFrame }: { facing: MapDirection; walkingFrame: number }) {
  const horizontal = facing === "left" || facing === "right";
  return (
    <View
      style={[
        styles.playerSprite,
        horizontal && { transform: [{ scaleX: facing === "left" ? -1 : 1 }] },
        walkingFrame === 1 && styles.playerStep,
      ]}
      accessibilityLabel={`Your cartographer facing ${facing}`}
    >
      <View style={styles.playerHatTop} />
      <View style={styles.playerHatBrim} />
      <View style={styles.playerFace}>
        {facing !== "up" ? <View style={[styles.playerEye, horizontal && styles.playerEyeSide]} /> : null}
      </View>
      <View style={styles.playerCoat} />
      <View style={[styles.playerFeet, walkingFrame === 1 && styles.playerFeetStep]}>
        <View style={styles.playerFoot} /><View style={styles.playerFoot} />
      </View>
    </View>
  );
}

function LandmarkSprite({ scenario, completed }: { scenario: MapScenario; completed: boolean }) {
  return (
    <View style={[styles.landmark, { backgroundColor: completed ? "#657057" : scenario.color }]}>
      <View style={styles.landmarkRoof} />
      <View style={styles.landmarkDoor} />
      <Text style={styles.landmarkLabel}>{completed ? "✓" : scenario.mapLabel.slice(0, 2)}</Text>
    </View>
  );
}

function WorldTile({
  x, y, size, save, walkingFrame,
}: { x: number; y: number; size: number; save: UnwrittenMapSaveV2; walkingFrame: number }) {
  const position = { x, y };
  const tile = tileAt(position);
  const scenario = scenarioAt(position);
  const hasPlayer = samePosition(position, save.position);
  return (
    <View style={[
      styles.tile, { width: size, height: size },
      tile === "T" && styles.treeTile, tile === "G" && styles.grassTile,
      tile === "P" && styles.pathTile, tile === "W" && styles.waterTile,
      tile === "S" && styles.sandTile, tile === "M" && styles.mountainTile,
    ]}>
      {tile === "T" ? <><View style={styles.treeCrown} /><View style={styles.treeTrunk} /></> : null}
      {tile === "G" && (x * 3 + y) % 5 === 0 ? <View style={styles.grassTuft} /> : null}
      {tile === "W" ? <View style={styles.waterLine} /> : null}
      {tile === "M" ? <View style={styles.mountainPeak} /> : null}
      {scenario ? <LandmarkSprite scenario={scenario} completed={save.decisions.some((item) => item.scenarioId === scenario.id)} /> : null}
      {hasPlayer ? <PlayerSprite facing={save.facing} walkingFrame={walkingFrame} /> : null}
    </View>
  );
}

function WorldMap({
  save, tileSize, columns, rows, walkingFrame, bumpDirection, onActivate, onDeactivate,
}: {
  save: UnwrittenMapSaveV2;
  tileSize: number;
  columns: number;
  rows: number;
  walkingFrame: number;
  bumpDirection: MapDirection | null;
  onActivate: () => void;
  onDeactivate: () => void;
}) {
  const origin = cameraOrigin(save.position, columns, rows);
  const bumpTransform = bumpDirection === "left" ? { translateX: -3 }
    : bumpDirection === "right" ? { translateX: 3 }
      : bumpDirection === "up" ? { translateY: -3 }
        : bumpDirection === "down" ? { translateY: 3 } : undefined;
  return (
    <View
      style={[styles.viewport, { width: columns * tileSize + 8, height: rows * tileSize + 8 }]}
      accessibilityLabel="The Unwritten Map overworld. Focus to use arrow or WASD controls."
      accessibilityRole="image"
      focusable
      onFocus={onActivate}
      onBlur={onDeactivate}
      onTouchStart={onActivate}
    >
      <View style={bumpTransform ? [styles.worldMap, { transform: [bumpTransform] }] : styles.worldMap}>
        {Array.from({ length: rows }, (_, rowOffset) => {
          const y = origin.y + rowOffset;
          return (
            <View key={`row-${y}`} style={styles.mapRow}>
              {Array.from({ length: columns }, (_, columnOffset) => {
                const x = origin.x + columnOffset;
                return <WorldTile key={`${x}-${y}`} x={x} y={y} size={tileSize} save={save} walkingFrame={walkingFrame} />;
              })}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function DirectionButton({
  direction, label, onMove, onHoldStart, onHoldEnd,
}: {
  direction: MapDirection;
  label: string;
  onMove: (direction: MapDirection) => void;
  onHoldStart: (direction: MapDirection) => void;
  onHoldEnd: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.directionButton}
      onPress={() => onMove(direction)}
      onPressIn={() => onHoldStart(direction)}
      onPressOut={onHoldEnd}
      accessibilityRole="button"
      accessibilityLabel={`Move ${direction}`}
      accessibilityHint="Press and hold to keep walking"
    >
      <Text style={styles.directionText}>{label}</Text>
    </TouchableOpacity>
  );
}

function DPad(props: {
  onMove: (direction: MapDirection) => void;
  onHoldStart: (direction: MapDirection) => void;
  onHoldEnd: () => void;
}) {
  const button = (direction: MapDirection, label: string) =>
    <DirectionButton direction={direction} label={label} {...props} />;
  return (
    <View style={styles.dPad}>
      <View style={styles.dPadRow}><View style={styles.directionSpacer} />{button("up", "▲")}<View style={styles.directionSpacer} /></View>
      <View style={styles.dPadRow}>{button("left", "◀")}<View style={styles.dPadCenter} />{button("right", "▶")}</View>
      <View style={styles.dPadRow}><View style={styles.directionSpacer} />{button("down", "▼")}<View style={styles.directionSpacer} /></View>
    </View>
  );
}

function GameHeader({ save, onLeave, leaving }: { save: UnwrittenMapSaveV2; onLeave: () => void; leaving: boolean }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={[styles.headerButton, leaving && styles.buttonDisabled]} disabled={leaving} onPress={onLeave} accessibilityRole="button" accessibilityLabel="Save and leave The Unwritten Map">
        <Text style={styles.headerButtonText}>{leaving ? "SAVING..." : "EXIT"}</Text>
      </TouchableOpacity>
      <View style={styles.headerTitleWrap}>
        <Text style={styles.headerKicker}>A CARTOGRAPHER&apos;S TALE</Text>
        <Text style={styles.headerTitle}>THE UNWRITTEN MAP</Text>
      </View>
      <View style={styles.headerProgress}>
        <Text style={styles.headerProgressValue}>{save.decisions.length}/{UNWRITTEN_MAP_SCENARIOS.length}</Text>
        <Text style={styles.headerProgressLabel}>MARKS</Text>
      </View>
    </View>
  );
}

function TitleScreen({
  hasProgress, onBegin, onPrivacy, onReset, beginning,
}: { hasProgress: boolean; onBegin: () => void; onPrivacy: () => void; onReset: () => void; beginning: boolean }) {
  return (
    <ScrollView contentContainerStyle={styles.titleScreen}>
      <View style={styles.titleMap}>
        <View style={styles.titleRiver} /><View style={styles.titleRoadHorizontal} /><View style={styles.titleRoadVertical} />
        <View style={[styles.titleLandmark, { left: 24, top: 28 }]} /><View style={[styles.titleLandmark, { right: 25, top: 44 }]} />
        <View style={[styles.titleLandmark, { left: 74, bottom: 25 }]} />
      </View>
      <Text style={styles.titleKicker}>A POCKET-SIZED JOURNEY</Text>
      <Text style={styles.titleLogo}>THE{"\n"}UNWRITTEN MAP</Text>
      <Text style={styles.titleCopy}>Cross five wild regions, meet their curious inhabitants, and make a map no other traveler could draw.</Text>
      <TouchableOpacity style={[styles.primaryButton, beginning && styles.buttonDisabled]} disabled={beginning} onPress={onBegin} accessibilityRole="button">
        <Text style={styles.primaryButtonText}>{beginning ? "OPENING..." : hasProgress ? "CONTINUE JOURNEY" : "OPEN THE MAP"}</Text>
      </TouchableOpacity>
      <Text style={styles.titleHint}>Focus the map for Arrow/WASD controls, or hold the direction pad.</Text>
      <TouchableOpacity style={styles.textButton} onPress={onPrivacy} accessibilityRole="button">
        <Text style={styles.textButtonText}>What the map remembers</Text>
      </TouchableOpacity>
      {hasProgress ? <TouchableOpacity style={[styles.textButton, beginning && styles.buttonDisabled]} disabled={beginning} onPress={onReset} accessibilityRole="button">
        <Text style={styles.resetText}>Reset this journey</Text>
      </TouchableOpacity> : null}
    </ScrollView>
  );
}

function PrivacyNote({ onClose }: { onClose: () => void }) {
  return (
    <View style={styles.notePanel}>
      <Text style={styles.noteTitle}>WHAT THE MAP REMEMBERS</Text>
      <Text style={styles.noteText}>
        This device saves your anonymous journey, encounter options, choices or skips, corrections, and a broad response-pace category.
        Walking routes never count as preferences. Notes may wait locally until syncing is available; no name or email is sent.
      </Text>
      <TouchableOpacity style={styles.smallButton} onPress={onClose} accessibilityRole="button"><Text style={styles.smallButtonText}>CLOSE</Text></TouchableOpacity>
    </View>
  );
}

function EncounterPanel({
  scenario, choices, submitting, onChoose, onSkip,
}: {
  scenario: MapScenario;
  choices: MapChoice[];
  submitting: boolean;
  onChoose: (choice: MapChoice) => void;
  onSkip: () => void;
}) {
  return (
    <View style={styles.dialoguePanel}>
      <View style={[styles.dialogueLocation, { backgroundColor: scenario.color }]}>
        <Text style={styles.dialogueLocationText}>{scenario.location.toUpperCase()} · {scenario.type.toUpperCase()}</Text>
      </View>
      <Text style={styles.dialogueTitle}>{scenario.title}</Text>
      <Text style={styles.dialoguePrompt}>{scenario.prompt}</Text>
      <View style={styles.choiceGrid}>
        {choices.map((item, index) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.choiceButton, submitting && styles.buttonDisabled]}
            disabled={submitting}
            onPress={() => onChoose(item)}
            accessibilityRole="button"
            accessibilityLabel={`Option ${index + 1}: ${item.label}. ${item.description}`}
          >
            <Text style={styles.choiceNumber}>{index + 1}</Text>
            <View style={styles.choiceCopy}><Text style={styles.choiceLabel}>{item.label}</Text><Text style={styles.choiceDescription}>{item.description}</Text></View>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={styles.skipButton} disabled={submitting} onPress={onSkip} accessibilityRole="button">
        <Text style={styles.skipText}>NONE OF THESE · KEEP EXPLORING</Text>
      </TouchableOpacity>
      <Text style={styles.equalNote}>Every path is a good path. You can also change your latest field note.</Text>
    </View>
  );
}

function ResultPanel({
  scenario, choice, skipped, onContinue, pending,
}: { scenario: MapScenario; choice: MapChoice | null; skipped: boolean; onContinue: () => void; pending: boolean }) {
  return (
    <View style={styles.dialoguePanel}>
      <Text style={styles.resultStamp}>{skipped ? "LANDMARK NOTED" : "STORY ADDED TO MAP"}</Text>
      <Text style={styles.dialogueTitle}>{scenario.location}</Text>
      {choice ? <><Text style={styles.resultChoice}>{choice.label}</Text><Text style={styles.resultText}>{choice.result}</Text></> : (
        <Text style={styles.resultText}>You mark the place with a small open circle. It can remain a possibility, without meaning anything more.</Text>
      )}
      <TouchableOpacity style={[styles.primaryButton, pending && styles.buttonDisabled]} disabled={pending} onPress={onContinue} accessibilityRole="button">
        <Text style={styles.primaryButtonText}>RETURN TO THE ROAD</Text>
      </TouchableOpacity>
    </View>
  );
}

function Journal({
  save, onUndo, undoing,
}: { save: UnwrittenMapSaveV2; onUndo: () => void; undoing: boolean }) {
  return (
    <View style={styles.journal}>
      <Text style={styles.journalHeading}>FIELD NOTES</Text>
      {save.decisions.length ? save.decisions.map((decision) => {
        const scenario = UNWRITTEN_MAP_SCENARIOS.find((item) => item.id === decision.scenarioId);
        const selected = scenario?.choices.find((item) => item.id === decision.optionId);
        return (
          <View key={`${decision.scenarioId}:${decision.presentationId}`} style={styles.journalRow}>
            <View style={[styles.journalMark, { backgroundColor: scenario?.color || INK }]} />
            <View style={styles.journalCopy}>
              <Text style={styles.journalPlace}>{scenario?.location || decision.scenarioId}</Text>
              <Text style={styles.journalDecision}>{decision.kind === "skip" ? "Left as an open possibility" : selected?.label}</Text>
            </View>
          </View>
        );
      }) : <Text style={styles.emptyJournal}>Colored landmarks become notes as you explore.</Text>}
      {save.decisions.length ? (
        <TouchableOpacity style={styles.undoButton} onPress={onUndo} disabled={undoing} accessibilityRole="button" accessibilityLabel="Undo most recent encounter outcome">
          <Text style={styles.undoText}>{undoing ? "CORRECTING..." : "UNDO LATEST NOTE"}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function CompleteScreen(props: {
  save: UnwrittenMapSaveV2;
  onUndo: () => void;
  undoing: boolean;
  onRestart: () => void;
  onLeave: () => void;
  onRetryCompletion: () => void;
  leaving: boolean;
  busy: boolean;
  completionPending: boolean;
}) {
  return (
    <View style={styles.completeScreen}>
      <Text style={styles.completeKicker}>THE GRAND JOURNEY IS COMPLETE</Text>
      <Text style={styles.completeTitle}>The blank country has become your story.</Text>
      <Text style={styles.completeCopy}>No road was wrong. Your choices, open possibilities, and corrections made this map entirely yours.</Text>
      <Journal save={props.save} onUndo={props.onUndo} undoing={props.undoing} />
      {props.completionPending ? (
        <TouchableOpacity style={[styles.primaryButton, props.busy && styles.buttonDisabled]} disabled={props.busy} onPress={props.onRetryCompletion} accessibilityRole="button">
          <Text style={styles.primaryButtonText}>{props.busy ? "RETRYING..." : "RETRY FINAL FIELD NOTE"}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={[styles.primaryButton, props.busy && styles.buttonDisabled]} disabled={props.busy} onPress={props.onRestart} accessibilityRole="button"><Text style={styles.primaryButtonText}>DRAW A NEW MAP</Text></TouchableOpacity>
      )}
      {props.completionPending ? (
        <TouchableOpacity style={[styles.textButton, props.busy && styles.buttonDisabled]} disabled={props.busy} onPress={props.onRestart} accessibilityRole="button"><Text style={styles.textButtonText}>DRAW A NEW MAP</Text></TouchableOpacity>
      ) : null}
      <TouchableOpacity style={[styles.textButton, props.busy && styles.buttonDisabled]} disabled={props.busy} onPress={props.onLeave} accessibilityRole="button"><Text style={styles.textButtonText}>{props.leaving ? "Saving exit note..." : "Return to Games"}</Text></TouchableOpacity>
    </View>
  );
}

export default function UnwrittenMapRoute() {
  const params = useLocalSearchParams<{ playerId?: string; libraryId?: string; ageBand?: string }>();
  const routeConfig = useMemo(() => parseGameRouteConfig(params as GameRouteParams), [params]);
  const { width, height } = useWindowDimensions();
  const scopeKey = useMemo(() => storageScopeKey(params.libraryId, params.playerId), [params.libraryId, params.playerId]);
  const saveKey = useMemo(() => scopedSaveKey(scopeKey), [scopeKey]);
  const libraryScopeId = useMemo(() => scopeKey.slice(0, scopeKey.lastIndexOf("-")), [scopeKey]);
  const [save, setSave] = useState<UnwrittenMapSaveV2 | null>(null);
  const saveRef = useRef<UnwrittenMapSaveV2 | null>(null);
  const [phase, setPhase] = useState<GamePhase>("title");
  const phaseRef = useRef<GamePhase>("title");
  const [activeScenario, setActiveScenario] = useState<MapScenario | null>(null);
  const [presentedChoices, setPresentedChoices] = useState<MapChoice[]>([]);
  const [resultChoice, setResultChoice] = useState<MapChoice | null>(null);
  const [resultSkipped, setResultSkipped] = useState(false);
  const [loadedExistingProgress, setLoadedExistingProgress] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [lifecyclePending, setLifecyclePending] = useState(false);
  const [operationPending, setOperationPending] = useState(false);
  const [completionPending, setCompletionPending] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [showJournal, setShowJournal] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [mapFocused, setMapFocused] = useState(false);
  const mapFocusedRef = useRef(false);
  const [walkingFrame, setWalkingFrame] = useState(0);
  const [bumpDirection, setBumpDirection] = useState<MapDirection | null>(null);
  const bumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heldDirectionRef = useRef<MapDirection | null>(null);
  const heldKeysRef = useRef<Map<MapDirection, number>>(new Map());
  const keySequenceRef = useRef(0);
  const stepsThisSessionRef = useRef(0);
  const completionEmittedRef = useRef(false);
  const completionPendingRef = useRef(false);
  const resultDecisionRef = useRef<UnwrittenMapSaveV2["decisions"][number] | null>(null);
  const lifecyclePendingRef = useRef(false);
  const gameSessionIdRef = useRef(createGameSessionId());
  const encounterStartedAtRef = useRef(Date.now());
  const operationPendingRef = useRef(false);
  const operationIdsRef = useRef(new Map<string, string>());
  const movementOperationRef = useRef<string | null>(null);
  const moveRef = useRef<(direction: MapDirection) => void>(() => undefined);
  const columns = width < 520 ? 9 : width < 820 ? 11 : 13;
  const rows = height < 700 ? 7 : 9;
  const tileSize = Math.max(28, Math.min(44, Math.floor((Math.min(width, 760) - 28) / columns)));
  const gameRecommendationMilestone = useGameRecommendationMilestone({
    game: "unwritten_map",
    gameLabel: "The Unwritten Map",
    playerId: routeConfig.playerId,
    gameSessionId: gameSessionIdRef.current,
    libraryId: routeConfig.libraryId,
    ageBand: routeConfig.ageBand,
    sourceFlags: routeConfig.sourceFlags,
    localCollectionOnly: routeConfig.localCollectionOnly,
    evidenceMode: UNWRITTEN_MAP_EVIDENCE_MODE,
  });

  const updateSaveState = useCallback((next: UnwrittenMapSaveV2) => {
    saveRef.current = next;
    setSave(next);
  }, []);

  const updateCompletionPending = useCallback((pending: boolean) => {
    completionPendingRef.current = pending;
    setCompletionPending(pending);
  }, []);

  const acquireOperation = useCallback(() => {
    if (operationPendingRef.current) return false;
    operationPendingRef.current = true;
    setOperationPending(true);
    return true;
  }, []);

  const releaseOperation = useCallback(() => {
    operationPendingRef.current = false;
    setOperationPending(false);
  }, []);

  const queueSaveCommit = useCallback(async (
    operationKey: string,
    derive: (current: UnwrittenMapSaveV2) => {
      event: UnwrittenMapEventV2;
      nextSave: UnwrittenMapSaveV2;
    },
  ): Promise<UnwrittenMapSaveV2> => {
    const operationId = operationIdsRef.current.get(operationKey)
      || createOperationId(operationKey);
    operationIdsRef.current.set(operationKey, operationId);
    const durableSave = await transactUnwrittenMapEvent(
      gameStorage,
      scopeKey,
      libraryScopeId,
      operationId,
      derive,
    );
    operationIdsRef.current.delete(operationKey);
    updateSaveState(durableSave);
    void flushUnwrittenMapEvents(gameStorage, sendUnwrittenMapEvent, scopeKey).catch(() => {
      setStorageError("Your map is safe on this device. Some anonymous field notes are waiting to sync.");
    });
    return durableSave;
  }, [libraryScopeId, scopeKey, updateSaveState]);

  const reloadDurableJourney = useCallback(async (notice: string) => {
    const durable = await loadDurableUnwrittenMapJourney(
      gameStorage,
      scopeKey,
      libraryScopeId,
    );
    updateSaveState(durable);
    const journeyComplete = isUnwrittenMapJourneyComplete(durable);
    const displayedResultDecision = resultDecisionRef.current;
    const resultStillDurable = !journeyComplete
      && phaseRef.current === "result"
      && displayedResultDecision !== null
      && durable.decisions.some((decision) =>
        sameUnwrittenMapDecisionIdentity(displayedResultDecision, decision));
    if (!resultStillDurable) {
      resultDecisionRef.current = null;
      setActiveScenario(null);
      setPresentedChoices([]);
      setResultChoice(null);
      setResultSkipped(false);
    }
    setShowJournal(false);
    const durablePhase = journeyComplete
      ? "complete"
      : resultStillDurable ? "result" : "map";
    phaseRef.current = durablePhase;
    setPhase(durablePhase);
    setStorageError(notice);
    return durable;
  }, [libraryScopeId, scopeKey, updateSaveState]);

  const queueCompletionEvent = useCallback(async () => {
    const operationKey = `complete:${gameSessionIdRef.current}`;
    const operationId = operationIdsRef.current.get(operationKey)
      || createOperationId(operationKey);
    operationIdsRef.current.set(operationKey, operationId);
    let durableSave: UnwrittenMapSaveV2;
    try {
      durableSave = await transactUnwrittenMapCompletion(
        gameStorage,
        scopeKey,
        libraryScopeId,
        operationId,
        (latest) => createSessionEvent({
          save: latest,
          gameSessionId: gameSessionIdRef.current,
          eventType: "session_completed",
          playSessionCount: Math.max(1, latest.playSessionCount),
          stepsThisSession: stepsThisSessionRef.current,
        }),
      );
    } catch (error) {
      if (error instanceof Error && error.message === "unwritten_map_stale_completion") {
        operationIdsRef.current.delete(operationKey);
      }
      throw error;
    }
    operationIdsRef.current.delete(operationKey);
    updateSaveState(durableSave);
    void flushUnwrittenMapEvents(gameStorage, sendUnwrittenMapEvent, scopeKey).catch(() => {
      setStorageError("Your map is safe on this device. Some anonymous field notes are waiting to sync.");
    });
    completionEmittedRef.current = true;
    updateCompletionPending(false);
    return durableSave;
  }, [libraryScopeId, scopeKey, updateCompletionPending, updateSaveState]);

  const clearStaleCompletionState = useCallback(() => {
    completionEmittedRef.current = false;
    operationIdsRef.current.delete(`complete:${gameSessionIdRef.current}`);
    updateCompletionPending(false);
  }, [updateCompletionPending]);

  const reloadAfterStaleCompletion = useCallback(async () => {
    clearStaleCompletionState();
    try {
      return await reloadDurableJourney(
        "This map changed in another session before completion. The latest field notes are loaded; continue from the current map or result.",
      );
    } catch {
      setStorageError("This map changed in another session before completion, but the latest field notes could not be loaded.");
      return null;
    }
  }, [clearStaleCompletionState, reloadDurableJourney]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const raw = await gameStorage.getItem(saveKey);
        const restored = await migrateLegacyUnwrittenMapSaveForScope(gameStorage, scopeKey, libraryScopeId)
          || restoreUnwrittenMapSave(raw, libraryScopeId);
        const initial = restored || await initializeUnwrittenMapJourney(
          gameStorage,
          scopeKey,
          libraryScopeId,
          createInitialUnwrittenMapSave(createUnwrittenMapPlayerId(), undefined, libraryScopeId),
        );
        if (cancelled) return;
        await reconcileUnwrittenMapEvents(gameStorage, initial, scopeKey);
        setLoadedExistingProgress(Boolean(restored?.decisions.length));
        updateSaveState(initial);
        void flushUnwrittenMapEvents(gameStorage, sendUnwrittenMapEvent, scopeKey).catch(() => {
          if (!cancelled) setStorageError("Your journey is stored locally; anonymous field notes will sync when the road clears.");
        });
      } catch {
        if (!cancelled) setStorageError("The map case could not be opened. Check this device's storage and try again.");
      }
    })();
    return () => { cancelled = true; };
  }, [libraryScopeId, params.libraryId, params.playerId, saveKey, scopeKey, updateSaveState]);

  useEffect(() => {
    phaseRef.current = phase;
    mapFocusedRef.current = mapFocused;
  }, [mapFocused, phase]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const previousTitle = document.title;
    document.title = "The Unwritten Map";
    return () => { document.title = previousTitle; };
  }, []);

  const move = useCallback((direction: MapDirection) => {
    if (!saveRef.current || phaseRef.current !== "map" || !acquireOperation()) return;
    const operationId = movementOperationRef.current || createOperationId("move");
    movementOperationRef.current = operationId;
    const positionBefore = saveRef.current.position;
    void transactUnwrittenMapMovement(
      gameStorage,
      scopeKey,
      libraryScopeId,
      operationId,
      direction,
      gameSessionIdRef.current,
      stepsThisSessionRef.current,
    )
      .then((next) => {
        const moved = !samePosition(positionBefore, next.position);
        movementOperationRef.current = null;
        updateSaveState(next);
        if (moved) {
          stepsThisSessionRef.current += 1;
          setWalkingFrame((frame) => frame === 0 ? 1 : 0);
        } else {
          setBumpDirection(direction);
          if (bumpTimerRef.current) clearTimeout(bumpTimerRef.current);
          bumpTimerRef.current = setTimeout(() => setBumpDirection(null), 110);
        }
        const scenario = scenarioAt(next.position);
        if (scenario && !next.decisions.some((decision) => decision.scenarioId === scenario.id)) {
          if (heldTimerRef.current) clearInterval(heldTimerRef.current);
          heldTimerRef.current = null;
          heldDirectionRef.current = null;
          heldKeysRef.current.clear();
          phaseRef.current = "encounter";
          setActiveScenario(scenario);
          setPresentedChoices(orderedChoices(
            scenario,
            next.anonymousPlayerId,
            next.encounterAttempts[scenario.id],
          ));
          encounterStartedAtRef.current = Date.now();
          setPhase("encounter");
        }
      })
      .catch(() => setStorageError("That step could not be stored. Check device storage before continuing."))
      .finally(releaseOperation);
  }, [acquireOperation, libraryScopeId, releaseOperation, scopeKey, updateSaveState]);

  moveRef.current = move;

  const stopHeldMovement = useCallback(() => {
    if (heldTimerRef.current) clearInterval(heldTimerRef.current);
    heldTimerRef.current = null;
    heldDirectionRef.current = null;
  }, []);

  const clearMovementState = useCallback((updateUi = true) => {
    stopHeldMovement();
    heldKeysRef.current.clear();
    keySequenceRef.current = 0;
    if (bumpTimerRef.current) clearTimeout(bumpTimerRef.current);
    bumpTimerRef.current = null;
    if (updateUi) {
      setBumpDirection(null);
      setWalkingFrame(0);
    }
  }, [stopHeldMovement]);

  const startHeldMovement = useCallback((direction: MapDirection, moveImmediately = true) => {
    if (phaseRef.current !== "map" || operationPendingRef.current) return;
    if (heldDirectionRef.current === direction && heldTimerRef.current) return;
    stopHeldMovement();
    heldDirectionRef.current = direction;
    if (moveImmediately) moveRef.current(direction);
    heldTimerRef.current = setInterval(() => {
      if (heldDirectionRef.current) moveRef.current(heldDirectionRef.current);
    }, MOVE_CADENCE_MS);
  }, [stopHeldMovement]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const keyDirection = (key: string): MapDirection | null => {
      const lower = key.toLowerCase();
      return key === "ArrowUp" || lower === "w" ? "up"
        : key === "ArrowDown" || lower === "s" ? "down"
          : key === "ArrowLeft" || lower === "a" ? "left"
            : key === "ArrowRight" || lower === "d" ? "right" : null;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const direction = keyDirection(event.key);
      const target = event.target as HTMLElement | null;
      if (!direction || !mapFocusedRef.current || phaseRef.current !== "map"
        || target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      event.preventDefault();
      if (!heldKeysRef.current.has(direction)) {
        heldKeysRef.current.set(direction, ++keySequenceRef.current);
        startHeldMovement(direction);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const direction = keyDirection(event.key);
      if (!direction) return;
      heldKeysRef.current.delete(direction);
      if (heldDirectionRef.current !== direction) return;
      const next = [...heldKeysRef.current.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
      if (next) startHeldMovement(next, false);
      else stopHeldMovement();
    };
    const onWindowBlur = () => {
      mapFocusedRef.current = false;
      setMapFocused(false);
      clearMovementState();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") onWindowBlur();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onWindowBlur);
      clearMovementState(false);
    };
  }, [clearMovementState, startHeldMovement, stopHeldMovement]);

  useEffect(() => {
    clearMovementState();
    if (phase !== "map") {
      mapFocusedRef.current = false;
      setMapFocused(false);
    }
  }, [clearMovementState, phase]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") clearMovementState();
    });
    return () => subscription.remove();
  }, [clearMovementState]);

  useEffect(() => () => clearMovementState(false), [clearMovementState]);

  const beginJourney = useCallback(async () => {
    if (lifecyclePendingRef.current || !acquireOperation()) return;
    lifecyclePendingRef.current = true;
    setLifecyclePending(true);
    try {
      const durableNext = await queueSaveCommit(`begin:${gameSessionIdRef.current}`, (current) => {
        const playSessionCount = current.playSessionCount + 1;
        const next = {
          ...current,
          playSessionCount,
          lastSessionId: gameSessionIdRef.current,
          updatedAt: monotonicUnwrittenMapTimestamp(current),
        };
        const event = createSessionEvent({
          save: next,
          gameSessionId: gameSessionIdRef.current,
          eventType: current.decisions.length || current.playSessionCount ? "session_continued" : "session_started",
          playSessionCount,
        });
        return { event, nextSave: next };
      });
      const alreadyComplete = isUnwrittenMapJourneyComplete(durableNext);
      if (!alreadyComplete) {
        phaseRef.current = "map";
        setPhase("map");
      }
      if (alreadyComplete && !completionEmittedRef.current) {
        try {
          await queueCompletionEvent();
          phaseRef.current = "complete";
          setPhase("complete");
        } catch (error) {
          if (error instanceof Error && error.message === "unwritten_map_stale_completion") {
            await reloadAfterStaleCompletion();
          } else {
            updateCompletionPending(true);
            try {
              const latest = await reloadDurableJourney(
                "Your complete map is safe locally; its final field note will retry later.",
              );
              if (!isUnwrittenMapJourneyComplete(latest)) await reloadAfterStaleCompletion();
            } catch {
              phaseRef.current = "complete";
              setPhase("complete");
              setStorageError("Your complete map is safe locally; its final field note will retry later.");
            }
          }
        }
      } else if (alreadyComplete) {
        phaseRef.current = "complete";
        setPhase("complete");
      }
    } catch {
      setStorageError("The journey could not begin safely. Check this device's storage and try again.");
    } finally {
      lifecyclePendingRef.current = false;
      setLifecyclePending(false);
      releaseOperation();
    }
  }, [acquireOperation, queueCompletionEvent, queueSaveCommit, releaseOperation, reloadAfterStaleCompletion, reloadDurableJourney, updateCompletionPending]);

  const recordOutcome = useCallback(async (selected: MapChoice | null) => {
    if (!activeScenario || !acquireOperation()) return;
    setSubmitting(true);
    setStorageError("");
    const operationKey = `outcome:${activeScenario.id}:${presentedChoices.map((choice) => choice.id).join(".")}:${selected?.id || "skip"}`;
    try {
      const durableSave = await queueSaveCommit(operationKey, (current) => {
        const attempt = current.encounterAttempts[activeScenario.id];
        const event = selected ? createChoiceMadeEvent({
          save: current, scenario: activeScenario, presentedChoices,
          selectedOptionId: selected.id, attempt, gameSessionId: gameSessionIdRef.current,
          startedAtMs: encounterStartedAtRef.current, stepsThisSession: stepsThisSessionRef.current,
        }) : createEncounterSkippedEvent({
          save: current, scenario: activeScenario, presentedChoices,
          attempt, gameSessionId: gameSessionIdRef.current,
          startedAtMs: encounterStartedAtRef.current, stepsThisSession: stepsThisSessionRef.current,
        });
        const next = applyMapOutcome(current, {
          scenarioId: activeScenario.id,
          kind: selected ? "choice" : "skip",
          optionId: selected?.id || null,
          outcomeEvidence: {
            kind: "durable_event",
            schemaVersion: event.schemaVersion,
            eventId: event.eventId,
          },
          presentationId: event.presentationId,
          attempt,
        });
        return { event, nextSave: next };
      });
      resultDecisionRef.current = durableSave.decisions.find(
        (decision) => decision.scenarioId === activeScenario.id,
      ) || null;
      setResultChoice(selected);
      setResultSkipped(!selected);
      phaseRef.current = "result";
      setPhase("result");
      if (selected && resultDecisionRef.current) {
        const preferenceBearingChoiceCount = durableSave.decisions.filter((decision) => decision.kind === "choice").length;
        const signal = adaptUnwrittenMapChoiceToSignal({ scenarioId: activeScenario.id, option: selected });
        void gameRecommendationMilestone.notifyEvidence(
          resultDecisionRef.current.presentationId,
          [signal],
          (lastMilestoneEvidenceCount) => unwrittenMapMilestone(preferenceBearingChoiceCount, lastMilestoneEvidenceCount),
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message === "scenario_already_completed") {
        operationIdsRef.current.delete(operationKey);
        try {
          await reloadDurableJourney("This landmark was already completed in another session. The latest map has been loaded.");
        } catch {
          setStorageError("This map changed in another session, but its latest state could not be loaded.");
        }
      } else {
        setStorageError("That field note could not be saved. Check device storage and try again.");
      }
    } finally {
      setSubmitting(false);
      releaseOperation();
    }
  }, [acquireOperation, activeScenario, gameRecommendationMilestone, presentedChoices, queueSaveCommit, releaseOperation, reloadDurableJourney]);

  const continueFromResult = useCallback(async () => {
    if (!acquireOperation()) return;
    const current = saveRef.current;
    if (!current) {
      releaseOperation();
      return;
    }
    if (!isUnwrittenMapJourneyComplete(current)) {
      resultDecisionRef.current = null;
      setActiveScenario(null);
      setResultChoice(null);
      setResultSkipped(false);
      phaseRef.current = "map";
      setPhase("map");
      releaseOperation();
      return;
    }
    try {
      if (!completionEmittedRef.current) await queueCompletionEvent();
      resultDecisionRef.current = null;
      setActiveScenario(null);
      setResultChoice(null);
      setResultSkipped(false);
      phaseRef.current = "complete";
      setPhase("complete");
    } catch (error) {
      if (error instanceof Error && error.message === "unwritten_map_stale_completion") {
        await reloadAfterStaleCompletion();
      } else {
        updateCompletionPending(true);
        try {
          const latest = await reloadDurableJourney(
            "Your complete map is safe locally; its final field note is waiting to sync.",
          );
          if (!isUnwrittenMapJourneyComplete(latest)) await reloadAfterStaleCompletion();
        } catch {
          setStorageError("The latest map could not be checked. Retry the final field note or safely return to Games.");
        }
      }
    } finally {
      releaseOperation();
    }
  }, [acquireOperation, queueCompletionEvent, releaseOperation, reloadAfterStaleCompletion, reloadDurableJourney, updateCompletionPending]);

  const retryCompletion = useCallback(async () => {
    if (!completionPendingRef.current || !acquireOperation()) return;
    setStorageError("");
    try {
      await queueCompletionEvent();
      phaseRef.current = "complete";
      setPhase("complete");
    } catch (error) {
      if (error instanceof Error && error.message === "unwritten_map_stale_completion") {
        await reloadAfterStaleCompletion();
      } else {
        updateCompletionPending(true);
        try {
          const latest = await reloadDurableJourney(
            "The final field note is still waiting. You can retry, return to Games, or draw a new map.",
          );
          if (!isUnwrittenMapJourneyComplete(latest)) await reloadAfterStaleCompletion();
        } catch {
          setStorageError("The latest map could not be checked. Retry, return to Games, or draw a new map.");
        }
      }
    } finally {
      releaseOperation();
    }
  }, [acquireOperation, queueCompletionEvent, releaseOperation, reloadAfterStaleCompletion, reloadDurableJourney, updateCompletionPending]);

  const resolvePendingCompletionForTerminalAction = useCallback(async () => {
    if (!completionPendingRef.current) return true;
    try {
      await queueCompletionEvent();
      return true;
    } catch (error) {
      if (error instanceof Error && error.message === "unwritten_map_stale_completion") {
        await reloadAfterStaleCompletion();
        return true;
      }
      updateCompletionPending(true);
      try {
        const latest = await reloadDurableJourney(
          "The final field note is still waiting. Retry before leaving this completed map.",
        );
        if (!isUnwrittenMapJourneyComplete(latest)) {
          clearStaleCompletionState();
          setStorageError("This map changed in another session before completion. The latest field notes are loaded.");
          return true;
        }
      } catch {
        setStorageError("The latest map could not be checked. Retry the final field note.");
      }
      return false;
    }
  }, [clearStaleCompletionState, queueCompletionEvent, reloadAfterStaleCompletion, reloadDurableJourney, updateCompletionPending]);

  const undoLatest = useCallback(async () => {
    if (!saveRef.current?.decisions.length || !acquireOperation()) return;
    setUndoing(true);
    const latestDecision = saveRef.current.decisions[saveRef.current.decisions.length - 1];
    const operationKey = `undo:${latestDecision.outcomeEvidence.kind === "durable_event"
      ? latestDecision.outcomeEvidence.eventId : latestDecision.presentationId}`;
    try {
      await queueSaveCommit(operationKey, (current) => {
        const decision = current.decisions[current.decisions.length - 1];
        if (!decision || !sameUnwrittenMapDecisionIdentity(latestDecision, decision)) {
          throw new Error("unwritten_map_stale_undo");
        }
        const event = createChoiceUndoneEvent({
          save: current, decision, gameSessionId: gameSessionIdRef.current,
          stepsThisSession: stepsThisSessionRef.current,
        });
        return { event, nextSave: undoMostRecentOutcome(current, event.eventId) };
      });
      await gameRecommendationMilestone.retractEvidence(latestDecision.presentationId);
      completionEmittedRef.current = false;
      phaseRef.current = "map";
      setPhase("map");
      setShowJournal(false);
    } catch (error) {
      if (error instanceof Error && error.message === "unwritten_map_stale_undo") {
        operationIdsRef.current.delete(operationKey);
        try {
          await reloadDurableJourney("Your map changed in another session. Nothing was undone; the latest field notes are now shown.");
        } catch {
          setStorageError("Your map changed in another session. Nothing was undone, and the latest map could not be loaded.");
        }
      } else {
        setStorageError("That correction could not be stored. The original field note remains unchanged.");
      }
    } finally {
      setUndoing(false);
      releaseOperation();
    }
  }, [acquireOperation, gameRecommendationMilestone, queueSaveCommit, releaseOperation, reloadDurableJourney]);

  const leaveJourney = useCallback(async () => {
    if (lifecyclePendingRef.current || !acquireOperation()) return;
    lifecyclePendingRef.current = true;
    setLifecyclePending(true);
    try {
      if (!await resolvePendingCompletionForTerminalAction()) return;
      if (saveRef.current?.playSessionCount) {
        await queueSaveCommit(`exit:${gameSessionIdRef.current}`, (current) => ({
          event: createSessionEvent({
            save: current, gameSessionId: gameSessionIdRef.current,
            eventType: "session_exited", playSessionCount: current.playSessionCount,
            stepsThisSession: stepsThisSessionRef.current,
          }),
          nextSave: current,
        }));
      }
      clearMovementState();
      router.replace({
        pathname: "/games",
        params: {
          ...(params.playerId ? { playerId: params.playerId } : {}),
          ...(params.libraryId ? { libraryId: params.libraryId } : {}),
          ageBand: routeConfig.ageBand,
          ...buildGameRouteSourceParams(routeConfig.sourceFlags),
        },
      } as never);
    } catch {
      setStorageError("The exit note could not be queued locally. Stay on this map and retry Exit.");
    } finally {
      lifecyclePendingRef.current = false;
      setLifecyclePending(false);
      releaseOperation();
    }
  }, [acquireOperation, clearMovementState, params.libraryId, params.playerId, queueSaveCommit, releaseOperation, resolvePendingCompletionForTerminalAction, routeConfig.ageBand, routeConfig.sourceFlags]);

  const resetJourney = useCallback(() => {
    if (!acquireOperation()) return;
    lifecyclePendingRef.current = true;
    setLifecyclePending(true);
    const releaseReset = () => {
      lifecyclePendingRef.current = false;
      setLifecyclePending(false);
      releaseOperation();
    };
    const performReset = async () => {
      try {
        if (!await resolvePendingCompletionForTerminalAction()) return;
        const fresh = createInitialUnwrittenMapSave(createUnwrittenMapPlayerId(), undefined, libraryScopeId);
        updateSaveState(await resetUnwrittenMapJourney(
          gameStorage,
          scopeKey,
          libraryScopeId,
          fresh,
        ));
        clearMovementState();
        const nextGameSessionId = createGameSessionId();
        gameSessionIdRef.current = nextGameSessionId;
        await gameRecommendationMilestone.resetSession(nextGameSessionId);
        completionEmittedRef.current = false;
        updateCompletionPending(false);
        stepsThisSessionRef.current = 0;
        encounterStartedAtRef.current = Date.now();
        setLoadedExistingProgress(false);
        setActiveScenario(null);
        setPresentedChoices([]);
        setResultChoice(null);
        setResultSkipped(false);
        resultDecisionRef.current = null;
        setSubmitting(false);
        setUndoing(false);
        setShowJournal(false);
        setShowPrivacy(false);
        setStorageError("");
        setMapFocused(false);
        mapFocusedRef.current = false;
        phaseRef.current = "title";
        setPhase("title");
      } catch {
        setStorageError("A new map could not be drawn. Check this device's storage.");
      } finally {
        releaseReset();
      }
    };
    if (Platform.OS === "web" && typeof window !== "undefined") {
      if (window.confirm("Reset this journey? Existing field notes stay durable, but this device will begin a new anonymous map.")) {
        void performReset();
      } else {
        releaseReset();
      }
      return;
    }
    Alert.alert("Reset journey?", "Existing durable notes are not deleted. This device will begin a new anonymous map.", [
      { text: "Cancel", style: "cancel", onPress: releaseReset },
      { text: "Reset", style: "destructive", onPress: () => void performReset() },
    ], { cancelable: false });
  }, [acquireOperation, clearMovementState, gameRecommendationMilestone, libraryScopeId, releaseOperation, resolvePendingCompletionForTerminalAction, scopeKey, updateCompletionPending, updateSaveState]);

  const currentRegion = useMemo(() => save ? regionAt(save.position) : { id: "", name: "" }, [save]);

  if (!save) {
    return <SafeAreaView style={styles.safe}><View style={styles.loading}><ActivityIndicator color={LIGHT} /><Text style={styles.loadingText}>{storageError || "UNFOLDING MAP..."}</Text></View></SafeAreaView>;
  }

  if (phase === "title") {
    return (
      <SafeAreaView style={styles.safe}>
        <TitleScreen
          hasProgress={loadedExistingProgress}
          beginning={operationPending}
          onBegin={() => void beginJourney()}
          onPrivacy={() => setShowPrivacy(true)}
          onReset={resetJourney}
        />
        {showPrivacy ? <View style={styles.overlay}><PrivacyNote onClose={() => setShowPrivacy(false)} /></View> : null}
      </SafeAreaView>
    );
  }

  if (phase === "complete") {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.completeScroll}>
          <CompleteScreen
            save={save}
            onUndo={() => void undoLatest()}
            undoing={undoing || operationPending || completionPending}
            onRestart={resetJourney}
            onLeave={() => void leaveJourney()}
            onRetryCompletion={() => void retryCompletion()}
            leaving={lifecyclePending}
            busy={operationPending}
            completionPending={completionPending}
          />
          {storageError ? <Text style={styles.storageError}>{storageError}</Text> : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <GameHeader save={save} onLeave={() => void leaveJourney()} leaving={operationPending} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.hud}>
          <View><Text style={styles.locationLabel}>NOW EXPLORING</Text><Text style={styles.locationName}>{currentRegion.name}</Text></View>
          <View style={styles.hudActions}>
            <TouchableOpacity style={styles.hudButton} onPress={() => setShowJournal((value) => !value)} accessibilityRole="button">
              <Text style={styles.hudButtonText}>{showJournal ? "CLOSE NOTES" : "FIELD NOTES"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.hudButton} onPress={() => setShowPrivacy(true)} accessibilityRole="button" accessibilityLabel="What the map remembers">
              <Text style={styles.hudButtonText}>?</Text>
            </TouchableOpacity>
          </View>
        </View>
        {showJournal ? <Journal save={save} onUndo={() => void undoLatest()} undoing={undoing || operationPending} /> : (
          <>
            <WorldMap
              save={save} tileSize={tileSize} columns={columns} rows={rows} walkingFrame={walkingFrame}
              bumpDirection={bumpDirection}
              onActivate={() => setMapFocused(true)}
              onDeactivate={() => {
                setMapFocused(false);
                mapFocusedRef.current = false;
                clearMovementState();
              }}
            />
            <View style={styles.legendRow}>
              <Text style={styles.legendText}>◆ OPEN LANDMARK</Text><Text style={styles.legendText}>✓ FIELD NOTE</Text>
              <Text style={styles.legendText}>{mapFocused ? "KEYS ACTIVE" : "FOCUS MAP FOR KEYS"}</Text>
            </View>
          </>
        )}
        {phase === "map" && !showJournal ? (
          <View style={styles.mapControls}>
            <DPad onMove={move} onHoldStart={(direction) => startHeldMovement(direction, false)} onHoldEnd={stopHeldMovement} />
            <View style={styles.mapInstructions}>
              <Text style={styles.instructionHeading}>SEEK THE COLORED LANDMARKS</Text>
              <Text style={styles.instructionText}>Roads, grass, and sand are open. Trees, water, and peaks block the way. Your route is never used as a preference.</Text>
              <Text style={styles.coordinateText}>MAP {save.position.x.toString().padStart(2, "0")}:{save.position.y.toString().padStart(2, "0")}</Text>
            </View>
          </View>
        ) : null}
        {phase === "encounter" && activeScenario ? (
          <EncounterPanel scenario={activeScenario} choices={presentedChoices} submitting={submitting || operationPending} onChoose={(item) => void recordOutcome(item)} onSkip={() => void recordOutcome(null)} />
        ) : null}
        {phase === "result" && activeScenario ? (
          <ResultPanel scenario={activeScenario} choice={resultChoice} skipped={resultSkipped} pending={operationPending} onContinue={() => void continueFromResult()} />
        ) : null}
        {storageError ? <Text style={styles.storageError}>{storageError}</Text> : (
          <Text style={styles.syncNote}>Journey saved locally · anonymous field notes sync when available</Text>
        )}
      </ScrollView>
      {showPrivacy ? <View style={styles.overlay}><PrivacyNote onClose={() => setShowPrivacy(false)} /></View> : null}
      {gameRecommendationMilestone.pendingReward ? (
        <GameRecommendationReward
          visible
          cadence={gameRecommendationMilestone.pendingReward.cadence}
          gameLabel={gameRecommendationMilestone.pendingReward.gameLabel}
          book={{
            title: gameRecommendationMilestone.pendingReward.book.title,
            author: gameRecommendationMilestone.pendingReward.book.author,
            coverUrl: gameRecommendationMilestone.pendingReward.coverUrl,
            reason: gameRecommendationMilestone.pendingReward.reason,
          }}
          onRespond={(response) => gameRecommendationMilestone.respond(response, () => void continueFromResult())}
        />
      ) : null}
    </SafeAreaView>
  );
}

const INK = "#273927";
const DARK = "#142017";
const SCREEN = "#cbdc82";
const LIGHT = "#edf0ae";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#101811" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  loadingText: { color: SCREEN, fontSize: 12, fontWeight: "900", letterSpacing: 2, marginTop: 14, textAlign: "center" },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: "center", paddingHorizontal: 12, paddingBottom: 44 },
  header: { minHeight: 70, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 4, borderBottomColor: "#080d09", backgroundColor: INK, flexDirection: "row", alignItems: "center" },
  headerButton: { width: 62, minHeight: 44, borderWidth: 3, borderColor: SCREEN, alignItems: "center", justifyContent: "center", backgroundColor: DARK },
  headerButtonText: { color: LIGHT, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  headerTitleWrap: { flex: 1, alignItems: "center", paddingHorizontal: 6 },
  headerKicker: { color: "#91a95d", fontSize: 7, fontWeight: "900", letterSpacing: 1.3 },
  headerTitle: { color: LIGHT, fontSize: 16, fontWeight: "900", letterSpacing: 1.2, textAlign: "center", marginTop: 3 },
  headerProgress: { width: 62, minHeight: 44, borderWidth: 3, borderColor: "#839956", backgroundColor: DARK, alignItems: "center", justifyContent: "center" },
  headerProgressValue: { color: LIGHT, fontSize: 14, fontWeight: "900" },
  headerProgressLabel: { color: "#8fa45d", fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  titleScreen: { flexGrow: 1, minHeight: 680, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: DARK },
  titleMap: { width: 232, height: 166, borderWidth: 7, borderColor: INK, backgroundColor: SCREEN, marginBottom: 22, overflow: "hidden", position: "relative", transform: [{ rotate: "-1deg" }] },
  titleRiver: { position: "absolute", width: 36, height: 230, left: 142, top: -30, backgroundColor: "#70916c", transform: [{ rotate: "18deg" }] },
  titleRoadHorizontal: { position: "absolute", height: 17, left: 0, right: 0, top: 77, backgroundColor: "#e5d887" },
  titleRoadVertical: { position: "absolute", width: 17, top: 0, bottom: 0, left: 69, backgroundColor: "#e5d887" },
  titleLandmark: { position: "absolute", width: 22, height: 22, backgroundColor: "#b45645", borderWidth: 4, borderColor: INK },
  titleKicker: { color: "#93aa61", fontSize: 10, fontWeight: "900", letterSpacing: 2.4, textAlign: "center" },
  titleLogo: { color: LIGHT, fontSize: 39, lineHeight: 42, fontWeight: "900", letterSpacing: 3, textAlign: "center", marginTop: 9 },
  titleCopy: { color: "#afc46d", fontSize: 14, lineHeight: 22, textAlign: "center", maxWidth: 540, marginVertical: 20 },
  titleHint: { color: "#788d53", fontSize: 10, marginTop: 15, textAlign: "center" },
  primaryButton: { minWidth: 220, minHeight: 50, paddingHorizontal: 20, borderWidth: 4, borderColor: "#0b110c", backgroundColor: "#a54c3c", alignItems: "center", justifyContent: "center", marginTop: 10, shadowColor: "#000", shadowOpacity: 0.45, shadowOffset: { width: 4, height: 5 }, shadowRadius: 0 },
  primaryButtonText: { color: "#fff2b8", fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  textButton: { minHeight: 40, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", marginTop: 6 },
  textButtonText: { color: "#adbf73", textDecorationLine: "underline", fontSize: 11 },
  resetText: { color: "#b77d68", textDecorationLine: "underline", fontSize: 10 },
  hud: { width: "100%", maxWidth: 760, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 14, marginBottom: 8 },
  locationLabel: { color: "#718754", fontSize: 8, fontWeight: "900", letterSpacing: 1.5 },
  locationName: { color: LIGHT, fontSize: 14, fontWeight: "900", marginTop: 2 },
  hudActions: { flexDirection: "row", gap: 6 },
  hudButton: { minHeight: 38, paddingHorizontal: 10, backgroundColor: INK, borderWidth: 2, borderColor: "#6f8450", alignItems: "center", justifyContent: "center" },
  hudButtonText: { color: LIGHT, fontSize: 8, fontWeight: "900", letterSpacing: 0.6 },
  viewport: { borderWidth: 4, borderColor: "#080d09", overflow: "hidden", backgroundColor: SCREEN, shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 0, shadowOffset: { width: 6, height: 7 } },
  worldMap: { alignSelf: "flex-start" },
  mapRow: { flexDirection: "row" },
  tile: { position: "relative", alignItems: "center", justifyContent: "center", overflow: "visible" },
  treeTile: { backgroundColor: "#536f45" },
  grassTile: { backgroundColor: "#aabd67" },
  pathTile: { backgroundColor: "#d8ca79" },
  waterTile: { backgroundColor: "#638b78" },
  sandTile: { backgroundColor: "#d4bd72" },
  mountainTile: { backgroundColor: "#68735a" },
  treeCrown: { position: "absolute", top: 2, width: "75%", height: "64%", borderRadius: 3, backgroundColor: INK, borderWidth: 2, borderColor: "#40583a" },
  treeTrunk: { position: "absolute", bottom: 1, width: "20%", height: "38%", backgroundColor: "#674d35" },
  grassTuft: { width: "34%", height: 3, backgroundColor: "#829b55", transform: [{ rotate: "-18deg" }] },
  waterLine: { width: "70%", height: 3, backgroundColor: "#a8c682" },
  mountainPeak: { width: "72%", height: "65%", backgroundColor: "#4b5545", borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  landmark: { position: "absolute", width: "86%", height: "86%", borderWidth: 3, borderColor: INK, alignItems: "center", justifyContent: "flex-end", zIndex: 4, shadowColor: "#fff5a1", shadowOpacity: 0.8, shadowRadius: 5 },
  landmarkRoof: { position: "absolute", top: 2, width: "68%", height: "27%", backgroundColor: DARK },
  landmarkDoor: { width: "24%", height: "38%", backgroundColor: DARK },
  landmarkLabel: { position: "absolute", bottom: -7, color: "#fff5bd", backgroundColor: DARK, fontSize: 7, lineHeight: 10, fontWeight: "900", paddingHorizontal: 2, zIndex: 5 },
  playerSprite: { position: "absolute", width: "68%", height: "90%", alignItems: "center", zIndex: 8 },
  playerStep: { transform: [{ translateY: -2 }] },
  playerHatTop: { width: "54%", height: "23%", backgroundColor: "#a54c3c", borderWidth: 2, borderColor: DARK },
  playerHatBrim: { width: "84%", height: "12%", backgroundColor: "#a54c3c", borderWidth: 2, borderColor: DARK },
  playerFace: { width: "44%", height: "23%", backgroundColor: "#e1bc75", borderLeftWidth: 2, borderRightWidth: 2, borderColor: DARK, position: "relative" },
  playerEye: { position: "absolute", width: 3, height: 3, right: 3, top: 3, backgroundColor: DARK },
  playerEyeSide: { right: 1 },
  playerCoat: { width: "64%", height: "29%", backgroundColor: "#344f52", borderWidth: 2, borderColor: DARK },
  playerFeet: { width: "58%", height: "12%", flexDirection: "row", justifyContent: "space-between" },
  playerFeetStep: { width: "72%" },
  playerFoot: { width: "38%", height: "100%", backgroundColor: DARK },
  legendRow: { width: "100%", maxWidth: 760, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8, marginTop: 11, paddingHorizontal: 4 },
  legendText: { color: "#819657", fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  mapControls: { width: "100%", maxWidth: 700, flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 22, marginTop: 17 },
  dPad: { width: 144, height: 144, alignItems: "center", justifyContent: "center" },
  dPadRow: { flexDirection: "row" },
  directionButton: { width: 48, height: 48, backgroundColor: "#354936", borderWidth: 3, borderColor: "#0b120c", alignItems: "center", justifyContent: "center" },
  directionText: { color: LIGHT, fontSize: 15, fontWeight: "900" },
  directionSpacer: { width: 48, height: 48 },
  dPadCenter: { width: 48, height: 48, backgroundColor: "#354936" },
  mapInstructions: { flex: 1, minWidth: 235, maxWidth: 400, borderWidth: 4, borderColor: "#080d09", backgroundColor: INK, padding: 14 },
  instructionHeading: { color: LIGHT, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  instructionText: { color: "#a9be6d", fontSize: 11, lineHeight: 17, marginTop: 7 },
  coordinateText: { color: "#728753", fontSize: 8, fontWeight: "900", marginTop: 10, letterSpacing: 1.4 },
  dialoguePanel: { width: "100%", maxWidth: 760, borderWidth: 5, borderColor: "#080d09", backgroundColor: INK, padding: 17, marginTop: 18, shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 0, shadowOffset: { width: 6, height: 7 } },
  dialogueLocation: { alignSelf: "flex-start", paddingHorizontal: 9, paddingVertical: 5, borderWidth: 3, borderColor: DARK, marginBottom: 11 },
  dialogueLocationText: { color: DARK, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  dialogueTitle: { color: LIGHT, fontSize: 22, fontWeight: "900", letterSpacing: 0.7 },
  dialoguePrompt: { color: "#bfd079", fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 13 },
  choiceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  choiceButton: { flexGrow: 1, flexBasis: 310, minHeight: 88, borderWidth: 3, borderColor: "#839957", backgroundColor: DARK, padding: 11, flexDirection: "row", alignItems: "flex-start" },
  choiceNumber: { color: "#e2d378", fontSize: 11, fontWeight: "900", marginRight: 10, marginTop: 2 },
  choiceCopy: { flex: 1 },
  choiceLabel: { color: LIGHT, fontSize: 13, fontWeight: "900" },
  choiceDescription: { color: "#96ab63", fontSize: 11, lineHeight: 16, marginTop: 4 },
  skipButton: { minHeight: 44, marginTop: 11, borderWidth: 2, borderColor: "#6d8150", alignItems: "center", justifyContent: "center" },
  skipText: { color: "#c7d783", fontSize: 9, fontWeight: "900", letterSpacing: 0.9 },
  equalNote: { color: "#748a51", fontSize: 9, lineHeight: 14, marginTop: 9, textAlign: "center" },
  buttonDisabled: { opacity: 0.45 },
  resultStamp: { color: "#e2d378", fontSize: 10, fontWeight: "900", letterSpacing: 2, marginBottom: 8 },
  resultChoice: { color: "#93aa61", fontSize: 13, fontWeight: "900", textTransform: "uppercase", marginTop: 7 },
  resultText: { color: "#c7d783", fontSize: 15, lineHeight: 23, marginVertical: 17 },
  storageError: { width: "100%", maxWidth: 760, color: "#fff0ad", backgroundColor: "#7c3f34", borderWidth: 3, borderColor: "#b86a4e", padding: 11, marginTop: 13, fontSize: 11, lineHeight: 17, textAlign: "center" },
  syncNote: { color: "#64784b", fontSize: 8, marginTop: 14, textAlign: "center" },
  journal: { width: "100%", maxWidth: 620, borderWidth: 5, borderColor: "#080d09", backgroundColor: "#d8d68b", padding: 14, marginVertical: 8, transform: [{ rotate: "-0.2deg" }] },
  journalHeading: { color: DARK, fontSize: 11, fontWeight: "900", letterSpacing: 2, borderBottomWidth: 3, borderColor: "#758653", paddingBottom: 7 },
  journalRow: { flexDirection: "row", alignItems: "center", paddingVertical: 7, borderBottomWidth: 1, borderColor: "#9caa69" },
  journalMark: { width: 16, height: 16, borderWidth: 2, borderColor: DARK, marginRight: 9 },
  journalCopy: { flex: 1 },
  journalPlace: { color: DARK, fontSize: 11, fontWeight: "900" },
  journalDecision: { color: "#51603d", fontSize: 9, marginTop: 2 },
  emptyJournal: { color: "#51603d", fontSize: 11, paddingVertical: 14 },
  undoButton: { minHeight: 42, borderWidth: 2, borderColor: DARK, marginTop: 12, alignItems: "center", justifyContent: "center" },
  undoText: { color: DARK, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  completeScroll: { flexGrow: 1, padding: 18, paddingBottom: 44 },
  completeScreen: { width: "100%", maxWidth: 700, minHeight: 650, alignSelf: "center", alignItems: "center", justifyContent: "center" },
  completeKicker: { color: "#93aa61", fontSize: 10, fontWeight: "900", letterSpacing: 2, textAlign: "center" },
  completeTitle: { color: LIGHT, fontSize: 29, lineHeight: 36, fontWeight: "900", textAlign: "center", maxWidth: 560, marginTop: 10 },
  completeCopy: { color: "#a9be6d", fontSize: 14, lineHeight: 22, textAlign: "center", maxWidth: 530, marginTop: 12, marginBottom: 18 },
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 30, backgroundColor: "rgba(5,10,6,0.82)", alignItems: "center", justifyContent: "center", padding: 18 },
  notePanel: { width: "100%", maxWidth: 500, borderWidth: 5, borderColor: "#080d09", backgroundColor: INK, padding: 20 },
  noteTitle: { color: LIGHT, fontSize: 14, fontWeight: "900", letterSpacing: 1.5 },
  noteText: { color: "#b6c874", fontSize: 12, lineHeight: 20, marginVertical: 14 },
  smallButton: { minHeight: 43, borderWidth: 3, borderColor: "#829756", backgroundColor: DARK, alignItems: "center", justifyContent: "center" },
  smallButtonText: { color: LIGHT, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
});
