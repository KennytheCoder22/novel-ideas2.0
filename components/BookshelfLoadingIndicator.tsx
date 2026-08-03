// components/BookshelfLoadingIndicator.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  View,
  useWindowDimensions,
} from "react-native";

// ─── Book definitions ─────────────────────────────────────────────────────────

const BOOK_COLORS = [
  "#7c5c3a",
  "#5a3e28",
  "#8b6845",
  "#6b4c30",
  "#9b7b56",
  "#4a3322",
  "#a08060",
  "#3d2b1a",
];

const BOOK_HEIGHTS = [52, 60, 56, 48]; // px — alternating heights

const BOOK_WIDTH = 18;
const BOOK_GAP = 4;
const BOOK_COUNT = 14; // books per segment; we render 2 segments for seamless loop

interface BookDef {
  color: string;
  height: number;
  width: number;
  /* 0-based index, used to identify pull-and-inspect candidates */
  index: number;
  /* should this book be pulled? true for every 5th or 6th (alternating) */
  pullable: boolean;
}

function buildBooks(): BookDef[] {
  const books: BookDef[] = [];
  let pullCycle = 5; // alternates between 5 and 6
  let nextPull = pullCycle - 1; // 0-based index of next pullable book
  for (let i = 0; i < BOOK_COUNT; i++) {
    books.push({
      index: i,
      color: BOOK_COLORS[i % BOOK_COLORS.length],
      height: BOOK_HEIGHTS[i % BOOK_HEIGHTS.length],
      width: BOOK_WIDTH,
      pullable: i === nextPull,
    });
    if (i === nextPull) {
      nextPull += pullCycle;
      pullCycle = pullCycle === 5 ? 6 : 5;
    }
  }
  return books;
}

const BOOKS = buildBooks();
const SEGMENT_WIDTH = BOOK_COUNT * (BOOK_WIDTH + BOOK_GAP);

// ─── Loading messages ─────────────────────────────────────────────────────────

const MESSAGES = [
  "Looking through the shelves…",
  "Comparing books with your choices…",
  "Finding promising matches…",
  "Preparing your recommendations…",
];

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  loading: boolean;
}

export function BookshelfLoadingIndicator({ loading }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const diameter = screenWidth < 430 ? 150 : 200;

  // reduced-motion detection
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReducedMotionEnabled().then((enabled) => {
      if (!cancelled) setReducedMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      setReducedMotion(enabled);
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  // fade-out when loading flips false
  const mountOpacity = useRef(new Animated.Value(loading ? 1 : 0)).current;
  const [visible, setVisible] = useState(loading);

  useEffect(() => {
    if (loading) {
      setVisible(true);
      Animated.timing(mountOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    } else {
      Animated.timing(mountOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setVisible(false);
      });
    }
  }, [loading, mountOpacity]);

  if (!visible) return null;

  return (
    <Animated.View
      style={{ opacity: mountOpacity, marginTop: 14, alignItems: "center" }}
      accessibilityLabel="NovelIdeas is gathering your book recommendations"
    >
      <CircleShelf diameter={diameter} reducedMotion={reducedMotion} />
      <RotatingMessage />
    </Animated.View>
  );
}

// ─── Circle / shelf viewport ──────────────────────────────────────────────────

function CircleShelf({ diameter, reducedMotion }: { diameter: number; reducedMotion: boolean }) {
  const radius = diameter / 2;

  // reduced-motion pulse on the outer circle
  const pulseOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!reducedMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOpacity, { toValue: 0.6, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseOpacity, { toValue: 1.0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reducedMotion, pulseOpacity]);

  const shelfY = diameter * 0.62; // shelf sits ~62% down
  const SHELF_H = 8;

  return (
    <Animated.View
      style={{
        width: diameter,
        height: diameter,
        borderRadius: radius,
        overflow: "hidden",
        backgroundColor: "#0d1b2a",
        opacity: reducedMotion ? pulseOpacity : 1,
      }}
    >
      {/* scrolling bookshelf */}
      {reducedMotion ? (
        <StaticBooks shelfY={shelfY} diameter={diameter} />
      ) : (
        <ScrollingBooks shelfY={shelfY} diameter={diameter} />
      )}

      {/* wooden shelf plank */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: shelfY,
          height: SHELF_H,
          backgroundColor: "#7c5c3a",
          borderTopWidth: 2,
          borderTopColor: "#a08060",
        }}
      />
    </Animated.View>
  );
}

// ─── Static row (reduced-motion) ─────────────────────────────────────────────

function StaticBooks({ shelfY, diameter }: { shelfY: number; diameter: number }) {
  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "flex-start" }}>
      {BOOKS.map((book, i) => (
        <BookView key={i} book={book} shelfY={shelfY} tiltAnim={null} />
      ))}
    </View>
  );
}

// ─── Scrolling row with pull-and-inspect ─────────────────────────────────────

