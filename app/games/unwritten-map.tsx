import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
  UNWRITTEN_MAP_SAVE_KEY,
  UNWRITTEN_MAP_SCENARIOS,
  UNWRITTEN_MAP_TILES,
  applyMapChoice,
  createInitialUnwrittenMapSave,
  createUnwrittenMapChoiceEvent,
  createUnwrittenMapPlayerId,
  moveOnMap,
  restoreUnwrittenMapSave,
  scenarioAt,
  tileAt,
  updateMapPosition,
  type MapChoice,
  type MapDirection,
  type MapPosition,
  type MapScenario,
  type UnwrittenMapSaveV1,
} from "../../lib/recommendationGames/unwrittenMap";
import {
  commitUnwrittenMapEvent,
  flushUnwrittenMapEvents,
  queueUnwrittenMapEvent,
  reconcileUnwrittenMapEvents,
} from "../../lib/recommendationGames/unwrittenMapEvidenceClient";
import type { AsyncKeyValueStorage } from "../../lib/recommendationGames/evidenceClient";

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

function samePosition(left: MapPosition, right: MapPosition): boolean {
  return left.x === right.x && left.y === right.y;
}

function orderedChoices(scenario: MapScenario, anonymousPlayerId: string): MapChoice[] {
  const seed = `${anonymousPlayerId}:${scenario.id}`;
  const offset = Array.from(seed).reduce((total, character) => total + character.charCodeAt(0), 0)
    % scenario.choices.length;
  return [...scenario.choices.slice(offset), ...scenario.choices.slice(0, offset)];
}

async function sendUnwrittenMapEvent(event: unknown): Promise<boolean> {
  if (Platform.OS !== "web" && !nativeApiOrigin) return false;
  const response = await fetch(`${nativeApiOrigin}/api/unwritten-map-event`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...(Platform.OS !== "web" ? { origin: nativeApiOrigin } : {}),
    },
    body: JSON.stringify(event),
  });
  const payload = await response.json().catch(() => null);
  return response.status === 201 && payload?.status === "accepted";
}

function PixelCompass() {
  return (
    <View style={styles.compass}>
      <View style={styles.compassNeedleNorth} />
      <View style={styles.compassNeedleSouth} />
      <View style={styles.compassCenter} />
    </View>
  );
}

function PlayerSprite() {
  return (
    <View style={styles.playerSprite} accessibilityLabel="Your cartographer">
      <View style={styles.playerHatTop} />
      <View style={styles.playerHatBrim} />
      <View style={styles.playerFace} />
      <View style={styles.playerCoat} />
      <View style={styles.playerFeet}>
        <View style={styles.playerFoot} />
        <View style={styles.playerFoot} />
      </View>
    </View>
  );
}

function LandmarkSprite({ scenario, completed }: { scenario: MapScenario; completed: boolean }) {
  return (
    <View
      style={[
        styles.landmark,
        { backgroundColor: completed ? "#66705a" : scenario.color },
        !completed && styles.landmarkOpen,
      ]}
    >
      <View style={styles.landmarkRoof} />
      <View style={styles.landmarkDoor} />
      <Text style={styles.landmarkLabel}>{completed ? "DONE" : scenario.mapLabel}</Text>
    </View>
  );
}

function WorldTile({
  position,
  size,
  playerPosition,
  completedScenarioIds,
}: {
  position: MapPosition;
  size: number;
  playerPosition: MapPosition;
  completedScenarioIds: string[];
}) {
  const tile = tileAt(position);
  const scenario = scenarioAt(position);
  const hasPlayer = samePosition(position, playerPosition);
  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size },
        tile === "T" && styles.treeTile,
        tile === "G" && styles.grassTile,
        tile === "P" && styles.pathTile,
        tile === "W" && styles.waterTile,
      ]}
    >
      {tile === "T" ? (
        <>
          <View style={styles.treeCrown} />
          <View style={styles.treeTrunk} />
        </>
      ) : null}
      {tile === "G" && (position.x + position.y) % 3 === 0 ? <View style={styles.grassTuft} /> : null}
      {tile === "W" ? <View style={styles.waterLine} /> : null}
      {scenario ? (
        <LandmarkSprite
          scenario={scenario}
          completed={completedScenarioIds.includes(scenario.id)}
        />
      ) : null}
      {hasPlayer ? <PlayerSprite /> : null}
    </View>
  );
}

