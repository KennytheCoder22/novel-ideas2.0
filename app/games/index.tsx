import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router, useLocalSearchParams } from "expo-router";
import { ReactNode } from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

type GameTheme = {
  accent: string;
  bright: string;
  surface: string;
  wash: string;
};

type GameCardProps = {
  title: string;
  subtitle: string;
  duration: string;
  facts: [string, string];
  factIcons: [keyof typeof MaterialCommunityIcons.glyphMap, keyof typeof MaterialCommunityIcons.glyphMap];
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  theme: GameTheme;
  artwork: ReactNode;
  compact: boolean;
  onPress: () => void;
};

const themes = {
  mania: { accent: "#34d6ff", bright: "#92ecff", surface: "#071a2d", wash: "#0d3148" },
  bookshop: { accent: "#f2a83c", bright: "#ffd080", surface: "#211421", wash: "#432026" },
  map: { accent: "#b7d85a", bright: "#ddf58c", surface: "#10251d", wash: "#29452d" },
  cascade: { accent: "#f1ab2f", bright: "#ffd46a", surface: "#24170d", wash: "#4a2c0d" },
} satisfies Record<string, GameTheme>;

function MediaManiaArt() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 560 190" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id="mm-sky" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#06182d" />
          <Stop offset="0.55" stopColor="#0a3e61" />
          <Stop offset="1" stopColor="#120b2b" />
        </LinearGradient>
        <LinearGradient id="mm-card" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#164e80" />
          <Stop offset="1" stopColor="#071728" />
        </LinearGradient>
        <RadialGradient id="mm-glow">
          <Stop offset="0" stopColor="#35e8ff" stopOpacity="0.9" />
          <Stop offset="1" stopColor="#35e8ff" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width="560" height="190" fill="url(#mm-sky)" />
      <Circle cx="278" cy="112" r="130" fill="url(#mm-glow)" opacity="0.28" />
      <Path d="M0 146 C85 126 130 151 207 137 S365 118 560 146 V190 H0Z" fill="#030914" />
      <G opacity="0.55" fill="#63ddff">
        <Circle cx="42" cy="31" r="2" /><Circle cx="131" cy="17" r="1.5" /><Circle cx="361" cy="20" r="2" />
        <Circle cx="486" cy="38" r="1.5" /><Circle cx="521" cy="18" r="1" />
      </G>
      <G transform="translate(10 63) rotate(-9 56 45)">
        <Rect x="8" y="18" width="91" height="66" rx="5" fill="#0b1220" stroke="#4bdfff" strokeWidth="2" />
        <Rect x="8" y="10" width="92" height="18" rx="3" fill="#dcecf1" />
        <Path d="M10 11 L28 11 L18 27 L10 27ZM40 11 L58 11 L48 27 L30 27ZM70 11 L88 11 L78 27 L60 27Z" fill="#17253b" />
        <Circle cx="31" cy="52" r="14" fill="#f7be43" opacity="0.9" />
        <Path d="M25 44 Q31 39 37 44 L35 62 H27Z" fill="#fff3c4" />
      </G>
      <G transform="translate(96 116)">
        <Path d="M5 31 Q8 5 31 8 L70 8 Q93 5 97 31 L91 50 Q86 56 78 45 L68 34 H33 L23 45 Q13 57 8 48Z" fill="#102b48" stroke="#4edfff" strokeWidth="2" />
        <Path d="M29 17 V34 M20 25 H38" stroke="#99edff" strokeWidth="4" strokeLinecap="round" />
        <Circle cx="74" cy="22" r="4" fill="#ff5a70" /><Circle cx="84" cy="31" r="4" fill="#f4c44a" />
      </G>
      {[
        { x: 188, y: 25, rotate: -6, color: "#2768b0", icon: "M38 75 C21 59 18 46 29 39 C38 33 46 38 50 45 C55 36 66 33 74 40 C85 51 77 64 50 82Z", fill: "#ff6173" },
        { x: 281, y: 19, rotate: 3, color: "#145f70", icon: "M25 75 L25 43 L42 35 L53 44 L73 32 L73 75Z", fill: "#5ff4d4" },
        { x: 375, y: 30, rotate: 8, color: "#652042", icon: "M31 43 L70 79 M70 43 L31 79", fill: "none" },
      ].map((card) => (
        <G key={card.x} transform={`translate(${card.x} ${card.y}) rotate(${card.rotate} 44 65)`}>
          <Rect width="87" height="127" rx="9" fill="url(#mm-card)" stroke={card.color} strokeWidth="4" />
          <Rect x="8" y="9" width="71" height="77" rx="5" fill={card.color} opacity="0.72" />
          <Path d={card.icon} fill={card.fill} stroke={card.fill === "none" ? "#ff735e" : "none"} strokeWidth="7" strokeLinecap="round" />
          <Rect x="18" y="101" width="51" height="4" rx="2" fill="#b9e6f4" opacity="0.7" />
          <Rect x="25" y="111" width="37" height="3" rx="2" fill="#b9e6f4" opacity="0.35" />
        </G>
      ))}
      <G transform="translate(448 23)">
        <Path d="M10 63 C9 22 32 5 58 5 C84 5 105 24 104 63" fill="none" stroke="#18233d" strokeWidth="12" />
        <Path d="M16 62 C15 28 34 12 58 12 C82 12 98 30 98 62" fill="none" stroke="#a633b0" strokeWidth="4" />
        <Rect x="3" y="52" width="24" height="48" rx="11" fill="#10172a" stroke="#4e3a83" strokeWidth="3" />
        <Rect x="89" y="52" width="24" height="48" rx="11" fill="#10172a" stroke="#4e3a83" strokeWidth="3" />
      </G>
      <G transform="translate(446 132)">
        <Path d="M0 8 Q32 0 55 16 Q78 0 110 8 V53 Q78 43 55 58 Q32 43 0 53Z" fill="#e9dfc1" stroke="#75d9eb" strokeWidth="2" />
        <Path d="M55 16 V58" stroke="#9b8e72" strokeWidth="2" />
        <Path d="M10 17 Q31 12 45 21 M65 21 Q82 12 101 17 M10 28 Q31 23 45 32 M65 32 Q82 23 101 28" stroke="#9b8e72" strokeWidth="1.5" fill="none" />
      </G>
      <G fill="#07101d">
        <Circle cx="235" cy="176" r="20" /><Circle cx="282" cy="174" r="23" /><Circle cx="334" cy="176" r="20" />
        <Path d="M207 190 Q235 153 263 190ZM251 190 Q282 146 313 190ZM307 190 Q334 153 361 190Z" />
      </G>
    </Svg>
  );
}

