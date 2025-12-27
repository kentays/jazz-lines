// Chromatic scale order (C major / relative degrees)
export const SCALE_ORDER = [
  "1", "b2", "2", "b3", "3",
  "4", "b5", "5", "b6", "6", "b7", "7"
];

// Chord tones for basic seventh chords (1, 3, 5, 7)
const CHORD_TONES = ["1", "3", "5", "7"];

// Map degree string to semitone offset relative to the tonic (C = 0)
// This ensures enharmonic equivalents map to the same semitone value.
function degreeToSemitone(deg) {
  if (!deg) return null;
  const s = String(deg).trim();
  // allow unicode flats/sharps and both leading/trailing accidentals
  // capture pre and post accidentals and the degree number
  const m = s.match(/^([b#♭♯n♮]*)([1-7])([b#♭♯n♮]*)$/i);
  if (!m) return null;
  const pre = (m[1] || '').toLowerCase();
  const num = parseInt(m[2], 10);
  const post = (m[3] || '').toLowerCase();

  const baseMap = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11 };
  let sem = baseMap[num];
  if (sem === undefined) return null;

  // count accidentals (flats lower by 1, sharps raise by 1)
  const accStr = pre + post;
  let delta = 0;
  for (const ch of accStr) {
    if (ch === 'b' || ch === '♭' || ch === 'B') delta -= 1;
    if (ch === '#' || ch === '♯') delta += 1;
    // neutral/natural symbols set no change
  }

  sem = (sem + delta + 12) % 12;
  return sem;
}

function semitoneDistance(a, b) {
  const diff = Math.abs(a - b) % 12;
  return Math.min(diff, 12 - diff);
}

function forwardSemitoneDistance(from, to) {
  return (to - from + 12) % 12;
}

// Find nearest chord tone semitone above (forward) the given semitone
function nearestChordToneAbove(semitone) {
  const chordSemis = CHORD_TONES.map(degreeToSemitone).filter(v => v !== null);
  let best = null;
  let bestDist = 999;
  for (const cs of chordSemis) {
    const d = forwardSemitoneDistance(semitone, cs);
    if (d > 0 && d < bestDist) {
      bestDist = d;
      best = cs;
    }
  }
  return best;
}

function nearestChordToneBelow(semitone) {
  const chordSemis = CHORD_TONES.map(degreeToSemitone).filter(v => v !== null);
  let best = null;
  let bestDist = 999;
  for (const cs of chordSemis) {
    const d = forwardSemitoneDistance(cs, semitone); // distance from chord tone up to semitone
    if (d > 0 && d < bestDist) {
      bestDist = d;
      best = cs;
    }
  }
  return best;
}

// Determine if two lines can connect
export function canConnect(lineA, lineB) {
  const end = lineA?.end?.degree;
  const start = lineB?.start?.degree;
  const endSem = degreeToSemitone(end);
  const startSem = degreeToSemitone(start);
  if (endSem === null || startSem === null) return false;

  // 1) Semitone (1) or whole-tone (2) up/down (circular)
  const chromaticDist = semitoneDistance(endSem, startSem);
  if (chromaticDist === 1 || chromaticDist === 2) return true;

  // 2) Connect to the nearest chord tone above or below
  const above = nearestChordToneAbove(endSem);
  const below = nearestChordToneBelow(endSem);
  if (above !== null && startSem === above) return true;
  if (below !== null && startSem === below) return true;

  return false;
}
