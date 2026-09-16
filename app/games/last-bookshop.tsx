import { withGameReadingAge } from "../../components/GameReadingAge";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient as SvgLinearGradient,
  Line,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import {
  PITCH_CHARMS,
  advanceLastBookshopProgress,
  calculateRoundReward,
  createAnonymousPlayerId,
  createInitialLastBookshopProgress,
  createRecommendationGameEvent,
  getCustomer,
  getEncountersForNight,
  getWork,
  resolveEncounterOutcome,
  type ConfidenceLevel,
  type EncounterOutcome,
  type LastBookshopEncounter,
  type LastBookshopProgressV1,
  type PitchCharm,
} from "../../lib/recommendationGames/lastBookshop";
import {
  lastBookshopProgressScopeKey,
  loadLastBookshopProgressForScope,
  scopedLastBookshopProgressKey,
} from "../../lib/recommendationGames/lastBookshopProgressStorage";
import { lastBookshopPortraitForCustomer } from "../../lib/recommendationGames/lastBookshopPortraits";
import {
  LAST_BOOKSHOP_STAGE_ARTWORK,
  type LastBookshopStageArtwork,
} from "../../lib/recommendationGames/lastBookshopStageArtwork";
import {
  flushRecommendationGameEvents,
  queueRecommendationGameEvent,
  type AsyncKeyValueStorage,
} from "../../lib/recommendationGames/evidenceClient";
import { GameRecommendationReward } from "../../components/GameRecommendationReward";
import { useGameRecommendationMilestone } from "../../hooks/useGameRecommendationMilestone";
import { adaptLastBookshopEncounterToSignals, LAST_BOOKSHOP_EVIDENCE_MODE } from "../../lib/recommendationGames/gameRecommendationEvidenceAdapters";
import { lastBookshopMilestone } from "../../lib/recommendationGames/gameRecommendationMilestones";
import { buildGamesPortalRouteParams, parseGameRouteConfig, type GameRouteParams } from "../../lib/recommendationGames/gameRecommendationRouteConfig";

type GamePhase = "title" | "arrival" | "shelves" | "counter" | "result" | "night_complete" | "ending";

type RoundResult = {
  encounter: LastBookshopEncounter;
  outcome: EncounterOutcome;
  reward: { reputation: number; coins: number };
  predictedWorkId: string;
  nextProgress: LastBookshopProgressV1;
  evidenceEventId: string;
};

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

async function sendRecommendationGameEvent(event: unknown): Promise<boolean> {
  if (Platform.OS !== "web" && !nativeApiOrigin) return false;
  const response = await fetch(`${nativeApiOrigin}/api/recommendation-game-event`, {
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

function Cover({ workId, compact = false }: { workId: string; compact?: boolean }) {
  const work = getWork(workId);
  return (
    <View
      style={[
        styles.cover,
        compact && styles.coverCompact,
        { backgroundColor: work.coverColor, borderColor: work.coverAccent },
      ]}
    >
      <View style={[styles.coverRule, { backgroundColor: work.coverAccent }]} />
      <Text style={[styles.coverTitle, compact && styles.coverTitleCompact]} numberOfLines={4}>
        {work.title}
      </Text>
      <Text style={[styles.coverCreator, { color: work.coverAccent }]} numberOfLines={2}>
        {work.creator}
      </Text>
      <View style={[styles.coverMark, { borderColor: work.coverAccent }]} />
    </View>
  );
}

function ShopHeader({
  progress,
  displayNight,
  onExit,
}: {
  progress: LastBookshopProgressV1;
  displayNight: number;
  onExit: () => void;
}) {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.headerButton} onPress={onExit} accessibilityRole="button" accessibilityLabel="Back to Games">
        <Text style={styles.headerButtonText}>Back to Games</Text>
      </TouchableOpacity>
      <View style={styles.headerTitleWrap}>
        <Text style={styles.headerKicker}>OPEN UNTIL DAWN</Text>
        <Text style={styles.headerTitle}>The Last Bookshop</Text>
        <View style={styles.headerOrnament} />
      </View>
      <View style={styles.headerStats}>
        <Text style={styles.headerStat}>Night {Math.min(displayNight, 3)}</Text>
        <Text style={styles.headerStat}>{progress.reputation} renown</Text>
      </View>
    </View>
  );
}

function BookshopBackdrop({
  phase,
  onError,
}: {
  phase: LastBookshopStageArtwork;
  onError?: () => void;
}) {
  return (
    <View
      pointerEvents="none"
      style={styles.environment}
    >
      <Image
        source={LAST_BOOKSHOP_STAGE_ARTWORK[phase]}
        resizeMode="cover"
        style={styles.environmentImage}
        accessible={false}
        onError={onError}
      />
      <View style={styles.environmentVeil} />
      <View style={styles.environmentCenter} />
      <View style={styles.environmentWarmth} />
    </View>
  );
}

function FloatingBackToGames({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.floatingBackButton}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Back to Games"
    >
      <Text style={styles.headerButtonText}>Back to Games</Text>
    </TouchableOpacity>
  );
}

function AbstractTitleScreen({ onBegin, onExit, hasProgress }: { onBegin: () => void; onExit: () => void; hasProgress: boolean }) {
  return (
    <View style={styles.titleScreen}>
      <FloatingBackToGames onPress={onExit} />
      <View style={styles.moon}>
        <View style={styles.moonCutout} />
      </View>
      <View style={styles.shopSilhouette}>
        <View style={styles.shopRoof} />
        <View style={styles.shopBody}>
          <View style={styles.shopWindow}>
            <View style={styles.windowShelf} />
            <View style={[styles.windowBook, { left: 12, height: 32 }]} />
            <View style={[styles.windowBook, { left: 27, height: 40 }]} />
            <View style={[styles.windowBook, { left: 43, height: 28 }]} />
          </View>
          <View style={styles.shopDoor} />
        </View>
      </View>
      <Text style={styles.titleEyebrow}>A SHOP BETWEEN MIDNIGHT AND MORNING</Text>
      <Text style={styles.titleLogo}>THE LAST{"\n"}BOOKSHOP</Text>
      <Text style={styles.titleTagline}>
        Listen closely. Choose three stories. Send each midnight visitor home with the one they need.
      </Text>
      <TouchableOpacity
        style={styles.beginButton}
        onPress={onBegin}
        accessibilityRole="button"
        accessibilityLabel={hasProgress ? "Continue your journey" : "Turn the Key"}
      >
        <Text style={styles.beginButtonText}>{hasProgress ? "Continue the Night" : "Turn the Key"}</Text>
      </TouchableOpacity>
      <Text style={styles.titleHint}>The shop remembers every kindness.</Text>
    </View>
  );
}