function BookshopArt() {
  const books = [
    [18, 19, 12, 47, "#7d3d2b"], [33, 24, 9, 42, "#32516a"], [45, 14, 13, 52, "#ac752f"],
    [62, 28, 10, 38, "#4e315e"], [75, 18, 14, 48, "#7b692f"], [93, 23, 9, 43, "#244b49"],
    [438, 15, 11, 51, "#6c302b"], [452, 27, 14, 39, "#42536e"], [469, 17, 9, 49, "#a46c2c"],
    [481, 22, 13, 44, "#4e315e"], [497, 13, 11, 53, "#78642a"], [511, 27, 14, 39, "#294c4f"],
  ];
  return (
    <Svg width="100%" height="100%" viewBox="0 0 560 190" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id="bs-room" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#2e1a18" /><Stop offset="0.55" stopColor="#130d18" /><Stop offset="1" stopColor="#24122d" />
        </LinearGradient>
        <RadialGradient id="bs-candle">
          <Stop offset="0" stopColor="#ffd16a" stopOpacity="0.9" /><Stop offset="1" stopColor="#ff8b24" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width="560" height="190" fill="url(#bs-room)" />
      <Rect x="8" y="7" width="128" height="125" rx="3" fill="#1a1114" stroke="#6f462b" strokeWidth="3" />
      <Rect x="424" y="7" width="128" height="125" rx="3" fill="#15101b" stroke="#5e3b31" strokeWidth="3" />
      {[67, 126].map((y) => <Path key={y} d={`M12 ${y} H132 M428 ${y} H548`} stroke="#805534" strokeWidth="4" />)}
      {books.map(([x, y, w, h, fill]) => <Rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx="1" fill={fill} stroke="#ba8a55" strokeWidth="0.7" />)}
      {books.map(([x, y, w, h, fill], index) => <Rect key={`b-${x}`} x={x} y={y + 60} width={w} height={Math.max(24, h - (index % 3) * 5)} rx="1" fill={fill} stroke="#ba8a55" strokeWidth="0.7" />)}
      <Circle cx="286" cy="100" r="105" fill="url(#bs-candle)" opacity="0.25" />
      <G transform="translate(163 27)">
        <Circle cx="65" cy="36" r="27" fill="#08090d" />
        <Path d="M34 42 Q37 6 65 4 Q90 7 98 37 Q83 26 72 24 Q53 35 34 42Z" fill="#09090c" />
        <Path d="M52 27 Q67 15 83 27" stroke="#25160f" strokeWidth="8" strokeLinecap="round" />
        <Path d="M29 142 Q24 80 48 59 Q65 48 84 59 Q107 79 111 142Z" fill="#0b1119" />
        <Path d="M44 73 Q65 96 94 70" fill="none" stroke="#2b2130" strokeWidth="5" />
        <Path d="M40 142 Q52 107 86 97 Q106 105 116 142Z" fill="#12121c" />
      </G>
      <G transform="translate(328 18)">
        <Path d="M13 78 Q17 23 59 9 Q102 24 107 78 L94 148 H26Z" fill="#080a11" />
        <Path d="M21 78 Q26 31 59 19 Q92 32 99 78 Q80 58 59 56 Q37 58 21 78Z" fill="#181022" stroke="#3f2550" strokeWidth="2" />
        <Circle cx="49" cy="56" r="4" fill="#ffb23d" /><Circle cx="70" cy="56" r="4" fill="#ffb23d" />
        <Path d="M33 98 Q59 117 88 98" stroke="#24162c" strokeWidth="3" fill="none" />
      </G>
      <Rect x="132" y="145" width="300" height="45" fill="#1b0f0c" stroke="#704326" strokeWidth="3" />
      <Rect x="139" y="151" width="286" height="8" fill="#3c2115" />
      <G transform="translate(273 91)">
        <Circle cx="0" cy="16" r="48" fill="url(#bs-candle)" />
        <Path d="M0 0 C-12 12 -7 24 0 27 C9 22 12 11 0 0Z" fill="#fff0a6" />
        <Rect x="-6" y="25" width="12" height="49" rx="4" fill="#f2c779" />
        <Path d="M-7 43 Q0 49 7 42" stroke="#fff0b8" strokeWidth="3" fill="none" />
      </G>
      <G transform="translate(462 86)">
        <Rect width="75" height="58" rx="4" fill="#25133a" stroke="#8e55b6" strokeWidth="2" />
        <TextSvg x="37" y="20" lines={["OPEN", "UNTIL", "DAWN"]} color="#b86ed8" />
      </G>
      <G transform="translate(393 135)">
        <Ellipse cx="24" cy="38" rx="24" ry="7" fill="#0d0808" />
        <Path d="M8 21 H40 L36 38 H12Z" fill="#b87929" stroke="#f0b652" strokeWidth="2" />
        <Circle cx="24" cy="18" r="11" fill="#bc8536" stroke="#ffd580" strokeWidth="2" />
      </G>
    </Svg>
  );
}

