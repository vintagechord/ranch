type FitConfirmedParticipantsInput = {
  availableWidth: number;
  chipWidths: readonly number[];
  gap: number;
  moreWidth: number;
  tolerance?: number;
};

export function fitConfirmedParticipants({
  availableWidth,
  chipWidths,
  gap,
  moreWidth,
  tolerance = 0.5
}: FitConfirmedParticipantsInput) {
  if (chipWidths.length === 0) {
    return 0;
  }

  const safeWidth = Math.max(0, availableWidth);
  const safeGap = Math.max(0, gap);
  const totalWidth = chipWidths.reduce((sum, width) => sum + Math.max(0, width), 0)
    + safeGap * Math.max(0, chipWidths.length - 1);

  if (totalWidth <= safeWidth + tolerance) {
    return chipWidths.length;
  }

  let occupiedWidth = Math.max(0, moreWidth);
  let visibleCount = 0;

  while (visibleCount < chipWidths.length - 1) {
    const nextWidth = occupiedWidth + safeGap + Math.max(0, chipWidths[visibleCount]);

    if (nextWidth > safeWidth + tolerance) {
      break;
    }

    occupiedWidth = nextWidth;
    visibleCount += 1;
  }

  return visibleCount;
}
