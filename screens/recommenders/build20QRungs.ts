type QueryIntent = {
  baseGenre?: string;
  subgenres?: string[];
  themes?: string[];
  tones?: string[];
};

function clean(q: string) {
  return q.toLowerCase().replace(/\s+/g, " ").trim();
}

function combine(parts: string[]) {
  return clean(parts.filter(Boolean).join(" "));
}

export function build20QRungs(intent: QueryIntent) {
  const tones = intent.tones || [];
  const themes = intent.themes || [];
  const subs = intent.subgenres || [];

  const out: string[] = [];

  const add = (q: string) => {
    const c = clean(q);
    if (c && !out.includes(c)) out.push(c);
  };

  // 🔥 TRUE 20Q COMBINATIONS — NO GENRE LOCKING

  add(combine([tones[0], themes[0], "novel"]));
  add(combine([themes[0], themes[1], "novel"]));
  add(combine([subs[0], themes[0], "novel"]));
  add(combine([tones[0], subs[0], "novel"]));

  // fallback
  add(intent.baseGenre || "novel");

  return out.slice(0, 4).map((q, i) => ({
    rung: i,
    query: q,
  }));
}

export function rungToPreviewQuery(r: any) {
  return r?.query || "";
}