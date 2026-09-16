import assert from "node:assert/strict";
import test from "node:test";
import type { NormalizedCandidate } from "../../app/recommender-v2/types";
import { adaptLocalCollectionSourceRecord } from "../localCollection/presentation";
import {
  anonymousMelaniePremise,
  catalogMelanieStories,
  selectMelanieDescription,
  type MelanieDescriptionRejectionReason,
} from "./melanieDescriptionQuality";

function candidate(overrides: Partial<NormalizedCandidate> = {}): NormalizedCandidate {
  return {
    id: "book-1",
    source: "googleBooks",
    sourceId: "source-1",
    title: "Night Signals",
    creators: ["Alex Example"],
    description: undefined,
    displayDescription: undefined,
    formats: ["book"],
    genres: ["Mystery"],
    themes: ["secrets"],
    tones: ["tense"],
    characterDynamics: ["investigator"],
    raw: {},
    diagnostics: {},
    ...overrides,
  };
}

const GOOD_PREMISE = "When victims turn up in Los Angeles wearing mysterious masks, Jessie quickly realizes a deranged killer is at work and must stop the next attack before another victim disappears.";

test("rejects endorsements instead of treating praise as a premise", () => {
  const result = selectMelanieDescription(candidate({
    displayDescription: "Wilson, New York Times best-selling author of Robopocalypse ‘Fantastic, compelling, and authoritative.’ —General David Petraeus (US Army, Ret.)",
  }));
  assert.equal(result.selection, null);
  assert.equal(result.diagnostic.rejectionReason, "review_or_endorsement");
});

test("rejects review roundups, author-series metadata, and contextless fragments", () => {
  const fixtures: [string, string, string[], MelanieDescriptionRejectionReason][] = [
    [
      "‘A fabulously satisfying addition to the canon of vintage crime’ DAILY EXPRESS ‘One of the best in the genre’ THE SUN ‘Tremendous fun’ THE INDEPENDENT",
      "Resort to Murder",
      ["Vivian Conroy"],
      "review_or_endorsement",
    ],
    [
      "With In the Dark, Billingham steps briefly away from his bestselling series featuring Detective Inspector Tom Thorne and delivers a powerful story of cops and criminals.",
      "In the Dark",
      ["Mark Billingham"],
      "author_biography",
    ],
    [
      "Tom Sawyer, Detective follows Twain's popular novels The Adventures of Tom Sawyer, Adventures of Huckleberry Finn, and Tom Sawyer Abroad.",
      "Tom Sawyer, Detective",
      ["Mark Twain"],
      "author_biography",
    ],
    [
      "In only a few short weeks, she has seen her plans crumble before her eyes.",
      "Chain of Thorns",
      ["Cassandra Clare"],
      "no_story_premise",
    ],
    [
      "‘A riveting story of an imaginative world of ancient creatures woven into the real world.’ What Book Next?",
      "Spark Hunter",
      ["Sonya Wilson"],
      "review_or_endorsement",
    ],
    [
      "In the Dark is a magnificent achievement by a modern master whose latest novel was named Crime Novel of the Year.",
      "In the Dark",
      ["Mark Billingham"],
      "academic_or_catalog_metadata",
    ],
    [
      "In The Cardboard Kingdom, you can be anything you want to be--imagine that!",
      "The Cardboard Kingdom",
      ["Chad Sell"],
      "generic_promotion_without_premise",
    ],
  ];
  for (const [description, title, creators, reason] of fixtures) {
    const result = selectMelanieDescription(candidate({ title, creators, displayDescription: description }));
    assert.equal(result.selection, null, description);
    assert.equal(result.diagnostic.rejectionReason, reason, description);
  }
});

test("skips marketing and keeps a later child-friendly premise sentence", () => {
  const result = selectMelanieDescription(candidate({
    title: "Splat the Cat and the Quick Chicks",
    creators: ["Rob Scotton"],
    raw: {
      volumeInfo: {
        description: "Splat's class project is taking care of chicken eggs in this I Can Read book from New York Times bestselling author-artist Rob Scotton. When Splat takes the chicks home overnight, they hatch and run loose around his house! They pop up in the bathroom and hide inside his socks.",
      },
    },
  }));
  assert.equal(
    result.selection?.anonymizedDescription,
    "When Splat takes the chicks home overnight, they hatch and run loose around his house!",
  );
});

