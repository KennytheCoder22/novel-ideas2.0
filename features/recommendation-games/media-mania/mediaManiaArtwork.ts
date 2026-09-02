import coverUrlsMap from "../../../assets/coverUrls.json";
import type { MediaManiaCatalogItem } from "./mediaManiaCore.mjs";

export type MediaManiaArtworkOrigin = "deck" | "static_map" | "wikipedia" | "google_books" | "open_library";
export type MediaManiaArtworkCandidate = { uri: string; origin: MediaManiaArtworkOrigin };
export type MediaManiaArtworkResolution = {
  candidates: MediaManiaArtworkCandidate[];
  lookupStatus: "resolved" | "none" | "lookup_failed";
};

const coverMap = coverUrlsMap as Record<string, string>;

function normalizeKey(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ");
}

function normalizeUrl(value: unknown): string | null {
  const url = String(value || "").trim().replace(/^http:\/\//, "https://");
  return /^(?:https?:\/\/|\/|assets\/)/i.test(url) ? url : null;
}

function uniqueCandidates(values: MediaManiaArtworkCandidate[]): MediaManiaArtworkCandidate[] {
  const seen = new Set<string>();
  return values.filter((candidate) => {
    const key = candidate.uri.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function staticMediaManiaArtworkUrl(title: string, creator: string): string | undefined {
  const exact = [normalizeKey(title), normalizeKey(creator)].filter(Boolean).join("|");
  return coverMap[exact] || coverMap[normalizeKey(title)] || undefined;
}

export function initialMediaManiaArtworkCandidates(item: MediaManiaCatalogItem): MediaManiaArtworkCandidate[] {
  const candidates: MediaManiaArtworkCandidate[] = [];
  const explicit = normalizeUrl(item.imageUri);
  if (explicit) candidates.push({ uri: explicit, origin: item.imageOrigin || "deck" });
  const mapped = normalizeUrl(staticMediaManiaArtworkUrl(item.title, item.creator || ""));
  if (mapped) candidates.push({ uri: mapped, origin: "static_map" });
  return uniqueCandidates(candidates);
}

async function wikipediaArtwork(title: string): Promise<{ candidate?: MediaManiaArtworkCandidate; failed: boolean }> {
  const normalizedTitle = title.replace(/\s+/g, " ").trim();
  if (!normalizedTitle) return { failed: false };
  try {
    const summary = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(normalizedTitle)}`);
    if (summary.ok) {
      const data = await summary.json();
      const uri = normalizeUrl(data?.thumbnail?.source);
      if (uri) return { candidate: { uri, origin: "wikipedia" }, failed: false };
    }
  } catch {
    // Continue to the CORS-enabled MediaWiki API used by the swipe-card pipeline.
  }

  try {
    const params = new URLSearchParams({
      action: "query",
      prop: "pageimages",
      redirects: "1",
      titles: normalizedTitle,
      pithumbsize: "700",
      format: "json",
      origin: "*",
    });
    const response = await fetch(`https://en.wikipedia.org/w/api.php?${params.toString()}`);
    if (!response.ok) return { failed: true };
    const data = await response.json();
    const pages = Object.values(data?.query?.pages || {}) as { thumbnail?: { source?: string } }[];
    const uri = normalizeUrl(pages[0]?.thumbnail?.source);
    return uri ? { candidate: { uri, origin: "wikipedia" }, failed: false } : { failed: false };
  } catch {
    return { failed: true };
  }
}

async function bookArtwork(item: MediaManiaCatalogItem): Promise<{ candidates: MediaManiaArtworkCandidate[]; failed: boolean }> {
  const candidates: MediaManiaArtworkCandidate[] = [];
  const query = [`intitle:${item.title}`, item.creator ? `inauthor:${item.creator}` : ""].filter(Boolean).join(" ");
  try {
    const params = new URLSearchParams({ q: query, printType: "books", orderBy: "relevance", maxResults: "1", langRestrict: "en" });
    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY;
    if (apiKey?.trim()) params.set("key", apiKey.trim());
    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?${params.toString()}`);
    if (response.ok) {
      const imageLinks = (await response.json())?.items?.[0]?.volumeInfo?.imageLinks || {};
      const uri = normalizeUrl(imageLinks.thumbnail || imageLinks.smallThumbnail);
      if (uri) candidates.push({ uri, origin: "google_books" });
    }
  } catch {
    // Open Library remains available as a fallback.
  }

  try {
    const params = new URLSearchParams({ limit: "1", title: item.title });
    if (item.creator) params.set("author", item.creator);
    const response = await fetch(`https://openlibrary.org/search.json?${params.toString()}`);
    if (!response.ok) return { candidates, failed: candidates.length === 0 };
    const coverId = Number((await response.json())?.docs?.[0]?.cover_i || 0);
    if (coverId > 0) candidates.push({ uri: `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`, origin: "open_library" });
    return { candidates, failed: false };
  } catch {
    return { candidates, failed: candidates.length === 0 };
  }
}

export async function resolveMediaManiaArtwork(item: MediaManiaCatalogItem): Promise<MediaManiaArtworkResolution> {
  const candidates = initialMediaManiaArtworkCandidates(item);
  let lookupFailed = false;

  if (item.wikiTitle) {
    const wikipedia = await wikipediaArtwork(item.wikiTitle);
    if (wikipedia.candidate) candidates.push(wikipedia.candidate);
    lookupFailed ||= wikipedia.failed;
  }

  if (item.mediaSource === "books" && candidates.length === 0) {
    const books = await bookArtwork(item);
    candidates.push(...books.candidates);
    lookupFailed ||= books.failed;
  }

  const unique = uniqueCandidates(candidates);
  return {
    candidates: unique,
    lookupStatus: unique.length ? "resolved" : lookupFailed ? "lookup_failed" : "none",
  };
}
