// Presentation only. Uses the existing durable round count, so unknown replacements,
// undo, resume and age-band resets retain their gameplay semantics.
export function mediaManiaSessionProgress(completedRoundCount: number) {
  const count = Number.isFinite(completedRoundCount) ? Math.max(0, Math.floor(completedRoundCount)) : 0;
  const setSize = 6;
  const atCheckpoint = count > 0 && count % setSize === 0;
  const completed = atCheckpoint ? setSize : count % setSize;
  return { setNumber: Math.max(1, Math.ceil(count / setSize)), completed, setSize, atCheckpoint };
}