function TextSvg({ x, y, lines, color }: { x: number; y: number; lines: string[]; color: string }) {
  return (
    <G>
      {lines.map((line, index) => (
        <Path
          key={line}
          d={`M${x - line.length * 3.2} ${y + index * 13} h${line.length * 6.4}`}
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
        />
      ))}
    </G>
  );
}

function MapArt() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 560 190" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id="map-sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#7cd9ec" /><Stop offset="0.65" stopColor="#c8e6a3" /><Stop offset="1" stopColor="#588852" />
        </LinearGradient>
        <LinearGradient id="map-river" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#b9f2f4" /><Stop offset="1" stopColor="#3b96ba" />
        </LinearGradient>
      </Defs>
      <Rect width="560" height="190" fill="url(#map-sky)" />
      <Path d="M0 100 L66 38 L112 78 L168 22 L237 92 L284 46 L346 91 L399 29 L470 88 L522 45 L560 80 V190 H0Z" fill="#4d7c61" />
      <Path d="M0 111 L84 56 L133 101 L204 54 L269 111 L336 65 L401 100 L467 63 L560 107 V190 H0Z" fill="#75a75b" />
      <Path d="M0 132 Q90 93 180 128 T365 121 T560 128 V190 H0Z" fill="#44734c" />
      <Path d="M236 190 C231 153 261 136 303 128 C337 121 365 105 385 87 C368 116 358 137 385 190Z" fill="url(#map-river)" />
      <Path d="M435 103 L455 48 L474 103Z" fill="#89765a" /><Path d="M450 67 L455 48 L462 68Z" fill="#f2e2b2" />
      <Path d="M433 103 H477 V110 H433Z" fill="#415438" />
      <G fill="#244d37">
        {[23, 54, 92, 126, 165, 203, 400, 490, 527].map((x, i) => (
          <G key={x} transform={`translate(${x} ${96 + (i % 3) * 9})`}>
            <Rect x="8" y="25" width="5" height="28" fill="#59452d" />
            <Polygon points="10,0 0,32 21,32" /><Polygon points="10,12 -3,43 24,43" />
          </G>
        ))}
      </G>
      <G transform="translate(130 92)">
        <Circle cx="23" cy="16" r="11" fill="#bc7a45" />
        <Path d="M10 16 Q22 -2 36 14 L34 20 H10Z" fill="#3b2a1a" />
        <Rect x="12" y="28" width="25" height="31" rx="4" fill="#7a4a2e" />
        <Rect x="4" y="31" width="13" height="27" rx="4" fill="#3e5d39" />
        <Path d="M17 58 L13 82 M33 58 L39 82" stroke="#342920" strokeWidth="7" strokeLinecap="round" />
        <Path d="M9 37 L-2 53 M36 37 L49 48" stroke="#bc7a45" strokeWidth="5" strokeLinecap="round" />
      </G>
      <G transform="translate(304 74) rotate(3 100 55)">
        <Path d="M0 11 Q48 -2 98 16 Q143 -4 199 9 V119 Q145 106 99 124 Q52 105 0 118Z" fill="#d8bf7d" stroke="#6d492b" strokeWidth="5" />
        <Path d="M99 16 V124" stroke="#8c6842" strokeWidth="3" />
        <Path d="M21 28 Q47 20 76 31 M21 43 Q54 34 79 46 M21 59 Q48 52 76 62 M21 74 Q50 66 78 77 M21 90 Q45 84 70 92" stroke="#8d7147" strokeWidth="2" fill="none" />
        <Path d="M120 29 C147 16 175 34 180 55 C157 64 149 85 120 94 C130 71 112 52 120 29Z" fill="#b79a57" stroke="#715831" strokeWidth="2" />
        <Circle cx="149" cy="55" r="5" fill="#684123" />
        <Path d="M147 53 L166 40 M147 56 L130 73" stroke="#684123" strokeWidth="2" />
      </G>
      <G transform="translate(34 20)">
        <Circle cx="12" cy="12" r="11" fill="#fff7cb" opacity="0.85" />
        <Path d="M12 4 V20 M4 12 H20" stroke="#6e9c58" strokeWidth="2" />
      </G>
    </Svg>
  );
}

