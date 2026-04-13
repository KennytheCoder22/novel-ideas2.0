// tasteToQuerySignals.ts

export interface TasteSignal {
  darkness?: number;
  pacing?: number;
  realism?: number;
  ideaDensity?: number;
}

export interface QuerySignals {
  tone: string[];
  elements: string[];
  exclusions: string[];
}

export function tasteToQuerySignals(taste: TasteSignal): QuerySignals {
  const tone: string[] = [];
  const elements: string[] = [];
  const exclusions: string[] = [];

  // ---- TONE MAPPING (vibe, not genre) ----
  if ((taste.darkness ?? 0) > 0.3) {
    tone.push("dark");
  }

  if ((taste.darkness ?? 0) > 0.6) {
    tone.push("bleak", "disturbing");
  }

  if ((taste.pacing ?? 0) > 0.25) {
    tone.push("fast paced");
  }

  if ((taste.realism ?? 0) > 0.2) {
    tone.push("grounded", "realistic");
  }

  if ((taste.realism ?? 0) < -0.1) {
    tone.push("speculative");
  }

  if ((taste.ideaDensity ?? 0) > 0.2) {
    tone.push("thought provoking");
  }

  // ---- ELEMENT EXTRACTION (NOT GENRE LOCKING) ----
  if ((taste.darkness ?? 0) > 0.3) {
    elements.push("moral conflict", "psychological tension");
  }

  if ((taste.pacing ?? 0) > 0.25) {
    elements.push("high stakes", "urgent conflict");
  }

  if ((taste.realism ?? 0) > 0.2) {
    elements.push("human relationships", "personal struggle");
  }

  if ((taste.realism ?? 0) < -0.1) {
    elements.push("alternate reality", "speculative premise");
  }

  // ---- UNIVERSAL EXCLUSIONS (kill meta garbage) ----
  exclusions.push(
    "-analysis",
    "-guide",
    "-summary",
    "-criticism",
    "-literature",
    "-journal",
    "-magazine",
    "-catalog",
    "-reference",
    "-companion",
    "-study",
    "-workbook",
    "-textbook",
    "-manual",
    "-encyclopedia",
    "-anthology",
    "-collection",
    "-essays",
    "-nonfiction",
    "-biography",
    "-memoir"
  );

  return {
    tone,
    elements,
    exclusions,
  };
}