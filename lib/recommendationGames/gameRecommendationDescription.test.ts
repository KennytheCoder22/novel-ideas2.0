import assert from "node:assert/strict";
import test from "node:test";
import {
  gameRecommendationDescription,
  gameRecommendationDescriptionExcerpt,
} from "./gameRecommendationDescription";

test("prefers production display metadata and records its provenance", () => {
  const result = gameRecommendationDescription({
    source: "localLibrary",
    displayDescription: "<p>A catalogued &amp; librarian-provided premise.</p>",
    description: "A lower-priority description.",
    raw: { description: "A raw description." },
  });
  assert.deepEqual(result, {
    text: "A catalogued & librarian-provided premise.",
    provenance: { source: "localLibrary", field: "displayDescription" },
  });
});

test("extracts genuine source descriptions from supported production candidate shapes", () => {
  const fixtures = [
    {
      source: "googleBooks",
      raw: { volumeInfo: { description: "A Google Books premise." } },
      expected: "A Google Books premise.",
      field: "raw.volumeInfo.description",
    },
    {
      source: "openLibrary",
      raw: { description: { value: "An Open Library premise." } },
      expected: "An Open Library premise.",
      field: "raw.description",
    },
    {
      source: "openLibrary",
      raw: { first_sentence: ["A genuine", "Open Library first sentence."] },
      expected: "A genuine Open Library first sentence.",
      field: "raw.first_sentence",
    },
    {
      source: "kitsu",
      raw: { attributes: { synopsis: "A Kitsu synopsis." } },
      expected: "A Kitsu synopsis.",
      field: "raw.attributes.synopsis",
    },
    {
      source: "comicVine",
      raw: { deck: "A ComicVine deck." },
      expected: "A ComicVine deck.",
      field: "raw.deck",
    },
    {
      source: "nyt",
      raw: { description: "A publisher-supplied NYT premise." },
      expected: "A publisher-supplied NYT premise.",
      field: "raw.description",
    },
  ] as const;

  for (const fixture of fixtures) {
    const result = gameRecommendationDescription(fixture);
    assert.equal(result?.text, fixture.expected);
    assert.equal(result?.provenance.field, fixture.field);
  }
});

test("omits generated source fallbacks and candidates without a genuine description", () => {
  assert.equal(gameRecommendationDescription({
    source: "nyt",
    description: "New York Times bestseller from Young Adult Hardcover.",
  }), null);
  assert.equal(gameRecommendationDescription({
    source: "mock",
    description: "Generated mock recommendation description.",
  }), null);
  assert.equal(gameRecommendationDescription({ source: "googleBooks", raw: {} }), null);
});

test("cleans markup and entities and limits excerpts to three source sentences", () => {
  const excerpt = gameRecommendationDescriptionExcerpt(
    "<p>First &amp; foremost.</p><p>Second sentence.</p><p>Third sentence.</p><p>Fourth sentence.</p>",
  );
  assert.equal(excerpt, "First & foremost. Second sentence. Third sentence.");
  assert.doesNotMatch(excerpt || "", /<[^>]+>|&amp;/);
});

test("long descriptions truncate at a word boundary and empty descriptions stay absent", () => {
  const excerpt = gameRecommendationDescriptionExcerpt(`A premise ${"carefully ".repeat(60)}resolved`);
  assert.ok(excerpt);
  assert.ok((excerpt?.length || 0) <= 421);
  assert.match(excerpt || "", /carefully…$/);
  assert.equal(gameRecommendationDescriptionExcerpt("   "), null);
});