function WorldMap({
  save,
  tileSize,
}: {
  save: UnwrittenMapSaveV1;
  tileSize: number;
}) {
  return (
    <View
      style={[styles.worldMap, { width: tileSize * UNWRITTEN_MAP_TILES[0].length }]}
      accessibilityLabel="The Unwritten Map overworld"
    >
      {UNWRITTEN_MAP_TILES.map((row, y) => (
        <View key={`row-${y}`} style={styles.mapRow}>
          {Array.from(row).map((_, x) => (
            <WorldTile
              key={`${x}-${y}`}
              position={{ x, y }}
              size={tileSize}
              playerPosition={save.position}
              completedScenarioIds={save.decisions.map((decision) => decision.scenarioId)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function DirectionButton({
  direction,
  label,
  onMove,
}: {
  direction: MapDirection;
  label: string;
  onMove: (direction: MapDirection) => void;
}) {
  return (
    <TouchableOpacity
      style={styles.directionButton}
      onPress={() => onMove(direction)}
      accessibilityRole="button"
      accessibilityLabel={`Move ${direction}`}
    >
      <Text style={styles.directionText}>{label}</Text>
    </TouchableOpacity>
  );
}

function DPad({ onMove }: { onMove: (direction: MapDirection) => void }) {
  return (
    <View style={styles.dPad}>
      <View style={styles.dPadRow}>
        <View style={styles.directionSpacer} />
        <DirectionButton direction="up" label="UP" onMove={onMove} />
        <View style={styles.directionSpacer} />
      </View>
      <View style={styles.dPadRow}>
        <DirectionButton direction="left" label="LT" onMove={onMove} />
        <View style={styles.dPadCenter} />
        <DirectionButton direction="right" label="RT" onMove={onMove} />
      </View>
      <View style={styles.dPadRow}>
        <View style={styles.directionSpacer} />
        <DirectionButton direction="down" label="DN" onMove={onMove} />
        <View style={styles.directionSpacer} />
      </View>
    </View>
  );
}

function GameHeader({ save, onLeave }: { save: UnwrittenMapSaveV1; onLeave: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.headerButton}
        onPress={onLeave}
        accessibilityRole="button"
        accessibilityLabel="Leave The Unwritten Map"
      >
        <Text style={styles.headerButtonText}>EXIT</Text>
      </TouchableOpacity>
      <View style={styles.headerTitleWrap}>
        <Text style={styles.headerKicker}>A CARTOGRAPHER&apos;S TALE</Text>
        <Text style={styles.headerTitle}>THE UNWRITTEN MAP</Text>
      </View>
      <View style={styles.headerProgress}>
        <Text style={styles.headerProgressValue}>{save.decisions.length}/4</Text>
        <Text style={styles.headerProgressLabel}>PLACES</Text>
      </View>
    </View>
  );
}

function TitleScreen({
  hasProgress,
  onBegin,
}: {
  hasProgress: boolean;
  onBegin: () => void;
}) {
  return (
    <View style={styles.titleScreen}>
      <View style={styles.titleMap}>
        <View style={styles.titleRiver} />
        <View style={styles.titleRoadHorizontal} />
        <View style={styles.titleRoadVertical} />
        <View style={[styles.titleLandmark, { left: 22, top: 24 }]} />
        <View style={[styles.titleLandmark, { right: 26, top: 52 }]} />
        <View style={[styles.titleLandmark, { left: 64, bottom: 24 }]} />
        <PixelCompass />
      </View>
      <Text style={styles.titleKicker}>A POCKET-SIZED JOURNEY</Text>
      <Text style={styles.titleLogo}>THE{"\n"}UNWRITTEN MAP</Text>
      <Text style={styles.titleCopy}>
        Four roads wait beyond the village. Walk the map, make each discovery your own, and reveal the country at its edges.
      </Text>
      <TouchableOpacity style={styles.primaryButton} onPress={onBegin} accessibilityRole="button">
        <Text style={styles.primaryButtonText}>{hasProgress ? "CONTINUE JOURNEY" : "OPEN THE MAP"}</Text>
      </TouchableOpacity>
      <Text style={styles.titleHint}>Arrow keys, WASD, or the on-screen direction pad</Text>
    </View>
  );
}

function EncounterPanel({
  scenario,
  choices,
  submitting,
  onChoose,
}: {
  scenario: MapScenario;
  choices: MapChoice[];
  submitting: boolean;
  onChoose: (choice: MapChoice) => void;
}) {
  return (
    <View style={styles.dialoguePanel}>
      <View style={[styles.dialogueLocation, { backgroundColor: scenario.color }]}>
        <Text style={styles.dialogueLocationText}>{scenario.location.toUpperCase()}</Text>
      </View>
      <Text style={styles.dialogueTitle}>{scenario.title}</Text>
      <Text style={styles.dialoguePrompt}>{scenario.prompt}</Text>
      <View style={styles.choiceGrid}>
        {choices.map((choice, index) => (
          <TouchableOpacity
            key={choice.id}
            style={[styles.choiceButton, submitting && styles.buttonDisabled]}
            disabled={submitting}
            onPress={() => onChoose(choice)}
            accessibilityRole="button"
            accessibilityLabel={`${choice.label}. ${choice.description}`}
          >
            <Text style={styles.choiceNumber}>0{index + 1}</Text>
            <View style={styles.choiceCopy}>
              <Text style={styles.choiceLabel}>{choice.label}</Text>
              <Text style={styles.choiceDescription}>{choice.description}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function ResultPanel({
  scenario,
  choice,
  onContinue,
}: {
  scenario: MapScenario;
  choice: MapChoice;
  onContinue: () => void;
}) {
  return (
    <View style={styles.dialoguePanel}>
      <Text style={styles.resultStamp}>PLACE MAPPED</Text>
      <Text style={styles.dialogueTitle}>{scenario.location}</Text>
      <Text style={styles.resultChoice}>{choice.label}</Text>
      <Text style={styles.resultText}>{choice.result}</Text>
      <TouchableOpacity style={styles.primaryButton} onPress={onContinue} accessibilityRole="button">
        <Text style={styles.primaryButtonText}>RETURN TO THE ROAD</Text>
      </TouchableOpacity>
    </View>
  );
}

function Journal({ save }: { save: UnwrittenMapSaveV1 }) {
  return (
    <View style={styles.journal}>
      <Text style={styles.journalHeading}>FIELD NOTES</Text>
      {UNWRITTEN_MAP_SCENARIOS.map((scenario) => {
        const decision = save.decisions.find((candidate) => candidate.scenarioId === scenario.id);
        const choice = scenario.choices.find((candidate) => candidate.id === decision?.optionId);
        return (
          <View key={scenario.id} style={styles.journalRow}>
            <View style={[styles.journalMark, { backgroundColor: decision ? scenario.color : "#586049" }]} />
            <View style={styles.journalCopy}>
              <Text style={styles.journalPlace}>{decision ? scenario.location : "Unmapped place"}</Text>
              <Text style={styles.journalDecision}>{choice?.label || "Find its marker on the map"}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function CompleteScreen({ save, onRestart, onLeave }: {
  save: UnwrittenMapSaveV1;
  onRestart: () => void;
  onLeave: () => void;
}) {
  return (
    <View style={styles.completeScreen}>
      <PixelCompass />
      <Text style={styles.completeKicker}>THE FIRST JOURNEY IS COMPLETE</Text>
      <Text style={styles.completeTitle}>The map remembers how you traveled.</Text>
      <Text style={styles.completeCopy}>
        None of your roads were wrong. Together, they made this small country entirely yours.
      </Text>
      <Journal save={save} />
      <TouchableOpacity style={styles.primaryButton} onPress={onRestart} accessibilityRole="button">
        <Text style={styles.primaryButtonText}>DRAW A NEW MAP</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.textButton} onPress={onLeave} accessibilityRole="button">
        <Text style={styles.textButtonText}>Return to Games</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function UnwrittenMapRoute() {
  const { width } = useWindowDimensions();
  const [save, setSave] = useState<UnwrittenMapSaveV1 | null>(null);
  const [phase, setPhase] = useState<GamePhase>("title");
  const [activeScenario, setActiveScenario] = useState<MapScenario | null>(null);
  const [presentedChoices, setPresentedChoices] = useState<MapChoice[]>([]);
  const [resultChoice, setResultChoice] = useState<MapChoice | null>(null);
  const [loadedExistingProgress, setLoadedExistingProgress] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [storageError, setStorageError] = useState("");
  const gameSessionIdRef = useRef(`map-session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`);
  const encounterStartedAtRef = useRef(Date.now());
  const saveMutationRef = useRef<Promise<void>>(Promise.resolve());
  const tileSize = Math.max(20, Math.min(36, Math.floor((width - 32) / UNWRITTEN_MAP_TILES[0].length)));

  const persistSave = useCallback((nextSave: UnwrittenMapSaveV1) => {
    const write = saveMutationRef.current
      .catch(() => undefined)
      .then(() => gameStorage.setItem(UNWRITTEN_MAP_SAVE_KEY, JSON.stringify(nextSave)));
    saveMutationRef.current = write;
    return write;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const restored = restoreUnwrittenMapSave(await gameStorage.getItem(UNWRITTEN_MAP_SAVE_KEY));
        const initial = restored || createInitialUnwrittenMapSave(createUnwrittenMapPlayerId());
        if (!restored) await persistSave(initial);
        if (cancelled) return;
        await reconcileUnwrittenMapEvents(gameStorage, initial);
        setLoadedExistingProgress(Boolean(restored?.decisions.length));
        setSave(initial);
        void flushUnwrittenMapEvents(gameStorage, sendUnwrittenMapEvent).catch(() => {
          if (!cancelled) setStorageError("Your map is safe here, but some field notes are still waiting to be delivered.");
        });
      } catch {
        if (!cancelled) setStorageError("The map case could not be opened. Check this device's storage and try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [persistSave]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const previousTitle = document.title;
    document.title = "The Unwritten Map";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  const openScenario = useCallback((scenario: MapScenario, currentSave: UnwrittenMapSaveV1) => {
    if (currentSave.decisions.some((decision) => decision.scenarioId === scenario.id)) return;
    setActiveScenario(scenario);
    setPresentedChoices(orderedChoices(scenario, currentSave.anonymousPlayerId));
    encounterStartedAtRef.current = Date.now();
    setPhase("encounter");
  }, []);

  const move = useCallback((direction: MapDirection) => {
    if (!save || phase !== "map") return;
    const nextPosition = moveOnMap(save.position, direction);
    if (samePosition(nextPosition, save.position)) return;
    const nextSave = updateMapPosition(save, nextPosition);
    setSave(nextSave);
    void persistSave(nextSave).catch(() => {
      setStorageError("The map could not record that step. Check this device's storage before continuing.");
    });
    const scenario = scenarioAt(nextPosition);
    if (scenario) openScenario(scenario, nextSave);
  }, [openScenario, persistSave, phase, save]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const direction: MapDirection | null =
        event.key === "ArrowUp" || event.key.toLowerCase() === "w"
          ? "up"
          : event.key === "ArrowDown" || event.key.toLowerCase() === "s"
            ? "down"
            : event.key === "ArrowLeft" || event.key.toLowerCase() === "a"
              ? "left"
              : event.key === "ArrowRight" || event.key.toLowerCase() === "d"
                ? "right"
                : null;
      if (!direction || phase !== "map") return;
      event.preventDefault();
      move(direction);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [move, phase]);

  const choose = useCallback(async (choice: MapChoice) => {
    if (!save || !activeScenario || submitting) return;
    setSubmitting(true);
    setStorageError("");
    try {
      const event = createUnwrittenMapChoiceEvent({
        save,
        scenario: activeScenario,
        selectedOptionId: choice.id,
        presentedOptionIds: presentedChoices.map((candidate) => candidate.id),
        gameSessionId: gameSessionIdRef.current,
        startedAtMs: encounterStartedAtRef.current,
      });
      const nextSave = applyMapChoice(save, activeScenario.id, choice.id);
      await queueUnwrittenMapEvent(gameStorage, event);
      await persistSave(nextSave);
      setSave(nextSave);
      setResultChoice(choice);
      setPhase("result");
      try {
        await commitUnwrittenMapEvent(gameStorage, event.eventId);
        void flushUnwrittenMapEvents(gameStorage, sendUnwrittenMapEvent).catch(() => {
          setStorageError("This choice is saved locally. Its field note will be delivered when the road clears.");
        });
      } catch {
        setStorageError("This choice is saved locally. Its field note will be delivered when the road clears.");
      }
    } catch {
      setStorageError("That choice could not be recorded. Check this device's storage and try again.");
    } finally {
      setSubmitting(false);
    }
  }, [activeScenario, persistSave, presentedChoices, save, submitting]);

  const continueFromResult = useCallback(() => {
    if (!save) return;
    setActiveScenario(null);
    setResultChoice(null);
    setPhase(save.decisions.length === UNWRITTEN_MAP_SCENARIOS.length ? "complete" : "map");
  }, [save]);

  const restart = useCallback(async () => {
    const nextSave = createInitialUnwrittenMapSave(createUnwrittenMapPlayerId());
    try {
      await persistSave(nextSave);
      setSave(nextSave);
      setActiveScenario(null);
      setResultChoice(null);
      setLoadedExistingProgress(false);
      setStorageError("");
      setPhase("map");
    } catch {
      setStorageError("A new map could not be drawn. Check this device's storage and try again.");
    }
  }, [persistSave]);

  const currentLocation = useMemo(() => activeScenario?.location || "Crossroads Village", [activeScenario]);

  if (!save) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loading}>
          <ActivityIndicator color="#d9d56f" />
          <Text style={styles.loadingText}>{storageError || "UNFOLDING MAP..."}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === "title") {
    return (
      <SafeAreaView style={styles.safe}>
        <TitleScreen hasProgress={loadedExistingProgress} onBegin={() => setPhase(save.decisions.length === 4 ? "complete" : "map")} />
      </SafeAreaView>
    );
  }

  if (phase === "complete") {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.completeScroll}>
          <CompleteScreen save={save} onRestart={restart} onLeave={() => router.replace("/games" as never)} />
          {storageError ? <Text style={styles.storageError}>{storageError}</Text> : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <GameHeader save={save} onLeave={() => router.replace("/games" as never)} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.locationRow}>
          <Text style={styles.locationLabel}>NOW EXPLORING</Text>
          <Text style={styles.locationName}>{currentLocation}</Text>
        </View>
        <WorldMap save={save} tileSize={tileSize} />
        {phase === "map" ? (
          <View style={styles.mapControls}>
            <DPad onMove={move} />
            <View style={styles.mapInstructions}>
              <Text style={styles.instructionHeading}>WALK INTO THE COLORED MARKERS</Text>
              <Text style={styles.instructionText}>
                Explore all four corners. Every road advances the journey; there are no wrong choices.
              </Text>
              <Text style={styles.coordinateText}>MAP {save.position.x.toString().padStart(2, "0")}:{save.position.y.toString().padStart(2, "0")}</Text>
            </View>
          </View>
        ) : null}
        {phase === "encounter" && activeScenario ? (
          <EncounterPanel
            scenario={activeScenario}
            choices={presentedChoices}
            submitting={submitting}
            onChoose={choose}
          />
        ) : null}
        {phase === "result" && activeScenario && resultChoice ? (
          <ResultPanel scenario={activeScenario} choice={resultChoice} onContinue={continueFromResult} />
        ) : null}
        {storageError ? <Text style={styles.storageError}>{storageError}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const INK = "#293a28";
const DARK = "#18241a";
const SCREEN = "#cadb83";
const LIGHT = "#e5eca4";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#111912" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  loadingText: { color: SCREEN, fontSize: 12, fontWeight: "900", letterSpacing: 2, marginTop: 14, textAlign: "center" },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: "center", paddingHorizontal: 16, paddingBottom: 48 },
  header: { minHeight: 72, paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: 4, borderBottomColor: "#080d09", backgroundColor: INK, flexDirection: "row", alignItems: "center" },
  headerButton: { width: 64, minHeight: 44, borderWidth: 3, borderColor: SCREEN, alignItems: "center", justifyContent: "center", backgroundColor: DARK },
  headerButtonText: { color: LIGHT, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  headerTitleWrap: { flex: 1, alignItems: "center", paddingHorizontal: 8 },
  headerKicker: { color: "#8fa45d", fontSize: 8, fontWeight: "900", letterSpacing: 1.5 },
  headerTitle: { color: LIGHT, fontSize: 17, fontWeight: "900", letterSpacing: 1.4, textAlign: "center", marginTop: 3 },
  headerProgress: { width: 64, minHeight: 44, borderWidth: 3, borderColor: "#839956", backgroundColor: DARK, alignItems: "center", justifyContent: "center" },
  headerProgressValue: { color: LIGHT, fontSize: 15, fontWeight: "900" },
  headerProgressLabel: { color: "#8fa45d", fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  titleScreen: { flex: 1, minHeight: 700, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: DARK },
  titleMap: { width: 230, height: 170, borderWidth: 7, borderColor: INK, backgroundColor: SCREEN, marginBottom: 24, overflow: "hidden", position: "relative", transform: [{ rotate: "-1deg" }] },
  titleRiver: { position: "absolute", width: 36, height: 230, left: 132, top: -28, backgroundColor: "#74946a", transform: [{ rotate: "18deg" }] },
  titleRoadHorizontal: { position: "absolute", height: 18, left: 0, right: 0, top: 78, backgroundColor: "#e3da8c" },
  titleRoadVertical: { position: "absolute", width: 18, top: 0, bottom: 0, left: 70, backgroundColor: "#e3da8c" },
  titleLandmark: { position: "absolute", width: 22, height: 22, backgroundColor: INK, borderWidth: 4, borderColor: LIGHT },
  titleKicker: { color: "#93aa61", fontSize: 10, fontWeight: "900", letterSpacing: 2.4, textAlign: "center" },
  titleLogo: { color: LIGHT, fontSize: 40, lineHeight: 43, fontWeight: "900", letterSpacing: 3, textAlign: "center", marginTop: 9 },
  titleCopy: { color: "#afc46d", fontSize: 14, lineHeight: 22, textAlign: "center", maxWidth: 540, marginVertical: 22 },
  titleHint: { color: "#6f8450", fontSize: 10, marginTop: 15, textAlign: "center" },
  compass: { width: 72, height: 72, borderRadius: 36, borderWidth: 5, borderColor: INK, backgroundColor: LIGHT, alignItems: "center", justifyContent: "center" },
  compassNeedleNorth: { position: "absolute", top: 7, width: 0, height: 0, borderLeftWidth: 10, borderRightWidth: 10, borderBottomWidth: 26, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: "#a54c3c" },
  compassNeedleSouth: { position: "absolute", bottom: 7, width: 0, height: 0, borderLeftWidth: 10, borderRightWidth: 10, borderTopWidth: 26, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: INK },
  compassCenter: { width: 10, height: 10, borderRadius: 5, backgroundColor: LIGHT, borderWidth: 3, borderColor: INK, zIndex: 2 },
  primaryButton: { minWidth: 220, minHeight: 52, paddingHorizontal: 22, borderWidth: 4, borderColor: "#0b110c", backgroundColor: "#a54c3c", alignItems: "center", justifyContent: "center", marginTop: 10, shadowColor: "#000", shadowOpacity: 0.45, shadowOffset: { width: 4, height: 5 }, shadowRadius: 0 },
  primaryButtonText: { color: "#fff2b8", fontSize: 12, fontWeight: "900", letterSpacing: 1.3 },
  buttonDisabled: { opacity: 0.45 },
  locationRow: { width: "100%", maxWidth: 760, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 18, marginBottom: 8 },
  locationLabel: { color: "#708553", fontSize: 8, fontWeight: "900", letterSpacing: 1.5 },
  locationName: { color: LIGHT, fontSize: 13, fontWeight: "900" },
  worldMap: { alignSelf: "center", borderWidth: 6, borderColor: "#080d09", backgroundColor: SCREEN, shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 0, shadowOffset: { width: 7, height: 8 } },
  mapRow: { flexDirection: "row" },
  tile: { position: "relative", alignItems: "center", justifyContent: "center", overflow: "visible" },
  treeTile: { backgroundColor: "#536f45" },
  grassTile: { backgroundColor: "#aabd67" },
  pathTile: { backgroundColor: "#d7cc7d" },
  waterTile: { backgroundColor: "#668d73" },
  treeCrown: { position: "absolute", top: 2, width: "72%", height: "64%", borderRadius: 2, backgroundColor: INK, borderWidth: 2, borderColor: "#40583a" },
  treeTrunk: { position: "absolute", bottom: 1, width: "20%", height: "38%", backgroundColor: "#674d35" },
  grassTuft: { width: "34%", height: 3, backgroundColor: "#829b55", transform: [{ rotate: "-18deg" }] },
  waterLine: { width: "70%", height: 3, backgroundColor: "#a8c682" },
  landmark: { position: "absolute", width: "90%", height: "90%", borderWidth: 3, borderColor: INK, alignItems: "center", justifyContent: "flex-end", zIndex: 4 },
  landmarkOpen: { shadowColor: "#fff5a1", shadowOpacity: 0.9, shadowRadius: 7 },
  landmarkRoof: { position: "absolute", top: 2, width: "70%", height: "28%", backgroundColor: DARK },
  landmarkDoor: { width: "24%", height: "38%", backgroundColor: DARK },
  landmarkLabel: { position: "absolute", bottom: -10, color: "#f5efb0", backgroundColor: DARK, fontSize: 6, lineHeight: 9, fontWeight: "900", paddingHorizontal: 2, zIndex: 5 },
  playerSprite: { position: "absolute", width: "70%", height: "92%", alignItems: "center", zIndex: 8 },
  playerHatTop: { width: "52%", height: "24%", backgroundColor: "#a54c3c", borderWidth: 2, borderColor: DARK },
  playerHatBrim: { width: "82%", height: "12%", backgroundColor: "#a54c3c", borderWidth: 2, borderColor: DARK },
  playerFace: { width: "42%", height: "24%", backgroundColor: "#e1bc75", borderLeftWidth: 2, borderRightWidth: 2, borderColor: DARK },
  playerCoat: { width: "62%", height: "28%", backgroundColor: "#344f52", borderWidth: 2, borderColor: DARK },
  playerFeet: { width: "58%", height: "12%", flexDirection: "row", justifyContent: "space-between" },
  playerFoot: { width: "38%", height: "100%", backgroundColor: DARK },
  mapControls: { width: "100%", maxWidth: 680, flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 24, marginTop: 24 },
  dPad: { width: 156, height: 156, alignItems: "center", justifyContent: "center" },
  dPadRow: { flexDirection: "row" },
  directionButton: { width: 52, height: 52, backgroundColor: "#354936", borderWidth: 3, borderColor: "#0b120c", alignItems: "center", justifyContent: "center" },
  directionText: { color: LIGHT, fontSize: 10, fontWeight: "900" },
  directionSpacer: { width: 52, height: 52 },
  dPadCenter: { width: 52, height: 52, backgroundColor: "#354936" },
  mapInstructions: { flex: 1, minWidth: 250, maxWidth: 390, borderWidth: 4, borderColor: "#080d09", backgroundColor: INK, padding: 16 },
  instructionHeading: { color: LIGHT, fontSize: 11, fontWeight: "900", letterSpacing: 1.1 },
  instructionText: { color: "#a9be6d", fontSize: 12, lineHeight: 18, marginTop: 8 },
  coordinateText: { color: "#728753", fontSize: 9, fontWeight: "900", marginTop: 12, letterSpacing: 1.5 },
  dialoguePanel: { width: "100%", maxWidth: 760, borderWidth: 6, borderColor: "#080d09", backgroundColor: INK, padding: 18, marginTop: 20, shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 0, shadowOffset: { width: 6, height: 7 } },
  dialogueLocation: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderWidth: 3, borderColor: DARK, marginBottom: 12 },
  dialogueLocationText: { color: DARK, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  dialogueTitle: { color: LIGHT, fontSize: 23, fontWeight: "900", letterSpacing: 0.8 },
  dialoguePrompt: { color: "#bfd079", fontSize: 14, lineHeight: 21, marginTop: 9, marginBottom: 14 },
  choiceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  choiceButton: { flexGrow: 1, flexBasis: 310, minHeight: 94, borderWidth: 3, borderColor: "#839957", backgroundColor: DARK, padding: 12, flexDirection: "row", alignItems: "flex-start" },
  choiceNumber: { color: "#e2d378", fontSize: 11, fontWeight: "900", marginRight: 11, marginTop: 2 },
  choiceCopy: { flex: 1 },
  choiceLabel: { color: LIGHT, fontSize: 13, fontWeight: "900" },
  choiceDescription: { color: "#96ab63", fontSize: 11, lineHeight: 17, marginTop: 4 },
  resultStamp: { color: "#e2d378", fontSize: 10, fontWeight: "900", letterSpacing: 2, marginBottom: 8 },
  resultChoice: { color: "#93aa61", fontSize: 13, fontWeight: "900", textTransform: "uppercase", marginTop: 7 },
  resultText: { color: "#c7d783", fontSize: 15, lineHeight: 23, marginVertical: 18 },
  storageError: { width: "100%", maxWidth: 760, color: "#fff0ad", backgroundColor: "#7c3f34", borderWidth: 3, borderColor: "#b86a4e", padding: 12, marginTop: 14, fontSize: 12, lineHeight: 18, textAlign: "center" },
  completeScroll: { flexGrow: 1, padding: 20, paddingBottom: 48 },
  completeScreen: { width: "100%", maxWidth: 700, minHeight: 680, alignSelf: "center", alignItems: "center", justifyContent: "center" },
  completeKicker: { color: "#93aa61", fontSize: 10, fontWeight: "900", letterSpacing: 2, textAlign: "center", marginTop: 20 },
  completeTitle: { color: LIGHT, fontSize: 30, lineHeight: 37, fontWeight: "900", textAlign: "center", maxWidth: 560, marginTop: 10 },
  completeCopy: { color: "#a9be6d", fontSize: 14, lineHeight: 22, textAlign: "center", maxWidth: 530, marginTop: 12, marginBottom: 20 },
  journal: { width: "100%", maxWidth: 560, borderWidth: 5, borderColor: "#080d09", backgroundColor: "#d8d68b", padding: 16, marginBottom: 16, transform: [{ rotate: "-0.4deg" }] },
  journalHeading: { color: DARK, fontSize: 12, fontWeight: "900", letterSpacing: 2, borderBottomWidth: 3, borderColor: "#758653", paddingBottom: 8 },
  journalRow: { flexDirection: "row", alignItems: "center", paddingVertical: 9, borderBottomWidth: 1, borderColor: "#9caa69" },
  journalMark: { width: 18, height: 18, borderWidth: 2, borderColor: DARK, marginRight: 10 },
  journalCopy: { flex: 1 },
  journalPlace: { color: DARK, fontSize: 12, fontWeight: "900" },
  journalDecision: { color: "#51603d", fontSize: 10, marginTop: 2 },
  textButton: { minHeight: 44, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", marginTop: 6 },
  textButtonText: { color: "#91a862", fontSize: 12, textDecorationLine: "underline" },
});
