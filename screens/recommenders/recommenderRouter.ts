// patched recommenderRouter.ts (lane isolation applied)

function routeRecommendations(session) {
  const family = session.family; // e.g., "fantasy", "horror", etc.

  // Only treat horror signals if explicitly in horror lane
  const wantsHorrorTone = (family === "horror") && session.signals.includes("dark");

  const horrorAligned = (family === "horror") && (
    session.tags.includes("haunted") ||
    session.tags.includes("supernatural") ||
    session.tags.includes("survival")
  );

  // Fantasy remains unaffected by horror signals
  if (family === "fantasy") {
    return getFantasyRecommendations(session);
  }

  if (wantsHorrorTone || horrorAligned) {
    return getHorrorRecommendations(session);
  }

  return getGeneralRecommendations(session);
}
