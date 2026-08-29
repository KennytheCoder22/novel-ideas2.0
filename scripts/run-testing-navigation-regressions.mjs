import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveTestingReturnTo } from "../screens/swipe/testingNavigation.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const testingSource = readFileSync(resolve(root, "app/testing.tsx"), "utf8");
const swipeDeckSource = readFileSync(resolve(root, "screens/SwipeDeckScreen.tsx"), "utf8");
const homeSource = readFileSync(resolve(root, "app/(tabs)/index.tsx"), "utf8");

assert.match(testingSource, />← Back<\/Text>/, "testing header must render a visible Back control");
assert.match(testingSource, /accessibilityLabel="Back to NovelIdeas"/, "testing Back control must be accessible");
assert.match(testingSource, /router\.replace\(returnTo as any\)/, "testing Back must use an explicit route destination");
assert.doesNotMatch(testingSource, /router\.back\(\)/, "browser history must not be the primary testing exit");
assert.match(
  homeSource,
  /returnTo: props\.libraryId \? `\/\$\{encodeURIComponent\(props\.libraryId\)\}` : "\/"/,
  "hosted-library entry must preserve its route",
);

assert.equal(resolveTestingReturnTo("/yvhs"), "/yvhs", "hosted-library return destination must be preserved");
assert.equal(resolveTestingReturnTo(["/yvhs"]), "/yvhs", "array route parameters must preserve the first destination");
assert.equal(resolveTestingReturnTo("/"), "/", "home return destination must be preserved");
assert.equal(resolveTestingReturnTo("/yvhs?tab=swipe"), "/yvhs?tab=swipe", "safe route context must be preserved");

for (const unsafe of [undefined, "", "https://example.com", "//example.com", "/\\example.com", "/testing", "/testing?intro=1"]) {
  assert.equal(resolveTestingReturnTo(unsafe), "/", `unsafe destination must fall back home: ${String(unsafe)}`);
}

assert.match(testingSource, /onExitTesting=\{handleCancel\}/, "testing route must pass its route exit into the workflow");
assert.match(swipeDeckSource, /onExitTesting\?: \(\) => void/, "SwipeDeckScreen must accept the testing exit");
assert.match(swipeDeckSource, /humanReviewWorkflowExitButton/, "evaluation modal must expose an in-app exit");
assert.match(swipeDeckSource, /humanReviewCompletionExitButton/, "completion screen must expose an in-app exit");
assert.match(
  swipeDeckSource,
  /function exitCompletedTestingWorkflow\(\)[\s\S]*?props\.onCompleteAnonymousReview\?\.\(\);[\s\S]*?props\.onExitTesting\?\.\(\);/,
  "completed anonymous-review exit must preserve completion bookkeeping before leaving testing",
);

console.log("Testing navigation regressions passed.");
