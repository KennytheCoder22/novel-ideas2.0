import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import {
  CASCADE_LEVELS,
  CASCADE_REALMS,
  INGREDIENTS,
  activeLevelPhase,
  applyCatalyst,
  applySwap,
  assertCascadeExpectedState,
  assertCascadeLevelOpenCurrent,
  boardChecksum,
  captureCascadeExpectedState,
  catalystOptions,
  createActiveLevel,
  createCascadeEvent,
  createCascadeScope,
  createInitialCascadeSave,
  decodeBoard,
  encodeBoard,
  levelStars,
  levelWon,
  mechanicalEquivalence,
  monotonicCascadeTimestamp,
  type Board,
  type CascadeEvidenceEvent,
  type CascadeEventType,
  type CascadeSaveV1,
  type CatalystOption,
  type Coordinate,
  type EvidenceClass,
  type LevelConfig,
  type TimingBucket,
} from "../../lib/recommendationGames/alchemistsCascade";
import {
  flushCascadeEvents,
  initializeCascadeSave,
  loadCascadeSave,
  sendCascadeEventRequest,
  transactCascade,
} from "../../lib/recommendationGames/alchemistsCascadeEvidenceClient";
import type { AsyncKeyValueStorage } from "../../lib/recommendationGames/evidenceClient";
import { GameRecommendationReward } from "../../components/GameRecommendationReward";
import { useGameRecommendationMilestone } from "../../hooks/useGameRecommendationMilestone";
import { adaptAlchemistsCascadeCatalystToSignal, ALCHEMISTS_CASCADE_EVIDENCE_MODE } from "../../lib/recommendationGames/gameRecommendationEvidenceAdapters";
import { alchemistsCascadeMilestone } from "../../lib/recommendationGames/gameRecommendationMilestones";
import { buildGameRouteSourceParams, parseGameRouteConfig, type GameRouteParams } from "../../lib/recommendationGames/gameRecommendationRouteConfig";
import {
  ALCHEMISTS_CASCADE_TITLE_ARTWORK,
  computeAlchemistsCascadeTitleArtworkLayout,
} from "../../lib/recommendationGames/alchemistsCascadeTitleArtwork";
import {
  ALCHEMISTS_CASCADE_ATLAS_ARTWORK,
  computeAlchemistsCascadeAtlasLayout,
} from "../../lib/recommendationGames/alchemistsCascadeAtlasArtwork";

type Phase = "loading" | "title" | "campaign" | "catalyst" | "play" | "pause" | "help" | "result";
const STALE_SESSION_NOTICE = "This game changed in another tab. The latest save was reloaded; your action was not applied.";

function isStaleCascadeError(error: unknown): boolean {
  return error instanceof Error && error.message === "stale_cascade_session";
}