test("keeps abbreviated names intact and rejects series metadata after cleanup", () => {
  const dragon = selectMelanieDescription(candidate({
    title: "The Reluctant Dragon",
    displayDescription: "The boy who finds the dragon in the cave knows it is a kindly, harmless one, but how can he convince the frightened villagers and especially St. George?",
  }));
  assert.match(dragon.selection?.cleanedDescription || "", /St George\?$/);

  const series = selectMelanieDescription(candidate({
    title: "The No. 1 Ladies' Detective Agency",
    creators: ["Alexander McCall Smith"],
    displayDescription: "The No. 1 Ladies Detective Agency series tells the story of Precious Ramotswe, who is drawn to her profession to help people with problems in their lives.",
  }));
  assert.equal(series.selection, null);
  assert.equal(series.diagnostic.rejectionReason, "academic_or_catalog_metadata");
});

test("rejects generic reading promotion even when it mentions plots and characters", () => {
  const result = selectMelanieDescription(candidate({
    displayDescription: "The active, engaging stories have appealing plots and lovable characters, encouraging children to continue their reading journey.",
  }));
  assert.equal(result.selection, null);
  assert.equal(result.diagnostic.rejectionReason, "generic_promotion_without_premise");
});

test("rejects an isolated prose excerpt that does not summarize the story", () => {
  const result = selectMelanieDescription(candidate({
    title: "Five Children and It",
    displayDescription: "The house was three miles from the station, but, before the dusty hired fly had rattled along for five minutes, the children began to put their heads out of the carriage window and to say, \"Aren't we nearly there?\"",
  }));
  assert.equal(result.selection, null);
  assert.equal(result.diagnostic.rejectionReason, "no_story_premise");
});

test("does not append author biography to a valid short premise", () => {
  const result = selectMelanieDescription(candidate({
    title: "The Children of Kidillin",
    creators: ["Enid Blyton"],
    displayDescription: "The narrative follows four children who discover the magical hidden world of Kidillin. Her passion for storytelling and understanding of child psychology enabled her to create relatable characters that captivate young readers.",
  }));
  assert.equal(
    result.selection?.cleanedDescription,
    "The narrative follows four children who discover the magical hidden world of Kidillin.",
  );
});

test("rejects academic abstracts even when they contain a plot sentence", () => {
  const result = selectMelanieDescription(candidate({
    title: "Pretties with Ugly Thoughts",
    displayDescription: "Seminar paper from the year 2013 in the subject English Literature, grade: 1.0, course: Dystopian Fiction, language: English, abstract: A girl lives in a society whose citizens undergo an operation to be made pretty.",
  }));
  assert.equal(result.selection, null);
  assert.equal(result.diagnostic.rejectionReason, "academic_or_catalog_metadata");
});

test("rejects routine excerpts and title-led catalog copy that anonymize badly", () => {
  const selfieResult = selectMelanieDescription(candidate({
    title: "The Girl with the Mermaid Hair",
    displayDescription: "Sukie Jamieson takes a selfie after her tennis lesson. She takes one before she has to give a presentation in class.",
  }));
  assert.equal(selfieResult.selection, null);

  const titleResult = selectMelanieDescription(candidate({
    title: "The Speed of Souls: A Novel",
    displayDescription: "The Speed of Souls is the heart-warming journey of a dog who dies and comes back as a cat.",
  }));
  assert.equal(titleResult.selection, null);
  assert.equal(titleResult.diagnostic.rejectionReason, "academic_or_catalog_metadata");
});

test("rejects anonymization that would leave a repeated nonsensical title placeholder", () => {
  const result = selectMelanieDescription(candidate({
    title: "Foundation",
    creators: ["Isaac Asimov"],
    raw: {
      description: "The story of our future begins with the history of Foundation and its greatest scientist. But soon the fledgling Foundation finds itself at the mercy of corrupt warlords.",
    },
  }));
  assert.equal(result.selection, null);
  assert.equal(result.diagnostic.rejectionReason, "identity_could_not_be_hidden");
});

