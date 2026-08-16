#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(resolve(root, "screens", "SwipeDeckScreen.tsx"), "utf8");

assert(!source.includes("â˜"), "rating controls must not contain mojibake star sequences");
assert(source.includes('import MaterialIcons from "@expo/vector-icons/MaterialIcons"'), "rating controls must use the supported Material Icons package");

const ratingRowStart = source.indexOf("{([1, 2, 3, 4, 5] as const).map");
const ratingRowEnd = source.indexOf("</View>", ratingRowStart);
const ratingRow = source.slice(ratingRowStart, ratingRowEnd);

assert(ratingRowStart >= 0, "five-option rating row must remain present");
assert(ratingRow.includes('<MaterialIcons'), "each mapped rating option must render a star icon");
assert(ratingRow.includes('name={filled ? "star" : "star-border"}'), "rating icon must preserve filled and empty preview states");
assert(ratingRow.includes("size={26}"), "rating icon must preserve the existing mobile star size");
assert(ratingRow.includes("{ratingLabel(r)}"), "existing five rating meanings must remain unchanged");

for (const label of ["Hated it", "Didn't like it", "It was ok", "Liked it", "Loved it"]) {
  assert(source.includes(`return "${label}"`), `rating label must remain: ${label}`);
}

process.stdout.write("PASS rating row uses Material Icons without mojibake\n");
process.stdout.write("PASS five rating meanings and preview states remain unchanged\n");
