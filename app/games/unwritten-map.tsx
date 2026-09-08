import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AccessibilityInfo,
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
  createChoiceMadeEvent,
  createChoiceUndoneEvent,
  createEncounterSkippedEvent,
  createInitialUnwrittenMapSave,
  createSessionEvent,
  createUnwrittenMapPlayerId,
  isUnwrittenMapRecommendationContinuationCurrent,
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
  unwrittenMapArtworkFrame,
  unwrittenMapViewportLayout,
} from "../../lib/recommendationGames/unwrittenMapPresentation";
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
import {
  UNWRITTEN_MAP_TOKENS,
  UnwrittenMapEncounterTemplate,
  UnwrittenMapEntryTemplate,
  UnwrittenMapFieldNotesTemplate,
  UnwrittenMapRegionMapTemplate,
  UnwrittenMapResultTemplate,
} from "../../features/unwritten-map/components/UnwrittenMapTemplates";
import {
  UnwrittenMapArt,
  UnwrittenMapRegionMotifs,
} from "../../features/unwritten-map/components/UnwrittenMapArt";
import {
  buildUnwrittenMapPresentationMetadata,
  unwrittenMapHasCommissionedArt,
  type UnwrittenMapChoicePresentation,
  type UnwrittenMapEncounterPresentation,
} from "../../lib/recommendationGames/unwrittenMapPresentationContract";
import {
  UNWRITTEN_MAP_REGION_REGISTRY,
  type UnwrittenMapRegionId,
} from "../../lib/recommendationGames/unwrittenMapRegions";

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

function usePrefersReducedMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(function monitorReducedMotion() {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return reduceMotion;
}

const UNWRITTEN_MAP_PRESENTATION = new Map<string, UnwrittenMapEncounterPresentation>(
  buildUnwrittenMapPresentationMetadata().map((presentation) => [presentation.scenarioId, presentation]),
);

function presentationForScenario(scenario: MapScenario): UnwrittenMapEncounterPresentation {
  const presentation = UNWRITTEN_MAP_PRESENTATION.get(scenario.id);
  if (!presentation) throw new Error(`Missing Unwritten Map presentation metadata for ${scenario.id}`);
  return presentation;
}

function presentationForChoice(
  presentation: UnwrittenMapEncounterPresentation,
  choiceId: string,
): UnwrittenMapChoicePresentation {
  const choice = presentation.choices.find((candidate) => candidate.choiceId === choiceId);
  if (!choice) throw new Error(`Missing Unwritten Map choice presentation metadata for ${presentation.scenarioId}/${choiceId}`);
  return choice;
}

function CartographyBackdrop({
  page = "map",
  regionId,
}: {
  page?: "entry" | "map" | "journal" | "result";
  regionId?: UnwrittenMapRegionId;
}) {
  const result = page === "result";
  const journal = page === "journal" || result;
  const entry = page === "entry";
  const mossmere = regionId === "mossmere";
  const region = regionId ? UNWRITTEN_MAP_REGION_REGISTRY[regionId] : null;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.backdrop}
    >
      <Image
        source={entry
          ? require("../../assets/games/unwritten-map/entry-left.webp")
          : result && mossmere
            ? require("../../assets/games/unwritten-map/result-mossmere-left.webp")
          : mossmere
            ? require("../../assets/games/unwritten-map/encounter-mossmere-left.webp")
          : journal
            ? require("../../assets/games/unwritten-map/journal-left.webp")
            : require("../../assets/games/unwritten-map/entry-left.webp")}
        style={[styles.edgeArt, styles.edgeArtLeft]}
        contentFit="cover"
        accessibilityElementsHidden
      />
      <Image
        source={entry
          ? require("../../assets/games/unwritten-map/entry-right.webp")
          : result && mossmere
            ? require("../../assets/games/unwritten-map/result-mossmere-right.webp")
          : mossmere
            ? require("../../assets/games/unwritten-map/encounter-mossmere-right.webp")
          : journal
            ? require("../../assets/games/unwritten-map/journal-right.webp")
            : require("../../assets/games/unwritten-map/entry-right.webp")}
        style={[styles.edgeArt, styles.edgeArtRight]}
        contentFit="cover"
        accessibilityElementsHidden
      />
      {result && mossmere ? (
        <Image
          source={require("../../assets/games/unwritten-map/result-mossmere-bottom.webp")}
          style={styles.resultBackdropBottom}
          contentFit="cover"
          accessibilityElementsHidden
        />
      ) : null}
      {region && regionId ? (
        <View style={[styles.regionFrame, { borderColor: region.paletteHex.primary }]}>
          <UnwrittenMapRegionMotifs regionId={regionId} />
        </View>
      ) : null}
      <View style={[styles.parchmentWash, result && mossmere && styles.resultParchmentWash]} />
      {region ? <View style={[styles.regionWash, { backgroundColor: `${region.paletteHex.fallback}24` }]} /> : null}
      <View style={styles.edgeVignette} />
    </View>
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
    <View style={[styles.landmark, { backgroundColor: completed ? "#6f755d" : scenario.color }]}>
      <MaterialCommunityIcons name={completed ? "check" : "map-marker-star"} size={18} color={PARCHMENT} />
      <Text style={styles.landmarkLabel}>{completed ? "NOTED" : scenario.mapLabel.slice(0, 2)}</Text>
    </View>
  );
}

const RESULT_CLOSING_LINES: Record<MapScenario["type"], string> = {
  community: "Every gathering leaves a new trail of stories.",
  mystery: "Look closer. The world always has more to say.",
  craft: "Patient hands can redraw the shape of a journey.",
  wonder: "Curiosity turns ordinary places into extraordinary discoveries.",
  expedition: "Every distant path begins with one brave mark.",
};