function ScrollingBooks({ shelfY, diameter }: { shelfY: number; diameter: number }) {
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollXValue = useRef(0);

  // One tilt value per pullable book
  const tiltAnims = useRef<Record<number, Animated.Value>>(
    BOOKS.reduce<Record<number, Animated.Value>>((acc, book) => {
      if (book.pullable) acc[book.index] = new Animated.Value(0);
      return acc;
    }, {})
  ).current;

  // Track whether we're in a pause/tilt cycle to avoid re-entering
  const inPause = useRef(false);
  const scrollAnim = useRef<Animated.CompositeAnimation | null>(null);

  const SCROLL_DURATION_PER_SEGMENT = 7000; // ms for one full SEGMENT_WIDTH scroll

  function startScroll(fromValue: number) {
    const remaining = SEGMENT_WIDTH - fromValue;
    const duration = (remaining / SEGMENT_WIDTH) * SCROLL_DURATION_PER_SEGMENT;
    const anim = Animated.timing(scrollX, {
      toValue: SEGMENT_WIDTH,
      duration,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    scrollAnim.current = anim;
    anim.start(({ finished }) => {
      if (!finished) return;
      // loop: snap back to 0 and restart
      scrollX.setValue(0);
      scrollXValue.current = 0;
      startScroll(0);
    });
  }

  useEffect(() => {
    const listenerId = scrollX.addListener(({ value }) => {
      scrollXValue.current = value;
    });

    startScroll(0);

    // Pull-and-inspect trigger: fires every ~1.5 s offset from initial mount
    let stopped = false;
    const pullables = BOOKS.filter((b) => b.pullable);
    let pullIdx = 0;

    const timerRefs: ReturnType<typeof setTimeout>[] = [];

    function schedulePull() {
      if (stopped) return;
      const delay = 1800 + pullIdx * 2200;
      const t = setTimeout(() => {
        if (stopped) return;
        const book = pullables[pullIdx % pullables.length];
        const tilt = tiltAnims[book.index];
        if (!tilt) { schedulePull(); return; }
        pullIdx++;

        // pause scroll
        scrollAnim.current?.stop();
        inPause.current = true;

        const pauseDelay = setTimeout(() => {
          if (stopped) return;
          Animated.sequence([
            Animated.timing(tilt, { toValue: 1, duration: 280, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.delay(380),
            Animated.timing(tilt, { toValue: 0, duration: 280, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          ]).start(({ finished }) => {
            if (!finished || stopped) return;
            inPause.current = false;
            // resume scroll from current position
            const current = scrollXValue.current % SEGMENT_WIDTH;
            scrollX.setValue(current);
            startScroll(current);
            schedulePull();
          });
        }, 100);

        timerRefs.push(pauseDelay);
      }, delay);
      timerRefs.push(t);
    }

    schedulePull();

    return () => {
      stopped = true;
      scrollX.removeListener(listenerId);
      scrollAnim.current?.stop();
      timerRefs.forEach(clearTimeout);
      Object.values(tiltAnims).forEach((v) => v.stopAnimation());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Translate: negate scrollX so books move left; duplicate segment for seamless loop
  const translateX = scrollX.interpolate({
    inputRange: [0, SEGMENT_WIDTH],
    outputRange: [0, -SEGMENT_WIDTH],
  });

  return (
    <Animated.View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        flexDirection: "row",
        alignItems: "flex-start",
        transform: [{ translateX }],
      }}
    >
      {/* two segments for seamless loop */}
      {[0, 1].map((seg) =>
        BOOKS.map((book, i) => (
          <BookView
            key={`${seg}-${i}`}
            book={book}
            shelfY={shelfY}
            tiltAnim={seg === 0 ? (tiltAnims[book.index] ?? null) : null}
          />
        ))
      )}
    </Animated.View>
  );
}

// ─── Individual book ──────────────────────────────────────────────────────────

function BookView({
  book,
  shelfY,
  tiltAnim,
}: {
  book: BookDef;
  shelfY: number;
  tiltAnim: Animated.Value | null;
}) {
  // Books sit on the shelf — position them from the bottom of the circle viewport
  // using alignSelf / marginTop in the flex row
  const baseStyle = {
    width: book.width,
    height: book.height,
    marginRight: BOOK_GAP,
    backgroundColor: book.color,
    borderRightWidth: 2,
    borderRightColor: "rgba(0,0,0,0.35)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
    // sit on the shelf: push down from the flex container top
    marginTop: shelfY - book.height,
  };

  if (tiltAnim) {
    const tiltDeg = tiltAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ["0deg", "-30deg"],
    });
    // Pivot from book base: translate up by height, rotate, translate back down
    return (
      <Animated.View
        style={[
          baseStyle,
          {
            transform: [
              { translateY: book.height },
              { rotate: tiltDeg },
              { translateY: -book.height },
            ],
          },
        ]}
      />
    );
  }

  return <View style={baseStyle} />;
}

// ─── Rotating message ─────────────────────────────────────────────────────────

function RotatingMessage() {
  const [msgIndex, setMsgIndex] = useState(0);
  const msgOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let current = 0;
    let stopped = false;

    function cycle() {
      if (stopped) return;
      const t = setTimeout(() => {
        if (stopped) return;
        Animated.timing(msgOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
          if (stopped) return;
          current = (current + 1) % MESSAGES.length;
          setMsgIndex(current);
          Animated.timing(msgOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start(() => {
            cycle();
          });
        });
      }, 3000);
      timerRef.current = t;
    }

    const timerRef = { current: null as ReturnType<typeof setTimeout> | null };
    cycle();

    return () => {
      stopped = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      msgOpacity.stopAnimation();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.Text
      style={{
        opacity: msgOpacity,
        marginTop: 10,
        color: "#aaa",
        fontSize: 12,
        textAlign: "center",
      }}
    >
      {MESSAGES[msgIndex]}
    </Animated.Text>
  );
}
