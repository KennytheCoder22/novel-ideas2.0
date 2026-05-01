Place local swipe-card fallback images in this folder.

How to wire an image:
1. Add an image file here (example: `the-grand-budapest-hotel.jpg`).
2. Register it in `assets/swipeCardFallback/index.ts` by adding an entry to `SWIPE_CARD_FALLBACKS`.
3. Match by `title` and optional `author` exactly as they appear on the swipe card.

These images are only used when live internet image lookup does not return a usable image.