function resultClosingLine(scenario: MapScenario, choice: MapChoice | null) {
  if (!choice) return "An open circle is still a place worth remembering.";
  const motif = `${choice.id} ${choice.tags.join(" ")}`;
  if (/experiment|investigative|scholarly|puzzle/.test(motif)) return "Curiosity turns ordinary places into extraordinary discoveries.";
  if (/quiet|observant|reflective|patient/.test(motif)) return "The quietest details often tell the longest stories.";
  if (/music|dance|art|creative|spectacle/.test(motif)) return "A shared wonder can brighten every path home.";
  return RESULT_CLOSING_LINES[scenario.type];
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
      {tile === "T" ? <MaterialCommunityIcons name="pine-tree" size={Math.max(16, size * 0.62)} color="#314e32" /> : null}
      {tile === "G" && (x * 3 + y) % 5 === 0 ? <MaterialCommunityIcons name="sprout" size={Math.max(11, size * 0.28)} color="#68794b" /> : null}
      {tile === "W" ? <MaterialCommunityIcons name="waves" size={Math.max(15, size * 0.48)} color="#537f80" /> : null}
      {tile === "M" ? <MaterialCommunityIcons name="image-filter-hdr" size={Math.max(16, size * 0.58)} color="#5f6659" /> : null}
      {scenario ? <LandmarkSprite scenario={scenario} completed={save.decisions.some((item) => item.scenarioId === scenario.id)} /> : null}
      {hasPlayer ? <PlayerSprite facing={save.facing} walkingFrame={walkingFrame} /> : null}
    </View>
  );
}

function WorldMap({
  save, tileSize, columns, rows, walkingFrame, bumpDirection, compact, focused, onActivate, onDeactivate,
}: {
  save: UnwrittenMapSaveV2;
  tileSize: number;
  columns: number;
  rows: number;
  walkingFrame: number;
  bumpDirection: MapDirection | null;
  compact: boolean;
  focused: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
}) {
  const [boardArtFailed, setBoardArtFailed] = useState(false);
  const { origin, ...artworkFrame } = unwrittenMapArtworkFrame(save.position, columns, rows, tileSize);
  const bumpTransform = bumpDirection === "left" ? { translateX: -3 }
    : bumpDirection === "right" ? { translateX: 3 }
      : bumpDirection === "up" ? { translateY: -3 }
        : bumpDirection === "down" ? { translateY: 3 } : undefined;
  return (
    <View
      style={[styles.viewport, focused && styles.viewportFocused, { width: columns * tileSize + 8, height: rows * tileSize + 8 }]}
      accessibilityLabel="The Unwritten Map overworld. Focus to use arrow or WASD controls."
      accessibilityRole="image"
      focusable
      onFocus={onActivate}
      onBlur={onDeactivate}
      onTouchStart={onActivate}
    >
      {!boardArtFailed ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.worldArtworkPlane, artworkFrame]}
        >
          <Image
            source={compact
              ? require("../../assets/games/unwritten-map/board-map-mobile.webp")
              : require("../../assets/games/unwritten-map/board-map.webp")}
            style={styles.worldMapArt}
            contentFit="fill"
            onError={() => setBoardArtFailed(true)}
            accessibilityElementsHidden
          />
        </View>
      ) : null}
      <View pointerEvents="none" style={styles.mapArtVeil} />
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
        <MaterialCommunityIcons name="arrow-left" size={15} color={PARCHMENT} />
        <Text style={styles.headerButtonText}>{leaving ? "SAVING..." : "EXIT"}</Text>
      </TouchableOpacity>
      <View style={styles.headerTitleWrap}>
        <Text style={styles.headerKicker}>A CARTOGRAPHER&apos;S TALE</Text>
        <Text style={styles.headerTitle}>THE UNWRITTEN MAP</Text>
        <View style={styles.headerFlourish} />
      </View>
      <View style={styles.headerProgress}>
        <Text style={styles.headerProgressValue}>{save.decisions.length}/{UNWRITTEN_MAP_SCENARIOS.length}</Text>
        <Text style={styles.headerProgressLabel}>MARKS</Text>
      </View>
    </View>
  );
}

function TitleScreen({
  hasProgress, onBegin, onPrivacy, onReset, beginning, compact,
}: { hasProgress: boolean; onBegin: () => void; onPrivacy: () => void; onReset: () => void; beginning: boolean; compact: boolean }) {
  const [entryArtFailed, setEntryArtFailed] = useState(false);
  return (
    <ScrollView contentContainerStyle={styles.titleScreen}>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.entryBackdrop}
      >
        {!entryArtFailed ? (
          <Image
            source={require("../../assets/games/unwritten-map/entry-tabletop.webp")}
            style={styles.entryBackdropArt}
            contentFit="cover"
            onError={() => setEntryArtFailed(true)}
            accessibilityElementsHidden
          />
        ) : (
          <View style={styles.entryArtFallback}>
            <Image
              source={require("../../assets/games/unwritten-map/world-map.webp")}
              style={styles.entryFallbackMap}
              contentFit="cover"
              accessibilityElementsHidden
            />
            <MaterialCommunityIcons name="compass-rose" size={120} color="rgba(67,49,25,0.3)" />
          </View>
        )}
        <View style={styles.entryBackdropVignette} />
      </View>
      <View style={[styles.titleMap, compact && styles.titleMapCompact]}>
        <UnwrittenMapEntryTemplate testID="unwritten-map-entry-template">
          <View style={styles.titleKickerRow}>
            <View style={styles.titleRule} />
            <MaterialCommunityIcons name="compass-rose" size={22} color={INK} />
            <Text style={styles.titleKicker}>A CARTOGRAPHER&apos;S TALE</Text>
            <MaterialCommunityIcons name="compass-rose" size={22} color={INK} />
            <View style={styles.titleRule} />
          </View>
          <Text style={[styles.titleLogo, compact && styles.titleLogoCompact]}>THE{"\n"}UNWRITTEN MAP</Text>
          <Text style={styles.titleCopy}>Cross six wild regions, meet their curious inhabitants, and make a map no other traveler could draw.</Text>
          <TouchableOpacity style={[styles.primaryButton, beginning && styles.buttonDisabled]} disabled={beginning} onPress={onBegin} accessibilityRole="button" accessibilityLabel={hasProgress ? "Continue journey" : "Open the map"}>
            <MaterialCommunityIcons name="map-outline" size={18} color="#f7e7b0" />
            <Text style={styles.primaryButtonText}>{beginning ? "OPENING..." : hasProgress ? "CONTINUE JOURNEY" : "OPEN THE MAP"}</Text>
          </TouchableOpacity>
          <Text style={styles.titleHint}>Focus the map for Arrow/WASD controls, or hold the direction pad.</Text>
          <TouchableOpacity style={styles.textButton} onPress={onPrivacy} accessibilityRole="button">
            <MaterialCommunityIcons name="book-open-page-variant-outline" size={16} color={INK} />
            <Text style={styles.textButtonText}>What the map remembers</Text>
          </TouchableOpacity>
          {hasProgress ? <TouchableOpacity style={[styles.textButton, beginning && styles.buttonDisabled]} disabled={beginning} onPress={onReset} accessibilityRole="button">
            <Text style={styles.resetText}>Reset this journey</Text>
          </TouchableOpacity> : null}
        </UnwrittenMapEntryTemplate>
      </View>
    </ScrollView>
  );
}

