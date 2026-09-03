import { Redirect, useLocalSearchParams } from "expo-router";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";
import { GAME_PLAYTEST_FIXTURE_PARAM, isGamePlaytestFixtureEnabled } from "../../lib/gamePlaytest/fixtures";
import { MEDIA_MANIA_CATALOG } from "../../features/recommendation-games/media-mania/mediaManiaCatalog";
import { LAST_BOOKSHOP_ENCOUNTERS, getCustomer, getWork } from "../../lib/recommendationGames/lastBookshop";
import { UNWRITTEN_MAP_SCENARIOS } from "../../lib/recommendationGames/unwrittenMap";
import { CASCADE_CATALYST_COPY } from "../../lib/recommendationGames/alchemistsCascade";

type FixtureState =
  | "media-mania-start" | "media-mania-like" | "media-mania-dislike" | "media-mania-unknown-replacement" | "media-mania-unlock" | "media-mania-cross-media"
  | "last-bookshop-visitor-shelf" | "last-bookshop-counter" | "last-bookshop-pitch-charm" | "last-bookshop-candle" | "last-bookshop-result"
  | "unwritten-map-exploration" | "unwritten-map-encounter" | "unwritten-map-choice-result" | "unwritten-map-skip-result" | "unwritten-map-journal"
  | "cascade-level-start" | "cascade-board" | "cascade-catalyst-selection" | "cascade-resolved" | "cascade-success" | "cascade-failure-retry";

// Deterministic (stable across runs) picks from the real, production media catalog, so this fixture
// screen shows genuine catalog titles/creators rather than fabricated placeholder names.
const primaryCatalogItem = MEDIA_MANIA_CATALOG.find((item) => item.ageBands.includes("teens")) || MEDIA_MANIA_CATALOG[0];
const crossMediaCatalogItem = MEDIA_MANIA_CATALOG.find((item) => item.ageBands.includes("teens") && item.mediaSource !== primaryCatalogItem.mediaSource)
  || MEDIA_MANIA_CATALOG.find((item) => item.mediaSource !== primaryCatalogItem.mediaSource) || primaryCatalogItem;

