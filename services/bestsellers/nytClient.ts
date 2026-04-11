// /services/bestsellers/nytClient.ts

export type NytBestSellerBook = {
  title: string;
  author: string;
  description?: string;
  publisher?: string;
  primary_isbn10?: string;
  primary_isbn13?: string;
  rank?: number;
  weeks_on_list?: number;
  amazon_product_url?: string;
  book_image?: string;
  book_image_width?: number;
  book_image_height?: number;
  contributor?: string;
  contributor_note?: string;
  age_group?: string;
  book_review_link?: string;
  first_chapter_link?: string;
  sunday_review_link?: string;
  article_chapter_link?: string;
  list_name?: string;
  list_name_encoded?: string;
  display_name?: string;
  bestsellers_date?: string;
  published_date?: string;
  rank_last_week?: number;
  asterisk?: number;
  dagger?: number;
};

export type NytFetchParams = {
  listNames: string[];
  date?: string;
  maxPerList?: number;
  timeoutMs?: number;
};

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function normalizeListName(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function normalizeIsbn(value: unknown): string {
  return String(value || "").replace(/[^0-9xX]/g, "").toUpperCase().trim();
}

function dedupeBooks(books: NytBestSellerBook[]): NytBestSellerBook[] {
  const seen = new Set<string>();
  const out: NytBestSellerBook[] = [];

  for (const book of books) {
    const isbn13 = normalizeIsbn(book.primary_isbn13);
    const isbn10 = normalizeIsbn(book.primary_isbn10);
    const title = String(book.title || "").trim().toLowerCase();
    const author = String(book.author || "").trim().toLowerCase();

    const key =
      isbn13 ||
      isbn10 ||
      `${title}|${author}|${normalizeListName(book.list_name_encoded || book.list_name || book.display_name)}`;

    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(book);
  }

  return out;
}

function parseBooksFromPayload(payload: any, fallbackListName: string): NytBestSellerBook[] {
  const root = payload?.results ?? payload?.data ?? payload ?? {};
  const candidates = [
    ...(Array.isArray(root?.books) ? root.books : []),
    ...(Array.isArray(root?.results?.books) ? root.results.books : []),
    ...(Array.isArray(payload?.books) ? payload.books : []),
  ];

  return candidates
    .filter((book: any) => book && book.title && (book.author || book.contributor))
    .map((book: any) => ({
      title: String(book.title || "").trim(),
      author: String(book.author || book.contributor || "").replace(/^by\s+/i, "").trim(),
      description: typeof book.description === "string" ? book.description.trim() : undefined,
      publisher: typeof book.publisher === "string" ? book.publisher.trim() : undefined,
      primary_isbn10: typeof book.primary_isbn10 === "string" ? book.primary_isbn10.trim() : undefined,
      primary_isbn13: typeof book.primary_isbn13 === "string" ? book.primary_isbn13.trim() : undefined,
      rank: Number.isFinite(Number(book.rank)) ? Number(book.rank) : undefined,
      weeks_on_list: Number.isFinite(Number(book.weeks_on_list)) ? Number(book.weeks_on_list) : undefined,
      amazon_product_url: typeof book.amazon_product_url === "string" ? book.amazon_product_url.trim() : undefined,
      book_image: typeof book.book_image === "string" ? book.book_image.trim() : undefined,
      book_image_width: Number.isFinite(Number(book.book_image_width)) ? Number(book.book_image_width) : undefined,
      book_image_height: Number.isFinite(Number(book.book_image_height)) ? Number(book.book_image_height) : undefined,
      contributor: typeof book.contributor === "string" ? book.contributor.trim() : undefined,
      contributor_note: typeof book.contributor_note === "string" ? book.contributor_note.trim() : undefined,
      age_group: typeof book.age_group === "string" ? book.age_group.trim() : undefined,
      book_review_link: typeof book.book_review_link === "string" ? book.book_review_link.trim() : undefined,
      first_chapter_link: typeof book.first_chapter_link === "string" ? book.first_chapter_link.trim() : undefined,
      sunday_review_link: typeof book.sunday_review_link === "string" ? book.sunday_review_link.trim() : undefined,
      article_chapter_link: typeof book.article_chapter_link === "string" ? book.article_chapter_link.trim() : undefined,
      list_name: typeof root?.list_name === "string" ? root.list_name.trim() : fallbackListName,
      list_name_encoded:
        typeof root?.list_name_encoded === "string"
          ? root.list_name_encoded.trim()
          : normalizeListName(fallbackListName).replace(/\s+/g, "-"),
      display_name:
        typeof root?.display_name === "string"
          ? root.display_name.trim()
          : typeof root?.list_name === "string"
          ? root.list_name.trim()
          : fallbackListName,
      bestsellers_date:
        typeof root?.bestsellers_date === "string"
          ? root.bestsellers_date.trim()
          : typeof payload?.bestsellers_date === "string"
          ? payload.bestsellers_date.trim()
          : undefined,
      published_date:
        typeof root?.published_date === "string"
          ? root.published_date.trim()
          : typeof payload?.published_date === "string"
          ? payload.published_date.trim()
          : undefined,
      rank_last_week: Number.isFinite(Number(book.rank_last_week)) ? Number(book.rank_last_week) : undefined,
      asterisk: Number.isFinite(Number(book.asterisk)) ? Number(book.asterisk) : undefined,
      dagger: Number.isFinite(Number(book.dagger)) ? Number(book.dagger) : undefined,
    }));
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    const text = await response.text();
    let json: any = null;

    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`NYT proxy returned invalid JSON (${response.status})`);
    }

    if (!response.ok) {
      throw new Error(
        typeof json?.error === "string"
          ? json.error
          : `NYT proxy request failed (${response.status})`
      );
    }

    return json;
  } finally {
    clearTimeout(timer);
  }
}

export async function getNytBestsellerBooks(params: NytFetchParams): Promise<NytBestSellerBook[]> {
  const listNames = asArray(params?.listNames)
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  if (!listNames.length) return [];

  const date = String(params?.date || "current").trim() || "current";
  const maxPerList = Math.max(1, Math.min(40, Number(params?.maxPerList || 15)));
  const timeoutMs = Math.max(2000, Math.min(20000, Number(params?.timeoutMs || 8000)));

  const settled = await Promise.allSettled(
    listNames.map(async (listName) => {
      const search = new URLSearchParams();
      search.set("list", listName);
      search.set("date", date);
      search.set("limit", String(maxPerList));

      const json = await fetchJsonWithTimeout(`/api/nyt-books?${search.toString()}`, timeoutMs);
      return parseBooksFromPayload(json, listName);
    })
  );

  const merged: NytBestSellerBook[] = [];

  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    merged.push(...result.value);
  }

  return dedupeBooks(merged);
}