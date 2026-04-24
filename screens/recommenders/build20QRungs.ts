// NOTE: This file has been patched to fix historical rung collapse.
// Key change: removed early return for historical and injected historicalQueries into candidate pool.

export function build20QRungs(intent, maxRungs = 4) {
  const base = intent?.baseGenre || "";

  function isHistoricalIntent(intent, base) {
    const text = (base + " " + (intent?.subgenres || []).join(" ")).toLowerCase();
    return /historical/.test(text);
  }

  function buildHistoricalRungs(intent, maxRungs) {
    return [
      { rung: 0, query: "19th century american novel" },
      { rung: 1, query: "american society novel 19th century" },
      { rung: 2, query: "civil war historical fiction novel" },
      { rung: 3, query: "literary historical fiction novel" }
    ].slice(0, maxRungs);
  }

  const historicalQueries = isHistoricalIntent(intent, base)
    ? buildHistoricalRungs(intent, maxRungs).map(r => r.query)
    : [];

  const rankedHypothesisQueries = intent?.hypotheses?.map(h => h.query) || [];
  const fallbackQueries = ["historical fiction novel"];

  const candidateQueries = Array.from(new Set([
    ...historicalQueries,
    ...rankedHypothesisQueries,
    ...fallbackQueries
  ]));

  return candidateQueries.slice(0, maxRungs).map((q, i) => ({
    rung: i,
    query: q
  }));
}
