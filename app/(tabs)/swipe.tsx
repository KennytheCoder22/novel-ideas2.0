import HomeScreen from "./index";

export default function SwipeTab() {
  // Keep this tab as a "swipe shortcut", but render the same HomeScreen
  // so the header (and 7-tap Admin unlock) is always available.
  return <HomeScreen />;
}
