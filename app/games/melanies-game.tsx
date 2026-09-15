import { withGameReadingAge } from "../../components/GameReadingAge";
import RealStoryTournament from "../../features/recommendation-games/melanie/RealStoryTournament";
export default withGameReadingAge(RealStoryTournament, {
  accentColor: "#eed59a",
  borderColor: "#76938a",
  textColor: "#dce7df",
  selectedBackgroundColor: "rgba(238, 213, 154, 0.14)",
});
