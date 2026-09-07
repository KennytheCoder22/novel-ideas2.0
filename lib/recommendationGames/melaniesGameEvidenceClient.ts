import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { createSerializedRecommendationQueue, type AsyncKeyValueStorage } from "./gameRecommendationFeedbackQueue";
import { isMelanieEvidenceEvent, type MelaniePresentationEvidence } from "./melaniesGame";

export const MELANIES_GAME_EVIDENCE_QUEUE_KEY = "novelideas_melanies_game_evidence_queue_v2";

const webStorage: AsyncKeyValueStorage = {
  async getItem(key) {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  },
  async setItem(key, value) {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  },
};

const storage = Platform.OS === "web" ? webStorage : AsyncStorage;
const queue = createSerializedRecommendationQueue<MelaniePresentationEvidence>(
  MELANIES_GAME_EVIDENCE_QUEUE_KEY,
  isMelanieEvidenceEvent,
  (event) => event.presentationId,
);
const apiOrigin = String(process.env.EXPO_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");

async function send(event: MelaniePresentationEvidence): Promise<boolean> {
  if (Platform.OS !== "web" && !apiOrigin) return false;
  try {
    const response = await fetch(`${apiOrigin}/api/melanies-game-event`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        ...(Platform.OS === "web" ? {} : { origin: apiOrigin }),
      },
      body: JSON.stringify(event),
    });
    const body = await response.json().catch(() => null);
    return (response.status === 200 || response.status === 201) && body?.status === "accepted";
  } catch {
    return false;
  }
}

export async function syncMelanieEvidence(events: readonly MelaniePresentationEvidence[]): Promise<void> {
  await enqueueMelanieEvidence(events);
  await queue.flush(storage, send);
}

export async function enqueueMelanieEvidence(events: readonly MelaniePresentationEvidence[]): Promise<void> {
  for (const event of events) await queue.enqueue(storage, event);
}

export async function flushMelanieEvidence(): Promise<void> {
  await queue.flush(storage, send);
}
