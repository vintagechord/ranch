export type Participant = {
  id: string;
  name: string;
  imageUrl: string;
  accentColor: string;
};

const HANGUL_BASE_CODE = 0xac00;
const HANGUL_LAST_CODE = 0xd7a3;
const HANGUL_LEADING_INITIALS = [
  "G",
  "K",
  "N",
  "D",
  "T",
  "R",
  "M",
  "B",
  "P",
  "S",
  "S",
  "",
  "J",
  "J",
  "C",
  "K",
  "T",
  "P",
  "H"
];
const HANGUL_VOWEL_INITIALS = [
  "A",
  "A",
  "Y",
  "Y",
  "E",
  "E",
  "Y",
  "Y",
  "O",
  "W",
  "W",
  "W",
  "Y",
  "U",
  "W",
  "W",
  "W",
  "Y",
  "E",
  "I",
  "I"
];
const COMPOUND_KOREAN_SURNAMES = new Set([
  "강전",
  "남궁",
  "독고",
  "동방",
  "망절",
  "사공",
  "서문",
  "선우",
  "소봉",
  "어금",
  "장곡",
  "제갈",
  "황목",
  "황보"
]);

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

function getHangulInitial(character: string) {
  const code = character.codePointAt(0);

  if (!code || code < HANGUL_BASE_CODE || code > HANGUL_LAST_CODE) {
    return "";
  }

  const syllableIndex = code - HANGUL_BASE_CODE;
  const leadingIndex = Math.floor(syllableIndex / 588);
  const vowelIndex = Math.floor((syllableIndex % 588) / 28);

  return HANGUL_LEADING_INITIALS[leadingIndex] || HANGUL_VOWEL_INITIALS[vowelIndex] || "";
}

function getKoreanGivenName(name: string) {
  const compactName = Array.from(name).filter((character) => getHangulInitial(character)).join("");

  if (compactName.length <= 1) {
    return compactName;
  }

  const surnameLength =
    compactName.length >= 3 && COMPOUND_KOREAN_SURNAMES.has(compactName.slice(0, 2)) ? 2 : 1;

  return compactName.slice(surnameLength) || compactName.slice(-1);
}

function getLatinInitials(name: string) {
  const wordInitials = name
    .split(/[\s._-]+/)
    .map((word) => word.match(/[A-Za-z0-9]/)?.[0])
    .filter((initial): initial is string => Boolean(initial));

  if (wordInitials.length > 0) {
    return wordInitials.join("").toUpperCase();
  }

  const looseInitials = Array.from(name.matchAll(/[A-Za-z0-9]/g), ([match]) => match);

  return looseInitials.slice(0, 2).join("").toUpperCase();
}

export function getParticipantInitials(name: string) {
  const normalizedName = name.trim().replace(/\s+/g, " ");
  const koreanGivenName = getKoreanGivenName(normalizedName);
  const koreanInitials = Array.from(koreanGivenName, (character) => getHangulInitial(character))
    .filter(Boolean)
    .join("");

  if (koreanInitials) {
    return koreanInitials;
  }

  return getLatinInitials(normalizedName) || "P";
}

export function applyParticipantNames(names: string[]) {
  return buildParticipants({ names });
}

export function buildParticipants({
  names = [],
  imageUrlsBySlot = new Map<number, string>(),
  displayNamesBySlot = new Map<number, string>()
}: {
  names?: string[];
  imageUrlsBySlot?: Map<number, string>;
  displayNamesBySlot?: Map<number, string>;
}) {
  return participants.map((participant, index) => ({
    ...participant,
    name: displayNamesBySlot.get(index + 1) ?? names[index] ?? participant.name,
    imageUrl: imageUrlsBySlot.get(index + 1) ?? participant.imageUrl
  }));
}
