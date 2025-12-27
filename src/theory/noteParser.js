const LETTER_TO_SEMITONE = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11
};

export function parseNote(noteStr) {
  // Expect format like A5, F#4, EB5
  const match = noteStr.match(/^([A-G])([#B]?)(\d)$/);

  if (!match) {
    throw new Error(`Invalid note format: ${noteStr}`);
  }

  const [, letter, accidentalRaw, octaveStr] = match;

  // Normalize accidental
  const accidental =
    accidentalRaw === "B" ? "b" :
    accidentalRaw === "#" ? "#" :
    "";

  const octave = Number(octaveStr);

  const semitone =
    LETTER_TO_SEMITONE[letter] +
    (accidental === "#" ? 1 :
     accidental === "b" ? -1 : 0);

  const midi = (octave + 1) * 12 + semitone;

  return {
    letter,
    accidental,
    octave,
    midi
  };
}