function CascadeArt() {
  const gems = [
    "#ff9b20", "#8d4ec7", "#d64b8c", "#5a8de0", "#4ebd75", "#7d42b5",
    "#4a9fd5", "#f0c94f", "#6853c7", "#ff8b25", "#54c3a5", "#bd4b9e",
    "#72b641", "#f2a832", "#da4779", "#8d4ec7", "#ff9b20", "#6451d0",
  ];
  return (
    <Svg width="100%" height="100%" viewBox="0 0 560 190" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id="ca-bg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#201616" /><Stop offset="0.55" stopColor="#3a1d12" /><Stop offset="1" stopColor="#0e0911" />
        </LinearGradient>
        <RadialGradient id="ca-burst">
          <Stop offset="0" stopColor="#fff6ad" /><Stop offset="0.25" stopColor="#ffb62e" stopOpacity="0.95" /><Stop offset="1" stopColor="#ff8400" stopOpacity="0" />
        </RadialGradient>
        <LinearGradient id="ca-potion" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#fff2a0" /><Stop offset="0.35" stopColor="#ff9f35" /><Stop offset="1" stopColor="#b22b4e" />
        </LinearGradient>
      </Defs>
      <Rect width="560" height="190" fill="url(#ca-bg)" />
      <Rect x="8" y="5" width="330" height="180" rx="8" fill="#21131d" stroke="#75502b" strokeWidth="3" />
      {gems.map((color, index) => {
        const column = index % 6;
        const row = Math.floor(index / 6);
        const x = 22 + column * 50;
        const y = 17 + row * 54;
        return (
          <G key={`${x}-${y}`}>
            <Rect x={x} y={y} width="42" height="45" rx="7" fill="#0c0b14" stroke="#533b35" strokeWidth="2" />
            <Polygon points={`${x + 21},${y + 5} ${x + 36},${y + 18} ${x + 30},${y + 37} ${x + 12},${y + 37} ${x + 6},${y + 18}`} fill={color} stroke="#ffe1a0" strokeOpacity="0.55" strokeWidth="1.5" />
            <Path d={`M${x + 11} ${y + 18} L${x + 21} ${y + 9} L${x + 30} ${y + 19}`} stroke="#fff7c7" strokeOpacity="0.55" strokeWidth="2" fill="none" />
          </G>
        );
      })}
      <Circle cx="379" cy="93" r="103" fill="url(#ca-burst)" opacity="0.8" />
      <G stroke="#ffc94f" strokeWidth="3" strokeLinecap="round">
        <Path d="M336 14 L347 39 M380 6 L379 36 M426 16 L411 42 M462 47 L433 62 M474 91 L440 91 M459 135 L433 119 M421 172 L409 144 M351 168 L360 140" />
      </G>
      <G transform="translate(340 58)">
        <Path d="M28 0 H73 L71 20 Q91 38 99 85 Q95 118 50 124 Q5 118 1 85 Q9 38 30 20Z" fill="#fff4bf" stroke="#5f321d" strokeWidth="5" />
        <Path d="M16 68 Q51 54 85 68 L94 92 Q80 113 50 115 Q21 111 7 92Z" fill="url(#ca-potion)" />
        <Circle cx="31" cy="80" r="6" fill="#ffe77a" /><Circle cx="61" cy="91" r="8" fill="#ffcf54" /><Circle cx="74" cy="74" r="4" fill="#fff2a0" />
        <Rect x="27" y="-5" width="48" height="14" rx="4" fill="#7a4928" stroke="#d7a654" strokeWidth="3" />
      </G>
      <G transform="translate(451 30) rotate(8 45 70)">
        <Rect width="91" height="137" rx="9" fill="#20150f" stroke="#b57927" strokeWidth="4" />
        <Rect x="10" y="10" width="71" height="117" rx="5" fill="#352315" stroke="#674526" strokeWidth="2" />
        <Circle cx="45" cy="52" r="20" fill="none" stroke="#e0a536" strokeWidth="3" />
        <Path d="M45 32 V72 M25 52 H65 M31 38 L59 66 M59 38 L31 66" stroke="#8e5422" strokeWidth="2" />
        <Path d="M25 96 H65 M31 107 H59" stroke="#a6732c" strokeWidth="3" strokeLinecap="round" />
      </G>
    </Svg>
  );
}

