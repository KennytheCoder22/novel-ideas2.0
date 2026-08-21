import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  DEFAULT_HUMAN_REVIEW_DASHBOARD_FILTERS,
  parseHumanReviewDashboardFilters,
  serializeHumanReviewDashboardFilters,
  type HumanReviewDashboardFilters,
} from "../../lib/humanReview/dashboard";
import {
  isPreviewAcceptanceHarnessEnabled,
  PREVIEW_ACCEPTANCE_QUERY_PARAM,
  readPreviewAcceptanceDashboardModeFromDocument,
  type PreviewAcceptanceDashboardMode,
  writePreviewAcceptanceDashboardModeCookie,
} from "../../lib/previewAcceptanceHarness";

const DASHBOARD_PATH = "/admin/human-review";

type DashboardPayload = {
  status: "ok";
  storageMode: string;
  datasetInventory: {
    realReviews: number;
    syntheticReviews: number;
  };
  summary: {
    completedReviewSubmissions: number;
    [key: string]: any;
  };
  swipeCardPerformanceStorageMode: "durable_postgres" | "durable_blob" | "unavailable" | "error";
  swipeCardPerformanceError: string | null;
  swipeCardPerformance: SwipeCardPerformanceRow[];
  realSessionAuditStorageMode: "durable_blob" | "unavailable" | "error";
  realSessionAuditError: string | null;
  realSessionAudits: RealSessionAuditRow[];
  incompleteReviewDrafts: Array<{
    snapshotId: string;
    ageBand: string;
    updatedAt: string;
    completedItems: number;
    totalItems: number;
  }>;
  [key: string]: any;
};

type SwipeCardPerformanceSort = "highest_skip_rate" | "lowest_recognition_rate" | "most_shown" | "highest_recognition_rate";

type SwipeCardPerformanceRow = {
  cardId: string;
  cardType: string;
  title: string;
  ageBand: string;
  timesShown: number;
  likes: number;
  dislikes: number;
  skips: number;
  recognitionRate: number;
  utilityMetric: number;
};

type RealSessionAuditRow = {
  auditId: string;
  libraryId: string;
  libraryScope: "default" | "hosted";
  patronHash: string;
  ageBand: string;
  likes: number;
  dislikes: number;
  skips: number;
  dominantTaste: Record<string, Array<{ value: string; weight: number }>>;
  localQueries: string[];
  searchPlan: {
    intents: Array<{ query: string }>;
    sourcePlans: Array<{ source: string; intents: Array<{ query: string }> }>;
  };
  finalRecommendations: Array<{ id: string; title: string; source: string }>;
  recentOverlaps: Array<{ auditId: string; patronHash: string; overlapCount: number; overlapPercent: number }>;
  createdAt: string;
};

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isValidDashboardPayload(payload: unknown): payload is DashboardPayload {
  if (!isRecord(payload)) return false;
  if (payload.status !== "ok") return false;
  if (!isRecord(payload.datasetInventory)) return false;
  if (!Number.isFinite(payload.datasetInventory.realReviews)) return false;
  if (!Number.isFinite(payload.datasetInventory.syntheticReviews)) return false;
  if (!isRecord(payload.summary)) return false;
  if (!Number.isFinite(payload.summary.completedReviewSubmissions)) return false;
  if (!Array.isArray(payload.swipeCardPerformance)) return false;
  if (!Array.isArray(payload.realSessionAudits)) return false;
  if (!Array.isArray(payload.incompleteReviewDrafts)) return false;
  return true;
}

function labelAgeBand(value: string): string {
  if (value === "kids") return "Kids";
  if (value === "preteens") return "Pre-Teen";
  if (value === "teens") return "Teen";
  if (value === "adult") return "Adult";
  return value || "Unknown";
}

function labelDecision(value: string): string {
  if (value === "weak_recommend") return "Weak Recommend";
  if (value === "not_recommended") return "Not Recommended";
  if (value === "recommend") return "Recommend";
  if (value === "yes") return "Yes";
  if (value === "no") return "No";
  if (value === "unsure") return "Unsure";
  return value;
}

