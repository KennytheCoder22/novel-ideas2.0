function normalizeCoverUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  const httpsValue = value.replace(/^http:\/\//i, "https://");
  try {
    const parsed = new URL(httpsValue);
    if (!/^https?:$/i.test(parsed.protocol)) return "";
    if (!parsed.hostname) return "";
    if (!parsed.pathname || parsed.pathname === "/") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function candidateListFromDoc(doc, cacheCover = "") {
  const source = doc || {};
  const raw = source.raw && typeof source.raw === "object" ? source.raw : {};
  const imageLinks = source.imageLinks && typeof source.imageLinks === "object" ? source.imageLinks : {};
  const volumeInfo = source.volumeInfo && typeof source.volumeInfo === "object" ? source.volumeInfo : {};
  const rawVolumeInfo = raw.volumeInfo && typeof raw.volumeInfo === "object" ? raw.volumeInfo : {};
  const rawImageLinks = rawVolumeInfo.imageLinks && typeof rawVolumeInfo.imageLinks === "object" ? rawVolumeInfo.imageLinks : {};
  const direct = [
    source.imageUrl,
    source.coverImageUrl,
    source.thumbnail,
    source.smallThumbnail,
    imageLinks.thumbnail,
    imageLinks.smallThumbnail,
    volumeInfo.imageLinks && typeof volumeInfo.imageLinks === "object" ? volumeInfo.imageLinks.thumbnail : "",
    volumeInfo.imageLinks && typeof volumeInfo.imageLinks === "object" ? volumeInfo.imageLinks.smallThumbnail : "",
    raw.thumbnail,
    raw.smallThumbnail,
    raw.coverImageUrl,
    raw.imageUrl,
    rawImageLinks.thumbnail,
    rawImageLinks.smallThumbnail,
    cacheCover,
  ];
  const seen = new Set();
  const out = [];
  for (const candidate of direct) {
    const normalized = normalizeCoverUrl(candidate);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function resolveCover(doc, cacheCover = "", broken = []) {
  const brokenSet = new Set((Array.isArray(broken) ? broken : []).map((row) => String(row || "").trim().toLowerCase()).filter(Boolean));
  const candidates = candidateListFromDoc(doc, cacheCover);
  const firstUsable = candidates.find((candidate) => !brokenSet.has(candidate.toLowerCase()));
  if (firstUsable) {
    return {
      coverUrl: firstUsable,
      fallback: "source_cover",
    };
  }
  return {
    coverUrl: "",
    fallback: "placeholder",
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function main() {
  const checks = [];

  const validCover = resolveCover({ imageUrl: "https://cdn.example.com/valid.jpg" });
  assert(validCover.coverUrl === "https://cdn.example.com/valid.jpg", "valid_cover_not_selected");
  checks.push({ name: "valid_cover", pass: true });

  const nullCover = resolveCover({});
  assert(!nullCover.coverUrl && nullCover.fallback === "placeholder", "null_cover_not_placeholder");
  checks.push({ name: "null_cover_placeholder", pass: true });

  const brokenCover = resolveCover(
    { imageUrl: "https://cdn.example.com/broken.jpg" },
    "",
    ["https://cdn.example.com/broken.jpg"],
  );
  assert(!brokenCover.coverUrl && brokenCover.fallback === "placeholder", "broken_cover_not_placeholder");
  checks.push({ name: "broken_cover_placeholder", pass: true });

  const alternateCover = resolveCover(
    {
      imageUrl: "https://cdn.example.com/broken-primary.jpg",
      raw: {
        volumeInfo: {
          imageLinks: {
            thumbnail: "https://cdn.example.com/alternate-approved.jpg",
          },
        },
      },
    },
    "",
    ["https://cdn.example.com/broken-primary.jpg"],
  );
  assert(alternateCover.coverUrl === "https://cdn.example.com/alternate-approved.jpg", "alternate_cover_not_selected");
  checks.push({ name: "alternate_approved_cover", pass: true });

  const invalidPrimaryValidAlternate = resolveCover({
    imageUrl: "javascript:alert(1)",
    raw: { imageUrl: "http://cdn.example.com/http-alt.jpg" },
  });
  assert(invalidPrimaryValidAlternate.coverUrl === "https://cdn.example.com/http-alt.jpg", "invalid_primary_not_rejected");
  checks.push({ name: "invalid_url_validation", pass: true });

  process.stdout.write(`${JSON.stringify({ ok: true, checks }, null, 2)}\n`);
}

main();
