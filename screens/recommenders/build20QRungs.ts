// build20QRungs.ts
// 20Q-style rung builder

export function build20QRungs(intent, maxRungs = 4) {
  const base = intent.baseGenre || "novel";

  const core = [
    ...(intent.subgenres || []),
    ...(intent.themes || []),
    ...(intent.tones || []),
    "adult fiction",
    "novel",
  ].filter(Boolean);

  const rungs = [];
  const seen = new Set();

  for (let i = 0; i < maxRungs; i++) {
    const slice = core.slice(0, Math.max(2, core.length - i));
    const query = slice.join(" ").replace(/\s+/g, " ").trim();

    if (!query || seen.has(query)) continue;
    seen.add(query);

    rungs.push({ rung: i, query });
  }

  if (rungs.length === 0) {
    rungs.push({ rung: 0, query: base + " novel" });
  }

  return rungs;
}
