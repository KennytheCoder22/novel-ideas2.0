// /screens/swipe/openLibraryPreTeen.ts
//
// Pre-Teen (3–6) band query shaping + guardrail keywords.
// NOTE: "OpenLibrary" naming is legacy; we are building Google Books queries.

import type { TagCounts } from "./openLibraryFromTags";
import { buildSwipeTermsQueryFromTagCounts } from "./openLibraryFromTags";
import { coreTagToKeywords, normalizeToken } from "./openLibraryCore";

function normalizeTokenLocal(s: string) {
  return normalizeToken(s);
}


export const DEFAULT_36_CARDS: any[] = [
  { title: "The Day the Crayons Quit", author: "Drew Daywalt", genre: "Picture Book / Humor" },
  { title: "The One and Only Ivan (Picture Book Edition)", author: "Katherine Applegate", genre: "Picture Book / Animals" },
  { title: "Each Kindness", author: "Jacqueline Woodson", genre: "Picture Book / SEL" },
  { title: "The Girl Who Never Made Mistakes", author: "Mark Pett", genre: "Picture Book / Humor" },
  { title: "The Fantastic Flying Books of Mr. Morris Lessmore", author: "William Joyce", genre: "Picture Book / Imagination" },

  { title: "Captain Underpants", author: "Dav Pilkey", genre: "Humor / Graphic" },
  { title: "Dog Man", author: "Dav Pilkey", genre: "Humor / Graphic" },
  { title: "The Bad Guys", author: "Aaron Blabey", genre: "Humor / Series" },
  { title: "Big Nate: In a Class by Himself", author: "Lincoln Peirce", genre: "Humor / School" },
  { title: "Diary of a Wimpy Kid", author: "Jeff Kinney", genre: "Humor / School" },

  { title: "Magic Tree House: Dinosaurs Before Dark", author: "Mary Pope Osborne", genre: "Adventure / Series" },
  { title: "Judy Moody", author: "Megan McDonald", genre: "Humor / Series" },
  { title: "Ivy + Bean", author: "Annie Barrows", genre: "Friendship / Series" },
  { title: "The Boxcar Children", author: "Gertrude Chandler Warner", genre: "Mystery / Series" },
  { title: "A to Z Mysteries: The Absent Author", author: "Ron Roy", genre: "Mystery / Series" },

  { title: "Because of Winn-Dixie", author: "Kate DiCamillo", genre: "Realistic / Animals" },
  { title: "Charlotte’s Web", author: "E. B. White", genre: "Classic / Animals" },
  { title: "The Tale of Despereaux", author: "Kate DiCamillo", genre: "Fantasy / Animals" },
  { title: "Wonder (Young Readers Edition)", author: "R. J. Palacio", genre: "Realistic / SEL" },

  { title: "Harry Potter and the Sorcerer’s Stone", author: "J. K. Rowling", genre: "Fantasy / School" },
  { title: "Percy Jackson: The Lightning Thief", author: "Rick Riordan", genre: "Mythology / Adventure" },
  { title: "The Lion, the Witch and the Wardrobe", author: "C. S. Lewis", genre: "Fantasy / Classic" },
  { title: "How to Train Your Dragon", author: "Cressida Cowell", genre: "Fantasy / Adventure" },

  { title: "The Wild Robot", author: "Peter Brown", genre: "Sci-Fi / Adventure" },
  { title: "Frindle", author: "Andrew Clements", genre: "School / Humor" },
  { title: "Wayside School Is Falling Down", author: "Louis Sachar", genre: "Humor / Weird" },
];

// Band-specific tag → keyword mapping (NO guardrails here; guardrail is applied in buildFinalQueryPreTeen).
export function tagToKeywordsPreTeen(tag: string): string[] {
  const [rawKey, rawVal] = tag.split(":");
  const key = (rawKey || "").trim();
  const raw = (rawVal || "").trim();

  if (!key || !raw) return [];

  // If a media signal contributes an "animation" tag, "illustrated" is generally a better book-search hint.
  const normalizedWhole = normalizeTokenLocal(raw);
  if (normalizedWhole === "animation" || normalizedWhole === "animated") {
    return ["illustrated"];
  }

  // If the deck uses compound label-style values (e.g., "Picture Book / Humor"),
  // split into multiple usable search terms for Google Books.
  if (raw.includes("/")) {
    const parts = raw
      .split("/")
      .map((p) => normalizeTokenLocal(p.trim()))
      .filter(Boolean);

    const keywords = parts.map((p) => (p.includes(" ") ? `"${p}"` : p));
    return keywords.length ? keywords : [];
  }

  return coreTagToKeywords(tag);
}

function stripAgeMarkers(tagCounts: TagCounts): TagCounts {
  const out: TagCounts = {};
  for (const [k, v] of Object.entries(tagCounts || {})) {
    if (k.startsWith("age:") || k.startsWith("audience:") || k.startsWith("ageBand:") || k.startsWith("band:"))
      continue;
    out[k] = v;
  }
  return out;
}

// Pre-Teen final query starts with a single quoted guardrail, followed by swipe terms.
export function buildFinalQueryPreTeen(tagCounts: TagCounts): string {
  const guardrail = 'subject:"juvenile fiction" "middle grade fiction"';
  const cleaned = stripAgeMarkers(tagCounts);
  const swipeTerms = buildSwipeTermsQueryFromTagCounts(cleaned, tagToKeywordsPreTeen).trim();
  return swipeTerms ? `${guardrail} ${swipeTerms}`.trim() : guardrail;
}
