#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const adminSource = readFileSync(resolve("app", "app_admin-web.tsx"), "utf8");
const guideSource = readFileSync(resolve("components", "admin", "LibrarianSetupGuideModal.tsx"), "utf8");

assert.match(adminSource, /const \[setupGuideVisible, setSetupGuideVisible\] = useState\(false\)/);
assert.match(adminSource, /onPress=\{\(\) => setSetupGuideVisible\(true\)\}/);
assert.match(adminSource, /visible=\{setupGuideVisible\}/);
assert.match(adminSource, /onClose=\{\(\) => setSetupGuideVisible\(false\)\}/);

const openHandler = adminSource.match(/onPress=\{\(\) => setSetupGuideVisible\(true\)\}/)?.[0] || "";
const closeHandler = adminSource.match(/onClose=\{\(\) => setSetupGuideVisible\(false\)\}/)?.[0] || "";
assert(!/setConfig|setIsDirty|onSave|onDiscard/.test(openHandler));
assert(!/setConfig|setIsDirty|onSave|onDiscard/.test(closeHandler));

for (const requiredText of [
  "Create or Select Your Library",
  "A. Library Identity",
  "B. Appearance",
  "Reader Experience: Age Groups",
  "Reader Experience: Swipe Categories",
  "D. Recommendation Sources",
  "E. Local Collection",
  "F. Admin Security",
  "G. Advanced",
  "Save and Test",
  "Kids (K–2)",
  "Pre-Teens (3–6)",
  "Teens (Middle & High School)",
  "Google Books",
  "Open Library",
  "Kitsu (Manga)",
  "ComicVine (Comics)",
  "New York Times (limited)",
  "cannot run alongside external sources",
  "They do not turn recommendation sources on or off",
  "Guest mode",
]) {
  assert(guideSource.includes(requiredText), `guide must include: ${requiredText}`);
}

const orderedSections = [
  "Create or Select Your Library",
  "A. Library Identity",
  "B. Appearance",
  "Reader Experience: Age Groups",
  "Reader Experience: Swipe Categories",
  "D. Recommendation Sources",
  "E. Local Collection",
  "F. Admin Security",
  "G. Advanced",
  "Save and Test",
];
let previousSectionIndex = -1;
for (const section of orderedSections) {
  const sectionIndex = guideSource.indexOf(section);
  assert(sectionIndex > previousSectionIndex, `${section} must follow the prior guide section`);
  previousSectionIndex = sectionIndex;
}

assert.match(guideSource, /<Modal[\s\S]*transparent[\s\S]*onRequestClose=\{onClose\}/);
assert.match(guideSource, /testID="librarian-setup-guide-dialog"/);
assert.match(guideSource, /maxWidth: 760/);
assert.match(guideSource, /width: "100%"/);
assert.match(guideSource, /maxHeight: "94%"/);
assert.match(guideSource, /<ScrollView/);
assert.match(guideSource, /Closing this guide keeps your current draft unchanged/);
assert.match(guideSource, /<LibrarianSetupVideo colors=\{colors\} \/>/);
assert.match(guideSource, /src: "\/librarian-setup-guide\.mp4"/);
assert.match(guideSource, /controls: true/);
assert.match(guideSource, /playsInline: true/);
assert(
  guideSource.indexOf("<LibrarianSetupVideo colors={colors} />") < guideSource.indexOf("GUIDE_SECTIONS.map"),
  "video walkthrough must appear before the written guide sections"
);

console.log("Librarian Setup Guide regressions passed.");
