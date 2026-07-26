export function selectAutomaticValuationEps(gaapTtmEps, adjustedTtmEps) {
  const candidates = [
    { basis: "reported", value: gaapTtmEps },
    { basis: "adjusted", value: adjustedTtmEps },
  ].filter((candidate) => Number.isFinite(candidate.value) && candidate.value > 0);

  if (candidates.length === 0) {
    return {
      basis: "auto",
      value: null,
      reason: "no positive reported or adjusted TTM EPS available",
    };
  }

  candidates.sort((a, b) => a.value - b.value);
  return { ...candidates[0], reason: null };
}