test("accepts a concrete plot premise and keeps it source-grounded", () => {
  const result = selectMelanieDescription(candidate({
    raw: { volumeInfo: { description: `<p>${GOOD_PREMISE}</p>` } },
  }));
  assert.equal(result.selection?.descriptionSource, "googleBooks.publisherSynopsis");
  assert.equal(result.selection?.cleanedDescription, GOOD_PREMISE);
  assert.equal(result.selection?.anonymizedDescription, GOOD_PREMISE);
});

test("strips a leading award label when a genuine premise follows", () => {
  const descriptions = [
    "GOLD MEDAL WINNER - GLOBAL BOOK AWARDS, Teen & Young Adult Sci-Fi Fantasy Three teens with powers that defy science take on a warring planet destroyed by climate change.",
    "NEW YORK TIMES BESTSELLING SERIES • At a hidden magical school, a teen boy must confront evil spirits and family secrets.",
  ];
  for (const description of descriptions) {
    const result = selectMelanieDescription(candidate({
      raw: {
        volumeInfo: {
          description,
        },
      },
    }));
    assert.ok(result.selection?.cleanedDescription);
    assert.doesNotMatch(result.selection?.cleanedDescription || "", /award|bestsell/i);
  }
});

test("prefers MARC 520, then Google Books, then Open Library for duplicate works", () => {
  const title = "Shared Story";
  const creators = ["Morgan Writer"];
  const openLibrary = candidate({
    id: "ol",
    source: "openLibrary",
    sourceId: "ol",
    title,
    creators,
    raw: { description: "When a cartographer finds an impossible island on every map, she follows its clues and uncovers a secret that could erase her coastal town." },
  });
  const googleBooks = candidate({
    id: "gb",
    sourceId: "gb",
    title,
    creators,
    raw: { volumeInfo: { description: "After a hidden letter arrives, a young cartographer crosses a stormy sea to find the vanished explorer who can save her family." } },
  });
  const localMarc = candidate({
    id: "local",
    source: "localLibrary",
    sourceId: "local",
    title,
    creators,
    raw: {
      descriptionSource: "marc520",
      description: "When her village lighthouse goes dark, a young mapmaker follows a forbidden chart and must relight it before the winter fleet reaches shore.",
    },
  });
  const result = catalogMelanieStories([openLibrary, googleBooks, localMarc], false);
  assert.equal(result.stories.length, 1);
  assert.equal(result.stories[0].source, "localLibrary");
  assert.equal(result.diagnostics.candidates[0].rejectionReason, "duplicate_lower_priority");
  assert.equal(result.diagnostics.candidates[1].rejectionReason, "duplicate_lower_priority");
  assert.equal(result.diagnostics.candidates[2].descriptionSource, "marc520");
});

test("falls through a rejected higher-priority description to a usable source", () => {
  const title = "Shared Story";
  const creators = ["Morgan Writer"];
  const localMarc = candidate({
    id: "local",
    source: "localLibrary",
    title,
    creators,
    raw: {
      descriptionSource: "marc520",
      description: "A stunning, essential, unforgettable book that readers everywhere will love and recommend to all their friends.",
    },
  });
  const googleBooks = candidate({
    id: "gb",
    title,
    creators,
    raw: { volumeInfo: { description: GOOD_PREMISE } },
  });
  const result = catalogMelanieStories([localMarc, googleBooks], false);
  assert.equal(result.stories.length, 1);
  assert.equal(result.stories[0].source, "googleBooks");
  assert.equal(result.diagnostics.rejectionReasons.generic_promotion_without_premise, 1);
});

test("rejects non-premise description classes with explicit reasons", () => {
  const cases: [string, MelanieDescriptionRejectionReason][] = [
    ["Alex Example is the award-winning author of six novels and lives in Seattle with two dogs and a cat.", "author_biography"],
    ["Winner of the National Book Award and a New York Times bestseller celebrated by readers around the world.", "awards_or_bestseller_claim"],
    ["A scholarly monograph with bibliography, footnotes, references, and an extensive index for classroom research.", "academic_or_catalog_metadata"],
    ["Hardcover, 320 pages. First edition published by Example Press. ISBN-13: 9780000000000.", "publication_metadata"],
    ["Table of contents: Chapter One; Chapter Two; Chapter Three; Chapter Four; Chapter Five.", "table_of_contents"],
    ["A gripping, compelling, unforgettable, and essential read that is perfect for fans and readers everywhere.", "generic_promotion_without_premise"],
    ["When a detective finds the first clue, she follows it into the abandoned station where the missing children...", "truncated_or_garbled"],
  ];
  for (const [description, reason] of cases) {
    const result = selectMelanieDescription(candidate({ displayDescription: description }));
    assert.equal(result.selection, null, description);
    assert.equal(result.diagnostic.rejectionReason, reason, description);
  }
});