function GameCard({
  title,
  subtitle,
  duration,
  facts,
  factIcons,
  icon,
  theme,
  artwork,
  compact,
  onPress,
}: GameCardProps) {
  return (
    <View style={[
      styles.gameCard,
      { borderColor: theme.accent, backgroundColor: theme.surface },
      compact && styles.gameCardCompact,
    ]}>
      <View style={styles.artwork}>{artwork}</View>
      <View style={[styles.cardBody, compact && styles.cardBodyCompact]}>
        <View style={[styles.cardTopRow, compact && styles.cardTopRowCompact]}>
          <View style={[styles.iconMedallion, { borderColor: theme.accent, backgroundColor: theme.wash }]}>
            <MaterialCommunityIcons name={icon} size={compact ? 25 : 31} color={theme.bright} />
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.gameTitle}>{title}</Text>
            <Text style={[styles.subtitle, { color: theme.bright }]}>{subtitle}</Text>
          </View>
          <View style={[styles.duration, { borderColor: theme.accent }]}>
            <Text style={[styles.durationText, { color: theme.bright }]}>{duration}</Text>
          </View>
        </View>
        <View style={[styles.cardBottom, compact && styles.cardBottomCompact]}>
          <View style={styles.factList}>
            {facts.map((fact, index) => (
              <View key={fact} style={styles.factRow}>
                <MaterialCommunityIcons name={factIcons[index]} size={19} color={theme.bright} />
                <Text style={[styles.factText, { color: theme.bright }]}>{fact}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.playButton, { borderColor: theme.accent, backgroundColor: theme.wash }, compact && styles.playButtonCompact]}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={`Play ${title}`}
            activeOpacity={0.72}
          >
            <Text style={[styles.playButtonText, { color: theme.bright }]}>PLAY</Text>
            <MaterialCommunityIcons name="arrow-right" size={19} color={theme.bright} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function RecommendationGamesRoute() {
  const params = useLocalSearchParams<{ playerId?: string; libraryId?: string; ageBand?: string }>();
  const { width } = useWindowDimensions();
  const compact = width < 480;

  return (
    <SafeAreaView style={styles.safe}>
      <View pointerEvents="none" style={styles.ambient}>
        <View style={[styles.ambientOrb, styles.ambientOrbLeft]} />
        <View style={[styles.ambientOrb, styles.ambientOrbRight]} />
      </View>
      <TouchableOpacity
        style={[styles.backButton, compact && styles.backButtonCompact]}
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <MaterialCommunityIcons name="arrow-left" size={18} color="#e8e5f2" />
        <Text style={styles.backButtonText}>Back</Text>
      </TouchableOpacity>
      <ScrollView contentContainerStyle={[styles.content, compact && styles.contentCompact]} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <View style={styles.sparkRow}>
            <Text style={styles.spark}>✦</Text>
            <Text style={styles.arcadeLabel}>ARCADE AFTER DARK</Text>
            <Text style={styles.spark}>✦</Text>
          </View>
          <Text style={[styles.pageTitle, compact && styles.pageTitleCompact]}>Choose a Game</Text>
          <Text style={[styles.tagline, compact && styles.taglineCompact]}>Four ways to play. Four ways to discover your taste.</Text>
          <Text style={[styles.explainer, compact && styles.explainerCompact]}>
            Each game is a different kind of adventure—and every choice you make quietly helps NovelIdeas learn what stories and experiences fit you best.
          </Text>
        </View>
        <View style={styles.grid}>
          <GameCard
            title="Media Mania"
            subtitle="Build your taste lineup."
            duration="2–5 min"
            facts={["Rapid picks, likes/dislikes, unlock new media.", "Learns what you like across media."]}
            factIcons={["fast-forward", "heart"]}
            icon="lightning-bolt"
            theme={themes.mania}
            artwork={<MediaManiaArt />}
            compact={compact}
            onPress={() => router.push({
              pathname: "/media-mania",
              params: {
                playerId: params.playerId || "media-mania-player",
                libraryId: params.libraryId || "default",
                ageBand: params.ageBand || "teens",
              },
            } as any)}
          />
          <GameCard
            title="The Last Bookshop"
            subtitle="Recommend the right story before dawn."
            duration="5–10 min"
            facts={["Read clues, choose books, trust your instinct.", "Learns why a recommendation feels right."]}
            factIcons={["feather", "star-four-points"]}
            icon="book-open-page-variant"
            theme={themes.bookshop}
            artwork={<BookshopArt />}
            compact={compact}
            onPress={() => router.push("/games/last-bookshop" as any)}
          />
          <GameCard
            title="The Unwritten Map"
            subtitle="Cross a strange world and write your own story."
            duration="5–15 min"
            facts={["Explore, choose responses, build a journal.", "Learns the kinds of experiences you gravitate toward."]}
            factIcons={["shoe-print", "leaf"]}
            icon="compass-outline"
            theme={themes.map}
            artwork={<MapArt />}
            compact={compact}
            onPress={() => router.push({
              pathname: "/games/unwritten-map",
              params: {
                ...(params.playerId ? { playerId: params.playerId } : {}),
                ...(params.libraryId ? { libraryId: params.libraryId } : {}),
              },
            } as any)}
          />
          <GameCard
            title="The Alchemist’s Cascade"
            subtitle="Match ingredients. Make impossible choices."
            duration="3–8 min"
            facts={["Solve levels, trigger cascades, choose catalysts.", "Learns how you balance novelty, structure, intensity, and imagination."]}
            factIcons={["star-four-points", "bullseye-arrow"]}
            icon="flask-outline"
            theme={themes.cascade}
            artwork={<CascadeArt />}
            compact={compact}
            onPress={() => router.push({
              pathname: "/games/alchemists-cascade",
              params: {
                ...(params.playerId ? { playerId: params.playerId } : {}),
                ...(params.libraryId ? { libraryId: params.libraryId } : {}),
              },
            } as any)}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#050b17" },
  ambient: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  ambientOrb: { position: "absolute", width: 520, height: 520, borderRadius: 260, opacity: 0.1 },
  ambientOrbLeft: { left: -300, top: 140, backgroundColor: "#145d85" },
  ambientOrbRight: { right: -330, bottom: -210, backgroundColor: "#7a3d16" },
  backButton: {
    position: "absolute",
    zIndex: 10,
    top: 18,
    left: 18,
    minWidth: 86,
    minHeight: 42,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#35435d",
    borderRadius: 8,
    backgroundColor: "#080e1c",
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonCompact: { position: "relative", top: 10, left: 12, alignSelf: "flex-start", marginBottom: 4 },
  backButtonText: { color: "#e8e5f2", fontSize: 14, fontWeight: "800" },
  content: { width: "100%", maxWidth: 1180, alignSelf: "center", paddingHorizontal: 20, paddingTop: 18, paddingBottom: 40 },
  contentCompact: { paddingHorizontal: 12, paddingTop: 12 },
  intro: { alignItems: "center", paddingHorizontal: 90, paddingBottom: 18 },
  sparkRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  arcadeLabel: { color: "#d28bda", fontSize: 12, lineHeight: 18, fontWeight: "900", letterSpacing: 3.4 },
  spark: { color: "#bd72cb", fontSize: 15 },
  pageTitle: { color: "#fff5df", fontSize: 43, lineHeight: 49, fontWeight: "900", letterSpacing: -1.2, textAlign: "center" },
  pageTitleCompact: { fontSize: 34, lineHeight: 40 },
  tagline: { color: "#d580df", fontSize: 18, lineHeight: 24, fontWeight: "800", textAlign: "center" },
  taglineCompact: { fontSize: 16, lineHeight: 22 },
  explainer: { maxWidth: 620, marginTop: 5, color: "#c5cada", fontSize: 14, lineHeight: 20, textAlign: "center" },
  explainerCompact: { fontSize: 13, lineHeight: 19, paddingHorizontal: 0 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  gameCard: {
    flexBasis: 500,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 320,
    overflow: "hidden",
    borderWidth: 1.5,
    borderRadius: 15,
    shadowColor: "#000000",
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  gameCardCompact: { borderRadius: 13 },
  artwork: { height: 176, overflow: "hidden", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.12)" },
  cardBody: { minHeight: 143, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12 },
  cardBodyCompact: { minHeight: 220, padding: 14 },
  cardTopRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  cardTopRowCompact: { alignItems: "flex-start" },
  iconMedallion: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  titleBlock: { flex: 1, minWidth: 0 },
  gameTitle: { color: "#fff9ed", fontSize: 25, lineHeight: 29, fontWeight: "900", letterSpacing: -0.45 },
  subtitle: { fontSize: 13, lineHeight: 18, fontWeight: "700", marginTop: 1 },
  duration: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: "rgba(0,0,0,0.28)" },
  durationText: { fontSize: 12, lineHeight: 15, fontWeight: "900" },
  cardBottom: { flexDirection: "row", alignItems: "flex-end", gap: 12, marginTop: 8 },
  cardBottomCompact: { flexDirection: "column", alignItems: "stretch", marginTop: 14 },
  factList: { flex: 1, gap: 4 },
  factRow: { flexDirection: "row", alignItems: "center", gap: 9, minHeight: 23 },
  factText: { flex: 1, fontSize: 12.5, lineHeight: 17, fontWeight: "600" },
  playButton: {
    minWidth: 168,
    minHeight: 46,
    borderWidth: 1.5,
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  playButtonCompact: { width: "100%", marginTop: 6 },
  playButtonText: { fontSize: 15, lineHeight: 19, fontWeight: "900", letterSpacing: 2.4 },
});
