export type Participant = {
  id: string;
  name: string;
  imageUrl: string;
  accentColor: string;
};

export const participants: Participant[] = Array.from({ length: 16 }, (_, index) => {
  const number = String(index + 1).padStart(2, "0");
  const accentColors = [
    "#ffd95a",
    "#88bdf2",
    "#e22718",
    "#9b7cf8",
    "#39d5d7",
    "#f58f2a",
    "#ff6cb5",
    "#86d982",
    "#d7d7d7",
    "#c9a8ff",
    "#25d3a6",
    "#b8d9ff",
    "#f3a76b",
    "#7fa6ff",
    "#ffd24a",
    "#6ed3ff"
  ];

  return {
    id: `participant-${number}`,
    name: `참가자 ${number}`,
    imageUrl: `/participants/participant-${number}.webp`,
    accentColor: accentColors[index]
  };
});

export function applyParticipantNames(names: string[]) {
  return buildParticipants({ names });
}

export function buildParticipants({
  names = [],
  imageUrlsBySlot = new Map<number, string>()
}: {
  names?: string[];
  imageUrlsBySlot?: Map<number, string>;
}) {
  return participants.map((participant, index) => ({
    ...participant,
    name: names[index] ?? participant.name,
    imageUrl: imageUrlsBySlot.get(index + 1) ?? participant.imageUrl
  }));
}
