Place local swipe-card images here and register them in `data/swipeCardImageMap.ts`.

Example:

```ts
export const SWIPE_CARD_LOCAL_IMAGE_MAP = {
  "the expanse::prime video": require("../assets/swipe-cards/the-expanse.jpg"),
};
```

This allows swipe cards to render without any network lookups.
