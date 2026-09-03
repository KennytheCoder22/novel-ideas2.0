import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import {
  DEFAULT_PLAYTEST_FILTERS, parsePlaytestFilters, serializePlaytestFilters,
  type GameId, type GamePlaytestApiResponse, type GamePlaytestReplay, type PlaytestFilters,
} from "../../lib/gamePlaytest/analysis";

const PATH = "/admin/game-playtest";
type Payload = GamePlaytestApiResponse;
const names: Record<string, string> = { media_mania: "Media Mania", the_last_bookshop: "The Last Bookshop", the_unwritten_map: "The Unwritten Map", the_alchemists_cascade: "The Alchemist's Cascade" };
const duration = (ms: number | null) => ms == null ? "Unavailable" : `${Math.round(ms / 1000)}s`;

function Button({ title, onPress, disabled = false, quiet = false }: { title: string; onPress: () => void; disabled?: boolean; quiet?: boolean }) {
  return <TouchableOpacity disabled={disabled} onPress={onPress} style={[styles.button, quiet && styles.quietButton, disabled && styles.disabled]}><Text style={[styles.buttonText, quiet && styles.quietButtonText]}>{title}</Text></TouchableOpacity>;
}

function ReplaySummaryRow({ replay, onOpen }: { replay: GamePlaytestReplay; onOpen: () => void }) {
  const first = replay.checkpoints[0];
  const last = replay.checkpoints.at(-1);
  return <View style={styles.replayRow}>
    <View style={styles.replayRowInfo}>
      <Text style={styles.gameTitle}>{names[replay.game] || replay.game} · {replay.session}</Text>
      <Text style={styles.muted}>{replay.libraryId || "Legacy unscoped record"} · {replay.totalCheckpointCount} checkpoint{replay.totalCheckpointCount === 1 ? "" : "s"}{replay.truncated ? " · showing latest 80" : ""}{first ? ` · ${new Date(first.at).toLocaleString()} → ${last ? new Date(last.at).toLocaleString() : ""}` : ""}</Text>
    </View>
    <Button title="View replay" quiet onPress={onOpen} />
  </View>;
}

function ReplayDetail({ replay }: { replay: GamePlaytestReplay }) {
  return <View style={styles.panel}>
    <Text style={styles.gameTitle}>{names[replay.game] || replay.game} · {replay.session}</Text>
    <Text style={styles.muted}>{replay.libraryId || "Legacy unscoped record"}</Text>
    {replay.truncated ? <Text style={styles.warning}>This bounded replay shows the latest 80 of {replay.totalCheckpointCount} meaningful checkpoints.</Text> : null}
    {replay.checkpoints.length ? replay.checkpoints.map((step, index) => <View key={`${step.at}-${index}`} style={styles.timeline}>
      <Text style={styles.detail}>{new Date(step.at).toLocaleString()} · {step.label}</Text>
      <Text style={styles.body}>{step.detail}{step.choice ? ` — ${step.choice}` : ""}</Text>
      {step.options?.length ? <Text style={styles.muted}>Order: {step.options.join(" → ")}</Text> : null}
    </View>) : <Text style={styles.muted}>No meaningful checkpoints were stored for this session.</Text>}
  </View>;
}

