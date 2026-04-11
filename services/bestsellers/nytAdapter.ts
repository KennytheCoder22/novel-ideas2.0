// /services/bestsellers/nytAdapter.ts

import type { CommercialSignals, RecommendationDoc } from "../../screens/recommenders/types";
import type { NytBestSellerBook } from "./nytClient";

export type NytAdaptedRecommendationDoc = RecommendationDoc & {
  source: "openLibrary";
  isbn10?: string[];
  isbn13?: string[];
  publisher?: string[];
  hardcover?: {
    rating?: number;
    ratings_count?: number;
  };
  queryRung: 90;
  queryText: string;
  laneKind: "anchor";
};

function asArray(value: string | null | undefined): string[] | undefined {
  const cleaned = String(value || "").trim();
  return cleaned ? [cleaned] : undefined;
}

function normalizeIsbn(value: unknown): string {
  return String(value || "").replace(/[^0-9xX]/g, "").toUpperCase().trim();
}

function compact<T>(values: Array<T | null | undefined | false | "">): T[] {
  return values.filter(Boolean) as T[];
}

function popularityTierFromRankAndWeeks(rank?: number, weeksOnList?: number): number {
  const safeRank = Number.isFinite(Number(rank)) ? Number(rank) : 999;
  const safeWeeks = Number.isFinite(Number(weeksOnList)) ? Number(weeksOnList) : 0;

  if (safeRank <= 3 || safeWeeks >= 20) return 3;
  if (safeRank <= 8 || safeWeeks >= 8) return 2;
  return 1;
}

function buildCommercialSignals(book: NytBestSellerBook): CommercialSignals {
  return {
    bestseller: true,
    awards: 0,
    popularityTier: popularityTierFromRankAndWeeks(book.rank, book.weeks_on_list),
    sourceCount: 1,
  };
}

function buildSubjects(book: NytBestSellerBook): string[] {
  return compact<string>([
    "Fiction",
    "Bestsellers",
    "New York Times bestseller",
    typeof book.display_name === "string" ? book.display_name.trim() : "",
    typeof book.list_name === "string" ? book.list_name.trim() : "",
    typeof book.age_group === "string" ? book.age_group.trim() : "",
  ]);
}

function buildStableKey(book: NytBestSellerBook): string {
  const isbn13 = normalizeIsbn(book.primary_isbn13);
  const isbn10 = normalizeIsbn(book.primary_isbn10);
  const title = String(book.title || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const author = String(book.author || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return `nyt:${isbn13 || isbn10 || `${title}:${author}`}`;
}

export function adaptNytBookToRecommendationDoc(book: NytBestSellerBook): NytAdaptedRecommendationDoc {
  const isbn13 = normalizeIsbn(book.primary_isbn13);
  const isbn10 = normalizeIsbn(book.primary_isbn10);
  const displayList = String(book.display_name || book.list_name || "NYT Best Sellers").trim();

  const doc = {
    key: buildStableKey(book),
    id: buildStableKey(book),
    title: String(book.title || "").trim(),
    author_name: compact([String(book.author || "").trim()]),
    first_publish_year: undefined,
    cover_i: book.book_image || undefined,
    subject: buildSubjects(book),
    subtitle: undefined,
    description:
      typeof book.description === "string" && book.description.trim()
        ? book.description.trim()
        : `New York Times bestseller from ${displayList}.`,
    edition_count: 1,
    language: ["eng"],
    ebook_access: undefined,
    commercialSignals: buildCommercialSignals(book),
    source: "openLibrary" as const,
    isbn10: isbn10 ? [isbn10] : undefined,
    isbn13: isbn13 ? [isbn13] : undefined,
    publisher: asArray(book.publisher),
    queryRung: 90 as const,
    queryText: `nyt bestseller ${displayList}`.trim(),
    laneKind: "anchor" as const,
    nyt: {
      list_name: book.list_name,
      list_name_encoded: book.list_name_encoded,
      display_name: book.display_name,
      rank: book.rank,
      weeks_on_list: book.weeks_on_list,
      rank_last_week: book.rank_last_week,
      bestsellers_date: book.bestsellers_date,
      published_date: book.published_date,
      amazon_product_url: book.amazon_product_url,
      contributor: book.contributor,
      contributor_note: book.contributor_note,
      book_review_link: book.book_review_link,
      first_chapter_link: book.first_chapter_link,
      sunday_review_link: book.sunday_review_link,
      article_chapter_link: book.article_chapter_link,
      asterisk: book.asterisk,
      dagger: book.dagger,
    },
  } as NytAdaptedRecommendationDoc;

  return doc;
}

export function adaptNytBooksToRecommendationDocs(
  books: NytBestSellerBook[]
): NytAdaptedRecommendationDoc[] {
  return (Array.isArray(books) ? books : [])
    .filter((book) => book && book.title && book.author)
    .map((book) => adaptNytBookToRecommendationDoc(book));
}