const TIMEOUT_MS = 8000;

async function timedFetch(url, opts = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    const text = await res.text();
    return { ok: res.ok, status: res.status, body: text.slice(0, 500) };
  } catch (error) {
    return { ok: false, status: 0, error: String(error?.message || error) };
  } finally {
    clearTimeout(timeout);
  }
}

async function run() {
  const gbKey = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY || '';
  const kitsuApiBase = String(process.env.EXPO_PUBLIC_KITSU_API_BASE_URL || process.env.KITSU_API_BASE_URL || 'https://kitsu.app/api/edge').replace(/\/+$/, '');
  const gbUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent('mystery novel')}&maxResults=3${gbKey ? `&key=${encodeURIComponent(gbKey)}` : ''}`;
  const olUrl = `https://openlibrary.org/search.json?q=${encodeURIComponent('mystery novel')}&limit=3`;
  const kitsuUrl = `${kitsuApiBase}/manga?filter[text]=${encodeURIComponent('one piece')}&page[limit]=3`;

  const [googleBooks, openLibrary, kitsu] = await Promise.all([
    timedFetch(gbUrl),
    timedFetch(olUrl),
    timedFetch(kitsuUrl, { headers: { Accept: 'application/vnd.api+json' } }),
  ]);

  const summary = {
    source_health_failed: !(googleBooks.ok || openLibrary.ok || kitsu.ok),
    perSourceStatus: { googleBooks, openLibrary, kitsu },
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!googleBooks.ok && (googleBooks.status === 429 || googleBooks.status === 403)) {
    console.warn('googleBooks_temporarily_unavailable: quota_or_rate_limited');
  }

  if (summary.source_health_failed) {
    process.exitCode = 2;
  }
}

run();