function PrivacyNote({ onClose }: { onClose: () => void }) {
  return (
    <View style={styles.notePanel}>
      <MaterialCommunityIcons name="shield-lock-outline" size={28} color={GOLD} />
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
  const presentation = presentationForScenario(scenario);
  const region = UNWRITTEN_MAP_REGION_REGISTRY[presentation.regionId];
  return (
    <UnwrittenMapEncounterTemplate
      testID="unwritten-map-encounter-template"
      accent={region.paletteHex.primary}
      decoration={(
        <View pointerEvents="none" accessibilityElementsHidden style={styles.fieldSketch}>
          <MaterialCommunityIcons name="feather" size={90} color="rgba(81,53,25,0.12)" />
        </View>
      )}
    >
      <View style={styles.encounterLead}>
        <View style={styles.encounterLeadCopy}>
          <View style={styles.dialogueLocation}>
            <View style={[styles.locationSwatch, { backgroundColor: scenario.color }]} />
            <Text style={styles.dialogueLocationText}>{scenario.location.toUpperCase()} · {scenario.type.toUpperCase()}</Text>
          </View>
          <Text style={styles.dialogueTitle}>{scenario.title}</Text>
          <Text style={styles.dialoguePrompt}>{scenario.prompt}</Text>
        </View>
        {unwrittenMapHasCommissionedArt(presentation.focalArt) ? (
          <View style={[styles.encounterIllustration, { borderColor: region.paletteHex.primary }]}>
            <UnwrittenMapArt
              art={presentation.focalArt}
              actorRole={presentation.actorRole}
              regionId={presentation.regionId}
              label={`${scenario.title} at ${scenario.location}`}
              variant="encounter"
            />
          </View>
        ) : null}
      </View>
      <View style={styles.inkDivider}><View style={styles.inkLine} /><MaterialCommunityIcons name="leaf-maple" size={18} color={INK} /><View style={styles.inkLine} /></View>
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
            <View style={styles.choiceNumberSeal}><Text style={styles.choiceNumber}>{index + 1}</Text></View>
            <UnwrittenMapArt
              art={presentationForChoice(presentation, item.id).focalArt}
              actorRole="explorer"
              regionId={presentation.regionId}
              label={item.label}
              variant="choice"
            />
            <View style={styles.choiceCopy}><Text style={styles.choiceLabel}>{item.label}</Text><Text style={styles.choiceDescription}>{item.description}</Text></View>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={styles.skipButton} disabled={submitting} onPress={onSkip} accessibilityRole="button">
        <Text style={styles.skipText}>NONE OF THESE · KEEP EXPLORING</Text>
      </TouchableOpacity>
      <Text style={styles.equalNote}>Every path is a good path. You can also change your latest field note.</Text>
    </UnwrittenMapEncounterTemplate>
  );
}

function ResultPanel({
  scenario, choice, skipped, onContinue, pending,
}: { scenario: MapScenario; choice: MapChoice | null; skipped: boolean; onContinue: () => void; pending: boolean }) {
  const presentation = presentationForScenario(scenario);
  const choicePresentation = choice
    ? presentation.choices.find((candidate) => candidate.choiceId === choice.id)
    : null;
  const resultArt = choicePresentation?.result.focalArt || presentation.focalArt;
  const resultActor = choicePresentation?.result.actorRole || presentation.actorRole;
  const region = UNWRITTEN_MAP_REGION_REGISTRY[presentation.regionId];
  return (
    <UnwrittenMapResultTemplate testID="unwritten-map-result-template" accent={region.paletteHex.primary}>
      <View style={styles.resultLead}>
        <View style={styles.resultLeadCopy}>
          <View style={styles.resultEyebrow}>
            <MaterialCommunityIcons name={skipped ? "map-marker-outline" : "feather"} size={22} color="#6e522b" />
            <Text style={styles.resultStamp}>{skipped ? "LANDMARK NOTED" : "STORY ADDED TO MAP"}</Text>
          </View>
          <Text style={styles.resultEncounterTitle}>{scenario.title}</Text>
          <Text style={[styles.resultChoice, { color: region.paletteHex.primary }]}>
            {(choice?.label || "OPEN POSSIBILITY").toUpperCase()}
          </Text>
        </View>
        {unwrittenMapHasCommissionedArt(resultArt) ? (
          <View style={[styles.resultIllustration, { borderColor: region.paletteHex.primary }]}>
            <UnwrittenMapArt
              art={resultArt}
              actorRole={resultActor}
              regionId={presentation.regionId}
              label={choice ? `${choice.label}: ${choice.result}` : `${scenario.location}: open possibility`}
              variant="result"
            />
          </View>
        ) : null}
      </View>
      <View style={styles.resultRule}><View style={styles.resultRuleLine} /><MaterialCommunityIcons name="sprout" size={19} color={region.paletteHex.primary} /><View style={styles.resultRuleLine} /></View>
      <Text style={styles.resultText}>
        {choice?.result || "You mark the place with a small open circle. It can remain a possibility, without meaning anything more."}
      </Text>
      <TouchableOpacity
        style={[styles.resultContinue, pending && styles.buttonDisabled]}
        disabled={pending}
        onPress={onContinue}
        accessibilityRole="button"
        accessibilityLabel="Return to the road"
      >
        <Text style={styles.resultContinueText}>RETURN TO THE ROAD</Text>
        <MaterialCommunityIcons name="arrow-right" size={19} color="#f6e7b3" />
      </TouchableOpacity>
      <Text style={styles.resultClosing}>“{resultClosingLine(scenario, choice)}”</Text>
    </UnwrittenMapResultTemplate>
  );
}

function Journal({
  save, onUndo, undoing,
}: { save: UnwrittenMapSaveV2; onUndo: () => void; undoing: boolean }) {
  return (
    <UnwrittenMapFieldNotesTemplate
      testID="unwritten-map-field-notes-template"
      subtitle={`${save.decisions.length} of ${UNWRITTEN_MAP_SCENARIOS.length} landmarks recorded from saved journey data`}
    >
      {save.decisions.length ? save.decisions.map((decision) => {
        const scenario = UNWRITTEN_MAP_SCENARIOS.find((item) => item.id === decision.scenarioId);
        const selected = scenario?.choices.find((item) => item.id === decision.optionId);
        const presentation = scenario ? presentationForScenario(scenario) : null;
        const choicePresentation = presentation?.choices.find((item) => item.choiceId === decision.optionId);
        const region = presentation ? UNWRITTEN_MAP_REGION_REGISTRY[presentation.regionId] : null;
        return (
          <View key={`${decision.scenarioId}:${decision.presentationId}`} style={styles.journalRow}>
            {presentation ? (
              <UnwrittenMapArt
                art={choicePresentation?.result.focalArt || presentation.focalArt}
                actorRole={choicePresentation?.result.actorRole || presentation.actorRole}
                regionId={presentation.regionId}
                label={selected?.label || scenario?.location || decision.scenarioId}
                variant="choice"
              />
            ) : <View style={[styles.journalMark, { backgroundColor: scenario?.color || INK }]} />}
            <View style={styles.journalCopy}>
              <Text style={styles.journalPlace}>{scenario?.location || decision.scenarioId}</Text>
              {region ? <Text style={styles.journalRegion}>{region.name.toUpperCase()}</Text> : null}
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
    </UnwrittenMapFieldNotesTemplate>
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
      <View style={styles.completeCompass}>
        <MaterialCommunityIcons name="compass-rose" size={54} color={GOLD} />
      </View>
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
  const reduceMotion = usePrefersReducedMotion();
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
  const {
    columns,
    rows,
    tileSize,
    compact: compactLayout,
  } = useMemo(() => unwrittenMapViewportLayout(width, height), [height, width]);
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

  const continueFromResult = useCallback(async (expectedPresentationId?: string) => {
    if (expectedPresentationId && (
      phaseRef.current !== "result"
      || !isUnwrittenMapRecommendationContinuationCurrent(expectedPresentationId, resultDecisionRef.current)
    )) return;
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

  const currentRegion = useMemo(() => save
    ? regionAt(save.position) as { id: UnwrittenMapRegionId; name: string }
    : null, [save]);

  if (!save) {
    return <SafeAreaView style={styles.safe}><CartographyBackdrop page="entry" /><View style={styles.loading}><ActivityIndicator color={GOLD} /><Text style={styles.loadingText}>{storageError || "UNFOLDING MAP..."}</Text></View></SafeAreaView>;
  }

  if (phase === "title") {
    return (
      <SafeAreaView style={styles.safe}>
        <TitleScreen
          hasProgress={loadedExistingProgress}
          beginning={operationPending}
          compact={compactLayout}
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
        <CartographyBackdrop page="journal" />
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
      <CartographyBackdrop
        page={phase === "map" ? "map" : phase === "result" ? "result" : "journal"}
        regionId={phase === "map" ? currentRegion?.id : activeScenario
          ? presentationForScenario(activeScenario).regionId
          : currentRegion?.id}
      />
      <GameHeader save={save} onLeave={() => void leaveJourney()} leaving={operationPending} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.hud}>
          <View style={styles.locationCard}>
            <Text style={styles.locationLabel}>{phase === "map" ? "NOW EXPLORING" : "FIELD NOTE FROM"}</Text>
            <Text style={styles.locationName} accessibilityLiveRegion="polite">{currentRegion?.name || ""}</Text>
          </View>
          <View style={styles.hudActions}>
            <TouchableOpacity style={styles.hudButton} onPress={() => setShowJournal((value) => !value)} accessibilityRole="button">
              <MaterialCommunityIcons name={showJournal ? "close" : "notebook-outline"} size={17} color={PARCHMENT} />
              <Text style={styles.hudButtonText}>{showJournal ? "CLOSE NOTES" : "FIELD NOTES"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.hudButton} onPress={() => setShowPrivacy(true)} accessibilityRole="button" accessibilityLabel="What the map remembers">
              <MaterialCommunityIcons name="help" size={19} color={PARCHMENT} />
            </TouchableOpacity>
          </View>
        </View>
        {showJournal ? <Journal save={save} onUndo={() => void undoLatest()} undoing={undoing || operationPending} /> : phase === "map" ? (
          <UnwrittenMapRegionMapTemplate testID="unwritten-map-region-map-template">
            <WorldMap
              save={save} tileSize={tileSize} columns={columns} rows={rows} walkingFrame={reduceMotion ? 0 : walkingFrame}
              bumpDirection={reduceMotion ? null : bumpDirection}
              compact={compactLayout}
              focused={mapFocused}
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
          </UnwrittenMapRegionMapTemplate>
        ) : phase === "encounter" && activeScenario ? (
          <EncounterPanel scenario={activeScenario} choices={presentedChoices} submitting={submitting || operationPending} onChoose={(item) => void recordOutcome(item)} onSkip={() => void recordOutcome(null)} />
        ) : phase === "result" && activeScenario ? (
          <ResultPanel scenario={activeScenario} choice={resultChoice} skipped={resultSkipped} pending={operationPending} onContinue={() => void continueFromResult()} />
        ) : null}
        {phase === "map" && !showJournal ? (
          <View style={styles.mapControls}>
            <DPad onMove={move} onHoldStart={(direction) => startHeldMovement(direction, false)} onHoldEnd={stopHeldMovement} />
            <View style={styles.mapInstructions}>
              <View style={styles.instructionHeadingRow}>
                <MaterialCommunityIcons name="compass-outline" size={20} color={INK} />
                <Text style={styles.instructionHeading}>SEEK THE COLORED LANDMARKS</Text>
              </View>
              <Text style={styles.instructionText}>Roads, grass, and sand are open. Trees, water, and peaks block the way. Your route is never used as a preference.</Text>
              <Text style={styles.coordinateText}>MAP {save.position.x.toString().padStart(2, "0")}:{save.position.y.toString().padStart(2, "0")}</Text>
            </View>
          </View>
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
            description: gameRecommendationMilestone.pendingReward.description,
            reason: gameRecommendationMilestone.pendingReward.reason,
          }}
          onRespond={(response) => {
            const originatingDecisionId = gameRecommendationMilestone.pendingReward?.nativeEvidenceId;
            gameRecommendationMilestone.respond(response, () => {
              if (originatingDecisionId) void continueFromResult(originatingDecisionId);
            });
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

const INK = UNWRITTEN_MAP_TOKENS.color.ink;
const DARK = UNWRITTEN_MAP_TOKENS.color.darkGreen;
const SCREEN = "#d3c18d";
const PARCHMENT = UNWRITTEN_MAP_TOKENS.color.parchment;
const GOLD = UNWRITTEN_MAP_TOKENS.color.gold;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#17150f" },
  backdrop: { ...StyleSheet.absoluteFillObject, overflow: "hidden", backgroundColor: "#17150f" },
  edgeArt: { position: "absolute", top: 0, bottom: 0, width: "27%", height: "100%", opacity: 0.92 },
  edgeArtLeft: { left: 0 },
  edgeArtRight: { right: 0 },
  resultBackdropBottom: { position: "absolute", left: "17%", right: "17%", bottom: 0, width: "66%", height: 150, opacity: 0.94 },
  regionFrame: { position: "absolute", left: 12, right: 12, bottom: 10, zIndex: 2, minHeight: 48, paddingHorizontal: 14, borderTopWidth: 1, borderBottomWidth: 1, alignItems: "center", justifyContent: "center" },
  regionWash: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
  parchmentWash: { ...StyleSheet.absoluteFillObject, left: "17%", right: "17%", backgroundColor: "rgba(220,195,137,0.93)" },
  resultParchmentWash: { backgroundColor: "rgba(220,195,137,0.56)" },
  edgeVignette: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(31,24,14,0.13)" },
  loading: { flex: 1, zIndex: 2, alignItems: "center", justifyContent: "center", padding: 24 },
  loadingText: { color: INK, fontFamily: "Georgia", fontSize: 13, fontWeight: "800", letterSpacing: 2, marginTop: 14, textAlign: "center" },
  scroll: { flex: 1, zIndex: 2 },
  scrollContent: { flexGrow: 1, alignItems: "center", paddingHorizontal: 14, paddingBottom: 36 },
  header: { zIndex: 4, minHeight: 64, paddingHorizontal: 16, paddingVertical: 7, borderBottomWidth: 2, borderBottomColor: "#80612e", backgroundColor: "rgba(24,42,30,0.98)", flexDirection: "row", alignItems: "center", shadowColor: "#000", shadowOpacity: 0.55, shadowRadius: 12 },
  headerButton: { minWidth: 70, minHeight: 44, paddingHorizontal: 10, borderWidth: 1.5, borderColor: "#d6be7b", borderRadius: 3, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", backgroundColor: "#22362a" },
  headerButtonText: { color: PARCHMENT, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  headerTitleWrap: { flex: 1, alignItems: "center", paddingHorizontal: 6 },
  headerKicker: { color: "#bfa565", fontFamily: "Georgia", fontSize: 7, fontWeight: "800", letterSpacing: 1.8 },
  headerTitle: { color: PARCHMENT, fontFamily: "Georgia", fontSize: 18, lineHeight: 22, fontWeight: "900", letterSpacing: 1.1, textAlign: "center" },
  headerFlourish: { width: 66, height: 1, marginTop: 3, backgroundColor: "#8e7240" },
  headerProgress: { minWidth: 70, minHeight: 46, paddingHorizontal: 8, borderWidth: 1.5, borderColor: "#d6be7b", borderRadius: 3, backgroundColor: "#22362a", alignItems: "center", justifyContent: "center" },
  headerProgressValue: { color: PARCHMENT, fontFamily: "Georgia", fontSize: 15, fontWeight: "900" },
  headerProgressLabel: { color: "#baa66e", fontSize: 7, fontWeight: "900", letterSpacing: 1.2 },
  titleScreen: { flexGrow: 1, minHeight: 680, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, paddingVertical: 24, backgroundColor: "#17150f" },
  entryBackdrop: { ...StyleSheet.absoluteFillObject, overflow: "hidden", backgroundColor: "#1a160f" },
  entryBackdropArt: { width: "100%", height: "100%" },
  entryBackdropVignette: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(21,15,9,0.09)" },
  entryArtFallback: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "#c9b278" },
  entryFallbackMap: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%", opacity: 0.5 },
  titleMap: { zIndex: 2, width: "76%", maxWidth: 860, minHeight: 600, alignItems: "center", justifyContent: "center" },
  titleMapCompact: { width: "100%", minHeight: 720 },
  titleContent: { width: "90%", maxWidth: 690, alignItems: "center", paddingHorizontal: 24, paddingVertical: 30, borderWidth: 1, borderColor: "rgba(87,59,28,0.16)", borderRadius: 10, backgroundColor: "rgba(239,217,163,0.38)" },
  titleKickerRow: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  titleRule: { width: "12%", maxWidth: 70, height: 1, backgroundColor: "#725629" },
  titleKicker: { color: INK, fontFamily: "Georgia", fontSize: 11, fontWeight: "900", letterSpacing: 2.2, textAlign: "center" },
  titleLogo: { color: INK, fontFamily: "Georgia", fontSize: 58, lineHeight: 60, fontWeight: "900", letterSpacing: 1.8, textAlign: "center", marginTop: 12, textShadowColor: "rgba(246,229,176,0.9)", textShadowRadius: 5 },
  titleLogoCompact: { fontSize: 39, lineHeight: 43 },
  titleCopy: { color: "#3f2d1c", fontFamily: "Georgia", fontSize: 16, lineHeight: 24, fontWeight: "600", textAlign: "center", maxWidth: 540, marginVertical: 18 },
  titleHint: { color: "#66502d", fontSize: 11, lineHeight: 16, marginTop: 13, textAlign: "center" },
  primaryButton: { minWidth: 220, minHeight: 50, paddingHorizontal: 20, borderWidth: 2, borderColor: "#d3b66d", borderRadius: 4, backgroundColor: "#2e4a36", flexDirection: "row", gap: 9, alignItems: "center", justifyContent: "center", marginTop: 9, shadowColor: "#000", shadowOpacity: 0.42, shadowOffset: { width: 3, height: 4 }, shadowRadius: 3 },
  primaryButtonText: { color: "#f7e7b0", fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  textButton: { minHeight: 44, paddingHorizontal: 18, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", marginTop: 3 },
  textButtonText: { color: INK, textDecorationLine: "underline", fontSize: 12, fontWeight: "700" },
  resetText: { color: "#7d382c", textDecorationLine: "underline", fontSize: 11, fontWeight: "700" },
  hud: { width: "100%", maxWidth: 960, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 12, marginBottom: 9 },
  locationCard: { flexShrink: 1, minHeight: 52, paddingHorizontal: 13, paddingVertical: 8, borderLeftWidth: 4, borderLeftColor: "#38563c", backgroundColor: "rgba(238,218,163,0.93)" },
  locationLabel: { color: "#765b31", fontSize: 8, fontWeight: "900", letterSpacing: 1.5 },
  locationName: { color: INK, fontFamily: "Georgia", fontSize: 17, fontWeight: "900", marginTop: 2 },
  hudActions: { flexDirection: "row", gap: 7 },
  hudButton: { minHeight: 44, paddingHorizontal: 12, backgroundColor: "#253b2c", borderWidth: 1.5, borderColor: "#c3aa69", borderRadius: 3, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" },
  hudButtonText: { color: PARCHMENT, fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  viewport: { position: "relative", borderWidth: 6, borderColor: "#4b351d", borderRadius: 5, overflow: "hidden", backgroundColor: SCREEN, shadowColor: "#000", shadowOpacity: 0.55, shadowRadius: 12, shadowOffset: { width: 5, height: 7 } },
  viewportFocused: { borderColor: "#f1d47e", shadowColor: "#f2c85d", shadowOpacity: 0.78, shadowRadius: 10 },
  worldArtworkPlane: { position: "absolute", overflow: "hidden" },
  worldMapArt: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%", opacity: 0.5 },
  mapArtVeil: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(226,208,157,0.14)" },
  worldMap: { zIndex: 2, alignSelf: "flex-start" },
  mapRow: { flexDirection: "row" },
  tile: { position: "relative", alignItems: "center", justifyContent: "center", overflow: "visible", borderWidth: 0.35, borderColor: "rgba(81,63,34,0.1)" },
  treeTile: { backgroundColor: "rgba(43,82,43,0.68)" },
  grassTile: { backgroundColor: "rgba(193,190,111,0.5)" },
  pathTile: { backgroundColor: "rgba(226,197,126,0.58)" },
  waterTile: { backgroundColor: "rgba(68,139,151,0.68)" },
  sandTile: { backgroundColor: "rgba(217,181,98,0.6)" },
  mountainTile: { backgroundColor: "rgba(102,108,91,0.68)" },
  landmark: { position: "absolute", width: "78%", height: "80%", borderWidth: 2, borderColor: "#302416", borderRadius: 4, alignItems: "center", justifyContent: "center", zIndex: 4, shadowColor: "#fff2b0", shadowOpacity: 0.82, shadowRadius: 5 },
  landmarkLabel: { position: "absolute", bottom: -8, color: PARCHMENT, backgroundColor: DARK, fontSize: 6, lineHeight: 10, fontWeight: "900", paddingHorizontal: 3, zIndex: 5 },
  playerSprite: { position: "absolute", width: "70%", height: "92%", alignItems: "center", zIndex: 8, shadowColor: "#fff0a8", shadowOpacity: 0.9, shadowRadius: 5 },
  playerStep: { transform: [{ translateY: -2 }] },
  playerHatTop: { width: "54%", height: "23%", backgroundColor: "#a3482d", borderWidth: 2, borderColor: DARK, borderTopLeftRadius: 7, borderTopRightRadius: 7 },
  playerHatBrim: { width: "88%", height: "12%", backgroundColor: "#a3482d", borderWidth: 2, borderColor: DARK },
  playerFace: { width: "44%", height: "23%", backgroundColor: "#dfb775", borderLeftWidth: 2, borderRightWidth: 2, borderColor: DARK, position: "relative" },
  playerEye: { position: "absolute", width: 3, height: 3, right: 3, top: 3, backgroundColor: DARK },
  playerEyeSide: { right: 1 },
  playerCoat: { width: "64%", height: "29%", backgroundColor: "#31505a", borderWidth: 2, borderColor: DARK },
  playerFeet: { width: "58%", height: "12%", flexDirection: "row", justifyContent: "space-between" },
  playerFeetStep: { width: "72%" },
  playerFoot: { width: "38%", height: "100%", backgroundColor: DARK },
  legendRow: { width: "100%", maxWidth: 960, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8, marginTop: 10, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: "rgba(239,220,167,0.82)" },
  legendText: { color: "#48351f", fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  mapControls: { width: "100%", maxWidth: 800, flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 22, marginTop: 15 },
  dPad: { width: 144, height: 144, alignItems: "center", justifyContent: "center" },
  dPadRow: { flexDirection: "row" },
  directionButton: { width: 48, height: 48, backgroundColor: "#2d4937", borderWidth: 2, borderColor: "#1c281d", borderRadius: 4, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 2 },
  directionText: { color: PARCHMENT, fontSize: 16, fontWeight: "900" },
  directionSpacer: { width: 48, height: 48 },
  dPadCenter: { width: 48, height: 48, backgroundColor: "#21382a", borderRadius: 4 },
  mapInstructions: { flex: 1, minWidth: 235, maxWidth: 470, borderWidth: 1.5, borderColor: "#80612e", borderRadius: 4, backgroundColor: "rgba(239,220,168,0.95)", padding: 15, shadowColor: "#000", shadowOpacity: 0.32, shadowRadius: 7 },
  instructionHeadingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  instructionHeading: { flex: 1, color: INK, fontFamily: "Georgia", fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  instructionText: { color: "#57452c", fontSize: 12, lineHeight: 18, marginTop: 7 },
  coordinateText: { color: "#775e35", fontSize: 9, fontWeight: "900", marginTop: 10, letterSpacing: 1.4 },
  fieldPage: { position: "relative", width: "100%", maxWidth: 920, minHeight: 430, borderWidth: 2, borderColor: "#765322", borderRadius: 4, backgroundColor: "rgba(242,222,169,0.97)", paddingHorizontal: 24, paddingVertical: 22, marginTop: 6, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.48, shadowRadius: 13, shadowOffset: { width: 4, height: 7 } },
  fieldSketch: { position: "absolute", right: 12, top: 7 },
  encounterLead: { width: "100%", flexDirection: "row", flexWrap: "wrap", gap: 16, alignItems: "stretch" },
  encounterLeadCopy: { flex: 1, minWidth: 245, justifyContent: "center" },
  encounterIllustration: { width: 310, maxWidth: "100%", minHeight: 152, borderWidth: 1.5, borderRadius: 3, overflow: "hidden", backgroundColor: "rgba(233,210,155,0.72)" },
  encounterIllustrationArt: { width: "100%", height: "100%" },
  encounterMotif: { flex: 1, minHeight: 150, flexDirection: "row", gap: 12, alignItems: "center", justifyContent: "center" },
  dialogueLocation: { alignSelf: "flex-start", minHeight: 30, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1.5, borderColor: INK, flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 10, backgroundColor: "rgba(248,231,184,0.74)" },
  locationSwatch: { width: 12, height: 12, borderWidth: 1, borderColor: INK },
  dialogueLocationText: { color: INK, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  dialogueTitle: { maxWidth: 760, color: INK, fontFamily: "Georgia", fontSize: 28, lineHeight: 34, fontWeight: "900" },
  dialoguePrompt: { maxWidth: 760, color: "#4b3823", fontFamily: "Georgia", fontSize: 15, lineHeight: 22, marginTop: 6 },
  inkDivider: { width: "100%", flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 13 },
  inkLine: { flex: 1, height: 1, backgroundColor: "rgba(48,36,22,0.45)" },
  choiceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  choiceButton: { flexGrow: 1, flexBasis: 350, minWidth: 0, minHeight: 86, borderWidth: 1.5, borderColor: "#765b34", borderRadius: 3, backgroundColor: "rgba(247,229,183,0.78)", padding: 11, flexDirection: "row", alignItems: "flex-start" },
  choiceNumberSeal: { width: 27, height: 27, borderRadius: 14, borderWidth: 1.5, borderColor: INK, marginRight: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#dcc58c" },
  choiceNumber: { color: INK, fontFamily: "Georgia", fontSize: 12, fontWeight: "900" },
  frogChoiceArt: { width: 70, height: 58, marginRight: 10 },
  frogChoiceFallback: { width: 70, height: 58, marginRight: 10, alignItems: "center", justifyContent: "center" },
  choiceMotif: { width: 58, height: 58, marginRight: 10, borderWidth: 1, borderRadius: 29, backgroundColor: "rgba(236,216,168,0.72)", alignItems: "center", justifyContent: "center" },
  choiceCopy: { flex: 1 },
  choiceLabel: { color: INK, fontFamily: "Georgia", fontSize: 14, lineHeight: 18, fontWeight: "900" },
  choiceDescription: { color: "#5b472d", fontSize: 11, lineHeight: 16, marginTop: 4 },
  skipButton: { minHeight: 46, marginTop: 12, borderWidth: 1.5, borderColor: "#765b34", borderRadius: 3, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(247,229,183,0.58)" },
  skipText: { color: INK, fontSize: 9, fontWeight: "900", letterSpacing: 0.9 },
  equalNote: { color: "#655033", fontFamily: "Georgia", fontSize: 10, lineHeight: 15, marginTop: 10, textAlign: "center", fontStyle: "italic" },
  buttonDisabled: { opacity: 0.45 },
  resultCard: { width: "100%", maxWidth: 920, minHeight: 430, borderWidth: 2, borderColor: "#765322", borderRadius: 4, backgroundColor: "rgba(246,226,177,0.98)", paddingHorizontal: 34, paddingVertical: 28, marginTop: 8, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 4, height: 8 } },
  resultLead: { width: "100%", flexDirection: "row", flexWrap: "wrap", gap: 20, alignItems: "stretch" },
  resultLeadCopy: { flex: 1, minWidth: 245, justifyContent: "center" },
  resultEyebrow: { flexDirection: "row", gap: 9, alignItems: "center", marginBottom: 10 },
  resultStamp: { color: "#805a21", fontSize: 11, fontWeight: "900", letterSpacing: 2.4 },
  resultEncounterTitle: { color: "#251d12", fontFamily: "Georgia", fontSize: 31, lineHeight: 37, fontWeight: "900" },
  resultChoice: { fontFamily: "Georgia", fontSize: 16, lineHeight: 22, fontWeight: "900", marginTop: 8, letterSpacing: 0.5 },
  resultIllustration: { width: 350, maxWidth: "100%", minHeight: 190, borderWidth: 1.5, borderRadius: 3, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(226,205,153,0.65)" },
  resultIllustrationArt: { width: "100%", height: "100%" },
  resultMotif: { width: "100%", minHeight: 188, flexDirection: "row", gap: 14, alignItems: "center", justifyContent: "center" },
  resultRule: { width: "100%", flexDirection: "row", gap: 10, alignItems: "center", marginTop: 16 },
  resultRuleLine: { flex: 1, height: 1, backgroundColor: "#8f7a4d" },
  resultText: { color: "#4f3d27", fontFamily: "Georgia", fontSize: 17, lineHeight: 26, marginVertical: 19 },
  resultContinue: { width: "100%", minHeight: 58, borderWidth: 1.5, borderColor: "#bba163", borderRadius: 3, backgroundColor: "#234b36", flexDirection: "row", gap: 12, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.28, shadowRadius: 5, shadowOffset: { width: 2, height: 4 } },
  resultContinueText: { color: "#f6e7b3", fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  resultClosing: { color: "#382b1d", fontFamily: "Georgia", fontSize: 14, lineHeight: 21, fontStyle: "italic", textAlign: "center", marginTop: 20 },
  storageError: { width: "100%", maxWidth: 920, color: "#fff1c3", backgroundColor: "#743c2e", borderWidth: 2, borderColor: "#a66043", padding: 11, marginTop: 13, fontSize: 11, lineHeight: 17, textAlign: "center" },
  syncNote: { color: "#4f452f", backgroundColor: "rgba(239,220,167,0.76)", fontSize: 9, marginTop: 14, paddingHorizontal: 9, paddingVertical: 5, textAlign: "center" },
  journal: { width: "100%", maxWidth: 720, borderWidth: 2, borderColor: "#765322", borderRadius: 4, backgroundColor: "rgba(242,222,169,0.98)", padding: 18, marginVertical: 8, shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 10 },
  journalHeadingRow: { minHeight: 36, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 2, borderColor: "#8a7147", paddingBottom: 7 },
  journalHeading: { color: INK, fontFamily: "Georgia", fontSize: 14, fontWeight: "900", letterSpacing: 2 },
  journalRow: { flexDirection: "row", alignItems: "center", paddingVertical: 9, borderBottomWidth: 1, borderColor: "#b7a172" },
  journalMark: { width: 18, height: 18, borderWidth: 2, borderColor: DARK, marginRight: 10, transform: [{ rotate: "-5deg" }] },
  journalCopy: { flex: 1 },
  journalPlace: { color: DARK, fontFamily: "Georgia", fontSize: 13, fontWeight: "900" },
  journalRegion: { color: "#765b31", fontSize: 8, fontWeight: "900", letterSpacing: 1.1, marginTop: 2 },
  journalDecision: { color: "#584830", fontSize: 10, marginTop: 2 },
  emptyJournal: { color: "#584830", fontFamily: "Georgia", fontSize: 12, paddingVertical: 16 },
  undoButton: { minHeight: 44, borderWidth: 1.5, borderColor: DARK, borderRadius: 3, marginTop: 13, alignItems: "center", justifyContent: "center" },
  undoText: { color: DARK, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  completeScroll: { flexGrow: 1, zIndex: 2, padding: 18, paddingBottom: 44 },
  completeScreen: { width: "100%", maxWidth: 760, minHeight: 650, alignSelf: "center", alignItems: "center", justifyContent: "center" },
  completeCompass: { width: 74, height: 74, borderRadius: 37, borderWidth: 1.5, borderColor: "#7d5c2d", backgroundColor: "rgba(34,52,38,0.94)", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  completeKicker: { color: "#6b522c", fontSize: 10, fontWeight: "900", letterSpacing: 2, textAlign: "center" },
  completeTitle: { color: INK, fontFamily: "Georgia", fontSize: 32, lineHeight: 39, fontWeight: "900", textAlign: "center", maxWidth: 590, marginTop: 10 },
  completeCopy: { color: "#58452d", fontFamily: "Georgia", fontSize: 15, lineHeight: 23, textAlign: "center", maxWidth: 560, marginTop: 12, marginBottom: 18 },
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 30, backgroundColor: "rgba(18,16,10,0.76)", alignItems: "center", justifyContent: "center", padding: 18 },
  notePanel: { width: "100%", maxWidth: 520, borderWidth: 2, borderColor: "#765322", borderRadius: 5, backgroundColor: PARCHMENT, padding: 22, alignItems: "center", shadowColor: "#000", shadowOpacity: 0.58, shadowRadius: 18 },
  noteTitle: { color: INK, fontFamily: "Georgia", fontSize: 16, fontWeight: "900", letterSpacing: 1.4, marginTop: 8 },
  noteText: { color: "#4f3d27", fontSize: 13, lineHeight: 21, marginVertical: 14 },
  smallButton: { minHeight: 44, minWidth: 120, paddingHorizontal: 15, borderWidth: 1.5, borderColor: "#2e4936", borderRadius: 3, backgroundColor: DARK, alignItems: "center", justifyContent: "center" },
  smallButtonText: { color: PARCHMENT, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
});
