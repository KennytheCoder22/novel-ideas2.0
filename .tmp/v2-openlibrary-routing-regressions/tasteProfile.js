"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTasteProfile = buildTasteProfile;
const SOURCE_HINTS = new Set(["googleBooks", "openLibrary", "kitsu", "comicVine", "localLibrary", "nyt", "mock"]);
function normalizeSignal(value) {
    return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}
function addWeighted(map, rawValue, weight, evidence) {
    const value = normalizeSignal(rawValue);
    if (!value)
        return;
    const existing = map.get(value) || { value, weight: 0, evidence: [] };
    existing.weight += weight;
    if (!existing.evidence.includes(evidence))
        existing.evidence.push(evidence);
    map.set(value, existing);
}
function sortedSignals(map, positiveOnly = true) {
    return [...map.values()]
        .filter((row) => (positiveOnly ? row.weight > 0 : row.weight !== 0))
        .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight) || a.value.localeCompare(b.value))
        .slice(0, 12);
}
const MIDDLE_GRADES_SHARED_AVOID_SIGNAL = /^(book|books|novel|novels|fiction|story|stories|series|children|childrens?|middle grade|middle grades|adventure|fantasy|friendship|friends|playful|fast-paced|fast paced|comedy|funny|school|family|coming of age|game|games)$/i;
function hasPositiveSignal(value, maps) {
    const normalized = normalizeSignal(value);
    return maps.some((map) => (map.get(normalized)?.weight || 0) > 0);
}
function middleGradesAvoidSignals(avoidSignals, positiveMaps) {
    return sortedSignals(avoidSignals, false).filter((signal) => {
        const value = normalizeSignal(signal.value);
        if (!value)
            return false;
        if (hasPositiveSignal(value, positiveMaps))
            return false;
        if (MIDDLE_GRADES_SHARED_AVOID_SIGNAL.test(value))
            return false;
        return true;
    });
}
const MIDDLE_GRADES_DEEP_DEBUG_FLAG_NAMES = [
    "debugMiddleGradesDeepTrace",
    "debugMiddleGradesNoTimeouts",
    "debugMiddleGradesDeepDebug",
    "middleGradesDeepDebug",
];
function browserDebugFlag(names) {
    const flagNames = Array.isArray(names) ? names : [names];
    const runtime = globalThis;
    try {
        const search = String(runtime?.location?.search || "");
        if (search) {
            const params = new URLSearchParams(search);
            for (const name of flagNames) {
                const value = params.get(name);
                if (value === "1" || value === "true")
                    return { active: true, source: "url" };
            }
        }
    }
    catch {
        // Non-browser runtimes do not expose location; ignore.
    }
    try {
        for (const name of flagNames) {
            const value = runtime?.localStorage?.getItem?.(name);
            if (value === "1" || value === "true")
                return { active: true, source: "localStorage" };
        }
    }
    catch {
        // localStorage may be unavailable or blocked; ignore.
    }
    return { active: false };
}
function middleGradesDeepDebug(session) {
    if (session.ageBand !== "preteens")
        return { active: false, source: "none" };
    const diagnostics = session.diagnostics || {};
    if (diagnostics.debugMiddleGradesDeepTrace || diagnostics.debugMiddleGradesNoTimeouts || session.debugMiddleGradesDeepTrace || session.debugMiddleGradesNoTimeouts) {
        return { active: true, source: diagnostics.middleGradesDeepDebugActivationSource === "preset" ? "preset" : "profile" };
    }
    const browserFlag = browserDebugFlag(MIDDLE_GRADES_DEEP_DEBUG_FLAG_NAMES);
    if (browserFlag.active)
        return { active: true, source: browserFlag.source || "url" };
    return { active: false, source: "none" };
}
function middleGradesDeepDebugExpectedButInactive(session, active) {
    if (!session.diagnostics?.middleGradesDeepDebugExpected || active)
        return { requestedButInactive: false };
    if (session.ageBand !== "preteens")
        return { requestedButInactive: true, reason: "request_was_not_for_middle_grades_age_band" };
    if (!session.diagnostics.debugMiddleGradesDeepTrace && !session.diagnostics.debugMiddleGradesNoTimeouts && !session.debugMiddleGradesDeepTrace && !session.debugMiddleGradesNoTimeouts) {
        return { requestedButInactive: true, reason: "expected_flag_set_without_debug_flag" };
    }
    return { requestedButInactive: true, reason: "activation_detector_returned_inactive" };
}
function buildTasteProfile(session) {
    const tone = new Map();
    const pacing = new Map();
    const genreFamily = new Map();
    const themes = new Map();
    const characterDynamics = new Map();
    const formatPreference = new Map();
    const avoidSignals = new Map();
    const sourceHints = new Set();
    const deepDebug = middleGradesDeepDebug(session);
    const deepDebugFailure = middleGradesDeepDebugExpectedButInactive(session, deepDebug.active);
    for (const signal of session.signals || []) {
        const direction = signal.action === "like" ? 1 : signal.action === "dislike" ? -1 : 0.25;
        const weight = direction * Math.max(0.25, Number(signal.weight || 1));
        const evidence = signal.title ? `${signal.action}:${signal.title}` : signal.action;
        const targetMap = signal.action === "dislike" ? avoidSignals : null;
        for (const value of signal.tones || [])
            addWeighted(targetMap || tone, value, weight, evidence);
        for (const value of signal.genres || [])
            addWeighted(targetMap || genreFamily, value, weight, evidence);
        for (const value of signal.themes || [])
            addWeighted(targetMap || themes, value, weight, evidence);
        for (const value of signal.characterDynamics || [])
            addWeighted(targetMap || characterDynamics, value, weight, evidence);
        for (const value of signal.tags || []) {
            const normalized = normalizeSignal(value);
            if (/slow|fast|propulsive|quiet|paced/.test(normalized))
                addWeighted(targetMap || pacing, normalized, weight, evidence);
            else
                addWeighted(targetMap || themes, normalized, weight * 0.5, evidence);
        }
        if (signal.format)
            addWeighted(targetMap || formatPreference, signal.format, weight, evidence);
        const source = String(signal.source || "");
        if (SOURCE_HINTS.has(source))
            sourceHints.add(source);
    }
    return {
        ageBand: session.ageBand,
        tone: sortedSignals(tone),
        pacing: sortedSignals(pacing),
        genreFamily: sortedSignals(genreFamily),
        themes: sortedSignals(themes),
        characterDynamics: sortedSignals(characterDynamics),
        formatPreference: sortedSignals(formatPreference),
        maturityBand: session.ageBand,
        avoidSignals: session.ageBand === "preteens"
            ? middleGradesAvoidSignals(avoidSignals, [tone, pacing, genreFamily, themes, characterDynamics, formatPreference])
            : sortedSignals(avoidSignals, false),
        sourceHints: [...sourceHints],
        diagnostics: {
            inputSignalCount: session.signals?.length || 0,
            likedCount: session.signals?.filter((s) => s.action === "like").length || 0,
            dislikedCount: session.signals?.filter((s) => s.action === "dislike").length || 0,
            skippedCount: session.signals?.filter((s) => s.action === "skip").length || 0,
            ...(session.diagnostics || {}),
            debugMiddleGradesDeepTrace: deepDebug.active,
            debugMiddleGradesNoTimeouts: deepDebug.active,
            middleGradesDeepDebugActive: deepDebug.active,
            middleGradesDeepDebugActivationSource: deepDebug.source,
            middleGradesDeepDebugRequestedButNotActivated: deepDebugFailure.requestedButInactive,
            middleGradesDeepDebugActivationFailureReason: deepDebugFailure.reason,
            sessionReportHeader: deepDebug.active ? "MIDDLE GRADES DEEP DEBUG: ACTIVE" : undefined,
        },
    };
}
