import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { withGameReadingAge } from "../../components/GameReadingAge";
import RealStoryTournament from "../../features/recommendation-games/melanie/RealStoryTournament";

const MelanieWithAge = withGameReadingAge(RealStoryTournament, undefined, { inline: true });

export default function MelanieGameRoute() {
  // Static exports cannot know the reader's query-string age or viewport.
  // Mount the interactive game after hydration so its first render uses both.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <MelanieWithAge /> : <View style={{flex:1,backgroundColor:"#052425",justifyContent:"center"}}><ActivityIndicator color="#eed59a" accessibilityLabel="Loading Melanie’s Game" /></View>;
}