function labelTag(value: string): string {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatMetric(value: number | null): string {
  if (value == null) return "Unavailable";
  return String(value);
}

function formatPercent(value: number | null): string {
  if (value == null) return "Unavailable";
  return `${value}%`;
}

function hasActiveFilters(filters: HumanReviewDashboardFilters): boolean {
  return Object.entries(filters).some(([_, value]) => {
    if (Array.isArray(value)) return value.length > 0;
    return Boolean(String(value || "").trim());
  });
}

function MetricCard({ label, value, help }: { label: string; value: string; help?: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {help ? <Text style={styles.metricHelp}>{help}</Text> : null}
    </View>
  );
}

function ChipGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (!options.length) return null;
  return (
    <View style={styles.filterBlock}>
      <Text style={styles.filterLabel}>{title}</Text>
      <View style={styles.chipWrap}>
        {options.map((option) => {
          const active = selected.includes(option);
          return (
            <TouchableOpacity
              key={`${title}-${option}`}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onToggle(option)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {title === "Age band"
                  ? labelAgeBand(option)
                  : title === "Decision" || title === "Slate decision"
                    ? labelDecision(option)
                    : title.includes("Concern")
                      ? labelTag(option)
                      : option}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function updateArrayFilter(filters: HumanReviewDashboardFilters, key: keyof HumanReviewDashboardFilters, value: string) {
  const current = Array.isArray(filters[key]) ? [...(filters[key] as string[])] : [];
  const next = current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value];
  return { ...filters, [key]: next };
}

export default function HumanReviewDashboardRoute() {
  const params = useLocalSearchParams();
  const paramsKey = JSON.stringify(params);
  const previewAcceptanceFlag = Array.isArray(params[PREVIEW_ACCEPTANCE_QUERY_PARAM])
    ? params[PREVIEW_ACCEPTANCE_QUERY_PARAM][0]
    : params[PREVIEW_ACCEPTANCE_QUERY_PARAM];
  const queryFilters = useMemo(
    () => parseHumanReviewDashboardFilters(params as Record<string, unknown>),
    [paramsKey]
  );
  const previewAcceptanceHarnessVisible = useMemo(
    () => isPreviewAcceptanceHarnessEnabled(previewAcceptanceFlag),
    [previewAcceptanceFlag]
  );
  const [draftFilters, setDraftFilters] = useState<HumanReviewDashboardFilters>(queryFilters);
  const [authorized, setAuthorized] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [ownerPassword, setOwnerPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showInternalIds, setShowInternalIds] = useState(false);
  const [swipeCardSort, setSwipeCardSort] = useState<SwipeCardPerformanceSort>("most_shown");
  const [previewAcceptanceMode, setPreviewAcceptanceMode] = useState<PreviewAcceptanceDashboardMode>(() =>
    readPreviewAcceptanceDashboardModeFromDocument()
  );

  useEffect(() => {
    setDraftFilters(queryFilters);
  }, [queryFilters]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/owner-analytics-session", { credentials: "same-origin" })
      .then((response) => response.json())
      .then((payload) => {
        if (!cancelled) setAuthorized(payload?.authenticated === true);
      })
      .catch(() => {
        if (!cancelled) setAuthorized(false);
      })
      .finally(() => {
        if (!cancelled) setAuthChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;
    const query = new URLSearchParams(serializeHumanReviewDashboardFilters(queryFilters)).toString();

    async function load() {
      setLoading(true);
      setError("");
      setData(null);
      try {
        const response = await fetch(`/api/human-review-dashboard${query ? `?${query}` : ""}`, {
          credentials: "same-origin",
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const errorCode = String((payload as any)?.error || `dashboard_http_${response.status}`);
          if (response.status === 401 || errorCode === "owner_session_required") {
            setAuthorized(false);
            setAuthError("Your owner session expired. Sign in again.");
            return;
          }
          throw new Error(errorCode);
        }
        if (!isValidDashboardPayload(payload)) {
          throw new Error("malformed_dashboard_payload");
        }
        if (!cancelled) {
          setData(payload);
        }
      } catch (loadError: any) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [authorized, queryFilters, previewAcceptanceMode]);

  function applyFilters() {
    const nextParams = serializeHumanReviewDashboardFilters(draftFilters);
    if (previewAcceptanceHarnessVisible) nextParams[PREVIEW_ACCEPTANCE_QUERY_PARAM] = "1";
    router.replace({
      pathname: DASHBOARD_PATH,
      params: nextParams,
    } as any);
  }

  function clearFilters() {
    const cleared = { ...DEFAULT_HUMAN_REVIEW_DASHBOARD_FILTERS };
    setDraftFilters(cleared);
    if (previewAcceptanceHarnessVisible) {
      router.replace({
        pathname: DASHBOARD_PATH,
        params: { [PREVIEW_ACCEPTANCE_QUERY_PARAM]: "1" },
      } as any);
      return;
    }
    router.replace(DASHBOARD_PATH as any);
  }

  function setPreviewAcceptanceModeValue(mode: PreviewAcceptanceDashboardMode) {
    writePreviewAcceptanceDashboardModeCookie(mode);
    setPreviewAcceptanceMode(mode);
  }

  async function authenticateOwner() {
    setAuthSubmitting(true);
    setAuthError("");
    try {
      const response = await fetch("/api/owner-analytics-session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: ownerPassword }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.authenticated !== true) {
        throw new Error(String(payload?.error || "owner_authentication_failed"));
      }
      setOwnerPassword("");
      setAuthorized(true);
    } catch (authFailure: any) {
      const code = authFailure instanceof Error ? authFailure.message : String(authFailure);
      setAuthError(
        code === "owner_analytics_auth_not_configured"
          ? "Owner analytics authentication is not configured."
          : "Authentication failed.",
      );
    } finally {
      setAuthSubmitting(false);
      setAuthChecking(false);
    }
  }

  async function signOutOwner() {
    await fetch("/api/owner-analytics-session", { method: "DELETE", credentials: "same-origin" }).catch(() => null);
    setAuthorized(false);
    setData(null);
  }

  if (authChecking) {
    return (
      <SafeAreaView style={styles.loadingRoot}>
        <ActivityIndicator size="large" color="#fbbf24" />
        <Text style={styles.loadingText}>Checking owner access…</Text>
      </SafeAreaView>
    );
  }

  if (!authorized) {
    return (
      <SafeAreaView style={styles.loadingRoot}>
        <View style={styles.ownerAuthCard}>
          <Text style={styles.headerTitle}>Owner Analytics</Text>
          <Text style={styles.loadingText}>Enter the owner/developer credential to continue.</Text>
          <TextInput
            value={ownerPassword}
            onChangeText={setOwnerPassword}
            onSubmitEditing={() => void authenticateOwner()}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Owner credential"
            placeholderTextColor="#93a4bd"
            style={styles.ownerAuthInput}
            accessibilityLabel="Owner analytics credential"
          />
          {authError ? <Text style={styles.ownerAuthError}>{authError}</Text> : null}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => void authenticateOwner()}
            disabled={authSubmitting || !ownerPassword}
          >
            <Text style={styles.primaryButtonText}>{authSubmitting ? "Signing in…" : "Sign in"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => router.replace("/")}>
            <Text style={styles.secondaryButtonText}>Return home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const dashboardState: "loading" | "failure" | "empty" | "success" = (() => {
    if (loading) return "loading";
    if (error) return "failure";
    if (!data) return "failure";
    const totalEvidence = data.datasetInventory.realReviews + data.datasetInventory.syntheticReviews;
    return totalEvidence > 0
      || (data.incompleteReviewDrafts || []).length > 0
      || (data.swipeCardPerformance || []).length > 0
      || (data.realSessionAudits || []).length > 0
      ? "success"
      : "empty";
  })();

  const summary = data?.summary;
  const filterOptions = data?.filterOptions || {};
  const activeFilters = data?.appliedFilters || queryFilters;
  const swipeCardRows = [...(data?.swipeCardPerformance || [])].sort((a, b) => {
    if (swipeCardSort === "highest_skip_rate") {
      return (b.timesShown ? b.skips / b.timesShown : 0) - (a.timesShown ? a.skips / a.timesShown : 0);
    }
    if (swipeCardSort === "lowest_recognition_rate") return a.recognitionRate - b.recognitionRate;
    if (swipeCardSort === "highest_recognition_rate") return b.recognitionRate - a.recognitionRate;
    return b.timesShown - a.timesShown;
  });

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Human Review Dashboard</Text>
          <Text style={styles.headerSubtitle}>
            Auditable evidence from Human Review submissions. Derived views only — no record mutation.
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerButton} onPress={() => void signOutOwner()}>
            <Text style={styles.headerButtonText}>Sign out</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={() => router.push("/" as any)}>
            <Text style={styles.headerButtonText}>NovelIdeas Home</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.storageRow}>
          {dashboardState === "loading" ? (
            <Text style={styles.storageBadge}>Loading dashboard data…</Text>
          ) : dashboardState === "failure" ? (
            <Text style={styles.storageBadge}>Dashboard data unavailable</Text>
          ) : (
            <>
              <Text style={styles.storageBadge}>Storage: {String(data?.storageMode || "unknown")}</Text>
              <Text style={styles.storageMeta}>
                Completed reviews: {data?.datasetInventory.realReviews} · Incomplete drafts: {data?.incompleteReviewDrafts.length} · Synthetic fixtures: {data?.datasetInventory.syntheticReviews}
              </Text>
            </>
          )}
        </View>

        {previewAcceptanceHarnessVisible ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Preview Acceptance Harness</Text>
            <Text style={styles.sectionSubtitle}>
              Preview-only controls for manual dashboard acceptance. Production defaults remain unchanged.
            </Text>
            <View style={styles.filterActions}>
              <TouchableOpacity
                style={[styles.secondaryButton, previewAcceptanceMode === "live" && styles.previewModeActive]}
                onPress={() => setPreviewAcceptanceModeValue("live")}
              >
                <Text style={styles.secondaryButtonText}>Use live evidence</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryButton, previewAcceptanceMode === "fixtures" && styles.previewModeActive]}
                onPress={() => setPreviewAcceptanceModeValue("fixtures")}
              >
                <Text style={styles.secondaryButtonText}>Load acceptance fixtures</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryButton, previewAcceptanceMode === "failure" && styles.previewModeActive]}
                onPress={() => setPreviewAcceptanceModeValue("failure")}
              >
                <Text style={styles.secondaryButtonText}>Force unavailable state</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.inlineNote}>Current preview mode: {previewAcceptanceMode}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Filters</Text>
            {hasActiveFilters(activeFilters) ? (
              <Text style={styles.sectionSubtitle}>Active filters are reflected in the URL.</Text>
            ) : (
              <Text style={styles.sectionSubtitle}>No filters active.</Text>
            )}
          </View>

          <View style={styles.inputRow}>
            <View style={styles.inputBlock}>
              <Text style={styles.filterLabel}>Start date</Text>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#6b7d98"
                value={draftFilters.startDate}
                onChangeText={(value) => setDraftFilters((prev) => ({ ...prev, startDate: value }))}
              />
            </View>
            <View style={styles.inputBlock}>
              <Text style={styles.filterLabel}>End date</Text>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#6b7d98"
                value={draftFilters.endDate}
                onChangeText={(value) => setDraftFilters((prev) => ({ ...prev, endDate: value }))}
              />
            </View>
          </View>

          <View style={styles.inputRow}>
            <View style={styles.inputBlock}>
              <Text style={styles.filterLabel}>Recommendation title</Text>
              <TextInput
                style={styles.input}
                placeholder="Search title"
                placeholderTextColor="#6b7d98"
                value={draftFilters.titleQuery}
                onChangeText={(value) => setDraftFilters((prev) => ({ ...prev, titleQuery: value }))}
              />
            </View>
            <View style={styles.inputBlock}>
              <Text style={styles.filterLabel}>Author</Text>
              <TextInput
                style={styles.input}
                placeholder="Search author"
                placeholderTextColor="#6b7d98"
                value={draftFilters.authorQuery}
                onChangeText={(value) => setDraftFilters((prev) => ({ ...prev, authorQuery: value }))}
              />
            </View>
          </View>

          <ChipGroup
            title="Age band"
            options={filterOptions.ageBands || []}
            selected={draftFilters.ageBands}
            onToggle={(value) => setDraftFilters((prev) => updateArrayFilter(prev, "ageBands", value))}
          />
          <ChipGroup
            title="Source"
            options={filterOptions.sources || []}
            selected={draftFilters.sources}
            onToggle={(value) => setDraftFilters((prev) => updateArrayFilter(prev, "sources", value))}
          />
          <ChipGroup
            title="Genre / lane"
            options={filterOptions.lanes || []}
            selected={draftFilters.lanes}
            onToggle={(value) => setDraftFilters((prev) => updateArrayFilter(prev, "lanes", value))}
          />
          <ChipGroup
            title="Rank"
            options={filterOptions.ranks || []}
            selected={draftFilters.ranks}
            onToggle={(value) => setDraftFilters((prev) => updateArrayFilter(prev, "ranks", value))}
          />
          <ChipGroup
            title="Familiarity"
            options={filterOptions.familiarity || []}
            selected={draftFilters.familiarity}
            onToggle={(value) => setDraftFilters((prev) => updateArrayFilter(prev, "familiarity", value))}
          />
          <ChipGroup
            title="Expected enjoyment"
            options={filterOptions.expectedEnjoyments || []}
            selected={draftFilters.expectedEnjoyments}
            onToggle={(value) => setDraftFilters((prev) => updateArrayFilter(prev, "expectedEnjoyments", value))}
          />
          <ChipGroup
            title="Taste fit"
            options={filterOptions.tasteFits || []}
            selected={draftFilters.tasteFits}
            onToggle={(value) => setDraftFilters((prev) => updateArrayFilter(prev, "tasteFits", value))}
          />
          <ChipGroup
            title="Novelty"
            options={filterOptions.novelties || []}
            selected={draftFilters.novelties}
            onToggle={(value) => setDraftFilters((prev) => updateArrayFilter(prev, "novelties", value))}
          />
          <ChipGroup
            title="Confidence"
            options={filterOptions.confidences || []}
            selected={draftFilters.confidences}
            onToggle={(value) => setDraftFilters((prev) => updateArrayFilter(prev, "confidences", value))}
          />
          <ChipGroup
            title="Decision"
            options={filterOptions.decisions || []}
            selected={draftFilters.decisions}
            onToggle={(value) => setDraftFilters((prev) => updateArrayFilter(prev, "decisions", value))}
          />
          <ChipGroup
            title="Concern tags"
            options={filterOptions.concernTags || []}
            selected={draftFilters.concernTags}
            onToggle={(value) => setDraftFilters((prev) => updateArrayFilter(prev, "concernTags", value))}
          />
          <ChipGroup
            title="Slate decision"
            options={filterOptions.slateDecisions || []}
            selected={draftFilters.slateDecisions}
            onToggle={(value) => setDraftFilters((prev) => updateArrayFilter(prev, "slateDecisions", value))}
          />
          <ChipGroup
            title="Rubric version"
            options={filterOptions.rubricVersions || []}
            selected={draftFilters.rubricVersions}
            onToggle={(value) => setDraftFilters((prev) => updateArrayFilter(prev, "rubricVersions", value))}
          />
          <ChipGroup
            title="Schema version"
            options={filterOptions.schemaVersions || []}
            selected={draftFilters.schemaVersions}
            onToggle={(value) => setDraftFilters((prev) => updateArrayFilter(prev, "schemaVersions", value))}
          />
          <ChipGroup
            title="Dataset"
            options={filterOptions.datasets || []}
            selected={draftFilters.datasets}
            onToggle={(value) => setDraftFilters((prev) => updateArrayFilter(prev, "datasets", value))}
          />
          <ChipGroup
            title="Completion state"
            options={filterOptions.completionStates || []}
            selected={draftFilters.completionStates}
            onToggle={(value) => setDraftFilters((prev) => updateArrayFilter(prev, "completionStates", value))}
          />

          <TouchableOpacity
            style={styles.toggleButton}
            onPress={() => setShowAdvancedFilters((prev) => !prev)}
          >
            <Text style={styles.toggleButtonText}>
              {showAdvancedFilters ? "Hide advanced filters" : "Show advanced filters"}
            </Text>
          </TouchableOpacity>

          {showAdvancedFilters ? (
            <>
              <View style={styles.inputRow}>
                <View style={styles.inputBlock}>
                  <Text style={styles.filterLabel}>Profile ID or label</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="runtime-adult-… or fixture label"
                    placeholderTextColor="#6b7d98"
                    value={draftFilters.profileQuery}
                    onChangeText={(value) => setDraftFilters((prev) => ({ ...prev, profileQuery: value }))}
                  />
                </View>
                <View style={styles.inputBlock}>
                  <Text style={styles.filterLabel}>Snapshot / slate ID</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="hrs-…"
                    placeholderTextColor="#6b7d98"
                    value={draftFilters.snapshotQuery}
                    onChangeText={(value) => setDraftFilters((prev) => ({ ...prev, snapshotQuery: value }))}
                  />
                </View>
              </View>
              <View style={styles.inputRow}>
                <View style={styles.inputBlock}>
                  <Text style={styles.filterLabel}>Reviewer / session identifier</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Admin-only reviewer search"
                    placeholderTextColor="#6b7d98"
                    value={draftFilters.reviewerQuery}
                    onChangeText={(value) => setDraftFilters((prev) => ({ ...prev, reviewerQuery: value }))}
                  />
                </View>
                <View style={styles.inputBlock}>
                  <Text style={styles.filterLabel}>Local collection identity</Text>
                  <Text style={styles.inlineNote}>
                    {data?.fieldAvailability?.localLibraryIdsAvailable
                      ? "Available through source-derived identifiers below."
                      : "No local-collection identifiers are present in the current filtered evidence."}
                  </Text>
                </View>
              </View>
              <ChipGroup
                title="Local collection ID"
                options={filterOptions.libraryIds || []}
                selected={draftFilters.libraryIds}
                onToggle={(value) => setDraftFilters((prev) => updateArrayFilter(prev, "libraryIds", value))}
              />
            </>
          ) : null}

          <View style={styles.filterActions}>
            <TouchableOpacity style={styles.primaryButton} onPress={applyFilters}>
              <Text style={styles.primaryButtonText}>Apply filters</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={clearFilters}>
              <Text style={styles.secondaryButtonText}>Clear all filters</Text>
            </TouchableOpacity>
          </View>
        </View>

        {dashboardState === "loading" ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#fbbf24" />
            <Text style={styles.loadingText}>Loading dashboard data…</Text>
          </View>
        ) : null}

        {dashboardState === "failure" ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Dashboard data unavailable</Text>
            <Text style={styles.errorText}>Repository/API error: {error || "unknown_dashboard_error"}</Text>
          </View>
        ) : null}

        {dashboardState === "empty" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>No review evidence exists yet</Text>
            <Text style={styles.sectionSubtitle}>
              No real reviews or synthetic fixtures have been persisted for the selected filters.
            </Text>
          </View>
        ) : null}

        {dashboardState === "success" && data ? (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Incomplete Human Reviews</Text>
              <Text style={styles.sectionSubtitle}>
                Partial reviews are saved automatically and kept separate from completed-review metrics.
              </Text>
              {data.incompleteReviewDrafts.map((draft) => (
                <View key={`${draft.snapshotId}:${draft.updatedAt}`} style={styles.storyCard}>
                  <Text style={styles.storyTitle}>
                    {labelAgeBand(draft.ageBand)} · {draft.completedItems}/{draft.totalItems} recommendations answered
                  </Text>
                  <Text style={styles.storyMeta}>Last saved {new Date(draft.updatedAt).toLocaleString()}</Text>
                </View>
              ))}
              {!data.incompleteReviewDrafts.length ? (
                <Text style={styles.inlineNote}>No incomplete Human Review drafts.</Text>
              ) : null}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Real Session Overlap Audit</Text>
              <Text style={styles.sectionSubtitle}>
                Anonymous completed sessions across default and hosted scopes. Overlap compares each final slate with the five preceding sessions from other patrons in the same library scope and age band.
              </Text>
              {data.realSessionAuditStorageMode === "error" ? (
                <Text style={styles.inlineNote}>
                  Real Session Audit storage is unavailable: {data.realSessionAuditError || "unknown error"}
                </Text>
              ) : data.realSessionAuditStorageMode === "unavailable" ? (
                <Text style={styles.inlineNote}>
                  Real Session Audit collection is off because durable Blob storage is not configured.
                </Text>
              ) : (
                <Text style={styles.inlineNote}>Collection active (Blob).</Text>
              )}
              {(data.realSessionAudits || []).map((row) => {
                const formatSignals = (key: string) => (row.dominantTaste?.[key] || [])
                  .map((signal) => `${signal.value} (${signal.weight})`)
                  .join(", ") || "None";
                const searchQueries = (row.searchPlan?.intents || []).map((intent) => intent.query);
                const sourceQueries = (row.searchPlan?.sourcePlans || [])
                  .map((plan) => `${plan.source}: ${plan.intents.map((intent) => intent.query).join(" | ") || "None"}`)
                  .join(" · ");
                const overlap = (row.recentOverlaps || [])
                  .map((entry) => `${entry.patronHash}: ${entry.overlapCount}/${row.finalRecommendations.length} (${entry.overlapPercent}%)`)
                  .join(" · ");
                return (
                  <View key={row.auditId} style={styles.storyCard}>
                    <Text style={styles.storyTitle}>
                      Patron {row.patronHash} · {labelAgeBand(row.ageBand)} · {row.libraryScope === "hosted" ? `Hosted ${row.libraryId}` : "Default"} · {new Date(row.createdAt).toLocaleString()}
                    </Text>
                    <Text style={styles.storyMeta}>
                      Likes {row.likes} · Dislikes {row.dislikes} · Skips {row.skips}
                    </Text>
                    <Text style={styles.storyBody}>Genres: {formatSignals("genreFamily")}</Text>
                    <Text style={styles.storyBody}>Tones: {formatSignals("tone")}</Text>
                    <Text style={styles.storyBody}>Themes: {formatSignals("themes")}</Text>
                    <Text style={styles.storyBody}>Avoid: {formatSignals("avoidSignals")}</Text>
                    <Text style={styles.storyBody}>Recommendation queries: {searchQueries.join(" | ") || "None"}</Text>
                    <Text style={styles.storyBody}>Source plans: {sourceQueries || "None"}</Text>
                    <Text style={styles.storyBody}>Local query: {row.localQueries.join(" | ") || "None"}</Text>
                    <Text style={styles.storyBody}>
                      Final 10: {row.finalRecommendations.map((item) => `${item.title} [${item.source}]`).join(" · ")}
                    </Text>
                    <Text style={styles.storyMeta}>Recent overlap: {overlap || "No earlier sessions"}</Text>
                  </View>
                );
              })}
              {!data.realSessionAudits.length && data.realSessionAuditStorageMode === "durable_blob" ? (
                <Text style={styles.inlineNote}>Collection is active, but no completed recommendation sessions have been recorded yet.</Text>
              ) : null}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Swipe Card Performance</Text>
              <Text style={styles.sectionSubtitle}>
                Aggregate card recognition evidence only. Skip means the card was not recognized.
              </Text>
              {data.swipeCardPerformanceStorageMode === "error" ? (
                <Text style={styles.inlineNote}>
                  Swipe Card Performance storage is unavailable: {data.swipeCardPerformanceError || "unknown error"}
                </Text>
              ) : data.swipeCardPerformanceStorageMode === "unavailable" ? (
                <Text style={styles.inlineNote}>
                  Swipe Card Performance collection is off because no durable storage is configured.
                </Text>
              ) : (
                <Text style={styles.inlineNote}>
                  Collection active ({data.swipeCardPerformanceStorageMode === "durable_postgres" ? "Postgres" : "Blob"}).
                </Text>
              )}
              <View style={styles.chipWrap}>
                {([
                  ["highest_skip_rate", "Highest skip rate"],
                  ["lowest_recognition_rate", "Lowest recognition rate"],
                  ["most_shown", "Most shown"],
                  ["highest_recognition_rate", "Highest recognition rate"],
                ] as Array<[SwipeCardPerformanceSort, string]>).map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.chip, swipeCardSort === key && styles.chipActive]}
                    onPress={() => setSwipeCardSort(key)}
                  >
                    <Text style={[styles.chipText, swipeCardSort === key && styles.chipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {(["kids", "preteens", "teens", "adult"] as const).map((ageBand) => {
                const rows = swipeCardRows.filter((row) => row.ageBand === ageBand);
                if (!rows.length) return null;
                return (
                  <View key={ageBand} style={styles.performanceGroup}>
                    <Text style={styles.tableTitle}>{labelAgeBand(ageBand)}</Text>
                    <ScrollView horizontal>
                      <View style={styles.performanceTable}>
                        <View style={[styles.performanceRow, styles.performanceHeader]}>
                          {["Card", "Type", "Shown", "Likes", "Dislikes", "Skips", "Recognition %"].map((label) => (
                            <Text key={label} style={[styles.performanceCell, label === "Card" && styles.performanceCardCell]}>{label}</Text>
                          ))}
                        </View>
                        {rows.map((row) => (
                          <View key={`${row.ageBand}:${row.cardId}`} style={styles.performanceRow}>
                            <Text style={[styles.performanceCell, styles.performanceCardCell]} numberOfLines={2}>{row.title}</Text>
                            <Text style={styles.performanceCell}>{labelTag(row.cardType)}</Text>
                            <Text style={styles.performanceCell}>{row.timesShown}</Text>
                            <Text style={styles.performanceCell}>{row.likes}</Text>
                            <Text style={styles.performanceCell}>{row.dislikes}</Text>
                            <Text style={styles.performanceCell}>{row.skips}</Text>
                            <Text style={styles.performanceCell}>{Math.round(row.recognitionRate * 100)}%</Text>
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                );
              })}
              {!swipeCardRows.length && data.swipeCardPerformanceStorageMode !== "unavailable" && data.swipeCardPerformanceStorageMode !== "error" ? (
                <Text style={styles.inlineNote}>Collection is active, but no swipe card performance data has been recorded yet.</Text>
              ) : null}
            </View>

            {Array.isArray(data.evidenceNotes) && data.evidenceNotes.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Evidence notes</Text>
                {data.evidenceNotes.map((note: string) => (
                  <Text key={note} style={styles.noteText}>• {note}</Text>
                ))}
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Overview</Text>
              <View style={styles.metricGrid}>
                <MetricCard label="Completed review submissions" value={String(summary?.completedReviewSubmissions ?? 0)} />
                <MetricCard label="Reviewed recommendation items" value={String(summary?.reviewedRecommendationItems ?? 0)} />
                <MetricCard label="Unique anonymous reviewers" value={String(summary?.uniqueAnonymousReviewers ?? 0)} />
                <MetricCard label="Unique snapshots/slates reviewed" value={String(summary?.uniqueReviewedSnapshots ?? 0)} />
                <MetricCard label="Completion rate" value={formatMetric(summary?.completionRate)} help={summary?.completionRateNote} />
                <MetricCard label="Average expected enjoyment" value={formatMetric(summary?.avgExpectedEnjoyment)} />
                <MetricCard label="Average taste fit" value={formatMetric(summary?.avgTasteFit)} />
                <MetricCard label="Average novelty" value={formatMetric(summary?.avgNovelty)} />
                <MetricCard label="Average confidence" value={formatMetric(summary?.avgConfidence)} />
                <MetricCard label="Recommend" value={formatPercent(summary?.recommendRate)} />
                <MetricCard label="Weak Recommend" value={formatPercent(summary?.weakRecommendRate)} />
                <MetricCard label="Not Recommended" value={formatPercent(summary?.notRecommendedRate)} />
                <MetricCard label="Would use this slate" value={formatPercent(summary?.wouldUseSlateRate)} />
                <MetricCard label="Reviews in last 7 days" value={String(summary?.reviewsLast7Days ?? 0)} />
                <MetricCard label="Reviews in last 30 days" value={String(summary?.reviewsLast30Days ?? 0)} />
                <MetricCard label="Reviews in last 90 days" value={String(summary?.reviewsLast90Days ?? 0)} />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Discovery indicators</Text>
              <View style={styles.metricGrid}>
                {(data.discoveryIndicators || []).map((entry: any) => (
                  <MetricCard key={entry.key} label={entry.label} value={String(entry.count)} help={entry.definition} />
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Age-band comparison</Text>
              {(data.ageBandComparison || []).map((row: any) => (
                <View key={row.key} style={styles.tableRow}>
                  <View style={styles.tableLead}>
                    <Text style={styles.tableTitle}>{labelAgeBand(row.key)}</Text>
                    <Text style={styles.tableSubtext}>
                      {row.reviewedSlates} slates · {row.reviewedItems} items
                    </Text>
                  </View>
                  <Text style={styles.tableValue}>Taste {formatMetric(row.avgTasteFit)}</Text>
                  <Text style={styles.tableValue}>Enjoy {formatMetric(row.avgExpectedEnjoyment)}</Text>
                  <Text style={styles.tableValue}>Rec {formatPercent(row.recommendRate)}</Text>
                </View>
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Source comparison</Text>
              {(data.sourceComparison || []).map((row: any) => (
                <View key={row.key} style={styles.tableRow}>
                  <View style={styles.tableLead}>
                    <Text style={styles.tableTitle}>{row.key}</Text>
                    <Text style={styles.tableSubtext}>
                      {row.reviewedSlates} slates · {row.reviewedItems} items
                    </Text>
                  </View>
                  <Text style={styles.tableValue}>Taste {formatMetric(row.avgTasteFit)}</Text>
                  <Text style={styles.tableValue}>Enjoy {formatMetric(row.avgExpectedEnjoyment)}</Text>
                  <Text style={styles.tableValue}>Rec {formatPercent(row.recommendRate)}</Text>
                </View>
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Evidence-backed hypothesis clusters</Text>
              {(data.hypothesisClusters || []).length ? (
                (data.hypothesisClusters || []).map((entry: any) => (
                  <View key={entry.key} style={styles.storyCard}>
                    <Text style={styles.storyTitle}>{labelAgeBand(entry.ageBand)} · {labelTag(entry.tag)}</Text>
                    <Text style={styles.storyBody}>{entry.summary}</Text>
                    <Text style={styles.storyMeta}>Sources: {(entry.sources || []).join(", ") || "Unknown"} · Mentions: {entry.count}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.inlineNote}>No concern clusters match the current filters.</Text>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Disagreement worth inspecting</Text>
              {(data.disagreementSnapshots || []).length ? (
                (data.disagreementSnapshots || []).map((entry: any) => (
                  <View key={`${entry.snapshotId}-${entry.rank}-${entry.title}`} style={styles.storyCard}>
                    <Text style={styles.storyTitle}>{entry.title}{entry.author ? ` — ${entry.author}` : ""}</Text>
                    <Text style={styles.storyBody}>
                      {labelAgeBand(entry.ageBand)} · Rank {entry.rank} · {entry.reviewerCount} reviewers · Item decisions: {(entry.itemDecisions || []).map(labelDecision).join(", ")}
                    </Text>
                    <Text style={styles.storyMeta}>Slate decisions: {(entry.slateDecisions || []).map(labelDecision).join(", ")} · Score range: {entry.scoreRange || "Unavailable"}</Text>
                    {showInternalIds ? (
                      <Text style={styles.storyMeta}>Profile {entry.profileId} · Snapshot {entry.snapshotId}</Text>
                    ) : null}
                  </View>
                ))
              ) : (
                <Text style={styles.inlineNote}>No multi-reviewer disagreements match the current filters.</Text>
              )}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recent reviewed slates</Text>
                <TouchableOpacity style={styles.toggleButton} onPress={() => setShowInternalIds((prev) => !prev)}>
                  <Text style={styles.toggleButtonText}>{showInternalIds ? "Hide internal IDs" : "Show internal IDs"}</Text>
                </TouchableOpacity>
              </View>
              {(data.recentSubmissions || []).map((row: any) => (
                <View key={row.reviewId} style={styles.storyCard}>
                  <Text style={styles.storyTitle}>{labelAgeBand(row.ageBand)} · {row.reviewerLabel}</Text>
                  <Text style={styles.storyBody}>
                    {row.titlePreview.join(" · ") || "No titles recorded"}
                  </Text>
                  <Text style={styles.storyMeta}>
                    {row.createdAt} · Slate decision: {labelDecision(row.slateDecision)} · Sources: {(row.sources || []).join(", ") || "Unknown"}
                  </Text>
                  {row.concernTags?.length ? (
                    <Text style={styles.storyMeta}>Concern tags: {row.concernTags.map(labelTag).join(", ")}</Text>
                  ) : null}
                  {row.notes ? <Text style={styles.storyBody}>{row.notes}</Text> : null}
                  {showInternalIds ? (
                    <Text style={styles.storyMeta}>Review {row.reviewId} · Profile {row.profileId} · Snapshot {row.snapshotId} · Reviewer {row.reviewerId}</Text>
                  ) : null}
                </View>
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Title outcomes</Text>
              {(data.titleOutcomes || []).map((row: any) => (
                <View key={`${row.title}-${row.author}`} style={styles.tableRow}>
                  <View style={styles.tableLead}>
                    <Text style={styles.tableTitle}>{row.title}</Text>
                    <Text style={styles.tableSubtext}>{row.author || "Author unavailable"} · {row.source}</Text>
                  </View>
                  <Text style={styles.tableValue}>Taste {formatMetric(row.avgTasteFit)}</Text>
                  <Text style={styles.tableValue}>Enjoy {formatMetric(row.avgExpectedEnjoyment)}</Text>
                  <Text style={styles.tableValue}>Rec {formatPercent(row.recommendRate)}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#071526",
  },
  loadingRoot: {
    flex: 1,
    backgroundColor: "#071526",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingText: {
    color: "#d6e4ff",
    marginTop: 12,
    textAlign: "center",
  },
  ownerAuthCard: {
    width: "100%",
    maxWidth: 420,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#173354",
    backgroundColor: "#0c2037",
    gap: 12,
  },
  ownerAuthInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#315277",
    borderRadius: 10,
    backgroundColor: "#071526",
    color: "#f8fbff",
    paddingHorizontal: 14,
    fontSize: 16,
  },
  ownerAuthError: {
    color: "#fca5a5",
    fontWeight: "700",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "web" ? 18 : 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#173354",
    gap: 12,
  },
  headerCopy: {
    gap: 6,
  },
  headerTitle: {
    color: "#f8fbff",
    fontSize: 24,
    fontWeight: "900",
  },
  headerSubtitle: {
    color: "#9bb3d3",
    fontSize: 14,
    lineHeight: 20,
  },
  headerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  headerButton: {
    borderWidth: 1,
    borderColor: "#275487",
    backgroundColor: "#112845",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  headerButtonText: {
    color: "#e5efff",
    fontWeight: "800",
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  storageRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
  },
  storageBadge: {
    color: "#fbbf24",
    borderWidth: 1,
    borderColor: "#7b5d16",
    backgroundColor: "#231b08",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    fontWeight: "800",
  },
  storageMeta: {
    color: "#9bb3d3",
    fontSize: 13,
  },
  section: {
    backgroundColor: "#0d2138",
    borderWidth: 1,
    borderColor: "#183455",
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sectionTitle: {
    color: "#f8fbff",
    fontSize: 18,
    fontWeight: "900",
  },
  sectionSubtitle: {
    color: "#9bb3d3",
    fontSize: 12,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metricCard: {
    minWidth: 180,
    flexGrow: 1,
    borderWidth: 1,
    borderColor: "#23486f",
    backgroundColor: "#102946",
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  metricLabel: {
    color: "#9bb3d3",
    fontSize: 12,
    fontWeight: "700",
  },
  metricValue: {
    color: "#f8fbff",
    fontSize: 22,
    fontWeight: "900",
  },
  metricHelp: {
    color: "#7f95b4",
    fontSize: 11,
    lineHeight: 16,
  },
  inputRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  inputBlock: {
    flexGrow: 1,
    minWidth: 220,
    gap: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#254b74",
    backgroundColor: "#081a2d",
    color: "#f8fbff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  filterBlock: {
    gap: 8,
  },
  filterLabel: {
    color: "#c8d8ee",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#2a4d75",
    backgroundColor: "#112845",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: {
    borderColor: "#fbbf24",
    backgroundColor: "#3a2c08",
  },
  chipText: {
    color: "#d9e7fa",
    fontSize: 12,
    fontWeight: "700",
  },
  chipTextActive: {
    color: "#fbbf24",
  },
  filterActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  primaryButton: {
    backgroundColor: "#fbbf24",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: "#1c1302",
    fontWeight: "900",
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#2a4d75",
    backgroundColor: "#112845",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: "#d9e7fa",
    fontWeight: "800",
  },
  previewModeActive: {
    borderColor: "#fbbf24",
    backgroundColor: "#3a2c08",
  },
  toggleButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#2a4d75",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  toggleButtonText: {
    color: "#d9e7fa",
    fontWeight: "700",
  },
  noteText: {
    color: "#d9e7fa",
    lineHeight: 20,
  },
  inlineNote: {
    color: "#9bb3d3",
    fontSize: 12,
    lineHeight: 18,
  },
  loadingCard: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0d2138",
    borderWidth: 1,
    borderColor: "#183455",
    borderRadius: 18,
    padding: 24,
  },
  errorCard: {
    backgroundColor: "#38131a",
    borderWidth: 1,
    borderColor: "#7d2738",
    borderRadius: 18,
    padding: 16,
    gap: 8,
  },
  errorTitle: {
    color: "#ffd7df",
    fontWeight: "900",
    fontSize: 16,
  },
  errorText: {
    color: "#ffd7df",
    lineHeight: 20,
  },
  tableRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#183455",
    backgroundColor: "#102946",
    borderRadius: 14,
    padding: 12,
  },
  tableLead: {
    flexGrow: 1,
    minWidth: 220,
    gap: 4,
  },
  tableTitle: {
    color: "#f8fbff",
    fontWeight: "800",
    fontSize: 15,
  },
  tableSubtext: {
    color: "#9bb3d3",
    fontSize: 12,
  },
  tableValue: {
    color: "#d9e7fa",
    fontWeight: "700",
    minWidth: 86,
  },
  performanceGroup: {
    gap: 8,
    marginTop: 8,
  },
  performanceTable: {
    minWidth: 850,
    borderWidth: 1,
    borderColor: "#183455",
    borderRadius: 12,
    overflow: "hidden",
  },
  performanceRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#183455",
  },
  performanceHeader: {
    backgroundColor: "#173354",
  },
  performanceCell: {
    width: 100,
    color: "#d9e7fa",
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 12,
  },
  performanceCardCell: {
    width: 240,
  },
  storyCard: {
    borderWidth: 1,
    borderColor: "#183455",
    backgroundColor: "#102946",
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  storyTitle: {
    color: "#f8fbff",
    fontSize: 15,
    fontWeight: "800",
  },
  storyBody: {
    color: "#d9e7fa",
    lineHeight: 20,
  },
  storyMeta: {
    color: "#8ca4c5",
    fontSize: 12,
    lineHeight: 18,
  },
});