function TitleScreen({ onBegin, onExit, hasProgress }: { onBegin: () => void; onExit: () => void; hasProgress: boolean }) {
  const { width } = useWindowDimensions();
  const [artworkFailed, setArtworkFailed] = useState(false);
  const buttonLabel = hasProgress ? "Continue your journey" : "Turn the Key";
  const compact = width < 700;

  if (artworkFailed) return <AbstractTitleScreen onBegin={onBegin} onExit={onExit} hasProgress={hasProgress} />;

  return (
    <View style={styles.titleArtworkDesktop}>
      <BookshopBackdrop phase="title" onError={() => setArtworkFailed(true)} />
      <FloatingBackToGames onPress={onExit} />
      <ScrollView
        style={styles.titleArtworkMobileScroll}
        contentContainerStyle={[styles.liveTitleContent, compact && styles.liveTitleContentCompact]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleBrand}>
          <Text style={styles.titleBookGlyph}>▤</Text>
          <Text accessibilityRole="header" style={[styles.liveTitleLogo, compact && styles.liveTitleLogoCompact]}>
            The Last Bookshop
          </Text>
          <Text style={styles.titleEyebrow}>A SHOP BETWEEN MIDNIGHT AND MORNING</Text>
        </View>
        <View style={[styles.titleInvitation, compact && styles.titleInvitationCompact]}>
          <Text style={styles.titleInvitationHeading}>Step inside.</Text>
          <Text style={styles.titleInvitationCopy}>Three books. One night. A new story.</Text>
          <TouchableOpacity
            testID="last-bookshop-title-begin"
            style={styles.beginButton}
            onPress={onBegin}
            accessibilityRole="button"
            accessibilityLabel={buttonLabel}
            accessibilityHint="Enter The Last Bookshop and meet the next visitor"
          >
            <Text style={styles.beginButtonText}>{hasProgress ? "Continue the Night" : "Turn the Key  ⚿"}</Text>
          </TouchableOpacity>
          <Text style={styles.titleTagline}>
            Listen closely. Choose three stories. Send each midnight visitor home with the one they need.
          </Text>
          <Text style={styles.titleHint}>The shop remembers every kindness.</Text>
        </View>
        <View style={styles.titlePromiseRow}>
          {["Meet unforgettable people", "Explore hidden gems", "Follow your instincts", "See where the night leads"].map((promise) => (
            <View key={promise} style={styles.titlePromise}>
              <Text style={styles.titlePromiseMark}>◇</Text>
              <Text style={styles.titlePromiseText}>{promise}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function CustomerPortrait({ encounter }: { encounter: LastBookshopEncounter }) {
  const customer = getCustomer(encounter.customerId);
  const { width } = useWindowDimensions();
  const [failedCustomerId, setFailedCustomerId] = useState("");
  const source = lastBookshopPortraitForCustomer(customer.id);
  const showArtwork = Boolean(source) && failedCustomerId !== customer.id;
  const artworkSize = width < 480
    ? { width: 142, height: 142, borderRadius: 71 }
    : { width: 210, height: 210, borderRadius: 105 };
  const accessibilityLabel = `Portrait of ${customer.name}, ${customer.role}`;

  if (showArtwork && source) {
    return (
      <View style={[styles.portraitArtworkFrame, artworkSize]}>
        <Image
          source={source}
          style={styles.portraitArtwork}
          resizeMode="contain"
          accessible
          accessibilityRole="image"
          accessibilityLabel={accessibilityLabel}
          accessibilityIgnoresInvertColors
          onError={() => setFailedCustomerId(customer.id)}
        />
      </View>
    );
  }

  return (
    <View
      style={[styles.portrait, { borderColor: customer.portraitColor }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={[styles.portraitHair, { backgroundColor: customer.portraitColor }]} />
      <View style={styles.portraitFace}>
        <View style={styles.portraitEyes}>
          <View style={styles.portraitEye} />
          <View style={styles.portraitEye} />
        </View>
      </View>
      <View style={[styles.portraitCoat, { backgroundColor: customer.portraitColor }]} />
    </View>
  );
}

function ArrivalScreen({ encounter, onContinue }: { encounter: LastBookshopEncounter; onContinue: () => void }) {
  const customer = getCustomer(encounter.customerId);
  return (
    <View style={styles.scene}>
      <Text style={styles.sceneChapter}>THE BELL ABOVE THE DOOR RINGS</Text>
      <View style={styles.arrivalPanel}>
        <View style={styles.customerRow}>
          <CustomerPortrait encounter={encounter} />
          <View style={styles.customerIdentity}>
            <Text style={styles.customerName}>{customer.name}</Text>
            <Text style={styles.customerRole}>{customer.role}</Text>
            <Text style={styles.arrivalText}>{customer.arrival}</Text>
          </View>
        </View>
        <View style={styles.dialogueBox}>
          <View style={styles.dialogueNotch} />
          <Text style={styles.dialogueMark}>“</Text>
          <Text style={styles.dialogueQuote}>{encounter.request}</Text>
          <Text style={styles.dialogueMarkClosing}>”</Text>
        </View>
      </View>
      <View style={styles.cluePanel}>
        <Text style={styles.clueHeading}>WHAT YOU NOTICE</Text>
        <View style={styles.clueGrid}>
          {encounter.clues.map((clue, index) => (
            <View key={clue} style={styles.clueCard}>
              <View style={styles.clueNumber}>
                <Text style={styles.clueNumberText}>{index + 1}</Text>
              </View>
              <Text style={styles.clueText}>{clue}</Text>
            </View>
          ))}
        </View>
      </View>
      <TouchableOpacity style={[styles.primaryButton, styles.searchButton]} onPress={onContinue} accessibilityRole="button">
        <Text style={styles.primaryButtonText}>Search the Shelves  →</Text>
      </TouchableOpacity>
    </View>
  );
}

function WorkCard({
  workId,
  selectedOrder,
  onPress,
  wide,
}: {
  workId: string;
  selectedOrder: number;
  onPress: () => void;
  wide: boolean;
}) {
  const work = getWork(workId);
  const selected = selectedOrder > 0;
  return (
    <TouchableOpacity
      style={[styles.workCard, wide && styles.workCardWide, selected && styles.workCardSelected]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${work.title} by ${work.creator}${selected ? `, choice ${selectedOrder}` : ""}`}
    >
      {selected ? (
        <View style={styles.orderBadge}>
          <Text style={styles.orderBadgeText}>{selectedOrder}</Text>
        </View>
      ) : null}
      <View style={styles.bookPresentation}>
        <Cover workId={workId} />
        <View style={styles.bookRest} />
      </View>
      <View style={styles.workCopy}>
        <View style={styles.shelfPlaque}>
          <Text style={styles.workShelf}>{work.shelf}</Text>
        </View>
        <Text style={styles.workTitle}>{work.title}</Text>
        <Text style={styles.workCreator}>{work.creator}</Text>
        <Text style={styles.workBlurb} numberOfLines={4}>{work.blurb}</Text>
      </View>
    </TouchableOpacity>
  );
}

function ShelvesScreen({
  encounter,
  selectedIds,
  onToggle,
  onContinue,
}: {
  encounter: LastBookshopEncounter;
  selectedIds: string[];
  onToggle: (workId: string) => void;
  onContinue: () => void;
}) {
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  return (
    <View style={styles.sceneWide}>
      <View style={styles.shelfHeadingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.sceneChapter}>THE MIDNIGHT SHELVES</Text>
          <Text style={styles.shelfInstruction}>Choose exactly three. The order you choose becomes the counter display.</Text>
        </View>
        <View style={styles.selectionCounter}>
          <Text style={styles.selectionCounterValue}>{selectedIds.length}/3</Text>
          <Text style={styles.selectionCounterLabel}>ON COUNTER</Text>
        </View>
      </View>
      <View style={styles.workGrid}>
        {encounter.shelfIds.map((workId) => (
          <WorkCard
            key={workId}
            workId={workId}
            selectedOrder={selectedIds.indexOf(workId) + 1}
            onPress={() => onToggle(workId)}
            wide={wide}
          />
        ))}
      </View>
      <TouchableOpacity
        style={[styles.primaryButton, selectedIds.length !== 3 && styles.buttonDisabled]}
        disabled={selectedIds.length !== 3}
        onPress={onContinue}
        accessibilityRole="button"
      >
        <Text style={styles.primaryButtonText}>Set the Counter</Text>
      </TouchableOpacity>
    </View>
  );
}

function CharmIllustration({ charm, active }: { charm: PitchCharm; active: boolean }) {
  const glow = active ? "#ffd98d" : "#c69a64";
  if (charm === "mood") {
    return (
      <Svg width="100%" height="100%" viewBox="0 0 120 92" accessible={false}>
        <Defs>
          <SvgLinearGradient id="ribbon" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#7d405b" />
            <Stop offset="0.48" stopColor="#3f172e" />
            <Stop offset="1" stopColor="#aa6578" />
          </SvgLinearGradient>
          <RadialGradient id="ribbonGlow">
            <Stop offset="0" stopColor={glow} stopOpacity="0.42" />
            <Stop offset="1" stopColor="#1b111d" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Ellipse cx="60" cy="45" rx="55" ry="38" fill="url(#ribbonGlow)" />
        <Path d="M56 42C41 18 10 17 13 39c3 20 28 18 43 7Z" fill="url(#ribbon)" stroke="#c48191" strokeWidth="1.3" />
        <Path d="M64 42c15-24 46-25 43-3-3 20-28 18-43 7Z" fill="url(#ribbon)" stroke="#c48191" strokeWidth="1.3" />
        <Path d="M54 49 31 84l24-10 7-25Z" fill="url(#ribbon)" stroke="#93566d" strokeWidth="1.2" />
        <Path d="m66 49 23 35-24-10-7-25Z" fill="url(#ribbon)" stroke="#93566d" strokeWidth="1.2" />
        <Ellipse cx="60" cy="44" rx="12" ry="10" fill="#4b1d33" stroke="#d09aa5" strokeWidth="1.4" />
        <Path d="M23 35c9-7 20-4 29 6M97 35c-9-7-20-4-29 6" fill="none" stroke="#e2a9b4" strokeOpacity="0.48" strokeWidth="1.2" />
      </Svg>
    );
  }
  if (charm === "world") {
    return (
      <Svg width="100%" height="100%" viewBox="0 0 120 92" accessible={false}>
        <Defs>
          <RadialGradient id="compassFace">
            <Stop offset="0" stopColor="#7d5a2e" />
            <Stop offset="0.62" stopColor="#2f241c" />
            <Stop offset="1" stopColor="#110f12" />
          </RadialGradient>
          <SvgLinearGradient id="brass" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#f1c878" />
            <Stop offset="0.5" stopColor="#8a5a24" />
            <Stop offset="1" stopColor="#dfaa52" />
          </SvgLinearGradient>
        </Defs>
        <Path d="M30 21c5-16 27-17 33-3" fill="none" stroke="#8c653a" strokeWidth="4" strokeLinecap="round" />
        <Circle cx="61" cy="49" r="35" fill="url(#compassFace)" stroke="url(#brass)" strokeWidth="5" />
        <Circle cx="61" cy="49" r="27" fill="none" stroke="#c18e46" strokeOpacity="0.55" strokeWidth="1.2" />
        <Line x1="61" y1="20" x2="61" y2="78" stroke="#927044" strokeWidth="1" />
        <Line x1="32" y1="49" x2="90" y2="49" stroke="#927044" strokeWidth="1" />
        <Path d="m61 26 8 25-8-4-8 4Z" fill="#f4d28c" />
        <Path d="m61 72-8-23 8 4 8-4Z" fill="#a63e35" />
        <Circle cx="61" cy="49" r="4.5" fill="#d8aa5b" stroke="#f6dda4" strokeWidth="1" />
        <Path d="M26 33c-8 9-10 22-5 34" fill="none" stroke={glow} strokeOpacity="0.55" strokeWidth="1.5" />
      </Svg>
    );
  }
  if (charm === "pace") {
    return (
      <Svg width="100%" height="100%" viewBox="0 0 120 92" accessible={false}>
        <Defs>
          <SvgLinearGradient id="silver" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#f4e4c7" />
            <Stop offset="0.42" stopColor="#8f827c" />
            <Stop offset="0.7" stopColor="#ded1bd" />
            <Stop offset="1" stopColor="#665a5a" />
          </SvgLinearGradient>
        </Defs>
        <Ellipse cx="58" cy="54" rx="50" ry="28" fill={glow} fillOpacity="0.12" />
        <Circle cx="36" cy="33" r="15" fill="none" stroke="url(#silver)" strokeWidth="5" />
        <Circle cx="36" cy="33" r="6" fill="none" stroke="#c6b8aa" strokeWidth="2" />
        <Path d="m48 43 38 30 7-8-7-6 7-8-8-7-8 7-6-5-6 6-24-19Z" fill="url(#silver)" stroke="#eee1c9" strokeOpacity="0.7" strokeWidth="1.2" strokeLinejoin="round" />
        <Path d="M47 38 89 71" stroke="#fff1d4" strokeOpacity="0.5" strokeWidth="1.3" />
        <Circle cx="23" cy="22" r="2" fill="#f4d998" />
        <Circle cx="93" cy="31" r="1.5" fill="#f4d998" />
      </Svg>
    );
  }
  return (
    <Svg width="100%" height="100%" viewBox="0 0 120 92" accessible={false}>
      <Defs>
        <SvgLinearGradient id="wing" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#d9b98b" />
          <Stop offset="0.5" stopColor="#745b4b" />
          <Stop offset="1" stopColor="#2f2830" />
        </SvgLinearGradient>
      </Defs>
      <Ellipse cx="60" cy="48" rx="46" ry="32" fill={glow} fillOpacity="0.1" />
      <Path d="M57 45C46 12 15 9 8 24c14 3 21 15 17 30 13 0 24-4 32-9Z" fill="url(#wing)" stroke="#dcc39c" strokeWidth="1.2" />
      <Path d="M63 45c11-33 42-36 49-21-14 3-21 15-17 30-13 0-24-4-32-9Z" fill="url(#wing)" stroke="#dcc39c" strokeWidth="1.2" />
      <Path d="M55 51C42 48 22 56 17 76c17 2 33-6 42-20ZM65 51c13-3 33 5 38 25-17 2-33-6-42-20Z" fill="#4d4040" stroke="#a48a6d" strokeWidth="1.2" />
      <Path d="M54 39 25 23m29 23-29 8m41-15 29-16M66 46l29 8M53 56 22 17m42-17L85 73" stroke="#e0c397" strokeOpacity="0.42" strokeWidth="1.1" />
      <Ellipse cx="60" cy="51" rx="4" ry="18" fill="#291d22" stroke="#b09373" strokeWidth="1" />
      <Path d="M59 34C53 25 49 24 46 22m15 12c6-9 10-10 13-12" fill="none" stroke="#bda17c" strokeWidth="1.2" strokeLinecap="round" />
      <Circle cx="30" cy="31" r="4" fill="#2b2025" stroke="#c4a77f" strokeWidth="1" />
      <Circle cx="90" cy="31" r="4" fill="#2b2025" stroke="#c4a77f" strokeWidth="1" />
    </Svg>
  );
}

function PitchCharmChoice({
  charm,
  active,
  onPress,
}: {
  charm: (typeof PITCH_CHARMS)[number];
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.charmChoice,
        charm.id === "surprise" && styles.charmChoiceWide,
        active && styles.charmChoiceActive,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`Pitch charm: ${charm.label}. ${charm.description}`}
    >
      <View style={[styles.charmArtwork, active && styles.charmArtworkActive]}>
        <CharmIllustration charm={charm.id} active={active} />
      </View>
      <Text style={[styles.charmChoiceLabel, active && styles.charmChoiceLabelActive]}>{charm.label}</Text>
    </TouchableOpacity>
  );
}

function CandleIllustration({
  confidence,
  active,
  flameMotion,
}: {
  confidence: ConfidenceLevel;
  active: boolean;
  flameMotion: Animated.Value;
}) {
  const isLow = confidence === "low";
  const isHigh = confidence === "high";
  const bodyHeight = isLow ? 40 : isHigh ? 76 : 58;
  const bodyY = 104 - bodyHeight;
  const flameScale = isLow ? 0.72 : isHigh ? 1.3 : 1;
  return (
    <View style={styles.candleIllustration}>
      <Animated.View
        style={[
          styles.candleSvgWrap,
          {
            transform: [
              { translateX: active ? flameMotion.interpolate({ inputRange: [0, 1], outputRange: [-1.4, 1.4] }) : 0 },
              { scaleY: active ? flameMotion.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1.03] }) : 1 },
            ],
          },
        ]}
      >
        <Svg width="100%" height="100%" viewBox="0 0 80 120" accessible={false}>
          <Defs>
            <SvgLinearGradient id={`wax-${confidence}`} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#8e5d28" />
              <Stop offset="0.24" stopColor="#e1aa58" />
              <Stop offset="0.64" stopColor="#b77732" />
              <Stop offset="1" stopColor="#6f431e" />
            </SvgLinearGradient>
            <RadialGradient id={`flame-${confidence}`}>
              <Stop offset="0" stopColor="#fffbd0" />
              <Stop offset="0.35" stopColor="#ffd05c" />
              <Stop offset="1" stopColor="#e65d1d" />
            </RadialGradient>
          </Defs>
          {active ? <Ellipse cx="40" cy={bodyY - 8} rx={isHigh ? 29 : 22} ry={isHigh ? 32 : 25} fill="#f59b32" fillOpacity={isHigh ? 0.18 : 0.1} /> : null}
          <Ellipse cx="40" cy="108" rx={isHigh ? 30 : 24} ry="6" fill="#3c241c" />
          <Rect x={isHigh ? 22 : 25} y={bodyY} width={isHigh ? 36 : 30} height={bodyHeight} rx="5" fill={`url(#wax-${confidence})`} stroke="#e0ad62" strokeOpacity="0.55" />
          <Path d={`M${isHigh ? 28 : 30} ${bodyY}c3 7 7 4 9 13 3-11 8-5 13-13Z`} fill="#f0c477" fillOpacity="0.9" />
          <Line x1="40" y1={bodyY} x2="40" y2={bodyY - 8} stroke="#4b2f24" strokeWidth="2" />
          <G transform={`translate(40 ${bodyY - 15}) scale(${flameScale})`}>
            <Path d="M0-18C13-6 8 7 0 10-8 7-11-4 0-18Z" fill={`url(#flame-${confidence})`} />
            <Path d="M0-8C5-2 3 5 0 6-4 4-4 0 0-8Z" fill="#fff5bb" />
          </G>
          {isHigh ? (
            <>
              <Path d="M18 61c-8-10-7-21 1-28-2 11 3 17 8 23Z" fill="#ef6b22" fillOpacity="0.72" />
              <Path d="M62 58c8-11 7-22-1-30 2 12-3 18-8 24Z" fill="#ef6b22" fillOpacity="0.72" />
            </>
          ) : null}
        </Svg>
      </Animated.View>
    </View>
  );
}

function CandleSelector({
  value,
  onChange,
}: {
  value: ConfidenceLevel | null;
  onChange: (value: ConfidenceLevel) => void;
}) {
  const flameMotion = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    flameMotion.stopAnimation();
    if (!value || reduceMotion) {
      flameMotion.setValue(value ? 0.5 : 0);
      return;
    }
    const duration = value === "low" ? 260 : value === "medium" ? 900 : 520;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(flameMotion, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(flameMotion, {
          toValue: 0,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [flameMotion, reduceMotion, value]);

  return (
    <View style={styles.candleChoices}>
      {(["low", "medium", "high"] as ConfidenceLevel[]).map((confidence) => {
        const active = value === confidence;
        const label = confidence === "low" ? "Flicker" : confidence === "medium" ? "Steady" : "Blazing";
        return (
          <TouchableOpacity
            key={confidence}
            style={[styles.candleChoice, active && styles.candleChoiceActive]}
            onPress={() => onChange(confidence)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${label}, ${confidence} confidence`}
          >
            <CandleIllustration confidence={confidence} active={active} flameMotion={flameMotion} />
            <Text style={[styles.candleChoiceLabel, active && styles.candleChoiceLabelActive]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
      <View pointerEvents="none" style={styles.candleTableEdge}>
        <View style={styles.candleTableHighlight} />
      </View>
    </View>
  );
}

function CounterScreen({
  encounter,
  selectedIds,
  predictedId,
  confidence,
  pitchCharm,
  onPredict,
  onConfidence,
  onCharm,
  onSubmit,
}: {
  encounter: LastBookshopEncounter;
  selectedIds: string[];
  predictedId: string;
  confidence: ConfidenceLevel | null;
  pitchCharm: PitchCharm | null;
  onPredict: (workId: string) => void;
  onConfidence: (value: ConfidenceLevel) => void;
  onCharm: (value: PitchCharm) => void;
  onSubmit: () => void;
}) {
  const customer = getCustomer(encounter.customerId);
  const ready = Boolean(predictedId && confidence && pitchCharm);
  return (
    <View style={styles.sceneWide}>
      <View pointerEvents="none" style={styles.counterAmbientGlow} />
      <Text style={styles.sceneChapter}>THE COUNTER</Text>
      <Text style={styles.counterPrompt}>Which story will {customer.name.split(" ")[0]} carry into the night?</Text>
      <View style={styles.counterBooks}>
        {selectedIds.map((workId, index) => {
          const work = getWork(workId);
          const active = predictedId === workId;
          return (
            <TouchableOpacity
              key={workId}
              style={[styles.counterBook, active && styles.counterBookActive]}
              onPress={() => onPredict(workId)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Predict ${work.title}`}
            >
              <Text style={styles.counterOrder}>COUNTER {index + 1}</Text>
              <Cover workId={workId} compact />
              <Text style={styles.counterBookTitle}>{work.title}</Text>
              <Text style={[styles.counterPick, active && styles.counterPickActive]}>
                {active ? "YOUR PREDICTION" : "Choose"}
              </Text>
            </TouchableOpacity>
          );
        })}
        <View pointerEvents="none" style={styles.counterWoodEdge}>
          <View style={styles.counterWoodHighlight} />
        </View>
      </View>
      <View style={styles.counterOptions}>
        <View style={styles.optionBlock}>
          <Text style={styles.optionHeading}>Choose a pitch charm</Text>
          <Text style={styles.optionHelp}>What makes your predicted book the right one?</Text>
          <View style={styles.charmRow}>
            {PITCH_CHARMS.map((charm) => (
              <PitchCharmChoice
                key={charm.id}
                charm={charm}
                active={pitchCharm === charm.id}
                onPress={() => onCharm(charm.id)}
              />
            ))}
          </View>
          {pitchCharm ? (
            <Text style={styles.charmDescription}>{PITCH_CHARMS.find((charm) => charm.id === pitchCharm)?.description}</Text>
          ) : null}
        </View>
        <View style={styles.optionBlock}>
          <Text style={styles.optionHeading}>Set the candle</Text>
          <Text style={styles.optionHelp}>How certain is your shopkeeper&apos;s instinct?</Text>
          <CandleSelector value={confidence} onChange={onConfidence} />
        </View>
      </View>
      <TouchableOpacity
        style={[styles.primaryButton, !ready && styles.buttonDisabled]}
        disabled={!ready}
        onPress={onSubmit}
        accessibilityRole="button"
      >
        <Text style={styles.primaryButtonText}>Ring the Bell</Text>
      </TouchableOpacity>
    </View>
  );
}

function ResultScreen({ result, onContinue }: { result: RoundResult; onContinue: () => void }) {
  const customer = getCustomer(result.encounter.customerId);
  const chosen = getWork(result.outcome.chosenWorkId);
  const predictionCorrect = result.predictedWorkId === result.outcome.chosenWorkId;
  const reaction = result.outcome.choiceScore >= 8
    ? result.encounter.reactions.delighted
    : result.outcome.choiceScore >= 3
      ? result.encounter.reactions.content
      : result.encounter.reactions.disappointed;
  const nextAction = result.nextProgress.night > 3
    ? "See the Hidden Stacks"
    : result.nextProgress.night > result.encounter.night
      ? `Play Night ${result.nextProgress.night}`
      : "Meet the Next Visitor";
  return (
    <View style={styles.scene}>
      <Text style={styles.sceneChapter}>THE BELL HAS SPOKEN</Text>
      <Text style={styles.resultPrelude}>{customer.name} carries this story into the night.</Text>
      <View style={styles.resultReveal}>
        <View style={styles.resultBookColumn}>
          <Text style={styles.resultChoiceLabel}>{customer.name.toUpperCase()}&apos;S CHOICE</Text>
          <View style={styles.resultGlow}>
            <Cover workId={chosen.id} />
          </View>
        </View>
        <View style={styles.resultStoryColumn}>
          <Text style={styles.resultTitle}>{chosen.title}</Text>
          <Text style={styles.resultCreator}>{chosen.creator}</Text>
          <View style={styles.resultDialogue}>
            <Text style={styles.dialogueMark}>“</Text>
            <Text style={styles.dialogueQuote}>{reaction}</Text>
          </View>
          <Text style={styles.resultBlurb}>{chosen.blurb}</Text>
        </View>
      </View>
      <View style={styles.rewardPanel}>
        <View style={styles.rewardItem}>
          <Text style={styles.rewardIcon}>✦</Text>
          <Text style={styles.rewardValue}>+{result.reward.reputation}</Text>
          <Text style={styles.rewardLabel}>RENOWN</Text>
        </View>
        <View style={styles.rewardDivider} />
        <View style={styles.rewardItem}>
          <Text style={styles.rewardIcon}>☾</Text>
          <Text style={styles.rewardValue}>+{result.reward.coins}</Text>
          <Text style={styles.rewardLabel}>MOON COINS</Text>
        </View>
        <View style={styles.rewardDivider} />
        <View style={styles.rewardItem}>
          <Text style={styles.rewardIcon}>◇</Text>
          <Text style={[styles.rewardValue, predictionCorrect ? styles.rewardGood : styles.rewardQuiet]}>
            {predictionCorrect ? "TRUE" : "MISREAD"}
          </Text>
          <Text style={styles.rewardLabel}>INSTINCT</Text>
        </View>
      </View>
      {result.outcome.boundaryViolations.length ? (
        <Text style={styles.resultLesson}>A clue was missed: {result.outcome.boundaryViolations.join(", ")}.</Text>
      ) : (
        <Text style={styles.resultLesson}>Every boundary was respected.</Text>
      )}
      <Text style={styles.resultMemory}>
        Another visitor leaves with a story. The bookshop remembers your kindness.
      </Text>
      <TouchableOpacity style={[styles.primaryButton, styles.resultPrimaryButton]} onPress={onContinue} accessibilityRole="button">
        <Text style={styles.primaryButtonText}>{nextAction}</Text>
      </TouchableOpacity>
    </View>
  );
}

function NightCompleteScreen({
  completedNight,
  progress,
  onContinue,
}: {
  completedNight: number;
  progress: LastBookshopProgressV1;
  onContinue: () => void;
}) {
  const latestDecoration = progress.unlockedDecorations[progress.unlockedDecorations.length - 1];
  return (
    <View style={styles.scene}>
      <Text style={styles.sceneChapter}>DAWN FINDS THE WINDOWS</Text>
      <Text style={styles.nightCompleteTitle}>Night {completedNight} Complete</Text>
      <Text style={styles.nightCompleteText}>
        The last visitor leaves. Somewhere in the walls, the shop turns a page by itself.
      </Text>
      <View style={styles.ledger}>
        <Text style={styles.ledgerHeading}>THE SHOPKEEPER&apos;S LEDGER</Text>
        <View style={styles.ledgerRow}><Text style={styles.ledgerLabel}>Total renown</Text><Text style={styles.ledgerValue}>{progress.reputation}</Text></View>
        <View style={styles.ledgerRow}><Text style={styles.ledgerLabel}>Moon coins</Text><Text style={styles.ledgerValue}>{progress.coins}</Text></View>
        <View style={styles.ledgerRow}><Text style={styles.ledgerLabel}>Visitors helped</Text><Text style={styles.ledgerValue}>{progress.completedEncounterIds.length}</Text></View>
        <View style={styles.ledgerRow}><Text style={styles.ledgerLabel}>Newest furnishing</Text><Text style={styles.ledgerValue}>{latestDecoration}</Text></View>
      </View>
      <TouchableOpacity style={styles.primaryButton} onPress={onContinue} accessibilityRole="button">
        <Text style={styles.primaryButtonText}>Wait for Midnight</Text>
      </TouchableOpacity>
    </View>
  );
}

function EndingScreen({ progress, onRestart, onExit }: { progress: LastBookshopProgressV1; onRestart: () => void; onExit: () => void }) {
  return (
    <View style={styles.titleScreen}>
      <View style={styles.moon}>
        <View style={styles.moonCutout} />
      </View>
      <Text style={styles.titleEyebrow}>THE THIRD DAWN</Text>
      <Text style={styles.endingTitle}>The hidden stacks open.</Text>
      <Text style={styles.titleTagline}>
        Nine visitors carry stories into the waking world. The shop is no longer waiting for a keeper. It has found one.
      </Text>
      <View style={styles.endingStats}>
        <Text style={styles.endingStat}>{progress.reputation} renown</Text>
        <Text style={styles.endingStat}>{progress.completedEncounterIds.length} stories matched</Text>
        <Text style={styles.endingStat}>{progress.unlockedDecorations.length} furnishings</Text>
      </View>
      <TouchableOpacity style={styles.beginButton} onPress={onRestart} accessibilityRole="button">
        <Text style={styles.beginButtonText}>Begin Another Story</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.textButton} onPress={onExit} accessibilityRole="button" accessibilityLabel="Back to Games">
        <Text style={styles.textButtonText}>Back to Games</Text>
      </TouchableOpacity>
    </View>
  );
}

function LastBookshopRoute() {
  const params = useLocalSearchParams<{ playerId?: string; libraryId?: string; ageBand?: string; readingAgeOverride?: string; readingAgeBase?: string }>();
  const routeConfig = useMemo(() => parseGameRouteConfig(params as GameRouteParams), [params]);
  const progressScopeKey = useMemo(() => lastBookshopProgressScopeKey({
    playerId: routeConfig.playerId,
    libraryId: routeConfig.libraryId,
    ageBand: routeConfig.ageBand,
  }), [routeConfig.ageBand, routeConfig.libraryId, routeConfig.playerId]);
  const [progress, setProgress] = useState<LastBookshopProgressV1 | null>(null);
  const [phase, setPhase] = useState<GamePhase>("title");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [predictedId, setPredictedId] = useState("");
  const [confidence, setConfidence] = useState<ConfidenceLevel | null>(null);
  const [pitchCharm, setPitchCharm] = useState<PitchCharm | null>(null);
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
  const [loadedExistingProgress, setLoadedExistingProgress] = useState(false);
  const [storageError, setStorageError] = useState("");
  const gameSessionIdRef = useRef(`lbs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`);
  const encounterStartedAtRef = useRef(Date.now());
  const gameRecommendationMilestone = useGameRecommendationMilestone({
    game: "the_last_bookshop",
    gameLabel: "The Last Bookshop",
    playerId: routeConfig.playerId,
    gameSessionId: gameSessionIdRef.current,
    libraryId: routeConfig.libraryId,
    ageBand: routeConfig.ageBand,
    sourceFlags: routeConfig.sourceFlags,
    localCollectionOnly: routeConfig.localCollectionOnly,
    evidenceMode: LAST_BOOKSHOP_EVIDENCE_MODE,
  });
  const exit = useCallback(() => {
    router.push({
      pathname: "/games",
      params: buildGamesPortalRouteParams(routeConfig, params),
    });
  }, [params, routeConfig]);

  const persistProgress = useCallback(async (next: LastBookshopProgressV1) => {
    await gameStorage.setItem(scopedLastBookshopProgressKey(progressScopeKey), JSON.stringify(next));
  }, [progressScopeKey]);

  useEffect(() => {
    let active = true;
    setProgress(null);
    setLoadedExistingProgress(false);
    setPhase("title");
    setSelectedIds([]);
    setPredictedId("");
    setConfidence(null);
    setPitchCharm(null);
    setRoundResult(null);
    const previousTitle = Platform.OS === "web" && typeof document !== "undefined" ? document.title : "";
    if (Platform.OS === "web" && typeof document !== "undefined") document.title = "The Last Bookshop";
    void (async () => {
      let existing: LastBookshopProgressV1 | null = null;
      try {
        existing = await loadLastBookshopProgressForScope(gameStorage, {
          scopeKey: progressScopeKey,
        });
      } catch {
        if (active) setStorageError("The shop ledger is unavailable. This visit may not survive closing the game.");
      }
      const initial = existing || createInitialLastBookshopProgress(createAnonymousPlayerId());
      if (!active) return;
      setLoadedExistingProgress(Boolean(existing && existing.completedEncounterIds.length));
      setProgress(initial);
      if (!existing) {
        try {
          await persistProgress(initial);
        } catch {
          if (active) setStorageError("The shop ledger is unavailable. This visit may not survive closing the game.");
        }
      }
      void flushRecommendationGameEvents(gameStorage, async (event) => (
        initial.completedEncounterIds.includes(event.scenarioId)
          ? sendRecommendationGameEvent(event)
          : false
      )).catch(() => {
        if (active) setStorageError("The shop ledger is available, but its sealed letters could not be sorted.");
      });
    })();
    return () => {
      active = false;
      if (Platform.OS === "web" && typeof document !== "undefined") document.title = previousTitle;
    };
  }, [persistProgress, progressScopeKey]);

  const encounter = useMemo(() => {
    if (!progress || progress.night > 3) return null;
    return getEncountersForNight(progress.night)[progress.encounterIndex] || null;
  }, [progress]);

  const beginEncounter = useCallback(() => {
    if (!progress) return;
    setPhase(progress.night > 3 ? "ending" : "arrival");
    encounterStartedAtRef.current = Date.now();
  }, [progress]);

  const toggleWork = useCallback((workId: string) => {
    setSelectedIds((current) => {
      if (current.includes(workId)) return current.filter((id) => id !== workId);
      if (current.length >= 3) return current;
      return [...current, workId];
    });
  }, []);

  const submitCounter = useCallback(async () => {
    if (!progress || !encounter || !predictedId || !confidence || !pitchCharm) return;
    const outcome = resolveEncounterOutcome(encounter, selectedIds);
    const reward = calculateRoundReward(predictedId, outcome);
    const nextProgress = advanceLastBookshopProgress(progress, encounter, reward);
    const event = createRecommendationGameEvent({
      progress,
      encounter,
      selectedWorkIds: selectedIds,
      predictedWorkId: predictedId,
      confidence,
      pitchCharm,
      outcome,
      reward,
      gameSessionId: gameSessionIdRef.current,
      startedAtMs: encounterStartedAtRef.current,
    });
    try {
      await queueRecommendationGameEvent(gameStorage, event);
      await persistProgress(nextProgress);
    } catch {
      setStorageError("The ledger could not save this choice. Check browser storage, then ring the bell again.");
      return;
    }
    setStorageError("");
    setRoundResult({ encounter, outcome, reward, predictedWorkId: predictedId, nextProgress, evidenceEventId: event.eventId });
    setProgress(nextProgress);
    setPhase("result");
    void flushRecommendationGameEvents(gameStorage, sendRecommendationGameEvent).catch(() => {
      setStorageError("This visit is saved locally, but its sealed letter is still waiting to be sent.");
    });
    const signals = adaptLastBookshopEncounterToSignals({
      selectedWorkIds: selectedIds,
      predictedWorkId: predictedId,
      pitchCharm,
      works: selectedIds.map((workId) => getWork(workId)),
    });
    void gameRecommendationMilestone.notifyEvidence(
      event.eventId,
      signals,
      () => null,
    );
  }, [confidence, encounter, gameRecommendationMilestone, persistProgress, pitchCharm, predictedId, progress, selectedIds]);

  const continueAfterResult = useCallback(() => {
    if (!roundResult) return;
    const previousNight = roundResult.encounter.night;
    const next = roundResult.nextProgress;
    setProgress(next);
    setSelectedIds([]);
    setPredictedId("");
    setConfidence(null);
    setPitchCharm(null);
    setRoundResult(null);
    if (next.night > 3 || next.night !== previousNight) {
      setPhase(next.night > 3 ? "ending" : "night_complete");
      void gameRecommendationMilestone.notifyEvidence(
        roundResult.evidenceEventId,
        [],
        (lastMilestoneEvidenceCount) => lastBookshopMilestone(next.completedEncounterIds.length, lastMilestoneEvidenceCount),
      );
    } else {
      setPhase("arrival");
      encounterStartedAtRef.current = Date.now();
    }
  }, [gameRecommendationMilestone, roundResult]);

  const continueAfterNight = useCallback(() => {
    setPhase("arrival");
    encounterStartedAtRef.current = Date.now();
  }, []);

  const restart = useCallback(async () => {
    if (!progress) return;
    const next = createInitialLastBookshopProgress(progress.anonymousPlayerId);
    try {
      await persistProgress(next);
    } catch {
      setStorageError("The ledger could not begin a new story. Check device storage and try again.");
      return;
    }
    const nextGameSessionId = `lbs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    gameSessionIdRef.current = nextGameSessionId;
    await gameRecommendationMilestone.resetSession(nextGameSessionId);
    setStorageError("");
    setProgress(next);
    setLoadedExistingProgress(false);
    setSelectedIds([]);
    setPredictedId("");
    setConfidence(null);
    setPitchCharm(null);
    setRoundResult(null);
    setPhase("arrival");
    encounterStartedAtRef.current = Date.now();
  }, [gameRecommendationMilestone, persistProgress, progress]);

  if (!progress) {
    return (
      <SafeAreaView style={styles.safe}>
        <FloatingBackToGames onPress={exit} />
        <View style={styles.loading}><ActivityIndicator color="#e9c46a" size="large" /></View>
      </SafeAreaView>
    );
  }

  if (phase === "title") {
    return (
      <SafeAreaView style={styles.safe}>
        <TitleScreen onBegin={beginEncounter} onExit={exit} hasProgress={loadedExistingProgress} />
      </SafeAreaView>
    );
  }

  if (phase === "ending" || progress.night > 3) {
    return (
      <SafeAreaView style={styles.safe}>
        <BookshopBackdrop phase="ending" />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <EndingScreen progress={progress} onRestart={restart} onExit={exit} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <BookshopBackdrop phase={phase as LastBookshopStageArtwork} />
      <ShopHeader
        progress={progress}
        displayNight={
          phase === "result" && roundResult
            ? roundResult.encounter.night
            : phase === "night_complete"
              ? progress.night - 1
              : progress.night
        }
        onExit={exit}
      />
      <ScrollView
        key={phase}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {storageError ? <Text style={styles.storageError}>{storageError}</Text> : null}
        {phase === "arrival" && encounter ? <ArrivalScreen encounter={encounter} onContinue={() => setPhase("shelves")} /> : null}
        {phase === "shelves" && encounter ? (
          <ShelvesScreen
            encounter={encounter}
            selectedIds={selectedIds}
            onToggle={toggleWork}
            onContinue={() => setPhase("counter")}
          />
        ) : null}
        {phase === "counter" && encounter ? (
          <CounterScreen
            encounter={encounter}
            selectedIds={selectedIds}
            predictedId={predictedId}
            confidence={confidence}
            pitchCharm={pitchCharm}
            onPredict={setPredictedId}
            onConfidence={setConfidence}
            onCharm={setPitchCharm}
            onSubmit={submitCounter}
          />
        ) : null}
        {phase === "result" && roundResult ? <ResultScreen result={roundResult} onContinue={continueAfterResult} /> : null}
        {phase === "night_complete" ? (
          <NightCompleteScreen completedNight={progress.night - 1} progress={progress} onContinue={continueAfterNight} />
        ) : null}
      </ScrollView>
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
          onRespond={(response) => gameRecommendationMilestone.respond(
            response,
            phase === "night_complete" ? continueAfterNight : () => undefined,
          )}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#07101f", position: "relative", overflow: "hidden" },
  environment: { ...StyleSheet.absoluteFillObject, overflow: "hidden", backgroundColor: "#07101f" },
  environmentImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%", opacity: 0.78 },
  environmentVeil: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(3, 8, 18, 0.56)" },
  environmentCenter: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "14%",
    right: "14%",
    backgroundColor: "rgba(5, 11, 24, 0.38)",
  },
  environmentWarmth: {
    position: "absolute",
    width: 540,
    height: 540,
    borderRadius: 270,
    alignSelf: "center",
    top: 90,
    backgroundColor: "rgba(190, 108, 34, 0.07)",
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { flex: 1, zIndex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 56 },
  header: {
    minHeight: 78,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(201, 148, 78, 0.55)",
    backgroundColor: "rgba(5, 13, 27, 0.94)",
    flexDirection: "row",
    alignItems: "center",
    zIndex: 3,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
  },
  headerButton: {
    minWidth: 116,
    minHeight: 44,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#b98a50",
    borderRadius: 8,
    backgroundColor: "rgba(8, 18, 33, 0.78)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerButtonText: { color: "#efd7a5", fontSize: 13, fontWeight: "800", letterSpacing: 0.4 },
  floatingBackButton: {
    position: "absolute",
    top: 12,
    left: 12,
    zIndex: 20,
    minWidth: 116,
    minHeight: 44,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#b28b55",
    borderRadius: 8,
    backgroundColor: "rgba(5,13,27,0.94)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleWrap: { flex: 1, alignItems: "center", paddingHorizontal: 8 },
  headerKicker: { color: "#b28b55", fontSize: 9, letterSpacing: 2.2, fontWeight: "800" },
  headerTitle: { color: "#f6dfb1", fontFamily: "Georgia", fontSize: 21, fontWeight: "900", letterSpacing: 0.4 },
  headerOrnament: { width: 64, height: 1, backgroundColor: "#b98a50", marginTop: 5, opacity: 0.72 },
  headerStats: { minWidth: 76, alignItems: "flex-end" },
  headerStat: { color: "#d8b979", fontSize: 11, lineHeight: 17, fontWeight: "800" },
  titleScreen: {
    flex: 1,
    minHeight: 660,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  titleArtworkDesktop: {
    flex: 1,
    backgroundColor: "#0d0a12",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
  },
  titleArtworkMobileScroll: { flex: 1, zIndex: 1 },
  liveTitleContent: {
    flexGrow: 1,
    minHeight: 700,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 92,
    paddingBottom: 34,
  },
  liveTitleContentCompact: { minHeight: 760, paddingHorizontal: 14, paddingTop: 84, justifyContent: "flex-start" },
  titleBrand: {
    width: "100%",
    maxWidth: 820,
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: "rgba(202, 149, 78, 0.52)",
    borderRadius: 12,
    backgroundColor: "rgba(4, 12, 25, 0.82)",
    shadowColor: "#000",
    shadowOpacity: 0.46,
    shadowRadius: 20,
  },
  titleBookGlyph: { color: "#dfa654", fontSize: 28, lineHeight: 32, marginBottom: 4 },
  liveTitleLogo: { color: "#f4d69f", fontFamily: "Georgia", fontSize: 54, lineHeight: 62, fontWeight: "900", textAlign: "center", textShadowColor: "#170d08", textShadowRadius: 10 },
  liveTitleLogoCompact: { fontSize: 38, lineHeight: 45 },
  titleInvitation: {
    width: "100%",
    maxWidth: 560,
    alignItems: "center",
    marginTop: 28,
    paddingHorizontal: 28,
    paddingVertical: 24,
    borderWidth: 1,
    borderColor: "rgba(190, 132, 70, 0.56)",
    borderRadius: 14,
    backgroundColor: "rgba(7, 14, 27, 0.84)",
  },
  titleInvitationCompact: { marginTop: 18, paddingHorizontal: 18, paddingVertical: 20 },
  titleInvitationHeading: { color: "#fff0d1", fontFamily: "Georgia", fontSize: 36, lineHeight: 43, fontWeight: "900", textAlign: "center" },
  titleInvitationCopy: { color: "#e5d2b1", fontFamily: "Georgia", fontSize: 18, lineHeight: 27, textAlign: "center", marginTop: 4, marginBottom: 18 },
  titlePromiseRow: { width: "100%", maxWidth: 720, flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10, marginTop: 20 },
  titlePromise: { flexGrow: 1, flexBasis: 145, maxWidth: 175, minHeight: 68, alignItems: "center", justifyContent: "center", padding: 9, borderTopWidth: 1, borderColor: "rgba(213, 163, 90, 0.5)", backgroundColor: "rgba(5, 13, 26, 0.72)" },
  titlePromiseMark: { color: "#dca65c", fontSize: 14, marginBottom: 4 },
  titlePromiseText: { color: "#e3d1b5", fontSize: 10, lineHeight: 14, fontWeight: "800", letterSpacing: 0.7, textTransform: "uppercase", textAlign: "center" },
  moon: {
    position: "absolute",
    top: 58,
    right: "15%",
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#e7d8a7",
    opacity: 0.9,
  },
  moonCutout: {
    position: "absolute",
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: "#100d18",
    left: 26,
    top: -8,
  },
  shopSilhouette: { width: 190, height: 158, marginBottom: 24, marginTop: 30 },
  shopRoof: {
    width: 0,
    height: 0,
    borderLeftWidth: 105,
    borderRightWidth: 105,
    borderBottomWidth: 55,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#342633",
    marginLeft: -10,
  },
  shopBody: { flex: 1, backgroundColor: "#2a2029", borderWidth: 2, borderColor: "#4b3740", flexDirection: "row", justifyContent: "space-around", alignItems: "flex-end", padding: 14 },
  shopWindow: { width: 84, height: 70, backgroundColor: "#d39a45", borderWidth: 5, borderColor: "#503a32", position: "relative" },
  windowShelf: { position: "absolute", height: 5, left: 0, right: 0, bottom: 9, backgroundColor: "#503a32" },
  windowBook: { position: "absolute", bottom: 14, width: 11, backgroundColor: "#7f3545" },
  shopDoor: { width: 42, height: 83, backgroundColor: "#392d35", borderWidth: 3, borderColor: "#5d4645" },
  titleEyebrow: { color: "#d0a35f", fontSize: 11, letterSpacing: 3, fontWeight: "800", textAlign: "center", marginBottom: 10 },
  titleLogo: { color: "#f0dbb4", fontFamily: "Georgia", fontSize: 42, lineHeight: 43, fontWeight: "900", textAlign: "center", letterSpacing: 3 },
  titleTagline: { color: "#bcae9c", fontSize: 15, lineHeight: 23, textAlign: "center", maxWidth: 540, marginTop: 18, marginBottom: 26 },
  beginButton: { minWidth: 220, minHeight: 52, paddingHorizontal: 28, backgroundColor: "#914b36", borderWidth: 2, borderColor: "#e0aa62", borderRadius: 8, alignItems: "center", justifyContent: "center" },
  beginButtonText: { color: "#fff4d9", fontSize: 16, fontWeight: "900", letterSpacing: 0.8 },
  titleHint: { color: "#74697c", fontSize: 11, fontStyle: "italic", marginTop: 14 },
  scene: {
    width: "100%",
    maxWidth: 820,
    alignSelf: "center",
    marginTop: 28,
    paddingHorizontal: 26,
    paddingVertical: 30,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(201, 148, 78, 0.55)",
    borderRadius: 18,
    backgroundColor: "rgba(5, 13, 27, 0.86)",
    shadowColor: "#000",
    shadowOpacity: 0.56,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
  },
  sceneWide: {
    width: "100%",
    maxWidth: 1120,
    alignSelf: "center",
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 28,
    position: "relative",
    borderWidth: 1,
    borderColor: "rgba(201, 148, 78, 0.48)",
    borderRadius: 18,
    backgroundColor: "rgba(5, 13, 27, 0.84)",
    shadowColor: "#000",
    shadowOpacity: 0.58,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 12 },
  },
  counterAmbientGlow: {
    position: "absolute",
    top: 38,
    left: "15%",
    right: "15%",
    height: 420,
    borderRadius: 210,
    backgroundColor: "rgba(171, 103, 48, 0.045)",
  },
  sceneChapter: { color: "#d7a85f", fontSize: 11, letterSpacing: 2.6, fontWeight: "900", marginBottom: 22, textAlign: "center" },
  arrivalPanel: { width: "100%", alignItems: "center" },
  customerRow: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 10 },
  portraitArtworkFrame: {
    backgroundColor: "rgba(36, 24, 30, 0.78)",
    borderWidth: 2,
    borderColor: "#bd8a4b",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    shadowColor: "#e9a345",
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 7 },
  },
  portraitArtwork: { width: "100%", height: "100%" },
  portrait: { width: 112, height: 132, borderWidth: 2, borderRadius: 56, backgroundColor: "#241c29", overflow: "hidden", alignItems: "center", position: "relative" },
  portraitHair: { position: "absolute", width: 74, height: 76, borderRadius: 38, top: 16, opacity: 0.72 },
  portraitFace: { width: 54, height: 67, borderRadius: 27, backgroundColor: "#c99575", marginTop: 34, alignItems: "center", paddingTop: 24 },
  portraitEyes: { flexDirection: "row", gap: 15 },
  portraitEye: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#2d2028" },
  portraitCoat: { position: "absolute", width: 94, height: 55, borderTopLeftRadius: 47, borderTopRightRadius: 47, bottom: -19, opacity: 0.85 },
  customerIdentity: { flex: 1, maxWidth: 430, paddingLeft: 28 },
  customerName: { color: "#f5dfb8", fontFamily: "Georgia", fontSize: 34, fontWeight: "900" },
  customerRole: { color: "#c48c62", fontSize: 13, textTransform: "uppercase", letterSpacing: 1.5, marginTop: 3 },
  arrivalText: { color: "#b8a6a0", fontSize: 14, fontStyle: "italic", lineHeight: 21, marginTop: 12 },
  dialogueBox: {
    width: "100%",
    maxWidth: 700,
    backgroundColor: "rgba(24, 17, 29, 0.94)",
    borderWidth: 1,
    borderColor: "#8f6848",
    borderRadius: 12,
    paddingHorizontal: 36,
    paddingVertical: 24,
    marginBottom: 22,
    position: "relative",
    shadowColor: "#000",
    shadowOpacity: 0.34,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  dialogueNotch: { position: "absolute", top: -7, left: 64, width: 13, height: 13, backgroundColor: "#18111d", borderLeftWidth: 1, borderTopWidth: 1, borderColor: "#8f6848", transform: [{ rotate: "45deg" }] },
  dialogueMark: { position: "absolute", left: 14, top: 2, color: "#c8944f", fontFamily: "Georgia", fontSize: 42, opacity: 0.75 },
  dialogueMarkClosing: { position: "absolute", right: 14, bottom: -13, color: "#c8944f", fontFamily: "Georgia", fontSize: 42, opacity: 0.75 },
  dialogueQuote: { color: "#f1dfc2", fontFamily: "Georgia", fontSize: 19, lineHeight: 30, fontStyle: "italic", textAlign: "center" },
  cluePanel: { width: "100%", paddingTop: 4, marginBottom: 24 },
  clueHeading: { color: "#d4a760", fontSize: 10, letterSpacing: 2.2, fontWeight: "900", marginBottom: 12, textAlign: "center" },
  clueGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  clueCard: {
    flexGrow: 1,
    flexBasis: 190,
    minHeight: 90,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(185, 138, 80, 0.48)",
    borderRadius: 10,
    backgroundColor: "rgba(37, 27, 31, 0.9)",
    padding: 14,
  },
  clueNumber: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#69462f", borderWidth: 1, borderColor: "#d3a25c", alignItems: "center", justifyContent: "center", marginRight: 12 },
  clueNumberText: { color: "#f5d491", fontSize: 12, fontWeight: "900" },
  clueText: { flex: 1, color: "#e0ceb2", fontSize: 14, lineHeight: 20 },
  primaryButton: {
    minHeight: 54,
    minWidth: 230,
    alignSelf: "center",
    paddingHorizontal: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#dfa45c",
    backgroundColor: "#8f4936",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
    shadowColor: "#e39b4d",
    shadowOpacity: 0.26,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 5 },
  },
  searchButton: { minWidth: 280 },
  primaryButtonText: { color: "#fff2d5", fontSize: 15, fontWeight: "900", letterSpacing: 0.6 },
  buttonDisabled: { opacity: 0.38 },
  shelfHeadingRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 14, marginBottom: 20 },
  headingCopy: { flexGrow: 1, flexShrink: 1, minWidth: 250 },
  shelfInstruction: { color: "#c9b99f", fontSize: 14, lineHeight: 21, maxWidth: 620 },
  selectionCounter: {
    width: 104,
    height: 72,
    borderWidth: 2,
    borderColor: "#b27d3d",
    borderRadius: 8,
    backgroundColor: "rgba(34, 24, 28, 0.96)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#dc9746",
    shadowOpacity: 0.22,
    shadowRadius: 10,
  },
  selectionCounterValue: { color: "#e2bf7a", fontSize: 22, fontWeight: "900" },
  selectionCounterLabel: { color: "#8e7868", fontSize: 8, letterSpacing: 1.2, fontWeight: "900" },
  workGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14, justifyContent: "center", marginBottom: 20 },
  workCard: {
    width: "100%",
    minHeight: 232,
    flexDirection: "row",
    backgroundColor: "rgba(18, 18, 27, 0.95)",
    borderWidth: 1,
    borderColor: "rgba(126, 91, 64, 0.75)",
    borderRadius: 10,
    padding: 14,
    position: "relative",
    shadowColor: "#000",
    shadowOpacity: 0.42,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
  },
  workCardWide: { width: "48.5%" },
  workCardSelected: {
    borderColor: "#efb960",
    backgroundColor: "rgba(59, 39, 28, 0.97)",
    transform: [{ translateY: -3 }],
    shadowColor: "#f0ad4e",
    shadowOpacity: 0.42,
    shadowRadius: 17,
  },
  orderBadge: { position: "absolute", right: 9, top: 9, zIndex: 2, width: 32, height: 32, borderRadius: 16, backgroundColor: "#e0a44d", borderWidth: 2, borderColor: "#ffe0a2", alignItems: "center", justifyContent: "center" },
  orderBadgeText: { color: "#241921", fontWeight: "900" },
  bookPresentation: { alignItems: "center", alignSelf: "center" },
  bookRest: { width: 118, height: 7, marginTop: 7, borderRadius: 3, backgroundColor: "#6d4027", borderTopWidth: 2, borderTopColor: "#b97946" },
  shelfPlaque: { alignSelf: "flex-start", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 4, borderWidth: 1, borderColor: "#9a6f3d", backgroundColor: "#3c2b20" },
  cover: { width: 104, height: 164, borderWidth: 2, borderRadius: 3, padding: 10, justifyContent: "space-between", shadowColor: "#000", shadowOpacity: 0.55, shadowRadius: 10, shadowOffset: { width: 4, height: 7 } },
  coverCompact: { width: 76, height: 118, padding: 7 },
  coverRule: { height: 2, width: "66%", opacity: 0.8 },
  coverTitle: { color: "#f8ead0", fontSize: 14, lineHeight: 17, fontWeight: "900", textTransform: "uppercase" },
  coverTitleCompact: { fontSize: 11, lineHeight: 13 },
  coverCreator: { fontSize: 9, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
  coverMark: { width: 18, height: 18, borderWidth: 1, borderRadius: 9, alignSelf: "center" },
  workCopy: { flex: 1, paddingLeft: 16, paddingRight: 4 },
  workShelf: { color: "#edc176", fontSize: 9, letterSpacing: 1.15, fontWeight: "900", textTransform: "uppercase" },
  workTitle: { color: "#f1dfbf", fontFamily: "Georgia", fontSize: 19, fontWeight: "900", marginTop: 10 },
  workCreator: { color: "#c3a678", fontSize: 12, marginTop: 3 },
  workBlurb: { color: "#c7b9ae", fontSize: 13, lineHeight: 19, marginTop: 11 },
  counterPrompt: { color: "#f1dfbd", fontFamily: "Georgia", fontSize: 28, lineHeight: 36, fontWeight: "800", textAlign: "center", marginBottom: 26 },
  counterBooks: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "flex-end", gap: 16, paddingHorizontal: 14, paddingBottom: 24, marginBottom: 28, position: "relative" },
  counterBook: { width: 190, minHeight: 242, alignItems: "center", borderWidth: 1, borderColor: "#5a4747", borderRadius: 9, backgroundColor: "rgba(17, 17, 25, 0.95)", padding: 13, zIndex: 2 },
  counterBookActive: { borderColor: "#efb45b", backgroundColor: "rgba(63, 40, 27, 0.98)", transform: [{ translateY: -5 }], shadowColor: "#efac50", shadowOpacity: 0.42, shadowRadius: 18 },
  counterWoodEdge: { position: "absolute", left: 0, right: 0, bottom: 0, height: 20, borderRadius: 7, backgroundColor: "#5b321e", borderWidth: 1, borderColor: "#8d5631" },
  counterWoodHighlight: { height: 3, marginHorizontal: 4, marginTop: 2, backgroundColor: "#bc7844", borderRadius: 2, opacity: 0.8 },
  counterOrder: { color: "#806e65", fontSize: 8, letterSpacing: 1.5, fontWeight: "900", marginBottom: 8 },
  counterBookTitle: { color: "#f0ddbd", fontFamily: "Georgia", fontSize: 14, fontWeight: "900", textAlign: "center", marginTop: 10, minHeight: 36 },
  counterPick: { color: "#796c77", fontSize: 9, fontWeight: "900", letterSpacing: 1.2, marginTop: 8 },
  counterPickActive: { color: "#e2ae66" },
  counterOptions: { width: "100%", maxWidth: 900, alignSelf: "center", flexDirection: "row", flexWrap: "wrap", gap: 14 },
  optionBlock: {
    flexGrow: 1,
    flexBasis: 390,
    backgroundColor: "rgba(17, 17, 26, 0.94)",
    borderWidth: 1,
    borderColor: "#78543b",
    borderRadius: 12,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  optionHeading: { color: "#f1d8aa", fontFamily: "Georgia", fontSize: 18, fontWeight: "900" },
  optionHelp: { color: "#a5949d", fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 12 },
  charmRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  charmChoice: {
    minWidth: 96,
    flexBasis: 96,
    flexGrow: 1,
    minHeight: 136,
    paddingHorizontal: 8,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "#59464f",
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#211922",
  },
  charmChoiceWide: { minWidth: "100%", flexBasis: "100%", minHeight: 120 },
  charmChoiceActive: {
    borderColor: "#d8a55f",
    backgroundColor: "#38251f",
    shadowColor: "#e7a957",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  charmArtwork: {
    width: "100%",
    maxWidth: 118,
    height: 88,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(122, 92, 91, 0.32)",
  },
  charmArtworkActive: { borderBottomColor: "rgba(227, 171, 93, 0.58)" },
  charmChoiceLabel: { color: "#b9a7af", fontSize: 10, lineHeight: 14, fontWeight: "900", letterSpacing: 0.55, marginTop: 8, textTransform: "uppercase", textAlign: "center" },
  charmChoiceLabelActive: { color: "#f4d9ad" },
  candleChoices: { minHeight: 166, flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 8, position: "relative", paddingBottom: 4 },
  candleChoice: {
    flex: 1,
    minWidth: 92,
    maxWidth: 128,
    minHeight: 158,
    paddingHorizontal: 5,
    paddingTop: 2,
    paddingBottom: 9,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "flex-end",
    zIndex: 2,
  },
  candleChoiceActive: {
    borderColor: "#c88a43",
    backgroundColor: "rgba(104, 60, 32, 0.28)",
    shadowColor: "#ef9f3b",
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  candleIllustration: { width: 80, height: 120 },
  candleSvgWrap: { width: 80, height: 120 },
  candleChoiceLabel: {
    minWidth: 78,
    color: "#b9a7af",
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: "#59464f",
    borderRadius: 3,
    backgroundColor: "#211922",
  },
  candleChoiceLabelActive: { color: "#ffe1aa", borderColor: "#d9a050", backgroundColor: "#5a3927" },
  candleTableEdge: { position: "absolute", left: 2, right: 2, bottom: 0, height: 7, borderRadius: 4, backgroundColor: "#5b3827" },
  candleTableHighlight: { height: 2, marginHorizontal: 3, backgroundColor: "#a06e47", opacity: 0.75 },
  charmDescription: { color: "#d0b58e", fontSize: 11, lineHeight: 17, fontStyle: "italic", marginTop: 10 },
  resultPrelude: { color: "#d9c49f", fontFamily: "Georgia", fontSize: 18, lineHeight: 27, textAlign: "center", marginBottom: 20 },
  resultReveal: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    borderWidth: 1,
    borderColor: "#80583a",
    borderRadius: 14,
    backgroundColor: "rgba(27, 19, 25, 0.94)",
    padding: 22,
    marginBottom: 18,
  },
  resultBookColumn: { minWidth: 180, alignItems: "center" },
  resultStoryColumn: { flexGrow: 1, flexShrink: 1, flexBasis: 340, maxWidth: 480 },
  resultChoiceLabel: { color: "#d5a65f", fontSize: 10, letterSpacing: 1.8, fontWeight: "900", marginBottom: 10 },
  resultGlow: {
    padding: 22,
    borderRadius: 90,
    backgroundColor: "rgba(224, 158, 71, 0.18)",
    shadowColor: "#f0a744",
    shadowOpacity: 0.36,
    shadowRadius: 22,
  },
  resultTitle: { color: "#f4dfba", fontFamily: "Georgia", fontSize: 30, lineHeight: 37, fontWeight: "900", marginBottom: 4 },
  resultCreator: { color: "#c9a36d", fontSize: 14, fontWeight: "700", marginBottom: 14 },
  resultDialogue: { position: "relative", borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#74533d", paddingHorizontal: 24, paddingVertical: 16, marginBottom: 14 },
  resultBlurb: { color: "#c9bbad", fontSize: 13, lineHeight: 20 },
  rewardPanel: {
    width: "100%",
    flexDirection: "row",
    backgroundColor: "rgba(25, 20, 27, 0.96)",
    borderWidth: 1,
    borderColor: "#73543e",
    borderRadius: 10,
    paddingVertical: 16,
    marginBottom: 14,
  },
  rewardItem: { flex: 1, alignItems: "center", justifyContent: "center" },
  rewardIcon: { color: "#d9a558", fontSize: 18, marginBottom: 3 },
  rewardValue: { color: "#dfb36c", fontSize: 20, fontWeight: "900" },
  rewardLabel: { color: "#81747e", fontSize: 8, letterSpacing: 1.3, fontWeight: "900", marginTop: 3 },
  rewardDivider: { width: 1, backgroundColor: "#433642" },
  rewardGood: { color: "#8fc7a3", fontSize: 14 },
  rewardQuiet: { color: "#b58f83", fontSize: 14 },
  resultLesson: { color: "#efc985", fontSize: 14, fontWeight: "700", textAlign: "center", marginBottom: 8 },
  resultMemory: { color: "#c8b7aa", fontFamily: "Georgia", fontSize: 15, lineHeight: 23, fontStyle: "italic", textAlign: "center", maxWidth: 560, marginBottom: 12 },
  resultPrimaryButton: { minWidth: 260 },
  storageError: { width: "100%", maxWidth: 700, alignSelf: "center", color: "#f2c17d", backgroundColor: "#38251f", borderWidth: 1, borderColor: "#82533f", padding: 12, marginTop: 12, fontSize: 13, lineHeight: 19, textAlign: "center" },
  nightCompleteTitle: { color: "#f0d9b5", fontFamily: "Georgia", fontSize: 34, fontWeight: "900", textAlign: "center" },
  nightCompleteText: { color: "#aa9da8", fontSize: 15, lineHeight: 23, textAlign: "center", maxWidth: 520, marginTop: 12, marginBottom: 22 },
  ledger: { width: "100%", backgroundColor: "#d8c39e", borderWidth: 6, borderColor: "#49352e", padding: 18, marginBottom: 18, transform: [{ rotate: "-0.4deg" }] },
  ledgerHeading: { color: "#4a342b", fontSize: 12, fontWeight: "900", letterSpacing: 2, textAlign: "center", borderBottomWidth: 1, borderColor: "#9d8665", paddingBottom: 10, marginBottom: 6 },
  ledgerRow: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderColor: "#b7a17f", paddingVertical: 10 },
  ledgerLabel: { color: "#675045", fontSize: 13 },
  ledgerValue: { color: "#39271f", fontSize: 13, fontWeight: "900", maxWidth: "55%", textAlign: "right" },
  endingTitle: { color: "#f0dbb4", fontFamily: "Georgia", fontSize: 38, lineHeight: 45, fontWeight: "900", textAlign: "center", maxWidth: 560 },
  endingStats: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10, marginBottom: 24 },
  endingStat: { color: "#c7ae87", borderWidth: 1, borderColor: "#57443d", paddingVertical: 9, paddingHorizontal: 13, fontSize: 12, fontWeight: "800" },
  textButton: { minHeight: 44, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", marginTop: 8 },
  textButtonText: { color: "#8f7d89", fontSize: 13, textDecorationLine: "underline" },
});

export default withGameReadingAge(LastBookshopRoute, {
  accentColor: "#d9a45f",
  borderColor: "#725945",
  textColor: "#d9c9ad",
  selectedBackgroundColor: "rgba(217, 164, 95, 0.14)",
});
