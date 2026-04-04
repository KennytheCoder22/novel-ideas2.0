# Manga slider integration notes

I added the two UI sliders in the panel:

- `kitsuSourceBoost`
- `minMangaResults`

## Still required in your codebase

To make this compile and function end-to-end, you still need to update the file that defines `RecommenderProfile` and `recommenderProfiles` defaults.

Add these numeric fields to `RecommenderProfile`:

```ts
kitsuSourceBoost: number;
minMangaResults: number;
```

Suggested defaults by lane:

```ts
kids:     { kitsuSourceBoost: 0, minMangaResults: 0 }
preTeen:  { kitsuSourceBoost: 0.5, minMangaResults: 0 }
teen:     { kitsuSourceBoost: 1.0, minMangaResults: 2 }
adult:    { kitsuSourceBoost: 0.5, minMangaResults: 1 }
```

## Then wire them into the recommender

### In scoring
```ts
if (candidate.source === 'kitsu') {
  score += profile.kitsuSourceBoost;
}
```

### In selection
Use:
```ts
const required = profile.minMangaResults;
```

instead of a hardcoded manga floor.

## Why I did not patch the override/storage files

Those files already sanitize dynamically from `recommenderProfiles`, so once the profile type/defaults are updated, they should accept the new keys automatically.
