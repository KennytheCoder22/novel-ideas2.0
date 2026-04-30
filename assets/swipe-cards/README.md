Place local swipe-card images here and register them in `data/swipeCardImageMap.ts`.

### Automated population

Run:

```bash
node scripts/fetch-swipe-images.mjs
```

This script:
1. Parses deck files for card titles / wiki titles.
2. Downloads Wikipedia thumbnails.
3. Writes local files into this folder.
4. Rewrites `data/swipeCardImageMap.ts` with the mapped local assets.

This allows swipe cards to render without runtime network lookups.