const webStorage: AsyncKeyValueStorage = {
  async getItem(key) {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  },
  async setItem(key, value) {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  },
};
const storage: AsyncKeyValueStorage = Platform.OS === "web" ? webStorage : AsyncStorage;
const nativeApiOrigin = String(process.env.EXPO_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");

function id(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function timingBucket(started: number): TimingBucket {
  const elapsed = Date.now() - started;
  if (elapsed < 1_500) return "instant";
  if (elapsed < 5_000) return "quick";
  if (elapsed < 20_000) return "considered";
  if (elapsed < 120_000) return "long";
  return "returned";
}

function realmFor(level: LevelConfig) {
  return CASCADE_REALMS.find((realm) => realm.id === level.realmId) || CASCADE_REALMS[0];
}

function phaseForDurableSave(value: CascadeSaveV1): Phase {
  if (!value.activeLevel) return value.playSessionCount > 0 ? "campaign" : "title";
  const config = CASCADE_LEVELS.find((level) => level.id === value.activeLevel?.levelId);
  if (!config) return "title";
  const activePhase = activeLevelPhase(value.activeLevel, config);
  return activePhase === "won" || activePhase === "lost" ? "result" : activePhase;
}

function goalSnapshot(level: LevelConfig, collected: number[]) {
  return level.goals.map((goal) => ({
    ingredientId: INGREDIENTS[goal.kind].id,
    target: goal.target,
    collected: collected[goal.kind] || 0,
  }));
}

function makeEvent(args: {
  save: CascadeSaveV1;
  eventType: CascadeEventType;
  payload: Record<string, unknown>;
  at: string;
  timing?: TimingBucket;
  evidenceClass?: EvidenceClass;
  preference?: CascadeEvidenceEvent["preferenceInference"];
}) {
  return createCascadeEvent({
    eventType: args.eventType,
    evidenceClass: args.evidenceClass || "gameplay_telemetry",
    gameSessionId: args.save.gameSessionId,
    anonymousPlayerId: args.save.anonymousPlayerId,
    libraryScopeId: args.save.libraryScopeId,
    occurredAt: args.at,
    timingBucket: args.timing || "instant",
    preferenceInference: args.preference || "none_from_gameplay",
    payload: args.payload,
  });
}

function IngredientCell({
  board, at, size, selected, onPress,
}: {
  board: Board; at: Coordinate; size: number; selected: boolean; onPress: () => void;
}) {
  const cell = board[at.row][at.column];
  const ingredient = INGREDIENTS[cell.kind];
  const specialLabel = cell.special === "none" ? "" : `, ${cell.special} catalyst`;
  return (
    <TouchableOpacity
      style={[
        styles.cell,
        { width: size, height: size, backgroundColor: ingredient.color },
        selected && styles.cellSelected,
        cell.special !== "none" && styles.cellSpecial,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Row ${at.row + 1}, column ${at.column + 1}, ${ingredient.name}${specialLabel}`}
      accessibilityHint={selected ? "Selected. Choose an adjacent ingredient to swap." : "Select, then choose an adjacent ingredient."}
    >
      <Text style={[styles.cellSymbol, { color: ingredient.ink, fontSize: Math.max(20, size * 0.42) }]}>
        {ingredient.symbol}
      </Text>
      {cell.special !== "none" ? (
        <View style={cell.special === "row" ? styles.specialRow : cell.special === "column" ? styles.specialColumn : styles.specialBurst} />
      ) : null}
    </TouchableOpacity>
  );
}

function BoardView({
  board, width, selected, onCell,
}: {
  board: Board; width: number; selected: Coordinate | null; onCell: (at: Coordinate) => void;
}) {
  const gap = width < 390 ? 3 : 5;
  const cellSize = Math.floor((width - gap * 6) / 7);
  return (
    <View
      style={[styles.board, { width: cellSize * 7 + gap * 6, gap }]}
      accessibilityLabel="Alchemy cascade board, seven rows by seven columns"
    >
      {board.map((row, rowIndex) => (
        <View key={`row-${rowIndex}`} style={[styles.boardRow, { gap }]}>
          {row.map((_, columnIndex) => {
            const at = { row: rowIndex, column: columnIndex };
            return (
              <IngredientCell
                key={`${rowIndex}-${columnIndex}`}
                board={board}
                at={at}
                size={cellSize}
                selected={selected?.row === rowIndex && selected.column === columnIndex}
                onPress={() => onCell(at)}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

function HelpPanel({ onClose }: { onClose: () => void }) {
  return (
    <ScrollView contentContainerStyle={styles.overlayScroll}>
      <View style={styles.sheet}>
        <Text style={styles.sheetTitle}>The apprentice&apos;s field notes</Text>
        <Text style={styles.lead}>Swap neighboring ingredients. A line of three brews; four leaves a line-clearing rune; five leaves a bursting star.</Text>
        <View style={styles.helpStep}><Text style={styles.helpNumber}>1</Text><Text style={styles.helpText}>Tap one ingredient, then an adjacent one. Swaps without a match spring back and cost no move.</Text></View>
        <View style={styles.helpStep}><Text style={styles.helpNumber}>2</Text><Text style={styles.helpText}>Meet every ingredient goal and the score target before the move flask empties.</Text></View>
        <View style={styles.helpStep}><Text style={styles.helpNumber}>3</Text><Text style={styles.helpText}>Falling matches chain into cascades. Longer chains score more.</Text></View>
        <Text style={styles.keyboardHint}>Keyboard: select a tile, then use Arrow keys or WASD to swap.</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={onClose} accessibilityRole="button">
          <Text style={styles.primaryButtonText}>BACK TO THE CAULDRON</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function PrivacyPanel({ onClose }: { onClose: () => void }) {
  return (
    <View style={styles.sheet}>
      <Text style={styles.sheetTitle}>What the cauldron remembers</Text>
      <Text style={styles.lead}>
        This device saves anonymous gameplay events, board choices, catalyst choices or skips, and only a broad response-time category.
        Names, email addresses, student IDs, exact timing, and IP addresses are not included in evidence. Ordinary swaps, speed,
        failed levels, forced moves, and scoring choices never count as taste. Notes may wait here until syncing returns.
      </Text>
      <TouchableOpacity style={styles.secondaryButton} onPress={onClose} accessibilityRole="button">
        <Text style={styles.secondaryButtonText}>CLOSE THE LEDGER</Text>
      </TouchableOpacity>
    </View>
  );
}

type CascadeTitleScreenProps = {
  busy: boolean;
  hasProgress: boolean;
  ready: boolean;
  syncWarning: string | null;
  onBegin: () => void;
  onHelp: () => void;
  onMemory: () => void;
  onReset: () => void;
};

function AbstractCascadeTitleScreen({
  busy,
  hasProgress,
  ready,
  syncWarning,
  onBegin,
  onHelp,
  onMemory,
  onReset,
}: CascadeTitleScreenProps) {
  return (
    <ScrollView contentContainerStyle={styles.titleScreen}>
      <View style={styles.titleSigil}>
        <View style={styles.sigilRing}><Text style={styles.sigilMark}>✦</Text></View>
        <View style={styles.sigilLine} />
      </View>
      <Text style={styles.title}>THE ALCHEMIST&apos;S{"\n"}CASCADE</Text>
      <Text style={styles.titleCopy}>A kinetic campaign of strange ingredients, chain reactions, and twelve recipes that should not exist.</Text>
      <TouchableOpacity
        style={[styles.primaryButton, busy && styles.disabled]}
        disabled={busy || !ready}
        onPress={onBegin}
        accessibilityRole="button"
        accessibilityLabel={hasProgress ? "Continue the experiment" : "Light the first flame"}
      >
        <Text style={styles.primaryButtonText}>{busy ? "OPENING THE VIAL..." : hasProgress ? "CONTINUE THE EXPERIMENT" : "LIGHT THE FIRST FLAME"}</Text>
      </TouchableOpacity>
      <View style={styles.titleActions}>
        <TouchableOpacity style={styles.textButton} onPress={onHelp} accessibilityRole="button">
          <Text style={styles.textButtonText}>How to brew</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.textButton} onPress={onMemory} accessibilityRole="button">
          <Text style={styles.textButtonText}>What the cauldron remembers</Text>
        </TouchableOpacity>
        {hasProgress ? (
          <TouchableOpacity style={styles.textButton} onPress={onReset} accessibilityRole="button">
            <Text style={styles.dangerText}>Reset campaign</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {syncWarning ? <Text style={styles.warning} accessibilityRole="alert">{syncWarning}</Text> : null}
    </ScrollView>
  );
}

function CascadeTitleScreen(props: CascadeTitleScreenProps) {
  const { width, height } = useWindowDimensions();
  const [artworkFailed, setArtworkFailed] = useState(false);
  const [focusedControl, setFocusedControl] = useState("");
  const [hoveredControl, setHoveredControl] = useState("");
  const layout = computeAlchemistsCascadeTitleArtworkLayout(width, height);
  const primaryLabel = props.hasProgress ? "Continue the experiment" : "Light the first flame";
  const primaryVisibleLabel = props.busy
    ? "OPENING THE VIAL..."
    : props.hasProgress
      ? "CONTINUE"
      : "LIGHT THE FIRST FLAME";
  const showVisiblePrimary = props.hasProgress || props.busy;

  if (artworkFailed) return <AbstractCascadeTitleScreen {...props} />;

  const artwork = (
    <View
      style={[
        styles.cascadeTitleArtworkStage,
        { width: layout.stage.width, height: layout.stage.height },
      ]}
    >
      <Image
        source={ALCHEMISTS_CASCADE_TITLE_ARTWORK}
        style={[styles.cascadeTitleArtworkImage, { height: layout.imageHeight }]}
        resizeMode="contain"
        accessible
        accessibilityRole="image"
        accessibilityLabel="A moonlit alchemy laboratory filled with books, bottles, and a glowing workbench"
        accessibilityIgnoresInvertColors
        onError={() => setArtworkFailed(true)}
      />
      {layout.mode !== "mobile" ? (
        <>
          <Pressable
            testID="alchemists-cascade-title-primary"
            accessibilityRole="button"
            accessibilityLabel={primaryLabel}
            accessibilityHint="Open the recipe atlas and continue the campaign"
            accessibilityState={{ disabled: props.busy || !props.ready }}
            disabled={props.busy || !props.ready}
            onPress={props.onBegin}
            onFocus={() => setFocusedControl("primary")}
            onBlur={() => setFocusedControl("")}
            onHoverIn={() => setHoveredControl("primary")}
            onHoverOut={() => setHoveredControl("")}
            style={({ pressed }: { pressed: boolean }) => [
              styles.cascadeTitleArtworkControl,
              layout.controls.primary,
              showVisiblePrimary && styles.cascadeTitleArtworkPrimaryVisible,
              (focusedControl === "primary" || hoveredControl === "primary")
                && (showVisiblePrimary
                  ? styles.cascadeTitleArtworkPrimaryVisibleActive
                  : styles.cascadeTitleArtworkControlActive),
              pressed && (
                showVisiblePrimary
                  ? styles.cascadeTitleArtworkPrimaryVisiblePressed
                  : styles.cascadeTitleArtworkControlPressed
              ),
              (props.busy || !props.ready) && styles.disabled,
            ]}
          >
            <Text
              style={[styles.cascadeTitleArtworkPrimaryText, !showVisiblePrimary && styles.visuallyHidden]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.65}
            >
              {primaryVisibleLabel}
            </Text>
          </Pressable>
          <Pressable
            testID="alchemists-cascade-title-help"
            accessibilityRole="button"
            accessibilityLabel="How to brew"
            accessibilityHint="Open the apprentice's field notes"
            onPress={props.onHelp}
            onFocus={() => setFocusedControl("help")}
            onBlur={() => setFocusedControl("")}
            onHoverIn={() => setHoveredControl("help")}
            onHoverOut={() => setHoveredControl("")}
            style={({ pressed }: { pressed: boolean }) => [
              styles.cascadeTitleArtworkControl,
              styles.cascadeTitleArtworkLink,
              layout.controls.help,
              (focusedControl === "help" || hoveredControl === "help") && styles.cascadeTitleArtworkControlActive,
              pressed && styles.cascadeTitleArtworkControlPressed,
            ]}
          >
            <Text style={styles.visuallyHidden}>How to brew</Text>
          </Pressable>
          <Pressable
            testID="alchemists-cascade-title-memory"
            accessibilityRole="button"
            accessibilityLabel="What the cauldron remembers"
            accessibilityHint="Open the anonymous gameplay data notice"
            onPress={props.onMemory}
            onFocus={() => setFocusedControl("memory")}
            onBlur={() => setFocusedControl("")}
            onHoverIn={() => setHoveredControl("memory")}
            onHoverOut={() => setHoveredControl("")}
            style={({ pressed }: { pressed: boolean }) => [
              styles.cascadeTitleArtworkControl,
              styles.cascadeTitleArtworkLink,
              layout.controls.memory,
              (focusedControl === "memory" || hoveredControl === "memory") && styles.cascadeTitleArtworkControlActive,
              pressed && styles.cascadeTitleArtworkControlPressed,
            ]}
          >
            <Text style={styles.visuallyHidden}>What the cauldron remembers</Text>
          </Pressable>
          {props.hasProgress ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reset campaign"
              onPress={props.onReset}
              style={({ pressed }: { pressed: boolean }) => [
                styles.cascadeTitleArtworkReset,
                pressed && styles.cascadeTitleArtworkControlPressed,
              ]}
            >
              <Text style={styles.cascadeTitleArtworkResetText}>Reset campaign</Text>
            </Pressable>
          ) : null}
          {props.syncWarning ? (
            <Text style={styles.cascadeTitleArtworkWarning} accessibilityRole="alert">{props.syncWarning}</Text>
          ) : null}
        </>
      ) : null}
    </View>
  );

  if (layout.mode === "mobile") {
    return (
      <ScrollView
        style={styles.cascadeTitleArtworkMobileScroll}
        contentContainerStyle={styles.cascadeTitleArtworkMobileContent}
        showsVerticalScrollIndicator={false}
      >
        {artwork}
        <View style={styles.cascadeTitleArtworkMobileCopy}>
          <Text accessibilityRole="header" style={styles.cascadeTitleArtworkMobileTitle}>The Alchemist&apos;s Cascade</Text>
          <Text style={styles.cascadeTitleArtworkMobileDescription}>
            A kinetic campaign of strange ingredients, chain reactions, and twelve recipes that should not exist.
          </Text>
          <Pressable
            testID="alchemists-cascade-title-primary-mobile"
            accessibilityRole="button"
            accessibilityLabel={primaryLabel}
            accessibilityHint="Open the recipe atlas and continue the campaign"
            accessibilityState={{ disabled: props.busy || !props.ready }}
            disabled={props.busy || !props.ready}
            onPress={props.onBegin}
            style={({ pressed }: { pressed: boolean }) => [
              styles.cascadeTitleMobilePrimary,
              pressed && styles.cascadeTitleMobileControlPressed,
              (props.busy || !props.ready) && styles.disabled,
            ]}
          >
            <Text
              style={styles.cascadeTitleMobilePrimaryText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {props.busy ? "OPENING THE VIAL..." : primaryLabel.toUpperCase()}
            </Text>
          </Pressable>
          <View style={styles.cascadeTitleMobileActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="How to brew"
              accessibilityHint="Open the apprentice's field notes"
              onPress={props.onHelp}
              style={({ pressed }: { pressed: boolean }) => [
                styles.cascadeTitleMobileSecondary,
                pressed && styles.cascadeTitleMobileControlPressed,
              ]}
            >
              <Text style={styles.cascadeTitleMobileSecondaryText}>How to brew</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="What the cauldron remembers"
              accessibilityHint="Open the anonymous gameplay data notice"
              onPress={props.onMemory}
              style={({ pressed }: { pressed: boolean }) => [
                styles.cascadeTitleMobileSecondary,
                pressed && styles.cascadeTitleMobileControlPressed,
              ]}
            >
              <Text style={styles.cascadeTitleMobileSecondaryText}>What the cauldron remembers</Text>
            </Pressable>
          </View>
          {props.hasProgress ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Reset campaign" onPress={props.onReset} style={styles.cascadeTitleMobileReset}>
              <Text style={styles.dangerText}>Reset campaign</Text>
            </Pressable>
          ) : null}
          {props.syncWarning ? <Text style={styles.warning} accessibilityRole="alert">{props.syncWarning}</Text> : null}
        </View>
      </ScrollView>
    );
  }

  if (layout.mode === "compact") {
    return (
      <ScrollView
        style={styles.cascadeTitleArtworkCompactScroll}
        contentContainerStyle={styles.cascadeTitleArtworkCompactContent}
        showsVerticalScrollIndicator={false}
      >
        {artwork}
        <View style={styles.visuallyHidden} pointerEvents="none">
          <Text accessibilityRole="header">The Alchemist&apos;s Cascade</Text>
          <Text>A kinetic campaign of strange ingredients, chain reactions, and twelve recipes that should not exist.</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.cascadeTitleArtworkDesktop}>
      {artwork}
      <View style={styles.visuallyHidden} pointerEvents="none">
        <Text accessibilityRole="header">The Alchemist&apos;s Cascade</Text>
        <Text>A kinetic campaign of strange ingredients, chain reactions, and twelve recipes that should not exist.</Text>
      </View>
    </View>
  );
}

type CascadeAtlasScreenProps = {
    save: CascadeSaveV1;
    busy: boolean;
    syncWarning: string | null;
    onExit: () => void;
    onOpenLevel: (level: LevelConfig) => void;
    onOpenNotes: () => void;
};

const ATLAS_REALM_SURFACES: Record<string, string> = {
    "copper-garden": "#3A2415",
    "tidal-archive": "#12363B",
    "laughing-volcano": "#431E18",
    "astral-kitchen": "#292342",
};

function AtlasLevelButton({
    level,
    unlocked,
    stars,
    busy,
    compact,
    onPress,
  }: {
    level: LevelConfig;
    unlocked: boolean;
    stars: number;
    busy: boolean;
    compact: boolean;
    onPress: () => void;
  }) {
    const [focused, setFocused] = useState(false);
    const [hovered, setHovered] = useState(false);
    const disabled = !unlocked || busy;
    const stateLabel = unlocked
      ? stars > 0
        ? `${stars} of 3 stars, available to replay`
        : "available, not yet completed"
      : "locked";

    return (
      <Pressable
        testID={`alchemists-cascade-atlas-${level.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${level.name}, recipe ${level.number}, ${stateLabel}`}
        accessibilityHint={unlocked ? "Open this recipe" : undefined}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={({ pressed }: { pressed: boolean }) => [
          styles.atlasLevel,
          compact && styles.atlasLevelCompact,
          !unlocked && styles.atlasLevelLocked,
          (focused || hovered) && unlocked && styles.atlasLevelActive,
          pressed && styles.atlasLevelPressed,
        ]}
      >
        <Text style={[styles.atlasLevelNumber, compact && styles.atlasLevelNumberCompact]}>
          {unlocked ? level.number : "◆"}
        </Text>
        <Text
          style={[styles.atlasLevelName, compact && styles.atlasLevelNameCompact]}
          numberOfLines={compact ? 2 : 3}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {level.name}
        </Text>
        <Text style={[styles.atlasLevelStatus, !unlocked && styles.atlasLevelStatusLocked]}>
          {unlocked ? `${"★".repeat(stars)}${"☆".repeat(3 - stars)}` : "LOCKED"}
        </Text>
      </Pressable>
    );
  }

function AtlasRealmPanel({
    realm,
    save,
    busy,
    compact,
    onOpenLevel,
  }: {
    realm: (typeof CASCADE_REALMS)[number];
    save: CascadeSaveV1;
    busy: boolean;
    compact: boolean;
    onOpenLevel: (level: LevelConfig) => void;
  }) {
    const levels = CASCADE_LEVELS.filter((level) => level.realmId === realm.id);
    return (
      <View
        style={[
          styles.atlasRealm,
          compact && styles.atlasRealmCompact,
          { backgroundColor: ATLAS_REALM_SURFACES[realm.id], borderColor: realm.accent },
        ]}
        accessibilityRole="summary"
      >
        <Text style={[styles.atlasRealmTitle, compact && styles.atlasRealmTitleCompact, { color: realm.accent }]}>
          {realm.name}
        </Text>
        <Text
          style={[styles.atlasRealmFiction, compact && styles.atlasRealmFictionCompact]}
          numberOfLines={compact ? 1 : undefined}
        >
          {realm.fiction}
        </Text>
        <View style={[styles.atlasLevelRow, compact && styles.atlasLevelRowCompact]}>
          {levels.map((level) => (
            <AtlasLevelButton
              key={level.id}
              level={level}
              unlocked={level.number <= save.unlockedLevel}
              stars={save.levelStars[level.id] || 0}
              busy={busy}
              compact={compact}
              onPress={() => onOpenLevel(level)}
            />
          ))}
        </View>
      </View>
    );
  }

function AbstractCascadeAtlasScreen({
    save,
    busy,
    syncWarning,
    onExit,
    onOpenLevel,
    onOpenNotes,
  }: CascadeAtlasScreenProps) {
    return (
      <>
        <View style={styles.gameHeader}>
          <TouchableOpacity style={styles.headerButton} onPress={onExit} disabled={busy} accessibilityRole="button">
            <Text style={styles.headerButtonText}>EXIT</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>THE RECIPE ATLAS</Text>
          <Text style={styles.starTotal}>★ {Object.values(save.levelStars).reduce((sum, value) => sum + value, 0)}</Text>
        </View>
        <ScrollView contentContainerStyle={styles.campaign}>
          {CASCADE_REALMS.map((realm) => (
            <View key={realm.id} style={[styles.realmSection, { backgroundColor: realm.surface, borderColor: realm.accent }]}>
              <Text style={[styles.realmTitle, { color: realm.accent }]}>{realm.name}</Text>
              <Text style={styles.realmFiction}>{realm.fiction}</Text>
              <View style={styles.levelRow}>
                {CASCADE_LEVELS.filter((level) => level.realmId === realm.id).map((level) => {
                  const unlocked = level.number <= save.unlockedLevel;
                  const stars = save.levelStars[level.id] || 0;
                  return (
                    <TouchableOpacity
                      key={level.id}
                      style={[styles.levelTile, !unlocked && styles.levelLocked]}
                      disabled={!unlocked || busy}
                      onPress={() => onOpenLevel(level)}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: !unlocked || busy }}
                      accessibilityLabel={`${level.name}, level ${level.number}, ${unlocked ? `${stars} stars` : "locked"}`}
                    >
                      <Text style={styles.levelNumber}>{unlocked ? level.number : "◆"}</Text>
                      <Text style={styles.levelName}>{level.name}</Text>
                      <Text style={styles.levelStars}>{"★".repeat(stars)}{"☆".repeat(3 - stars)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
          <TouchableOpacity style={styles.textButton} onPress={onOpenNotes} accessibilityRole="button">
            <Text style={styles.textButtonText}>Open field notes</Text>
          </TouchableOpacity>
          {syncWarning ? <Text style={styles.warning} accessibilityRole="alert">{syncWarning}</Text> : null}
        </ScrollView>
      </>
    );
  }

function CascadeAtlasScreen(props: CascadeAtlasScreenProps) {
    const { width, height } = useWindowDimensions();
    const [artworkFailed, setArtworkFailed] = useState(false);
    const layout = computeAlchemistsCascadeAtlasLayout(width, height);
    const totalStars = Object.values(props.save.levelStars).reduce((sum, value) => sum + value, 0);

    if (artworkFailed) return <AbstractCascadeAtlasScreen {...props} />;

    if (layout.mode === "stacked") {
      return (
        <ScrollView
          style={styles.atlasStackedScroll}
          contentContainerStyle={styles.atlasStackedContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.atlasHeaderCrop, { width: layout.header.width, height: layout.header.height }]}>
            <Image
              source={ALCHEMISTS_CASCADE_ATLAS_ARTWORK}
              style={{
                position: "absolute",
                left: layout.header.imageLeft,
                top: 0,
                width: Math.max(layout.header.width, 760),
                height: layout.header.imageHeight,
              }}
              resizeMode="contain"
              accessible={false}
              accessibilityElementsHidden
              accessibilityIgnoresInvertColors
              onError={() => setArtworkFailed(true)}
            />
          </View>
          <View style={styles.atlasStackedToolbar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Exit Recipe Atlas"
              accessibilityHint="Save and return to Games"
              accessibilityState={{ disabled: props.busy }}
              disabled={props.busy}
              onPress={props.onExit}
              style={({ pressed }: { pressed: boolean }) => [
                styles.atlasToolbarButton,
                pressed && styles.atlasControlPressed,
                props.busy && styles.disabled,
              ]}
            >
              <Text style={styles.atlasToolbarButtonText}>EXIT</Text>
            </Pressable>
            <Text accessibilityRole="header" style={styles.atlasStackedTitle}>THE RECIPE ATLAS</Text>
            <View style={styles.atlasStarTotal} accessible accessibilityLabel={`${totalStars} total stars`}>
              <Text style={styles.atlasStarTotalText}>★ {totalStars}</Text>
            </View>
          </View>
          <View style={styles.atlasStackedRealms}>
            {CASCADE_REALMS.map((realm) => (
              <AtlasRealmPanel
                key={realm.id}
                realm={realm}
                save={props.save}
                busy={props.busy}
                compact={false}
                onOpenLevel={props.onOpenLevel}
              />
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open field notes"
            accessibilityHint="Open the apprentice's brewing instructions"
            onPress={props.onOpenNotes}
            style={({ pressed }: { pressed: boolean }) => [
              styles.atlasNotesButtonStacked,
              pressed && styles.atlasControlPressed,
            ]}
          >
            <Text style={styles.atlasNotesText}>▣  Open field notes</Text>
          </Pressable>
          {props.syncWarning ? (
            <Text style={styles.atlasSyncBannerStacked} accessibilityRole="alert">{props.syncWarning}</Text>
          ) : null}
        </ScrollView>
      );
    }

    return (
      <View style={styles.atlasCinematic}>
        <View style={[styles.atlasCinematicStage, layout.stage]}>
          <Image
            source={ALCHEMISTS_CASCADE_ATLAS_ARTWORK}
            style={styles.atlasCinematicImage}
            resizeMode="contain"
            accessible={false}
            accessibilityElementsHidden
            accessibilityIgnoresInvertColors
            onError={() => setArtworkFailed(true)}
          />
          <View style={styles.visuallyHidden} pointerEvents="none">
            <Text accessibilityRole="header">The Recipe Atlas</Text>
            <Text>Four paths. Twelve recipes. Infinite possibilities.</Text>
          </View>
          <Pressable
            testID="alchemists-cascade-atlas-exit"
            accessibilityRole="button"
            accessibilityLabel="Exit Recipe Atlas"
            accessibilityHint="Save and return to Games"
            accessibilityState={{ disabled: props.busy }}
            disabled={props.busy}
            onPress={props.onExit}
            style={({ pressed }: { pressed: boolean }) => [
              styles.atlasCinematicExit,
              layout.exit,
              pressed && styles.atlasControlPressed,
              props.busy && styles.disabled,
            ]}
          >
            <Text style={styles.atlasCinematicExitText}>EXIT</Text>
          </Pressable>
          <View
            testID="alchemists-cascade-atlas-stars"
            style={[styles.atlasCinematicStars, layout.stars]}
            accessible
            accessibilityLabel={`${totalStars} total stars`}
          >
            <Text style={styles.atlasCinematicStarsText}>★ {totalStars}</Text>
          </View>
          {CASCADE_REALMS.map((realm) => (
            <View key={realm.id} style={[styles.atlasCinematicRealmPosition, layout.realms[realm.id as keyof typeof layout.realms]]}>
              <AtlasRealmPanel
                realm={realm}
                save={props.save}
                busy={props.busy}
                compact
                onOpenLevel={props.onOpenLevel}
              />
            </View>
          ))}
          <Pressable
            testID="alchemists-cascade-atlas-notes"
            accessibilityRole="button"
            accessibilityLabel="Open field notes"
            accessibilityHint="Open the apprentice's brewing instructions"
            onPress={props.onOpenNotes}
            style={({ pressed }: { pressed: boolean }) => [
              styles.atlasCinematicNotes,
              layout.notes,
              pressed && styles.atlasControlPressed,
            ]}
          >
            <Text style={styles.atlasNotesText}>▣  Open field notes</Text>
          </Pressable>
          <View
            testID="alchemists-cascade-atlas-sync"
            style={[
              styles.atlasCinematicSyncMask,
              layout.sync,
              !props.syncWarning && styles.atlasCinematicSyncMaskEmpty,
            ]}
          >
            {props.syncWarning ? (
              <Text style={styles.atlasCinematicSyncText} accessibilityRole="alert" numberOfLines={2}>
                {props.syncWarning}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

export default function AlchemistsCascadeRoute() {
  const params = useLocalSearchParams<{ playerId?: string; libraryId?: string; ageBand?: string }>();
  const routeConfig = useMemo(() => parseGameRouteConfig(params as GameRouteParams), [params]);
  const scope = useMemo(() => createCascadeScope(params.playerId, params.libraryId), [params.playerId, params.libraryId]);
  const sessionId = useRef(id("cascade-session"));
  const lastTimestamp = useRef<string | null>(null);
  const actionLock = useRef(false);
  const flushSequence = useRef(0);
  const [save, setSave] = useState<CascadeSaveV1 | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [selected, setSelected] = useState<Coordinate | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("The cauldron is listening.");
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [choiceStarted, setChoiceStarted] = useState(Date.now());
  const [privacy, setPrivacy] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const helpReturn = useRef<Phase>("title");
  const comboPulse = useRef(new Animated.Value(1)).current;
  const { width } = useWindowDimensions();
  const gameRecommendationMilestone = useGameRecommendationMilestone({
    game: "alchemists_cascade",
    gameLabel: "The Alchemist's Cascade",
    playerId: routeConfig.playerId,
    gameSessionId: save?.gameSessionId || "",
    libraryId: routeConfig.libraryId,
    ageBand: routeConfig.ageBand,
    sourceFlags: routeConfig.sourceFlags,
    localCollectionOnly: routeConfig.localCollectionOnly,
    evidenceMode: ALCHEMISTS_CASCADE_EVIDENCE_MODE,
  });

  const activeConfig = save?.activeLevel
    ? CASCADE_LEVELS.find((level) => level.id === save.activeLevel?.levelId) || null
    : null;
  const board = save?.activeLevel ? decodeBoard(save.activeLevel.board) : null;
  const activeRealm = activeConfig ? realmFor(activeConfig) : CASCADE_REALMS[0];
  const catalystChoices = useMemo(
    () => board && save && activeConfig
      ? catalystOptions(board, save.anonymousPlayerId, save.catalystOccasion, save.activeLevel!.rngState, activeConfig.goals)
      : [],
    [activeConfig, board, save],
  );

  const now = useCallback(() => {
    const value = monotonicCascadeTimestamp(lastTimestamp.current);
    lastTimestamp.current = value;
    return value;
  }, []);

  const send = useCallback(async (event: CascadeEvidenceEvent) => {
    if (Platform.OS !== "web" && !nativeApiOrigin) return false;
    return sendCascadeEventRequest(
      event,
      `${nativeApiOrigin}/api/alchemists-cascade-event`,
      Platform.OS !== "web" ? { origin: nativeApiOrigin } : {},
    );
  }, []);

  const flush = useCallback(async () => {
    const sequence = ++flushSequence.current;
    try {
      const result = await flushCascadeEvents(storage, scope.scopeKey, send);
      if (sequence !== flushSequence.current) return;
      setSyncWarning(result.remaining ? `${result.remaining} cauldron note${result.remaining === 1 ? "" : "s"} waiting to sync.` : null);
    } catch {
      if (sequence !== flushSequence.current) return;
      setSyncWarning("Your progress is safe here, but cauldron notes could not sync yet.");
    }
  }, [scope.scopeKey, send]);

  const openHelp = useCallback((returnTo: Phase) => {
    helpReturn.current = returnTo;
    setPhase("help");
  }, []);

  const synchronizeDurableUi = useCallback(async (): Promise<CascadeSaveV1 | null> => {
    try {
      const durable = await loadCascadeSave(storage, scope.scopeKey, scope.libraryScopeId);
      if (!durable) {
        setSave(null);
        setSelected(null);
        setPhase("title");
        return null;
      }
      sessionId.current = durable.gameSessionId;
      if (!lastTimestamp.current || Date.parse(durable.updatedAt) > Date.parse(lastTimestamp.current)) {
        lastTimestamp.current = durable.updatedAt;
      }
      setSave(durable);
      setSelected(null);
      setPhase(phaseForDurableSave(durable));
      return durable;
    } catch {
      setSave(null);
      setSelected(null);
      setPhase("title");
      return null;
    }
  }, [scope.libraryScopeId, scope.scopeKey]);

  const mutate = useCallback(async (
    operation: string,
    derive: (current: CascadeSaveV1) => {
      save: CascadeSaveV1;
      event?: CascadeEvidenceEvent;
      events?: CascadeEvidenceEvent[];
    },
  ) => {
    const operationId = `${operation}-${id("op")}`;
    try {
      const next = await transactCascade(storage, scope.scopeKey, scope.libraryScopeId, operationId, derive);
      sessionId.current = next.gameSessionId;
      setSave(next);
      void flush();
      return next;
    } catch (error) {
      const durable = await synchronizeDurableUi();
      if (durable?.lastOperationId === operationId) {
        void flush();
        return durable;
      }
      if (isStaleCascadeError(error)) {
        flushSequence.current += 1;
        setSyncWarning(STALE_SESSION_NOTICE);
      }
      throw error;
    }
  }, [flush, scope.libraryScopeId, scope.scopeKey, synchronizeDurableUi]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const initial = createInitialCascadeSave(scope.anonymousPlayerId, scope.libraryScopeId, now(), sessionId.current);
        const restored = await initializeCascadeSave(storage, scope.scopeKey, initial);
        if (!cancelled) {
          sessionId.current = restored.gameSessionId;
          lastTimestamp.current = restored.updatedAt;
          setSave(restored);
          setPhase("title");
        }
        void flush();
      } catch {
        if (!cancelled) {
          setSyncWarning("This browser could not open its save vial. Check private-storage settings, then reload.");
          setPhase("title");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [flush, now, scope]);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const previous = document.title;
    document.title = "The Alchemist's Cascade";
    return () => { document.title = previous; };
  }, []);

  const saveExit = useCallback(async () => {
    if (!save) {
      router.back();
      return;
    }
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    const expected = captureCascadeExpectedState(save);
    let shouldExit = false;
    try {
      await mutate("exit", (current) => {
        assertCascadeExpectedState(current, expected);
        const at = now();
        const active = current.activeLevel;
        return {
          save: { ...current, updatedAt: at },
          event: makeEvent({
            save: current, eventType: "session_exited", at,
            payload: {
              levelId: active?.levelId || null, board: active?.board || null,
              boardChecksum: active ? boardChecksum(active.board) : null,
              movesRemaining: active?.movesRemaining ?? null, score: active?.score ?? null,
            },
          }),
        };
      });
      await flush();
      shouldExit = true;
    } catch (error) {
      if (!isStaleCascadeError(error)) {
        setSyncWarning("Your last action is saved locally, but its exit note could not be prepared.");
      }
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
    if (shouldExit) {
      router.replace({
        pathname: "/games",
        params: {
          ...(params.playerId ? { playerId: params.playerId } : {}),
          ...(params.libraryId ? { libraryId: params.libraryId } : {}),
          ageBand: routeConfig.ageBand,
          ...buildGameRouteSourceParams(routeConfig.sourceFlags),
        },
      } as never);
    }
  }, [flush, mutate, now, params.libraryId, params.playerId, routeConfig.ageBand, routeConfig.sourceFlags, save]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" && save?.activeLevel) void loadCascadeSave(storage, scope.scopeKey, scope.libraryScopeId);
    });
    return () => subscription.remove();
  }, [save?.activeLevel, scope.libraryScopeId, scope.scopeKey]);

  const begin = useCallback(async () => {
    if (!save || actionLock.current) return;
    const expected = captureCascadeExpectedState(save);
    actionLock.current = true;
    setBusy(true);
    try {
      const next = await mutate("begin", (current) => {
        assertCascadeExpectedState(current, expected);
        const at = now();
        const eventType = current.playSessionCount ? "session_continued" : "session_started";
        const playSessionCount = current.playSessionCount + 1;
        return {
          save: { ...current, playSessionCount, updatedAt: at },
          event: makeEvent({
            save: current, eventType, at,
            payload: { playSessionCount },
          }),
        };
      });
      if (!next.activeLevel) setPhase("campaign");
      else {
        const config = CASCADE_LEVELS.find((level) => level.id === next.activeLevel?.levelId)!;
        const resumed = activeLevelPhase(next.activeLevel, config);
        setPhase(resumed === "won" || resumed === "lost" ? "result" : resumed);
      }
    } catch (error) {
      if (!isStaleCascadeError(error)) {
        setSyncWarning("The save vial is full or unavailable. No progress was lost.");
      }
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }, [mutate, now, save]);

  const openLevel = useCallback(async (level: LevelConfig) => {
    if (!save || level.number > save.unlockedLevel || actionLock.current) return;
    const expected = captureCascadeExpectedState(save);
    actionLock.current = true;
    setBusy(true);
    try {
      await mutate("level-start", (current) => {
        assertCascadeExpectedState(current, expected);
        const durableLevel = assertCascadeLevelOpenCurrent(
          current,
          level.id,
          level.number,
          expected.gameSessionId,
          expected.revision,
        );
        const startedAt = now();
        const presentedAt = now();
        const activeLevel = createActiveLevel(durableLevel, startedAt);
        return {
          save: { ...current, activeLevel, updatedAt: presentedAt },
          events: [
            makeEvent({
              save: current, eventType: "level_started", at: startedAt,
              payload: {
                levelId: durableLevel.id,
                levelSeed: durableLevel.seed,
                moves: durableLevel.moves,
                goals: durableLevel.goals,
                scoreTarget: durableLevel.scoreTarget,
              },
            }),
            makeEvent({
              save: current, eventType: "board_presented", at: presentedAt,
              payload: {
                levelId: durableLevel.id,
                board: activeLevel.board,
                boardChecksum: boardChecksum(activeLevel.board),
                rngState: activeLevel.rngState,
              },
            }),
          ],
        };
      });
      setChoiceStarted(Date.now());
      setPhase("catalyst");
      setMessage(realmFor(level).fiction);
    } catch (error) {
      if (!isStaleCascadeError(error)) {
        setSyncWarning("The level could not be sealed into the save vial. Try again.");
      }
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }, [mutate, now, save]);

  useEffect(() => {
    if (phase !== "catalyst" || !save?.activeLevel || !activeConfig || !catalystChoices.length) return;
    const expected = captureCascadeExpectedState(save);
    const presentationId = `${save.gameSessionId}:${save.activeLevel.levelId}:${save.activeLevel.attempt}:${save.catalystOccasion}:catalyst-v3`;
    const equivalence = mechanicalEquivalence(catalystChoices.map((option) => option.normalizedMechanicalEstimate));
    actionLock.current = true;
    setBusy(true);
    void mutate("catalyst-presented", (current) => {
      assertCascadeExpectedState(current, expected);
      const at = now();
      return {
        save: { ...current, updatedAt: at },
        event: makeEvent({
          save: current, eventType: "catalyst_presented", at,
          payload: {
            levelId: save.activeLevel!.levelId, realmId: activeConfig.realmId,
            levelAttempt: save.activeLevel!.attempt, presentationId,
            catalystBoard: save.activeLevel!.board,
            catalystBoardChecksum: boardChecksum(save.activeLevel!.board),
            catalystRngState: save.activeLevel!.rngState,
            catalystGoals: activeConfig.goals,
            catalystOccasion: save.catalystOccasion,
            movesBefore: save.activeLevel!.movesRemaining,
            scoreBefore: save.activeLevel!.score,
            goalsBefore: goalSnapshot(activeConfig, save.activeLevel!.collected),
            catalystUsed: save.activeLevel!.catalystUsed,
            options: catalystChoices,
            presentedOrder: catalystChoices.map((option) => option.id), eligibility: equivalence,
          },
        }),
      };
    }).catch((error) => {
      if (!isStaleCascadeError(error)) {
        setSyncWarning("This catalyst offer is playable, but its local note could not be sealed.");
      }
    }).finally(() => {
      actionLock.current = false;
      setBusy(false);
    });
  // One presentation is recorded for each persisted catalyst occasion.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, save?.activeLevel?.levelId, save?.catalystOccasion]);

  const chooseCatalyst = useCallback(async (option: CatalystOption | null) => {
    if (!save?.activeLevel || !activeConfig || !board || busy || actionLock.current) return;
    const expected = captureCascadeExpectedState(save);
    actionLock.current = true;
    setBusy(true);
    const options = catalystChoices;
    const presentationId = `${save.gameSessionId}:${save.activeLevel.levelId}:${save.activeLevel.attempt}:${save.catalystOccasion}:catalyst-v3`;
    const eligibility = mechanicalEquivalence(options.map((item) => item.normalizedMechanicalEstimate));
    try {
      const next = await mutate(option ? "catalyst-select" : "catalyst-skip", (current) => {
        assertCascadeExpectedState(current, expected);
        const active = current.activeLevel;
        if (!active || active.levelId !== activeConfig.id || active.catalystUsed) throw new Error("stale_catalyst_choice");
        const currentBoard = decodeBoard(active.board);
        if (!currentBoard) throw new Error("invalid_saved_board");
        const at = now();
        const canonicalFields = {
          levelId: active.levelId,
          realmId: activeConfig.realmId,
          levelAttempt: active.attempt,
          presentationId,
          catalystBoard: active.board,
          catalystBoardChecksum: boardChecksum(active.board),
          catalystRngState: active.rngState,
          catalystGoals: activeConfig.goals,
          catalystOccasion: current.catalystOccasion,
          movesBefore: active.movesRemaining,
          scoreBefore: active.score,
          goalsBefore: goalSnapshot(activeConfig, active.collected),
          catalystUsed: active.catalystUsed,
          options,
          presentedOrder: options.map((item) => item.id),
          eligibility,
        };
        if (!option) {
          const nextActive = { ...active, catalystUsed: true };
          return {
            save: { ...current, activeLevel: nextActive, catalystOccasion: current.catalystOccasion + 1, tutorialSeen: true, updatedAt: at },
            event: makeEvent({
              save: current, eventType: "catalyst_skipped", at,
              timing: timingBucket(choiceStarted), preference: "none_neutral_skip",
              payload: {
                ...canonicalFields, selectedSlot: null, neutralEffect: true,
              },
            }),
          };
        }
        const selectedSlot = options.findIndex((item) => item.id === option.id);
        if (selectedSlot < 0 || JSON.stringify(options[selectedSlot]) !== JSON.stringify(option)) throw new Error("noncanonical_catalyst");
        const applied = applyCatalyst(currentBoard, active.rngState, option);
        const nextCollected = active.collected.map((count, index) => count + applied.collected[index]);
        const nextActive = {
          ...active, board: encodeBoard(applied.board), rngState: applied.rng.state,
          score: active.score + applied.scoreDelta, collected: nextCollected, catalystUsed: true,
        };
        const selectedEvent = makeEvent({
          save: current, eventType: "catalyst_selected", at,
          timing: timingBucket(choiceStarted),
          evidenceClass: eligibility.eligible ? "preference_observation" : "gameplay_telemetry",
          preference: eligibility.eligible ? "eligible_balanced_semantic_choice" : "none_mechanically_unequal",
          payload: {
            ...canonicalFields, selectedSlot, selectedOption: option,
            boardBefore: active.board, boardAfter: nextActive.board,
            beforeChecksum: boardChecksum(active.board), afterChecksum: boardChecksum(nextActive.board),
            cleared: applied.cleared, scoreAfter: nextActive.score,
            scoreDelta: applied.scoreDelta, rngAfter: nextActive.rngState,
            goalsBefore: goalSnapshot(activeConfig, active.collected),
            goalsAfter: goalSnapshot(activeConfig, nextCollected),
          },
        });
        const events = [selectedEvent];
        let updatedAt = at;
        if (applied.reshuffled) {
          updatedAt = now();
          const before = encodeBoard(applied.boardBeforeReshuffle);
          events.push(makeEvent({
            save: current, eventType: "dead_board_reshuffled", at: updatedAt,
            payload: {
              levelId: active.levelId, sourceEventId: selectedEvent.eventId,
              boardBefore: before, boardAfter: nextActive.board,
              beforeChecksum: boardChecksum(before), afterChecksum: boardChecksum(nextActive.board),
              rngBefore: applied.reshuffleRngBefore, rngAfter: nextActive.rngState,
              attempts: applied.reshuffleAttempts,
              inventoryPreserved: applied.reshuffleInventoryPreserved,
            },
          }));
        }
        const won = levelWon(nextActive, activeConfig);
        const stars = levelStars(nextActive, activeConfig);
        const nextStars = won
          ? { ...current.levelStars, [activeConfig.id]: Math.max(current.levelStars[activeConfig.id] || 0, stars) }
          : current.levelStars;
        const unlockedLevel = won
          ? Math.min(CASCADE_LEVELS.length, Math.max(current.unlockedLevel, activeConfig.number + 1))
          : current.unlockedLevel;
        if (won) {
          updatedAt = now();
          events.push(makeEvent({
            save: current, eventType: "level_completed", at: updatedAt,
            payload: {
              levelId: activeConfig.id, score: nextActive.score, stars,
              movesRemaining: nextActive.movesRemaining, goals: goalSnapshot(activeConfig, nextCollected),
            },
          }));
          if (activeConfig.number === CASCADE_LEVELS.length) {
            updatedAt = now();
            events.push(makeEvent({
              save: current, eventType: "session_completed", at: updatedAt,
              payload: {
                unlockedLevel,
                totalStars: Object.values(nextStars).reduce((sum, value) => sum + value, 0),
              },
            }));
          }
        }
        return {
          save: {
            ...current, activeLevel: nextActive, catalystOccasion: current.catalystOccasion + 1,
            tutorialSeen: true, levelStars: nextStars, unlockedLevel, updatedAt,
          },
          events,
        };
      });
      setSave(next);
      if (option) {
        const uniqueCompletedLevelCount = Object.keys(next.levelStars).length;
        const signals = eligibility.eligible ? [adaptAlchemistsCascadeCatalystToSignal(option)] : [];
        void gameRecommendationMilestone.notifyEvidence(
          `${next.gameSessionId}:catalyst:${next.catalystOccasion}`,
          signals,
          (lastMilestoneEvidenceCount) => alchemistsCascadeMilestone(uniqueCompletedLevelCount, lastMilestoneEvidenceCount),
        );
      }
      if (next.activeLevel && activeLevelPhase(next.activeLevel, activeConfig) === "won") {
        setPhase("result");
      } else if (next.tutorialSeen && save.tutorialSeen) {
        setPhase("play");
      } else {
        helpReturn.current = "play";
        setPhase("help");
      }
      setMessage(option ? `${option.title}. The board answers.` : "Fate keeps the spoon. No preference is recorded.");
    } catch (error) {
      if (!isStaleCascadeError(error)) {
        setSyncWarning("The catalyst could not be applied safely. Nothing was consumed.");
      }
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }, [activeConfig, board, busy, catalystChoices, choiceStarted, gameRecommendationMilestone, mutate, now, save]);

  const attemptSwap = useCallback(async (from: Coordinate, to: Coordinate) => {
    if (!save?.activeLevel || !activeConfig || busy || actionLock.current
      || activeLevelPhase(save.activeLevel, activeConfig) !== "play") return;
    const expected = captureCascadeExpectedState(save);
    actionLock.current = true;
    setBusy(true);
    setSelected(null);
    try {
      const next = await mutate("move", (current) => {
        assertCascadeExpectedState(current, expected);
        const active = current.activeLevel;
        if (!active || active.levelId !== activeConfig.id || activeLevelPhase(active, activeConfig) !== "play") {
          throw new Error("stale_or_terminal_move");
        }
        const currentBoard = decodeBoard(active.board);
        if (!currentBoard) throw new Error("invalid_saved_board");
        const result = applySwap(currentBoard, active.rngState, from, to, activeConfig.goals);
        const attemptedAt = now();
        const attempted = makeEvent({
          save: current, eventType: "move_attempted", at: attemptedAt,
          payload: {
            levelId: active.levelId, from, to, boardBefore: active.board, beforeChecksum: boardChecksum(active.board),
            rngBefore: active.rngState, legalMoves: result.legalMovesBefore.slice(0, 24), scoreBefore: active.score,
            movesBefore: active.movesRemaining, goalsBefore: goalSnapshot(activeConfig, active.collected),
          },
        });
        const resolvedAt = now();
        if (!result.valid) {
          const invalid = makeEvent({
            save: current, eventType: "move_invalid", at: resolvedAt,
            payload: {
              levelId: active.levelId, from, to, reason: result.reason, boardBefore: active.board,
              beforeChecksum: boardChecksum(active.board), rngBefore: active.rngState, rngAfter: active.rngState,
              legalMoves: result.legalMovesBefore.slice(0, 24),
              scoreBefore: active.score, scoreAfter: active.score, movesBefore: active.movesRemaining,
              movesAfter: active.movesRemaining, goalsBefore: goalSnapshot(activeConfig, active.collected),
              goalsAfter: goalSnapshot(activeConfig, active.collected), ordinaryMoveSemanticEvidence: false,
            },
          });
          return { save: { ...current, updatedAt: resolvedAt }, events: [attempted, invalid] };
        }
        const nextCollected = active.collected.map((count, index) => count + result.collected[index]);
        const nextActive = {
          ...active, board: encodeBoard(result.board), rngState: result.rng.state,
          movesRemaining: active.movesRemaining - 1, score: active.score + result.scoreDelta,
          collected: nextCollected,
        };
        const moveApplied = makeEvent({
          save: current, eventType: "move_applied", at: resolvedAt,
          payload: {
            levelId: active.levelId, from, to, boardBefore: active.board, boardAfter: nextActive.board,
            beforeChecksum: boardChecksum(active.board), afterChecksum: boardChecksum(nextActive.board),
            rngBefore: active.rngState, rngAfter: nextActive.rngState,
            legalMoves: result.legalMovesBefore.slice(0, 24), cascadeSteps: result.steps,
            scoreBefore: active.score, scoreAfter: nextActive.score, scoreDelta: result.scoreDelta,
            movesBefore: active.movesRemaining, movesAfter: nextActive.movesRemaining,
            goalsBefore: goalSnapshot(activeConfig, active.collected), goalsAfter: goalSnapshot(activeConfig, nextCollected),
            ordinaryMoveSemanticEvidence: false,
            reshuffled: result.reshuffled,
            reshuffleInventoryPreserved: result.reshuffleInventoryPreserved,
            reshuffleRngBefore: result.reshuffleRngBefore,
            reshuffleAttempts: result.reshuffleAttempts,
          },
        });
        let updatedAt = now();
        const events = [
          attempted,
          moveApplied,
          makeEvent({
            save: current, eventType: "cascade_resolved", at: updatedAt,
            payload: {
              levelId: active.levelId, sourceMoveEventId: moveApplied.eventId,
              sourceMoveOccurredAt: moveApplied.occurredAt,
              sourceMoveTimingBucket: moveApplied.timingBucket,
              from, to, boardBefore: active.board, boardAfter: nextActive.board,
              beforeChecksum: boardChecksum(active.board), afterChecksum: boardChecksum(nextActive.board),
              rngBefore: active.rngState, rngAfter: nextActive.rngState,
              legalMoves: result.legalMovesBefore.slice(0, 24), cascadeSteps: result.steps,
              scoreBefore: active.score, scoreAfter: nextActive.score, scoreDelta: result.scoreDelta,
              movesBefore: active.movesRemaining, movesAfter: nextActive.movesRemaining,
              goalsBefore: goalSnapshot(activeConfig, active.collected), goalsAfter: goalSnapshot(activeConfig, nextCollected),
              ordinaryMoveSemanticEvidence: false,
              reshuffled: result.reshuffled,
              reshuffleInventoryPreserved: result.reshuffleInventoryPreserved,
              reshuffleRngBefore: result.reshuffleRngBefore,
              reshuffleAttempts: result.reshuffleAttempts,
            },
          }),
        ];
        if (result.reshuffled) {
          updatedAt = now();
          const before = result.steps[result.steps.length - 1].boardAfter;
          events.push(makeEvent({
            save: current, eventType: "dead_board_reshuffled", at: updatedAt,
            payload: {
              levelId: active.levelId, sourceEventId: moveApplied.eventId,
              boardBefore: before, boardAfter: nextActive.board,
              beforeChecksum: boardChecksum(before), afterChecksum: boardChecksum(nextActive.board),
              rngBefore: result.reshuffleRngBefore, rngAfter: nextActive.rngState,
              attempts: result.reshuffleAttempts,
              inventoryPreserved: result.reshuffleInventoryPreserved,
            },
          }));
        }
        const terminal = activeLevelPhase(nextActive, activeConfig);
        const won = terminal === "won";
        const lost = terminal === "lost";
        const stars = levelStars(nextActive, activeConfig);
        const nextStars = won
          ? { ...current.levelStars, [activeConfig.id]: Math.max(current.levelStars[activeConfig.id] || 0, stars) }
          : current.levelStars;
        const unlockedLevel = won
          ? Math.min(CASCADE_LEVELS.length, Math.max(current.unlockedLevel, activeConfig.number + 1))
          : current.unlockedLevel;
        if (won || lost) {
          updatedAt = now();
          events.push(makeEvent({
            save: current,
            eventType: won ? "level_completed" : "level_failed", at: updatedAt,
            payload: won
              ? { levelId: activeConfig.id, score: nextActive.score, stars, movesRemaining: nextActive.movesRemaining, goals: goalSnapshot(activeConfig, nextCollected) }
              : { levelId: activeConfig.id, score: nextActive.score, movesRemaining: nextActive.movesRemaining, goals: goalSnapshot(activeConfig, nextCollected) },
          }));
        }
        if (won && activeConfig.number === CASCADE_LEVELS.length) {
          updatedAt = now();
          events.push(makeEvent({
            save: current, eventType: "session_completed", at: updatedAt,
            payload: {
              unlockedLevel, totalStars: Object.values(nextStars).reduce((sum, value) => sum + value, 0),
            },
          }));
        }
        return {
          save: { ...current, activeLevel: nextActive, levelStars: nextStars, unlockedLevel, updatedAt },
          events,
        };
      });
      const nextActive = next.activeLevel!;
      const previousScore = save.activeLevel.score;
      if (nextActive.movesRemaining === save.activeLevel.movesRemaining) {
        setMessage("That pairing refuses to brew. No move was spent.");
      } else {
        const gained = nextActive.score - previousScore;
        setMessage(gained >= 700 ? `Magnificent cascade! +${gained}` : `The mixture catches. +${gained}`);
        if (!reducedMotion) {
          comboPulse.setValue(1.12);
          Animated.spring(comboPulse, { toValue: 1, friction: 5, useNativeDriver: true }).start();
        }
        const terminal = activeLevelPhase(nextActive, activeConfig);
        if (terminal === "won" || terminal === "lost") setPhase("result");
        if (terminal === "won") {
          const uniqueCompletedLevelCount = Object.keys(next.levelStars).length;
          void gameRecommendationMilestone.notifyEvidence(
            `${next.gameSessionId}:level-completed:${activeConfig.id}`,
            [],
            (lastMilestoneEvidenceCount) => alchemistsCascadeMilestone(uniqueCompletedLevelCount, lastMilestoneEvidenceCount),
          );
        }
      }
    } catch (error) {
      if (!isStaleCascadeError(error)) {
        setSyncWarning("That move could not be sealed safely. The board was restored.");
      }
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }, [activeConfig, busy, comboPulse, gameRecommendationMilestone, mutate, now, reducedMotion, save]);

  const onCell = useCallback((at: Coordinate) => {
    if (busy || phase !== "play" || !save?.activeLevel || !activeConfig
      || activeLevelPhase(save.activeLevel, activeConfig) !== "play") return;
    if (!selected) {
      setSelected(at);
      setMessage(`${INGREDIENTS[board![at.row][at.column].kind].name} waits for a neighbor.`);
      return;
    }
    if (selected.row === at.row && selected.column === at.column) {
      setSelected(null);
      return;
    }
    void attemptSwap(selected, at);
  }, [activeConfig, attemptSwap, board, busy, phase, save?.activeLevel, selected]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined" || phase !== "play") return;
    const onKey = (event: KeyboardEvent) => {
      if (!selected) return;
      const delta = event.key === "ArrowUp" || event.key.toLowerCase() === "w" ? [-1, 0]
        : event.key === "ArrowDown" || event.key.toLowerCase() === "s" ? [1, 0]
          : event.key === "ArrowLeft" || event.key.toLowerCase() === "a" ? [0, -1]
            : event.key === "ArrowRight" || event.key.toLowerCase() === "d" ? [0, 1] : null;
      if (!delta) return;
      event.preventDefault();
      const to = { row: selected.row + delta[0], column: selected.column + delta[1] };
      if (to.row >= 0 && to.row < 7 && to.column >= 0 && to.column < 7) void attemptSwap(selected, to);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [attemptSwap, phase, selected]);

  const retry = useCallback(async () => {
    if (!save?.activeLevel || !activeConfig || actionLock.current) return;
    const expected = captureCascadeExpectedState(save);
    actionLock.current = true;
    setBusy(true);
    try {
      const next = await mutate("retry", (current) => {
        assertCascadeExpectedState(current, expected);
        const at = now();
        const presentedAt = now();
        const previousAttempt = current.activeLevel?.attempt;
        if (!previousAttempt || current.activeLevel?.levelId !== activeConfig.id) {
          throw new Error("stale_level_retry");
        }
        const activeLevel = createActiveLevel(activeConfig, at, previousAttempt + 1);
        return {
          save: { ...current, activeLevel, updatedAt: presentedAt },
          events: [
            makeEvent({
              save: current, eventType: "level_retried", at,
              payload: { levelId: activeConfig.id, previousAttempt, attempt: activeLevel.attempt },
            }),
            makeEvent({
              save: current, eventType: "board_presented", at: presentedAt,
              payload: {
                levelId: activeLevel.levelId, board: activeLevel.board,
                boardChecksum: boardChecksum(activeLevel.board), rngState: activeLevel.rngState,
              },
            }),
          ],
        };
      });
      setSave(next);
      setChoiceStarted(Date.now());
      setPhase("catalyst");
    } catch (error) {
      if (!isStaleCascadeError(error)) {
        setSyncWarning("The retry could not be saved. Your previous board remains safe.");
      }
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }, [activeConfig, mutate, now, save]);

  const returnToCampaign = useCallback(async () => {
    if (!save || actionLock.current) return;
    const expected = captureCascadeExpectedState(save);
    actionLock.current = true;
    try {
      const next = await mutate("close-level", (current) => {
        assertCascadeExpectedState(current, expected);
        return { save: { ...current, activeLevel: null, updatedAt: now() } };
      });
      setSave(next);
      setPhase("campaign");
    } catch (error) {
      if (!isStaleCascadeError(error)) {
        setSyncWarning("The chapter map could not be opened without risking your save.");
      }
    } finally {
      actionLock.current = false;
    }
  }, [mutate, now, save]);

  const reset = useCallback(() => {
    if (!save) return;
    const expected = captureCascadeExpectedState(save);
    const perform = async () => {
      if (actionLock.current) return;
      actionLock.current = true;
      try {
        const fresh = await mutate("reset-campaign", (current) => {
          assertCascadeExpectedState(current, expected);
          const at = now();
          const nextGameSessionId = id("cascade-session");
          const resetSave = createInitialCascadeSave(
            current.anonymousPlayerId,
            current.libraryScopeId,
            at,
            nextGameSessionId,
          );
          return {
            save: {
              ...resetSave, revision: current.revision,
              committedEventIds: current.committedEventIds, updatedAt: at,
            },
            event: makeEvent({
              save: current, eventType: "campaign_reset", at,
              payload: {
                previousGameSessionId: current.gameSessionId,
                nextGameSessionId,
                previousRevision: current.revision,
              },
            }),
          };
        });
        sessionId.current = fresh.gameSessionId;
        await gameRecommendationMilestone.resetSession(fresh.gameSessionId);
        setSave(fresh);
        setPhase("title");
        setSyncWarning(null);
      } catch (error) {
        if (!isStaleCascadeError(error)) {
          setSyncWarning("Reset failed. Existing progress remains unchanged.");
        }
      } finally {
        actionLock.current = false;
      }
    };
    if (Platform.OS === "web" && typeof window !== "undefined") {
      if (window.confirm("Reset the campaign on this device? Already-synced anonymous events are not deleted.")) void perform();
    } else {
      Alert.alert("Reset the campaign?", "Already-synced anonymous events are not deleted.", [
        { text: "Keep progress", style: "cancel" },
        { text: "Reset", style: "destructive", onPress: () => void perform() },
      ]);
    }
  }, [gameRecommendationMilestone, mutate, now, save]);

  if (phase === "loading") {
    return <SafeAreaView style={styles.loading}><ActivityIndicator color="#F6C957" /><Text style={styles.loadingText}>Warming the copper...</Text></SafeAreaView>;
  }

  if (privacy) {
    return <SafeAreaView style={styles.safe}><View style={styles.centered}><PrivacyPanel onClose={() => setPrivacy(false)} /></View></SafeAreaView>;
  }

  if (phase === "help") return <SafeAreaView style={styles.safe}><HelpPanel onClose={() => setPhase(helpReturn.current)} /></SafeAreaView>;

  if (phase === "title") {
    return (
      <SafeAreaView style={styles.safe}>
        <CascadeTitleScreen
          busy={busy}
          hasProgress={Boolean(save?.playSessionCount)}
          ready={Boolean(save)}
          syncWarning={syncWarning}
          onBegin={() => void begin()}
          onHelp={() => openHelp("title")}
          onMemory={() => setPrivacy(true)}
          onReset={reset}
        />
      </SafeAreaView>
    );
  }

  if (phase === "campaign" && save) {
    return (
      <SafeAreaView style={styles.safe}>
        <CascadeAtlasScreen
          save={save}
          busy={busy}
          syncWarning={syncWarning}
          onExit={() => void saveExit()}
          onOpenLevel={(level) => void openLevel(level)}
          onOpenNotes={() => openHelp("campaign")}
        />
      </SafeAreaView>
    );
  }

  if (phase === "catalyst" && save?.activeLevel && activeConfig) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: activeRealm.background }]}>
        <ScrollView contentContainerStyle={styles.choiceScreen}>
          <Text style={styles.choiceTitle}>Choose the first whisper</Text>
          <Text style={styles.choiceCopy}>Three equally measured infusions wait beside the flask. Choose the flavor of this opening, or let fate stir.</Text>
          <View style={styles.choiceList}>
            {catalystChoices.map((option) => (
              <TouchableOpacity
                key={option.id}
                style={[styles.choiceOption, { borderColor: option.manifestation.color }]}
                onPress={() => void chooseCatalyst(option)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`${option.title}. ${option.copy} ${option.manifestation.outcomeText}`}
              >
                <Text style={[styles.choiceOptionTitle, { color: option.manifestation.color }]}>
                  {option.manifestation.symbol} {option.title}
                </Text>
                <Text style={styles.choiceOptionCopy}>{option.copy}</Text>
                <Text style={styles.choiceOutcome}>{option.manifestation.outcomeText}</Text>
                <Text style={styles.choiceMechanic}>Same calibrated seven-ingredient effect</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.fateButton} onPress={() => void chooseCatalyst(null)} disabled={busy}>
            <Text style={styles.fateText}>LET FATE DECIDE — BEGIN WITHOUT AN INFUSION</Text>
          </TouchableOpacity>
          <Text style={styles.balanceNote}>Each offered infusion is calibrated to the same seven-ingredient strength.</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if ((phase === "play" || phase === "pause") && save?.activeLevel && activeConfig && board) {
    const goalDone = levelWon(save.activeLevel, activeConfig);
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: activeRealm.background }]}>
        <View style={[styles.gameHeader, { borderBottomColor: activeRealm.accent }]}>
          <TouchableOpacity style={styles.headerButton} onPress={() => setPhase(phase === "pause" ? "play" : "pause")} accessibilityRole="button">
            <Text style={styles.headerButtonText}>{phase === "pause" ? "RESUME" : "PAUSE"}</Text>
          </TouchableOpacity>
          <View style={styles.gameHeaderCenter}><Text style={styles.levelHeader}>{activeConfig.name}</Text><Text style={styles.realmHeader}>{activeRealm.name}</Text></View>
          <TouchableOpacity style={styles.headerButton} onPress={() => openHelp("play")}><Text style={styles.headerButtonText}>HELP</Text></TouchableOpacity>
        </View>
        {phase === "pause" ? (
          <View style={styles.centered}>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>The flame holds steady</Text>
              <Text style={styles.lead}>Your exact board and the next refill are sealed in the save vial.</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={() => setPhase("play")}><Text style={styles.primaryButtonText}>RETURN TO THE FLASK</Text></TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => void saveExit()}><Text style={styles.secondaryButtonText}>{busy ? "SAVING..." : "SAVE & EXIT"}</Text></TouchableOpacity>
            </View>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.playScreen}>
            <View style={styles.statusRail}>
              <View><Text style={styles.statusLabel}>MOVES</Text><Text style={styles.movesValue}>{save.activeLevel.movesRemaining}</Text></View>
              <Animated.View style={{ transform: [{ scale: comboPulse }] }}><Text style={styles.statusLabel}>SCORE</Text><Text style={styles.scoreValue}>{save.activeLevel.score.toLocaleString()}</Text><Text style={styles.targetText}>of {activeConfig.scoreTarget.toLocaleString()}</Text></Animated.View>
              <View><Text style={styles.statusLabel}>BREW</Text><Text style={styles.brewValue}>{goalDone ? "READY" : "ACTIVE"}</Text></View>
            </View>
            <View style={styles.goals}>
              {activeConfig.goals.map((goal) => {
                const ingredient = INGREDIENTS[goal.kind];
                const current = save.activeLevel!.collected[goal.kind];
                return (
                  <View key={ingredient.id} style={styles.goal}>
                    <View style={[styles.goalDot, { backgroundColor: ingredient.color }]}><Text style={{ color: ingredient.ink }}>{ingredient.symbol}</Text></View>
                    <Text style={styles.goalText}>{ingredient.name}</Text>
                    <Text style={[styles.goalCount, current >= goal.target && styles.goalDone]}>{Math.min(current, goal.target)}/{goal.target}</Text>
                  </View>
                );
              })}
            </View>
            <BoardView board={board} width={Math.min(width - 24, 510)} selected={selected} onCell={onCell} />
            <Text style={styles.feedback} accessibilityLiveRegion="polite">{busy ? "The mixture turns..." : message}</Text>
            {syncWarning ? <Text style={styles.warning}>{syncWarning}</Text> : null}
          </ScrollView>
        )}
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
            onRespond={(response) => gameRecommendationMilestone.respond(response, () => undefined)}
          />
        ) : null}
      </SafeAreaView>
    );
  }

  if (phase === "result" && save?.activeLevel && activeConfig) {
    const won = levelWon(save.activeLevel, activeConfig);
    const stars = levelStars(save.activeLevel, activeConfig);
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: activeRealm.background }]}>
        <View style={styles.centered}>
          <View style={[styles.resultSheet, { borderColor: activeRealm.accent }]}>
            <Text style={styles.resultGlyph}>{won ? "✦" : "◇"}</Text>
            <Text style={styles.sheetTitle}>{won ? "The recipe lives!" : "The flame went quiet"}</Text>
            <Text style={styles.resultStars}>{won ? `${"★".repeat(stars)}${"☆".repeat(3 - stars)}` : "☆☆☆"}</Text>
            <Text style={styles.resultScore}>{save.activeLevel.score.toLocaleString()} points</Text>
            <Text style={styles.lead}>{won ? "The atlas turns its own page. A stranger recipe is waiting." : "Nothing is wasted in alchemy. The board will return exactly from its seed."}</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={won ? () => void returnToCampaign() : () => void retry()} disabled={busy}>
              <Text style={styles.primaryButtonText}>{won ? "OPEN THE RECIPE ATLAS" : "REKINDLE THIS RECIPE"}</Text>
            </TouchableOpacity>
            {won ? <TouchableOpacity style={styles.secondaryButton} onPress={() => void retry()}><Text style={styles.secondaryButtonText}>BREW AGAIN</Text></TouchableOpacity> : <TouchableOpacity style={styles.secondaryButton} onPress={() => void returnToCampaign()}><Text style={styles.secondaryButtonText}>RETURN TO THE ATLAS</Text></TouchableOpacity>}
          </View>
        </View>
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
            onRespond={(response) => gameRecommendationMilestone.respond(response, () => void returnToCampaign())}
          />
        ) : null}
      </SafeAreaView>
    );
  }

  return <SafeAreaView style={styles.loading}><Text style={styles.loadingText}>The recipe slipped a page. Return to the atlas.</Text><TouchableOpacity style={styles.primaryButton} onPress={() => setPhase("campaign")}><Text style={styles.primaryButtonText}>OPEN ATLAS</Text></TouchableOpacity></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#151820" },
  loading: { flex: 1, backgroundColor: "#151820", alignItems: "center", justifyContent: "center", gap: 14, padding: 24 },
  loadingText: { color: "#E9DFCE", fontSize: 14, fontWeight: "700" },
  centered: { flex: 1, padding: 22, justifyContent: "center", alignItems: "center" },
  titleScreen: { flexGrow: 1, minHeight: 650, alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: "#161922" },
  cascadeTitleArtworkDesktop: { flex: 1, backgroundColor: "#0D0B11", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  cascadeTitleArtworkCompactScroll: { flex: 1, backgroundColor: "#0D0B11" },
  cascadeTitleArtworkCompactContent: { flexGrow: 1, alignItems: "center", justifyContent: "flex-start" },
  cascadeTitleArtworkMobileScroll: { flex: 1, backgroundColor: "#0D0B11" },
  cascadeTitleArtworkMobileContent: { flexGrow: 1, alignItems: "center", justifyContent: "flex-start", paddingBottom: 28 },
  cascadeTitleArtworkStage: { position: "relative", alignSelf: "center", backgroundColor: "#0D0B11", overflow: "hidden" },
  cascadeTitleArtworkImage: { position: "absolute", top: 0, left: 0, width: "100%" },
  cascadeTitleArtworkControl: {
    position: "absolute",
    borderWidth: 3,
    borderColor: "transparent",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  cascadeTitleArtworkLink: { borderRadius: 4 },
  cascadeTitleArtworkControlActive: {
    borderColor: "#FFE19A",
    backgroundColor: "rgba(246, 201, 87, 0.16)",
  },
  cascadeTitleArtworkControlPressed: {
    backgroundColor: "rgba(122, 72, 24, 0.55)",
    transform: [{ scale: 0.985 }],
  },
  cascadeTitleArtworkPrimaryVisible: {
    backgroundColor: "#F0AE3D",
    borderColor: "#FFE09A",
    shadowColor: "#000",
    shadowOpacity: 0.42,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
  },
  cascadeTitleArtworkPrimaryVisibleActive: {
    backgroundColor: "#FFC650",
    borderColor: "#FFF0B6",
  },
  cascadeTitleArtworkPrimaryVisiblePressed: {
    backgroundColor: "#C8862F",
    transform: [{ scale: 0.985 }],
  },
  cascadeTitleArtworkPrimaryText: { color: "#1E1609", fontSize: 17, fontWeight: "900", letterSpacing: 0.8, textAlign: "center" },
  cascadeTitleArtworkReset: {
    position: "absolute",
    right: 18,
    bottom: 16,
    minHeight: 44,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(242, 154, 148, 0.62)",
    borderRadius: 5,
    backgroundColor: "rgba(18, 13, 17, 0.82)",
    alignItems: "center",
    justifyContent: "center",
  },
  cascadeTitleArtworkResetText: { color: "#F5B2AA", fontSize: 12, fontWeight: "800" },
  cascadeTitleArtworkWarning: {
    position: "absolute",
    left: "25%",
    right: "25%",
    bottom: 16,
    color: "#FFD49C",
    backgroundColor: "rgba(59, 42, 32, 0.94)",
    padding: 10,
    borderRadius: 4,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  cascadeTitleArtworkMobileCopy: { alignSelf: "stretch", maxWidth: 560, alignItems: "center", paddingHorizontal: 22, paddingTop: 20 },
  cascadeTitleArtworkMobileTitle: { color: "#FFF1CF", fontSize: 27, lineHeight: 33, fontWeight: "900", textAlign: "center" },
  cascadeTitleArtworkMobileDescription: { color: "#D7C8AF", fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 9 },
  cascadeTitleMobilePrimary: {
    width: "100%",
    maxWidth: 390,
    minHeight: 52,
    marginTop: 20,
    paddingHorizontal: 18,
    borderWidth: 2,
    borderColor: "#FFE09A",
    borderRadius: 6,
    backgroundColor: "#F0AE3D",
    alignItems: "center",
    justifyContent: "center",
  },
  cascadeTitleMobilePrimaryText: { color: "#1E1609", fontSize: 14, fontWeight: "900", letterSpacing: 0.8, textAlign: "center" },
  cascadeTitleMobileActions: { alignSelf: "stretch", marginTop: 10, gap: 8 },
  cascadeTitleMobileSecondary: {
    alignSelf: "stretch",
    minHeight: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#80683D",
    borderRadius: 5,
    backgroundColor: "#1C1A20",
    alignItems: "center",
    justifyContent: "center",
  },
  cascadeTitleMobileSecondaryText: { color: "#F3D794", fontSize: 14, textDecorationLine: "underline", textAlign: "center" },
  cascadeTitleMobileControlPressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  cascadeTitleMobileReset: { minHeight: 44, marginTop: 8, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  visuallyHidden: { position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" },
  titleSigil: { width: 220, height: 150, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  sigilRing: { width: 122, height: 122, borderRadius: 61, borderWidth: 2, borderColor: "#F6C957", alignItems: "center", justifyContent: "center", backgroundColor: "#252A36" },
  sigilMark: { color: "#F6C957", fontSize: 58 },
  sigilLine: { position: "absolute", width: 210, height: 2, backgroundColor: "#F36B42", transform: [{ rotate: "-12deg" }] },
  title: { color: "#FFF8E8", fontSize: 42, lineHeight: 44, maxWidth: 660, textAlign: "center", fontWeight: "900", letterSpacing: -1 },
  titleCopy: { color: "#C9C3B8", fontSize: 17, lineHeight: 26, textAlign: "center", maxWidth: 620, marginTop: 20, marginBottom: 28 },
  primaryButton: { minHeight: 52, minWidth: 230, borderRadius: 5, backgroundColor: "#F6C957", paddingHorizontal: 22, paddingVertical: 15, alignItems: "center", justifyContent: "center", marginTop: 12 },
  primaryButtonText: { color: "#211A08", fontSize: 13, fontWeight: "900", letterSpacing: 1.1, textAlign: "center" },
  secondaryButton: { minHeight: 48, borderWidth: 1, borderColor: "#756C60", borderRadius: 5, padding: 14, alignItems: "center", justifyContent: "center", marginTop: 12 },
  secondaryButtonText: { color: "#F5ECDD", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  textButton: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  textButtonText: { color: "#E4D2AA", fontSize: 13, textDecorationLine: "underline" },
  dangerText: { color: "#F29A94", fontSize: 13 },
  titleActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 20 },
  disabled: { opacity: 0.55 },
  warning: { color: "#FFD49C", backgroundColor: "#3B2A20", padding: 10, borderRadius: 4, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 12, maxWidth: 560 },
  gameHeader: { minHeight: 66, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#584D3B", flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#171A22" },
  headerButton: { minWidth: 66, minHeight: 44, borderWidth: 1, borderColor: "#766C5B", borderRadius: 4, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  headerButtonText: { color: "#F1E6D5", fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  headerTitle: { color: "#F8EFDF", fontWeight: "900", fontSize: 18, letterSpacing: 0.5, textAlign: "center" },
  starTotal: { color: "#F6C957", minWidth: 66, textAlign: "right", fontWeight: "900" },
  campaign: { width: "100%", maxWidth: 940, alignSelf: "center", padding: 20, gap: 20, paddingBottom: 50 },
  realmSection: { borderWidth: 1, borderRadius: 6, padding: 18 },
  realmTitle: { fontSize: 24, fontWeight: "900" },
  realmFiction: { color: "#D6D2CA", fontSize: 14, lineHeight: 21, marginTop: 6, marginBottom: 16 },
  levelRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  levelTile: { flexGrow: 1, flexBasis: 190, minHeight: 112, backgroundColor: "#181B22", borderRadius: 4, padding: 13, justifyContent: "space-between" },
  levelLocked: { opacity: 0.4 },
  levelNumber: { color: "#F6C957", fontSize: 18, fontWeight: "900" },
  levelName: { color: "#F3EADE", fontSize: 14, fontWeight: "800" },
  levelStars: { color: "#F6C957", letterSpacing: 2 },
  atlasCinematic: { flex: 1, backgroundColor: "#100D10", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  atlasCinematicStage: { position: "relative", overflow: "hidden", backgroundColor: "#100D10" },
  atlasCinematicImage: { position: "absolute", inset: 0, width: "100%", height: "100%" },
  atlasCinematicExit: {
    position: "absolute",
    minWidth: 44,
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#B68B4D",
    borderRadius: 4,
    backgroundColor: "#161419",
    alignItems: "center",
    justifyContent: "center",
  },
  atlasCinematicExitText: { color: "#FBE8BD", fontSize: 15, fontWeight: "900", letterSpacing: 0.8 },
  atlasCinematicStars: {
    position: "absolute",
    minWidth: 44,
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#B68B4D",
    borderRadius: 4,
    backgroundColor: "#161419",
    alignItems: "center",
    justifyContent: "center",
  },
  atlasCinematicStarsText: { color: "#FFD06A", fontSize: 18, fontWeight: "900" },
  atlasCinematicRealmPosition: { position: "absolute" },
  atlasRealm: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 5,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  atlasRealmCompact: { height: "100%", paddingHorizontal: 11, paddingVertical: 8 },
  atlasRealmTitle: { fontSize: 24, lineHeight: 29, fontWeight: "900", textAlign: "center" },
  atlasRealmTitleCompact: { fontSize: 18, lineHeight: 21 },
  atlasRealmFiction: { color: "#E6D8C5", fontSize: 13, lineHeight: 18, marginTop: 3, marginBottom: 12, textAlign: "center" },
  atlasRealmFictionCompact: { fontSize: 10, lineHeight: 13, marginTop: 1, marginBottom: 6 },
  atlasLevelRow: { flexDirection: "row", gap: 8 },
  atlasLevelRowCompact: { flex: 1 },
  atlasLevel: {
    flex: 1,
    minWidth: 0,
    minHeight: 100,
    borderWidth: 1,
    borderColor: "#866B48",
    borderRadius: 4,
    backgroundColor: "#17151A",
    paddingHorizontal: 8,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "space-between",
  },
  atlasLevelCompact: { minHeight: 44, paddingHorizontal: 4, paddingVertical: 3 },
  atlasLevelLocked: { borderColor: "#4A4140", backgroundColor: "#211D20", opacity: 0.72 },
  atlasLevelActive: { borderColor: "#FFE19A", backgroundColor: "#30251B" },
  atlasLevelPressed: { backgroundColor: "#4A3320", transform: [{ scale: 0.98 }] },
  atlasLevelNumber: { color: "#F6C957", fontSize: 14, fontWeight: "900" },
  atlasLevelNumberCompact: { fontSize: 11 },
  atlasLevelName: { color: "#F7E8CE", fontSize: 13, lineHeight: 16, fontWeight: "800", textAlign: "center" },
  atlasLevelNameCompact: { fontSize: 10, lineHeight: 12 },
  atlasLevelStatus: { color: "#F6C957", fontSize: 12, letterSpacing: 1, fontWeight: "800" },
  atlasLevelStatusLocked: { color: "#A79A91", fontSize: 9, letterSpacing: 0.6 },
  atlasCinematicNotes: {
    position: "absolute",
    minWidth: 44,
    minHeight: 44,
    borderRadius: 4,
    backgroundColor: "#171419",
    borderWidth: 1,
    borderColor: "#80663C",
    alignItems: "center",
    justifyContent: "center",
  },
  atlasNotesText: { color: "#F2CC77", fontSize: 13, fontWeight: "800", textDecorationLine: "underline", textAlign: "center" },
  atlasCinematicSyncMask: {
    position: "absolute",
    backgroundColor: "#2D1B13",
    borderWidth: 1,
    borderColor: "#6E4225",
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  atlasCinematicSyncText: { color: "#FFD58C", fontSize: 11, lineHeight: 14, textAlign: "center" },
  atlasCinematicSyncMaskEmpty: { borderColor: "transparent", backgroundColor: "#25150F" },
  atlasControlPressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  atlasStackedScroll: { flex: 1, backgroundColor: "#100D10" },
  atlasStackedContent: { flexGrow: 1, paddingBottom: 34, alignItems: "center" },
  atlasHeaderCrop: { position: "relative", overflow: "hidden", backgroundColor: "#100D10" },
  atlasStackedToolbar: {
    width: "100%",
    maxWidth: 920,
    minHeight: 62,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  atlasToolbarButton: {
    minWidth: 70,
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#A57B42",
    borderRadius: 4,
    backgroundColor: "#171419",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  atlasToolbarButtonText: { color: "#FBE8BD", fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  atlasStackedTitle: { flex: 1, color: "#F7D79A", fontSize: 20, fontWeight: "900", textAlign: "center" },
  atlasStarTotal: {
    minWidth: 70,
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#A57B42",
    borderRadius: 4,
    backgroundColor: "#171419",
    alignItems: "center",
    justifyContent: "center",
  },
  atlasStarTotalText: { color: "#FFD06A", fontSize: 17, fontWeight: "900" },
  atlasStackedRealms: { width: "100%", maxWidth: 920, paddingHorizontal: 14, gap: 14 },
  atlasNotesButtonStacked: {
    width: "100%",
    maxWidth: 420,
    minHeight: 48,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#80663C",
    borderRadius: 4,
    backgroundColor: "#171419",
    alignItems: "center",
    justifyContent: "center",
  },
  atlasSyncBannerStacked: {
    color: "#FFD58C",
    backgroundColor: "#2D1B13",
    borderWidth: 1,
    borderColor: "#6E4225",
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 12,
    maxWidth: 560,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  overlayScroll: { flexGrow: 1, padding: 22, justifyContent: "center", alignItems: "center" },
  sheet: { width: "100%", maxWidth: 620, backgroundColor: "#252A36", borderRadius: 6, padding: 24, shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
  resultSheet: { width: "100%", maxWidth: 560, backgroundColor: "#252A36", borderWidth: 1, borderRadius: 6, padding: 26, alignItems: "center" },
  sheetTitle: { color: "#FFF5E5", fontSize: 28, lineHeight: 33, fontWeight: "900", marginBottom: 12 },
  lead: { color: "#D2CBC0", fontSize: 15, lineHeight: 23 },
  helpStep: { flexDirection: "row", gap: 13, marginTop: 18, alignItems: "flex-start" },
  helpNumber: { width: 30, height: 30, borderRadius: 15, textAlign: "center", textAlignVertical: "center", paddingTop: Platform.OS === "web" ? 6 : 0, backgroundColor: "#F6C957", color: "#211A08", fontWeight: "900" },
  helpText: { color: "#E3DDD3", flex: 1, fontSize: 14, lineHeight: 21 },
  keyboardHint: { color: "#AFA79B", fontSize: 12, marginTop: 20 },
  choiceScreen: { flexGrow: 1, padding: 24, justifyContent: "center", alignItems: "center" },
  choiceTitle: { color: "#FFF5E5", fontSize: 32, fontWeight: "900", textAlign: "center" },
  choiceCopy: { color: "#D1CBC1", fontSize: 15, lineHeight: 23, maxWidth: 610, textAlign: "center", marginTop: 10, marginBottom: 22 },
  choiceList: { width: "100%", maxWidth: 820, gap: 10 },
  choiceOption: { borderWidth: 1, borderRadius: 5, padding: 17, backgroundColor: "#20242E" },
  choiceOptionTitle: { fontSize: 19, fontWeight: "900" },
  choiceOptionCopy: { color: "#E1DBD0", fontSize: 14, lineHeight: 20, marginTop: 4 },
  choiceOutcome: { color: "#C7C0B5", fontSize: 12, lineHeight: 18, marginTop: 8, fontStyle: "italic" },
  choiceMechanic: { color: "#AAA297", fontSize: 11, fontWeight: "800", marginTop: 8, textTransform: "uppercase", letterSpacing: 0.7 },
  fateButton: { minHeight: 48, marginTop: 18, padding: 12, alignItems: "center", justifyContent: "center" },
  fateText: { color: "#E8D8B6", fontSize: 12, fontWeight: "900", textDecorationLine: "underline", textAlign: "center" },
  balanceNote: { color: "#958E84", fontSize: 11, textAlign: "center" },
  gameHeaderCenter: { flex: 1, alignItems: "center", paddingHorizontal: 8 },
  levelHeader: { color: "#F8EFDF", fontSize: 16, fontWeight: "900", textAlign: "center" },
  realmHeader: { color: "#AFA89B", fontSize: 10, marginTop: 2, textAlign: "center" },
  playScreen: { padding: 12, alignItems: "center", paddingBottom: 44 },
  statusRail: { width: "100%", maxWidth: 510, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 12 },
  statusLabel: { color: "#AEA79C", fontSize: 9, fontWeight: "900", letterSpacing: 1.4, textAlign: "center" },
  movesValue: { color: "#FFF4DE", fontSize: 32, lineHeight: 36, fontWeight: "900", textAlign: "center" },
  scoreValue: { color: "#F6C957", fontSize: 25, fontWeight: "900", textAlign: "center" },
  targetText: { color: "#AFA79A", fontSize: 10, textAlign: "center" },
  brewValue: { color: "#78D99A", fontSize: 14, marginTop: 7, fontWeight: "900" },
  goals: { width: "100%", maxWidth: 510, flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  goal: { flexGrow: 1, minWidth: 150, flexDirection: "row", alignItems: "center", backgroundColor: "#222630", borderRadius: 4, padding: 8, gap: 7 },
  goalDot: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  goalText: { color: "#E4DDD2", fontSize: 11, flex: 1 },
  goalCount: { color: "#FFF2D8", fontSize: 12, fontWeight: "900" },
  goalDone: { color: "#78D99A" },
  board: { backgroundColor: "#0E1117", borderWidth: 7, borderColor: "#34303A", borderRadius: 7, padding: 5, shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 9 } },
  boardRow: { flexDirection: "row" },
  cell: { borderRadius: 6, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(255,255,255,0.18)", overflow: "hidden" },
  cellSelected: { borderColor: "#FFFFFF", borderWidth: 4, transform: [{ scale: 0.92 }] },
  cellSpecial: { borderColor: "#FFF5C2" },
  cellSymbol: { fontWeight: "900" },
  specialRow: { position: "absolute", left: 3, right: 3, height: 3, backgroundColor: "#FFF8E8", opacity: 0.9 },
  specialColumn: { position: "absolute", top: 3, bottom: 3, width: 3, backgroundColor: "#FFF8E8", opacity: 0.9 },
  specialBurst: { position: "absolute", width: 13, height: 13, borderRadius: 7, borderWidth: 2, borderColor: "#FFF8E8" },
  feedback: { color: "#F2E8D7", minHeight: 42, fontSize: 14, fontWeight: "700", textAlign: "center", padding: 11 },
  resultGlyph: { color: "#F6C957", fontSize: 60 },
  resultStars: { color: "#F6C957", fontSize: 30, letterSpacing: 4 },
  resultScore: { color: "#FFF3DD", fontSize: 22, fontWeight: "900", marginVertical: 12 },
});
