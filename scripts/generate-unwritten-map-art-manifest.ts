import fs from "node:fs";
import path from "node:path";

import { UNWRITTEN_MAP_SCENARIOS } from "../lib/recommendationGames/unwrittenMap";
import { buildUnwrittenMapPresentationMetadata } from "../lib/recommendationGames/unwrittenMapPresentationContract";
import { UNWRITTEN_MAP_FOCAL_ASSET_PROVENANCE } from "../lib/recommendationGames/unwrittenMapArtAssets";
import { UNWRITTEN_MAP_REGION_REGISTRY } from "../lib/recommendationGames/unwrittenMapRegions";
import {
  buildUnwrittenMapArtInventorySummary,
  validateUnwrittenMapPresentation,
} from "../lib/recommendationGames/unwrittenMapPresentationValidator";

const root = path.resolve(__dirname, "..");
const outputPath = path.join(root, "docs", "unwritten-map-art-manifest.md");

function escaped(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function renderUnwrittenMapArtManifest(): string {
  const metadata = buildUnwrittenMapPresentationMetadata();
  const inventory = buildUnwrittenMapArtInventorySummary();
  const diagnostics = validateUnwrittenMapPresentation();
  const lines = [
    "# The Unwritten Map art manifest",
    "",
    "> Production focal-art gate: **BLOCKED** until every missing slot below is filled with authorized local illustrated raster art and `npm run audit:unwritten-map-presentation` passes.",
    "",
    `Required: **${inventory.required}** distinct assets (${inventory.encounters.required} encounter, ${inventory.choices.required} choice, ${inventory.results.required} result).`,
    `Approved and integrated: **${inventory.approved}** (${inventory.encounters.approved} encounter, ${inventory.choices.approved} choice, ${inventory.results.approved} result).`,
    `Missing/commissioning: **${inventory.missing}** (${inventory.encounters.missing} encounter, ${inventory.choices.missing} choice, ${inventory.results.missing} result).`,
    "",
    "## Delivery package",
    "",
    "- Deliver one ZIP preserving `assets/games/unwritten-map/illustrations/<region>/<scenario>/`.",
    "- Use the exact paths below. For new commissions, encounter and result art: WebP, 3:2, 1800x1200 recommended. Choice art: WebP, 4:3, 800x600 recommended. Existing approved supplied assets retain their authorized source dimensions.",
    "- Use sRGB. Do not bake option numbers, labels, UI, borders, or text into the image.",
    "- Authored in-world signs or decorative lettering may remain part of an illustration, but must not replace live accessible screen text or controls.",
    "- Artwork must be original or explicitly authorized for this project. Do not source third-party copyrighted art.",
    "- Player-performed choice and result scenes must visibly depict the explorer performing the named action.",
    "- Shared entry/map/journal/Mossmere frame assets are retained but do not satisfy any unique focal-art slot.",
    "",
    "## Approved asset provenance",
    "",
    "| Stable asset ID | Authorization | Source file | Source SHA-256 | Derived WebP SHA-256 | Actual derived dimensions |",
    "|---|---|---|---|---|---|",
    ...Object.entries(UNWRITTEN_MAP_FOCAL_ASSET_PROVENANCE).flatMap(([localAssetId, provenance]) => (
      provenance
        ? [`| \`${localAssetId}\` | ${provenance.authorization} | \`${provenance.sourceFile}\` | \`${provenance.sourceSha256}\` | \`${provenance.derivedSha256}\` | ${provenance.derivedDimensions} |`]
        : []
    )),
    "",
    "## Commissioning checklist",
    "",
  ];

  for (const encounter of metadata) {
    const scenario = UNWRITTEN_MAP_SCENARIOS.find((candidate) => candidate.id === encounter.scenarioId);
    if (!scenario) throw new Error(`Missing gameplay scenario ${encounter.scenarioId}`);
    const region = UNWRITTEN_MAP_REGION_REGISTRY[encounter.regionId];
    lines.push(`### ${scenario.title} — ${scenario.location}`);
    lines.push("");
    lines.push(`Region frame: **${region.name}** · environment \`${encounter.environmentId}\` · character/creature \`${encounter.characterId}\` · landmark/prop \`${encounter.landmarkId}\` · canonical motifs: ${region.canonicalMotifTokens.join(", ")}.`);
    lines.push("");
    lines.push("| Status | Stable asset ID | Local path | Slot | Premise/action brief | Explorer role | Environment | Characters/creatures | Landmark/prop | Mood | Palette | Target ratio | Recommended pixels |");
    lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|");

    const rows = [{
      art: encounter.focalArt,
      action: encounter.focalArt.brief,
      actor: encounter.actorRole,
      mood: encounter.moodId,
      choiceId: null,
    }, ...encounter.choices.flatMap((choice) => {
      const gameplayChoice = scenario.choices.find((candidate) => candidate.id === choice.choiceId);
      if (!gameplayChoice) throw new Error(`Missing gameplay choice ${encounter.scenarioId}/${choice.choiceId}`);
      return [
        {
          art: choice.focalArt,
          action: choice.focalArt.brief,
          actor: choice.actorRole,
          mood: choice.moodId,
          choiceId: choice.choiceId,
        },
        {
          art: choice.result.focalArt,
          action: choice.result.focalArt.brief,
          actor: choice.result.actorRole,
          mood: choice.result.moodId,
          choiceId: choice.choiceId,
        },
      ];
    })];

    for (const row of rows) {
      const validatedApproval = row.art.status === "approved"
        && !diagnostics.some((issue) => (
          issue.scope === row.art.slot
          && issue.scenarioId === encounter.scenarioId
          && issue.choiceId === row.choiceId
        ));
      lines.push([
        validatedApproval ? "APPROVED · supplied" : "MISSING · commission",
        `\`${row.art.assetId}\``,
        `\`${row.art.assetPath}\``,
        row.art.slot,
        escaped(row.action),
        row.art.slot === "encounter"
          ? row.art.depictsActorRoles.includes("explorer")
            ? `depicted (${row.actor} encounter)`
            : `not required (${row.actor})`
          : `required (${row.actor})`,
        `\`${encounter.environmentId}\``,
        `\`${encounter.characterId}\``,
        `\`${encounter.landmarkId}\``,
        `\`${row.mood}\``,
        `\`${row.art.paletteId}\``,
        row.art.targetAspectRatio,
        row.art.recommendedDimensions,
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

const rendered = renderUnwrittenMapArtManifest();
if (process.argv.includes("--check")) {
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
  if (current !== rendered) {
    console.error(`ART MANIFEST is stale. Run: npm run generate:unwritten-map-art-manifest`);
    process.exit(1);
  }
  console.log("The Unwritten Map art manifest is current.");
} else {
  fs.writeFileSync(outputPath, rendered);
  console.log(`Wrote ${path.relative(root, outputPath)}`);
}
