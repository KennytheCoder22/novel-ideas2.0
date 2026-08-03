// scripts/prefetch-cover-urls.mjs
// Fetches Google Books cover URLs for all swipe deck cards.
// Usage: node scripts/prefetch-cover-urls.mjs
// Output: assets/coverUrls.json

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const API_KEY = 'AIzaSyA30JKOdHpoHYyfloKuQ8jZMt1zputWOUM';
const OUT_FILE = join(ROOT, 'assets', 'coverUrls.json');
const DELAY_MS = 150; // stay well under Google Books rate limits

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Extract cards from TypeScript deck files by parsing title/author patterns
function extractCards(tsSource) {
  const cards = [];
  // Match objects that have a title field
  const titleRegex = /title:\s*['"]([^'"]+)['"]/g;
  const authorRegex = /author:\s*['"]([^'"]+)['"]/g;
  
  let titleMatch;
  while ((titleMatch = titleRegex.exec(tsSource)) !== null) {
    // Find the nearest author after this title position
    authorRegex.lastIndex = titleMatch.index;
    const authorMatch = authorRegex.exec(tsSource);
    // Only use author if it appears before the next title
    const nextTitleMatch = /title:\s*['"]/.exec(tsSource.slice(titleMatch.index + 1));
    const nextTitlePos = nextTitleMatch ? titleMatch.index + 1 + nextTitleMatch.index : Infinity;
    const author = (authorMatch && authorMatch.index < nextTitlePos) ? authorMatch[1] : undefined;
    cards.push({ title: titleMatch[1], author });
  }
  return cards;
}

function normalizeKey(title, author) {
  const t = String(title || '').toLowerCase().trim().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
  const a = String(author || '').toLowerCase().trim().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
  return a ? `${t}|${a}` : t;
}

async function fetchCoverUrl(title, author) {
  const qParts = [];
  const safeTitle = String(title || '').trim();
  if (safeTitle) qParts.push(`intitle:${safeTitle}`);
  const safeAuthor = String(author || '').trim();
  if (safeAuthor) qParts.push(`inauthor:${safeAuthor}`);
  if (qParts.length === 0) return null;

  const params = new URLSearchParams();
  params.set('q', qParts.join(' '));
  params.set('printType', 'books');
  params.set('orderBy', 'relevance');
  params.set('maxResults', '1');
  params.set('langRestrict', 'en');
  params.set('key', API_KEY);

  const url = `https://www.googleapis.com/books/v1/volumes?${params}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  const imageLinks = json?.items?.[0]?.volumeInfo?.imageLinks || {};
  const thumb = imageLinks.thumbnail || imageLinks.smallThumbnail;
  if (!thumb) return null;
  return String(thumb).replace(/^http:\/\//, 'https://');
}

async function main() {
  const deckFiles = ['k2', '36', 'ms_hs', 'adult'].map(name => ({
    name,
    path: join(ROOT, 'data', 'swipeDecks', `${name}.ts`),
  }));

  // Load existing map to allow incremental runs
  let existing = {};
  if (existsSync(OUT_FILE)) {
    try { existing = JSON.parse(readFileSync(OUT_FILE, 'utf-8')); } catch {}
  }

  const map = { ...existing };
  let fetched = 0;
  let skipped = 0;
  let failed = 0;

  for (const { name, path } of deckFiles) {
    const source = readFileSync(path, 'utf-8');
    const cards = extractCards(source);
    console.log(`[${name}] ${cards.length} cards`);

    for (const { title, author } of cards) {
      const key = normalizeKey(title, author);
      if (map[key]) { skipped++; continue; }
      await sleep(DELAY_MS);
      try {
        const url = await fetchCoverUrl(title, author);
        if (url) {
          map[key] = url;
          fetched++;
          console.log(`  ✓ ${title}`);
        } else {
          failed++;
          console.log(`  ✗ ${title} (no cover found)`);
        }
      } catch (e) {
        failed++;
        console.log(`  ! ${title} (error: ${e.message})`);
      }
    }
  }

  writeFileSync(OUT_FILE, JSON.stringify(map, null, 2));
  console.log(`\nDone. fetched=${fetched} skipped=${skipped} failed=${failed} total=${Object.keys(map).length}`);
}

main().catch(console.error);