function MediaMania({ state }: { state: FixtureState }) {
  const catalogItem = state === "media-mania-cross-media" ? crossMediaCatalogItem : primaryCatalogItem;
  const mode = state === "media-mania-dislike" ? "DISLIKE" : "LIKE";
  return <View style={[styles.screen, styles.media]}>
    <Text style={styles.mediaBrand}>MEDIA MANIA</Text>
    {state === "media-mania-start" ? <><Text style={styles.mediaTitle}>Let&apos;s get ready to play Media Mania!</Text><Text style={styles.mediaCopy}>Tell us what feels like your kind of story. Skip anything you do not know.</Text><View style={styles.mediaButton}><Text>START PLAYING</Text></View></> : <>
      <Text style={styles.mediaRound}>{mode} · ROUND 4 OF 8</Text>
      <View style={styles.poster}><Text style={styles.posterMoon}>✦</Text><Text style={styles.posterTitle}>{catalogItem.title}</Text><Text style={styles.posterMeta}>{catalogItem.mediaSource}{catalogItem.creator ? ` · ${catalogItem.creator}` : ""}</Text></View>
      <Text style={styles.mediaCopy}>{state === "media-mania-unknown-replacement" ? "You marked this one unknown. A fresh candidate is ready." : "Would you want more stories with this feeling?"}</Text>
      <View style={styles.mediaActions}><Text style={styles.like}>{mode === "LIKE" ? "♥ LIKE" : "LIKE"}</Text><Text style={styles.dislike}>{mode === "DISLIKE" ? "× DISLIKE" : "DISLIKE"}</Text><Text style={styles.unknown}>I DON&apos;T KNOW THIS</Text></View>
      {state === "media-mania-unlock" ? <View style={styles.unlock}><Text style={styles.unlockTitle}>A NEW SHELF UNLOCKED</Text><Text style={styles.mediaCopy}>Open graphic novels for your next round?</Text><Text style={styles.unlockChoice}>OPEN THE SHELF</Text></View> : null}
    </>}
  </View>;
}
function BookCover({ workId, selected = false }: { workId: string; selected?: boolean }) {
  const work = getWork(workId);
  return <View style={[styles.book, { backgroundColor: work.coverColor }, selected && styles.bookSelected]}><Text style={[styles.bookAccent, { color: work.coverAccent }]}>✦</Text><Text style={styles.bookTitle}>{work.title}</Text><Text style={styles.bookAuthor}>{work.creator}</Text></View>;
}
function Bookshop({ state }: { state: FixtureState }) {
  const encounter = LAST_BOOKSHOP_ENCOUNTERS[0];
  const customer = getCustomer(encounter.customerId);
  const selected = encounter.shelfIds.slice(0, 3);
  const counter = state !== "last-bookshop-visitor-shelf";
  return <View style={[styles.screen, styles.bookshop]}>
    <Text style={styles.shopHeader}>THE LAST BOOKSHOP</Text><Text style={styles.shopSub}>Night {encounter.night} · {customer.name} waits by the rain-glass window</Text>
    {state === "last-bookshop-result" ? <View style={styles.result}><Text style={styles.resultSymbol}>✦</Text><Text style={styles.resultTitle}>{customer.name} chooses</Text><BookCover workId={selected[1]} selected /><Text style={styles.resultTitle}>{getWork(selected[1]).title}</Text><Text style={styles.resultQuote}>“That&apos;s the one. I knew it would find me.”</Text><Text style={styles.renown}>+3 RENOWN · TRUE INSTINCT</Text></View> : <>
      {!counter ? <><Text style={styles.visitor}>{customer.role}</Text><Text style={styles.request}>“I need a book for a long train ride. Something hopeful, but not too quiet.”</Text><Text style={styles.shelfLabel}>THE SHELF · SIX CANDIDATES</Text><View style={styles.bookRow}>{encounter.shelfIds.map((id) => <BookCover key={id} workId={id} selected={selected.includes(id)} />)}</View><Text style={styles.counterButton}>TAKE THREE TO THE COUNTER</Text></> : <>
        <Text style={styles.shelfLabel}>THE COUNTER · SELECTED IN ORDER</Text><View style={styles.counterRow}>{selected.map((id, index) => <View key={id}><Text style={styles.counterOrder}>COUNTER {index + 1}</Text><BookCover workId={id} selected={index === 1} /></View>)}</View>
        <Text style={styles.counterPrompt}>Which story will {customer.name.split(" ")[0]} carry into the night?</Text>
        <View style={styles.controlRow}><View style={[styles.control, state === "last-bookshop-pitch-charm" && styles.controlActive]}><Text style={styles.controlTitle}>PITCH CHARM</Text><Text style={styles.controlText}>{state === "last-bookshop-pitch-charm" ? "WORLD · A place to get lost in" : "Choose a reason"}</Text></View><View style={[styles.control, state === "last-bookshop-candle" && styles.controlActive]}><Text style={styles.controlTitle}>SET THE CANDLE</Text><Text style={styles.candle}>{state === "last-bookshop-candle" ? "🔥 BLAZING · HIGH" : "◯ Flicker · Steady · Blazing"}</Text></View></View><Text style={styles.counterButton}>RING THE BELL</Text>
      </>}
    </>}
  </View>;
}
function MapFixture({ state }: { state: FixtureState }) {
  const scenario = UNWRITTEN_MAP_SCENARIOS[0];
  const choices = scenario.choices.slice(0, 4);
  return <View style={[styles.screen, styles.map]}>
    <View style={styles.mapHeader}><Text style={styles.mapTitle}>THE UNWRITTEN MAP</Text><Text style={styles.mapNotes}>{state === "unwritten-map-journal" ? "CLOSE NOTES" : "FIELD NOTES"}</Text></View>
    {state === "unwritten-map-journal" ? <View style={styles.journal}><Text style={styles.journalTitle}>FIELD NOTES</Text><Text style={styles.journalEntry}>✓ Lantern Fair — Follow music</Text><Text style={styles.journalEntry}>↩ Undo available · the encounter can be revisited</Text><Text style={styles.journalEntry}>Coast · 2 landmarks discovered</Text></View> : <>
      <View style={styles.mapGrid}>{Array.from({ length: 48 }, (_, index) => <View key={index} style={[styles.tile, index === 21 && styles.player, [5, 6, 26].includes(index) && styles.landmark]}><Text>{index === 21 ? "●" : [5, 6, 26].includes(index) ? "◆" : ""}</Text></View>)}</View>
      {state === "unwritten-map-exploration" ? <><Text style={styles.mapLocation}>NOW EXPLORING · THE COAST</Text><Text style={styles.mapCopy}>Seek the colored landmarks. Your route is never used as a preference.</Text><Text style={styles.dpad}>↑{'\n'}←  ↓  →</Text></> : state.includes("result") ? <View style={styles.mapPanel}><Text style={styles.mapPanelTitle}>{state === "unwritten-map-skip-result" ? "THE PATH REMAINS OPEN" : "A FIELD NOTE TAKES SHAPE"}</Text><Text style={styles.mapCopy}>{state === "unwritten-map-skip-result" ? "You kept exploring. No preference signal was recorded." : `You chose “${choices[1].label}.” The lanterns remember this route.`}</Text><Text style={styles.mapButton}>CONTINUE EXPLORING</Text></View> : <View style={styles.mapPanel}><Text style={styles.mapPanelTitle}>{scenario.title}</Text><Text style={styles.mapCopy}>{scenario.prompt}</Text>{choices.map((choice) => <Text key={choice.id} style={styles.mapChoice}>◆ {choice.label}</Text>)}<Text style={styles.mapSkip}>KEEP EXPLORING</Text></View>}
    </>}
  </View>;
}
function Cascade({ state }: { state: FixtureState }) {
  const result = state === "cascade-success" ? "The recipe lives!" : state === "cascade-failure-retry" ? "The flame went quiet" : null;
  return <View style={[styles.screen, styles.cascade]}>
    {result ? <View style={styles.cascadeResult}><Text style={styles.cascadeGlyph}>{state === "cascade-success" ? "✦" : "◇"}</Text><Text style={styles.cascadeTitle}>{result}</Text><Text style={styles.stars}>{state === "cascade-success" ? "★★★" : "☆☆☆"}</Text><Text style={styles.cascadeCopy}>{state === "cascade-success" ? "The atlas turns its own page. A stranger recipe is waiting." : "Nothing is wasted in alchemy. The board will return exactly from its seed."}</Text><Text style={styles.cascadeButton}>{state === "cascade-success" ? "OPEN THE RECIPE ATLAS" : "REKINDLE THIS RECIPE"}</Text></View> : <>
      <Text style={styles.cascadeHeader}>THE ALCHEMIST&apos;S CASCADE</Text><Text style={styles.level}>LEVEL 1 · THE FIRST INFUSION</Text>
      {state === "cascade-level-start" ? <><Text style={styles.cascadeTitle}>Choose a recipe from the atlas</Text><Text style={styles.cascadeButton}>LIGHT THE FIRST FLAME</Text></> : state === "cascade-catalyst-selection" ? <><Text style={styles.cascadeTitle}>Choose the first whisper</Text>{CASCADE_CATALYST_COPY.map((catalyst, index) => <View key={catalyst.id} style={[styles.catalyst, index === 1 && styles.catalystSelected]}><Text style={styles.catalystName}>{catalyst.manifestation.symbol} {catalyst.title}</Text><Text style={styles.cascadeCopy}>{catalyst.copy}</Text></View>)}<Text style={styles.fate}>LET FATE DECIDE — BEGIN WITHOUT AN INFUSION</Text></> : <><View style={styles.status}><Text>MOVES{'\n'}12</Text><Text>SCORE{'\n'}{state === "cascade-resolved" ? "640" : "180"}</Text><Text>BREW{'\n'}ACTIVE</Text></View><View style={styles.board}>{Array.from({ length: 49 }, (_, index) => <View key={index} style={[styles.gem, { backgroundColor: ["#F36B42", "#55C7B5", "#F6C957", "#9576DA"][index % 4] }]}><Text>{index === 24 ? "✦" : ""}</Text></View>)}</View><Text style={styles.cascadeCopy}>{state === "cascade-resolved" ? "Cascade resolved · 5 ingredients gathered!" : "Match ingredients to complete the recipe."}</Text></>}
    </>}
  </View>;
}
/**
 * IMPORTANT — honesty disclosure for anyone capturing or reviewing screenshots from this route:
 *
 * These are deterministic *visual-state fixtures*, not frame-exact mounts of the real game routes
 * (`/media-mania`, `/games/last-bookshop`, `/games/unwritten-map`, `/games/alchemists-cascade`).
 * Each screen below is a bespoke presentational layout that reuses real production content and
 * contracts where practical — actual catalog titles/creators (`MEDIA_MANIA_CATALOG`), actual
 * encounter/customer/work data (`LAST_BOOKSHOP_ENCOUNTERS`, `getCustomer`, `getWork`), actual
 * scenario copy (`UNWRITTEN_MAP_SCENARIOS`), and actual catalyst copy (`CASCADE_CATALYST_COPY`) —
 * but it does not render the production screens themselves, so layout, chrome, and interaction
 * details will differ from what a patron actually sees in play. Do not present captures from this
 * route as literal gameplay recordings; describe them as illustrative production-content fixtures.
 */
