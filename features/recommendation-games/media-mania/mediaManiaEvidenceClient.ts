import type { MediaManiaEvent } from "./mediaManiaCore.mjs";

function evidenceEndpoint(): string | null {
  if (typeof window !== "undefined" && /^https?:\/\//i.test(window.location?.origin || "")) {
    return new URL("/api/media-mania-events", window.location.origin).toString();
  }
  const configuredOrigin = String(process.env.EXPO_PUBLIC_NOVELIDEAS_API_ORIGIN || "").replace(/\/+$/, "");
  return configuredOrigin ? `${configuredOrigin}/api/media-mania-events` : null;
}

const scope = (value?: string | null) =>
  String(value || "default").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "default";

export async function syncMediaManiaEvents(
  libraryId: string,
  events: MediaManiaEvent[],
  options: { endpoint?: string; request?: typeof fetch } = {},
): Promise<{ synced: boolean; error: string | null }> {
  const endpoint = options.endpoint || evidenceEndpoint();
  const request = options.request || fetch;
  const durableEvents = events.filter((event) => event.schemaVersion === "media_mania_event_v2");
  if (!durableEvents.length) return { synced: true, error: null };
  if (!endpoint) return { synced: false, error: "durable_endpoint_unavailable" };
  try {
    for (let offset = 0; offset < durableEvents.length; offset += 50) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      const response = await request(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-Media-Mania-Client": "novelideas-native-v1",
        },
        body: JSON.stringify({ libraryId: scope(libraryId), events: durableEvents.slice(offset, offset + 50) }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        return { synced: false, error: payload?.error || `http_${response.status}` };
      }
    }
    return { synced: true, error: null };
  } catch {
    return { synced: false, error: "request_failed" };
  }
}