test("uses complete source sentences, removes duplicates, and never chops mid-sentence", () => {
  const first = "When a lonely apprentice discovers a clock that can reverse one minute, she uses it to protect her brother from a dangerous rival.";
  const second = "Each attempt changes a different memory, forcing her to decide what she is willing to lose.";
  const result = selectMelanieDescription(candidate({
    displayDescription: `<p>${first}</p><p>${first}</p><p>${second}</p><p>Readers will love this unforgettable adventure.</p>`,
  }));
  assert.equal(result.selection?.cleanedDescription, first);
  assert.match(result.selection?.cleanedDescription || "", /[.!?]$/);
  assert.doesNotMatch(result.selection?.cleanedDescription || "", /<[^>]+>/);
});

test("hides title identity mechanically without inventing a new premise", () => {
  const premise = "When Night Signals begins broadcasting warnings from tomorrow, a student investigator follows the messages and discovers that her own disappearance is next.";
  const anonymous = anonymousMelaniePremise(premise, "Night Signals", ["Alex Example"]);
  assert.equal(anonymous, "When the protagonist begins broadcasting warnings from tomorrow, a student investigator follows the messages and discovers that her own disappearance is next.");
  assert.doesNotMatch(anonymous || "", /Night Signals|Alex Example/i);
});

test("records candidate-level and aggregate acceptance diagnostics", () => {
  const accepted = candidate({ raw: { volumeInfo: { description: GOOD_PREMISE } } });
  const rejected = candidate({
    id: "book-2",
    sourceId: "source-2",
    title: "Metadata Only",
    displayDescription: "Paperback, 240 pages. Published by Example Press. ISBN: 9780000000000.",
  });
  const result = catalogMelanieStories([accepted, rejected], false);
  assert.equal(result.diagnostics.totalCandidates, 2);
  assert.equal(result.diagnostics.acceptedCandidates, 1);
  assert.equal(result.diagnostics.rejectedCandidates, 1);
  assert.equal(result.diagnostics.byCandidateSource.googleBooks.total, 2);
  assert.equal(result.diagnostics.rejectionReasons.publication_metadata, 1);
  assert.equal(result.diagnostics.candidates[0].originalDescription, GOOD_PREMISE);
  assert.equal(result.diagnostics.candidates[0].anonymizedDescription, GOOD_PREMISE);
});

test("marks imported MARC descriptions as MARC 520 provenance", () => {
  const adapted = adaptLocalCollectionSourceRecord(
    { localId: "marc-1", title: "Harbor Secret", author: "A. Writer", description: GOOD_PREMISE },
    { sourceFormat: "marc21" },
  );
  assert.equal(adapted.descriptionSource, "marc520");
});

test("recognizes usable source-grounded fields from every supported book source", () => {
  const fixtures: [NormalizedCandidate["source"], Record<string, unknown>, string][] = [
    ["googleBooks", { volumeInfo: { description: GOOD_PREMISE } }, "googleBooks.publisherSynopsis"],
    ["openLibrary", { description: GOOD_PREMISE }, "openLibrary.description"],
    ["localLibrary", { description: GOOD_PREMISE, descriptionSource: "marc520" }, "marc520"],
    ["kitsu", { attributes: { synopsis: GOOD_PREMISE } }, "kitsu.synopsis"],
    ["comicVine", { raw: { description: GOOD_PREMISE } }, "comicVine.description"],
    ["nyt", { description: GOOD_PREMISE }, "nyt.publisherDescription"],
  ];
  for (const [source, raw, descriptionSource] of fixtures) {
    const result = selectMelanieDescription(candidate({ source, raw }));
    assert.equal(result.selection?.descriptionSource, descriptionSource, source);
    assert.equal(result.selection?.anonymizedDescription, GOOD_PREMISE, source);
  }
});