export default function GamePlaytestFixturesRoute() {
  const params = useLocalSearchParams();
  const param = Array.isArray(params[GAME_PLAYTEST_FIXTURE_PARAM]) ? params[GAME_PLAYTEST_FIXTURE_PARAM][0] : params[GAME_PLAYTEST_FIXTURE_PARAM];
  const state = String(param) as FixtureState;
  if (!isGamePlaytestFixtureEnabled(state)) return <Redirect href="/" />;
  const screen = state.startsWith("media-mania") ? <MediaMania state={state} /> : state.startsWith("last-bookshop") ? <Bookshop state={state} /> : state.startsWith("unwritten-map") ? <MapFixture state={state} /> : <Cascade state={state} />;
  const sentinel = `game-playtest-fixture:${state}`;
  return <SafeAreaView style={styles.root} testID={sentinel} accessibilityLabel={sentinel}>{screen}</SafeAreaView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#101811" }, screen: { flex: 1, width: "100%", maxWidth: 1040, alignSelf: "center", padding: 22, justifyContent: "center" },
  media: { backgroundColor: "#f8f1df", alignItems: "center" }, mediaBrand: { color: "#3e2969", fontSize: 15, fontWeight: "900", letterSpacing: 4 }, mediaTitle: { color: "#352353", fontSize: 35, fontWeight: "900", textAlign: "center", marginTop: 28 }, mediaRound: { color: "#7655a8", fontWeight: "900", marginBottom: 12 }, poster: { width: 300, minHeight: 270, padding: 25, justifyContent: "flex-end", backgroundColor: "#44306f", borderRadius: 12, marginVertical: 12 }, posterMoon: { color: "#f7d46a", fontSize: 50, position: "absolute", top: 22, right: 30 }, posterTitle: { color: "#fff9e7", fontSize: 26, fontWeight: "900" }, posterMeta: { color: "#e7ddff", marginTop: 8 }, mediaCopy: { color: "#54456d", fontSize: 16, lineHeight: 23, textAlign: "center", maxWidth: 600, marginVertical: 12 }, mediaActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10 }, like: { color: "#fff", backgroundColor: "#bd3763", padding: 14, fontWeight: "900" }, dislike: { color: "#fff", backgroundColor: "#5e5b75", padding: 14, fontWeight: "900" }, unknown: { color: "#49346d", borderWidth: 2, borderColor: "#7d609d", padding: 12, fontWeight: "900" }, mediaButton: { padding: 16, backgroundColor: "#f0bf4d", marginTop: 18 }, unlock: { alignItems: "center", marginTop: 18, padding: 16, borderWidth: 2, borderColor: "#e0af39", backgroundColor: "#fff8df" }, unlockTitle: { color: "#7a4e13", fontWeight: "900", letterSpacing: 1.5 }, unlockChoice: { color: "#fff", backgroundColor: "#754e9d", padding: 12, fontWeight: "900" },
  bookshop: { backgroundColor: "#1c131a" }, shopHeader: { color: "#f2d7a0", fontSize: 25, fontWeight: "900", letterSpacing: 2, textAlign: "center" }, shopSub: { color: "#c19b76", textAlign: "center", marginVertical: 10 }, visitor: { color: "#f6e9d2", fontSize: 20, fontWeight: "800" }, request: { color: "#e4cbb1", fontSize: 16, lineHeight: 24, marginVertical: 12 }, shelfLabel: { color: "#d9a761", fontSize: 12, fontWeight: "900", letterSpacing: 1.5, marginVertical: 9 }, bookRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, book: { width: 104, minHeight: 138, padding: 9, justifyContent: "space-between", borderWidth: 1, borderColor: "#dcbd83" }, bookSelected: { borderWidth: 3, borderColor: "#f6d566" }, bookAccent: { fontSize: 22 }, bookTitle: { color: "#fff8e8", fontSize: 12, fontWeight: "900" }, bookAuthor: { color: "#e5cfad", fontSize: 9 }, counterButton: { color: "#2a160b", backgroundColor: "#e6b968", padding: 13, fontWeight: "900", textAlign: "center", alignSelf: "center", marginTop: 16 }, counterRow: { flexDirection: "row", justifyContent: "center", gap: 14 }, counterOrder: { color: "#b88b55", fontSize: 9, marginBottom: 4, fontWeight: "900" }, counterPrompt: { color: "#f5e4c9", textAlign: "center", fontSize: 17, marginVertical: 15 }, controlRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center" }, control: { borderWidth: 1, borderColor: "#87644a", padding: 12, minWidth: 210 }, controlActive: { borderColor: "#ffd469", backgroundColor: "#453020" }, controlTitle: { color: "#eac77d", fontWeight: "900" }, controlText: { color: "#f1e4d0", marginTop: 5 }, candle: { color: "#ffca60", marginTop: 5 }, result: { alignItems: "center" }, resultSymbol: { color: "#f6d566", fontSize: 58 }, resultTitle: { color: "#fff0d6", fontSize: 23, fontWeight: "900", textAlign: "center", marginVertical: 8 }, resultQuote: { color: "#e6cba6", fontStyle: "italic", textAlign: "center", margin: 12 }, renown: { color: "#f3c967", fontWeight: "900" },
  map: { backgroundColor: "#101811", justifyContent: "flex-start" }, mapHeader: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 3, borderColor: "#080d09", paddingBottom: 12 }, mapTitle: { color: "#edf0ae", fontWeight: "900", letterSpacing: 1.5 }, mapNotes: { color: "#cbdc82", fontSize: 11, fontWeight: "900" }, mapGrid: { alignSelf: "center", flexDirection: "row", flexWrap: "wrap", width: 384, marginTop: 18, borderWidth: 4, borderColor: "#273927" }, tile: { width: 48, height: 42, backgroundColor: "#7da65d", borderWidth: 1, borderColor: "#678c50", alignItems: "center", justifyContent: "center" }, landmark: { backgroundColor: "#d8a54a" }, player: { backgroundColor: "#cbdc82" }, mapLocation: { color: "#edf0ae", fontWeight: "900", textAlign: "center", marginTop: 15 }, mapCopy: { color: "#d1dca4", lineHeight: 22, textAlign: "center", margin: 10 }, dpad: { color: "#edf0ae", textAlign: "center", fontSize: 22, fontWeight: "900" }, mapPanel: { borderWidth: 3, borderColor: "#cbdc82", backgroundColor: "#273927", padding: 16, marginTop: 15 }, mapPanelTitle: { color: "#edf0ae", fontSize: 21, fontWeight: "900", textAlign: "center" }, mapChoice: { color: "#edf0ae", borderWidth: 1, borderColor: "#91a95d", padding: 10, marginTop: 7, fontWeight: "800" }, mapSkip: { color: "#cbdc82", textAlign: "center", padding: 12, fontWeight: "900" }, mapButton: { color: "#142017", backgroundColor: "#cbdc82", textAlign: "center", padding: 12, fontWeight: "900", marginTop: 10 }, journal: { borderWidth: 3, borderColor: "#cbdc82", padding: 18, marginTop: 24, backgroundColor: "#273927" }, journalTitle: { color: "#edf0ae", fontSize: 22, fontWeight: "900" }, journalEntry: { color: "#d8e59d", paddingVertical: 10, borderBottomWidth: 1, borderColor: "#526946" },
  cascade: { backgroundColor: "#161922", alignItems: "center" }, cascadeHeader: { color: "#f6c957", fontWeight: "900", letterSpacing: 2, textAlign: "center" }, level: { color: "#f5ecdd", fontWeight: "800", marginVertical: 12 }, cascadeTitle: { color: "#fff8e8", fontSize: 28, fontWeight: "900", textAlign: "center", margin: 13 }, cascadeCopy: { color: "#c9c3b8", lineHeight: 21, textAlign: "center", maxWidth: 600 }, cascadeButton: { backgroundColor: "#f6c957", color: "#211a08", padding: 15, fontWeight: "900", textAlign: "center", marginTop: 18 }, catalyst: { width: "100%", maxWidth: 560, borderWidth: 2, borderColor: "#7b718a", padding: 13, marginTop: 9 }, catalystSelected: { borderColor: "#f6c957", backgroundColor: "#29283a" }, catalystName: { color: "#f6c957", fontSize: 17, fontWeight: "900" }, fate: { color: "#e9dfce", borderWidth: 1, borderColor: "#756c60", padding: 13, textAlign: "center", marginTop: 14, fontWeight: "800" }, status: { flexDirection: "row", width: "100%", maxWidth: 500, justifyContent: "space-around", color: "#f5ecdd", margin: 12 }, board: { width: 350, flexDirection: "row", flexWrap: "wrap", borderWidth: 4, borderColor: "#4d4b60" }, gem: { width: 50, height: 50, borderWidth: 2, borderColor: "#252434", alignItems: "center", justifyContent: "center" }, cascadeResult: { alignItems: "center", maxWidth: 600 }, cascadeGlyph: { color: "#f6c957", fontSize: 70 }, stars: { color: "#f6c957", fontSize: 30, letterSpacing: 4 },
});