export default function GamePlaytestDashboard() {
  const params = useLocalSearchParams();
  const queryFilters = useMemo(() => {
    try { return parsePlaytestFilters(params as Record<string, unknown>); } catch { return DEFAULT_PLAYTEST_FILTERS; }
  }, [params]);
  const [filters, setFilters] = useState<PlaytestFilters>(queryFilters);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { setFilters(queryFilters); }, [queryFilters]);
  useEffect(() => {
    let alive = true;
    fetch("/api/owner-analytics-session", { credentials: "same-origin" }).then((r) => r.json()).then((body) => alive && setAuthorized(body?.authenticated === true)).catch(() => alive && setAuthorized(false));
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!authorized) return;
    let alive = true; setLoading(true); setError("");
    const query = new URLSearchParams(serializePlaytestFilters(queryFilters)).toString();
    fetch(`/api/game-playtest-report${query ? `?${query}` : ""}`, { credentials: "same-origin" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (response.status === 401) { setAuthorized(false); throw new Error("Your owner session expired."); }
        if (!response.ok || body?.status !== "ok") throw new Error(String(body?.error || "playtest_report_unavailable"));
        if (alive) setData(body as Payload);
      }).catch((reason) => alive && setError(reason instanceof Error ? reason.message : "playtest_report_unavailable"))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [authorized, queryFilters]);

  async function signIn() {
    setAuthError("");
    const response = await fetch("/api/owner-analytics-session", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.authenticated !== true) return setAuthError(body?.error === "owner_analytics_auth_not_configured" ? "Owner analytics authentication is not configured." : "Authentication failed.");
    setPassword(""); setAuthorized(true);
  }
  function apply() { router.replace({ pathname: PATH, params: serializePlaytestFilters(filters) } as never); }
  function openReplay(session: string) {
    const next = { ...filters, session };
    setFilters(next);
    router.replace({ pathname: PATH, params: serializePlaytestFilters(next) } as never);
  }
  function clearSessionFilter() {
    const next = { ...filters, session: "" };
    setFilters(next);
    router.replace({ pathname: PATH, params: serializePlaytestFilters(next) } as never);
  }
  function toggleGame(game: GameId) { setFilters((current) => ({ ...current, games: current.games.includes(game) ? current.games.filter((value) => value !== game) : [...current.games, game] })); }

  if (authorized === null) return <SafeAreaView style={styles.center}><ActivityIndicator color="#eab75a" /><Text style={styles.muted}>Checking owner access…</Text></SafeAreaView>;
  if (!authorized) return <SafeAreaView style={styles.center}><View style={styles.auth}><Text style={styles.title}>Game playtest evaluation</Text><Text style={styles.muted}>Owner access is required. This dashboard is intentionally not linked from patron or librarian navigation.</Text><TextInput value={password} onChangeText={setPassword} onSubmitEditing={() => void signIn()} secureTextEntry autoCapitalize="none" placeholder="Owner credential" placeholderTextColor="#8090a8" style={styles.input} accessibilityLabel="Owner credential" />{authError ? <Text style={styles.error}>{authError}</Text> : null}<Button title="Sign in" onPress={() => void signIn()} disabled={!password} /><Button title="Return home" quiet onPress={() => router.replace("/")} /></View></SafeAreaView>;

  return <SafeAreaView style={styles.root}><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.heading}><View><Text style={styles.title}>Game playtest evaluation</Text><Text style={styles.muted}>Production telemetry only. Evidence classes are intentionally incomparable.</Text></View><Button title="Sign out" quiet onPress={() => { void fetch("/api/owner-analytics-session", { method: "DELETE", credentials: "same-origin" }); setAuthorized(false); }} /></View>
    <View style={styles.filters}><Text style={styles.sectionTitle}>Filters</Text><View style={styles.games}>{(Object.entries(names) as [GameId, string][]).map(([game, label]) => <TouchableOpacity key={game} onPress={() => toggleGame(game)} style={[styles.chip, filters.games.includes(game) && styles.chipActive]}><Text style={styles.chipText}>{label}</Text></TouchableOpacity>)}</View>
      <View style={styles.filterRow}><TextInput value={filters.startDate} onChangeText={(startDate) => setFilters({ ...filters, startDate })} placeholder="Start YYYY-MM-DD" placeholderTextColor="#8090a8" style={styles.smallInput} /><TextInput value={filters.endDate} onChangeText={(endDate) => setFilters({ ...filters, endDate })} placeholder="End YYYY-MM-DD" placeholderTextColor="#8090a8" style={styles.smallInput} /><TextInput value={filters.ageBands.join(",")} onChangeText={(value) => setFilters({ ...filters, ageBands: value.split(",").map((band) => band.trim()).filter(Boolean) })} placeholder="Age bands (Media Mania)" placeholderTextColor="#8090a8" style={styles.smallInput} /><TextInput value={filters.libraryIds.join(",")} onChangeText={(value) => setFilters({ ...filters, libraryIds: value.split(",").map((id) => id.trim()).filter(Boolean) })} placeholder="Library IDs" placeholderTextColor="#8090a8" style={styles.smallInput} /><TextInput value={filters.session} onChangeText={(session) => setFilters({ ...filters, session })} placeholder="Pseudonymous session" placeholderTextColor="#8090a8" style={styles.smallInput} /></View><Button title="Apply filters" onPress={apply} /></View>
    {loading ? <View style={styles.panel}><ActivityIndicator color="#eab75a" /><Text style={styles.muted}>Reading bounded event records…</Text></View> : null}
    {error ? <View style={styles.panel}><Text style={styles.error}>{error}</Text><Text style={styles.muted}>No raw event payloads are returned to the browser.</Text></View> : null}
    {data ? <><View style={styles.panel}><Text style={styles.sectionTitle}>Coverage</Text><Text style={styles.body}>{data.inventory.events} events across {data.inventory.sessions} sessions. {data.inventory.unscopedExcludedByLibraryFilter ? `${data.inventory.unscopedExcludedByLibraryFilter} unscoped legacy events excluded by library filter.` : "Library-scoped records remain isolated."}{data.inventory.malformedRecords ? ` ${data.inventory.malformedRecords} malformed records were excluded.` : ""}</Text>{data.storageGaps.map((gap) => <Text key={gap.game} style={styles.warning}>{names[gap.game] || gap.game}: storage gap — {gap.detail}</Text>)}{data.storageTruncated.map((game) => <Text key={game} style={styles.warning}>{names[game] || game}: read hit its per-game bound — this may not be complete coverage.</Text>)}</View>
      <Text style={styles.sectionTitle}>Playability by game</Text>{data.games.map((game) => <View key={game.game} style={styles.panel}><Text style={styles.gameTitle}>{names[game.game]}</Text><Text style={styles.body}>Observed {game.sessionsObserved} · started {game.sessionsStarted ?? "Unavailable"} · completed {game.sessionsCompleted ?? "Unavailable"} · completion {game.completionRate == null ? "Unavailable" : `${game.completionRate}%`}</Text><Text style={styles.muted}>Median active duration {duration(game.medianDurationMs)} · median decision {duration(game.medianDecisionMs)} · continuations {game.continuations ?? "Unavailable"} · exits {game.exits ?? "Unavailable"} · long pauses {game.longPauses} · usable signals {game.usableSignals}</Text>{Object.entries(game.details).map(([key, value]) => <Text key={key} style={styles.detail}>{key.replace(/([A-Z])/g, " $1")}: {String(value ?? "Unavailable")}</Text>)}</View>)}
      <Text style={styles.sectionTitle}>Evidence efficiency — class-specific</Text><View style={styles.panel}>{data.evidenceClasses.map((item) => <Text key={item.kind} style={styles.body}>{item.kind.replaceAll("_", " ")}: {item.count} events · {item.usableSignalsPerMinute == null ? "not scored" : `${item.usableSignalsPerMinute} usable signals/min`}</Text>)}</View>
      <View style={styles.replayHeading}><Text style={styles.sectionTitle}>Session replay</Text>{filters.session ? <Button title="Back to session list" quiet onPress={clearSessionFilter} /> : null}</View>
      {!data.replays.length ? <View style={styles.panel}><Text style={styles.body}>No matching sessions. Adjust filters or wait for production play.</Text></View>
        : filters.session
          ? data.replays.map((replay) => <ReplayDetail key={`${replay.game}-${replay.libraryId || "unscoped"}-${replay.session}`} replay={replay} />)
          : <View style={styles.panel}>
            <Text style={styles.muted}>Select a session to see its full, in-depth replay. Showing {data.replays.length} session{data.replays.length === 1 ? "" : "s"}.</Text>
            {data.replays.map((replay) => <ReplaySummaryRow key={`${replay.game}-${replay.libraryId || "unscoped"}-${replay.session}`} replay={replay} onOpen={() => openReplay(replay.session)} />)}
          </View>}
    </> : null}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0d1523" }, center: { flex: 1, backgroundColor: "#0d1523", alignItems: "center", justifyContent: "center", padding: 24, gap: 14 }, content: { padding: 20, maxWidth: 1120, width: "100%", alignSelf: "center", gap: 16 }, heading: { flexDirection: "row", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }, title: { color: "#f5f7fb", fontWeight: "700", fontSize: 27 }, sectionTitle: { color: "#f5f7fb", fontSize: 18, fontWeight: "700", marginBottom: 8 }, gameTitle: { color: "#f3c56b", fontSize: 17, fontWeight: "700", marginBottom: 6 }, muted: { color: "#b8c4d6", lineHeight: 21 }, body: { color: "#e2e8f2", lineHeight: 22 }, detail: { color: "#cfdae9", lineHeight: 20, marginTop: 3 }, warning: { color: "#f4c76a", lineHeight: 20, marginTop: 8 }, error: { color: "#ffb4b4", lineHeight: 21 }, panel: { borderWidth: 1, borderColor: "#31435e", backgroundColor: "#142034", padding: 16, gap: 5 }, filters: { borderWidth: 1, borderColor: "#31435e", backgroundColor: "#17253a", padding: 16, gap: 12 }, games: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, chip: { borderWidth: 1, borderColor: "#536985", paddingVertical: 8, paddingHorizontal: 10 }, chipActive: { borderColor: "#eab75a", backgroundColor: "#423617" }, chipText: { color: "#f0f4fa", fontSize: 14 }, filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, input: { color: "#f5f7fb", borderWidth: 1, borderColor: "#536985", padding: 12, width: "100%", marginVertical: 12 }, smallInput: { color: "#f5f7fb", borderWidth: 1, borderColor: "#536985", padding: 10, minWidth: 180, flexGrow: 1 }, button: { backgroundColor: "#eab75a", paddingHorizontal: 14, paddingVertical: 10, alignSelf: "flex-start" }, buttonText: { color: "#1a1710", fontWeight: "700" }, quietButton: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#536985" }, quietButtonText: { color: "#dbe5f2" }, disabled: { opacity: 0.45 }, auth: { width: "100%", maxWidth: 430, borderWidth: 1, borderColor: "#31435e", backgroundColor: "#142034", padding: 22 }, timeline: { borderTopWidth: 1, borderTopColor: "#2c3d57", paddingTop: 10, marginTop: 5 },
  replayHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, replayRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, borderTopWidth: 1, borderTopColor: "#2c3d57", paddingTop: 10, marginTop: 8 }, replayRowInfo: { flex: 1, gap: 2 },
});
