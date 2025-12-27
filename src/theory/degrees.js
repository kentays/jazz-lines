const LETTER_TO_DEGREE = {
  C: 1,
  D: 2,
  E: 3,
  F: 4,
  G: 5,
  A: 6,
  B: 7
};

export function noteToDegree(note) {
  const baseDegree = LETTER_TO_DEGREE[note.letter];

  if (!baseDegree) {
    throw new Error(`Unknown note letter: ${note.letter}`);
  }

  if (!note.accidental || note.accidental === "") {
    return String(baseDegree);
  }

  return `${note.accidental}${baseDegree}`;
}
