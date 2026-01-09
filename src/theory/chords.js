const SEMITONE_TO_SHARP = [
  'C','C#','D','D#','E','F','F#','G','G#','A','A#','B'
];

export function semitoneToName(semi) {
  return SEMITONE_TO_SHARP[((semi % 12) + 12) % 12];
}

export function nameFromNoteObj(note) {
  if (!note) return null;
  const acc = note.accidental === 'b' ? 'b' : (note.accidental === '#' ? '#' : '');
  return `${note.letter}${acc}`;
}

export function computeChordSymbols(notes = [], tags = []) {
  const tagStr = (tags || []).map((t) => String(t).toLowerCase()).join(" ");
  const symbols = [];

  if (!notes || notes.length === 0) return symbols;

  // Determine function from tags (simple heuristics)
  const isIiV = tagStr.includes('ii-v') || tagStr.includes('i i-v');
  const isMinor = tagStr.includes('minor') || tagStr.includes('min');
  const isV7 = tagStr.includes('v7') || tagStr.includes('dominant') || tagStr.includes('v 7');
  const isV7Sharp5 = tagStr.includes('#5') || tagStr.includes('sharp5') || tagStr.includes('altered');
  const isV13b9 = tagStr.includes('13') || tagStr.includes('b9') || tagStr.includes('13b9');

  // User-specified mappings (hard-coded to D/G example per request)
  // Static minor: show Cm7 for whole measure
  if (tagStr.includes('static minor') || tagStr.includes('static-minor') || (tagStr.includes('static') && tagStr.includes('minor'))) {
    // indicate whole-measure symbol but also attach to beat 1 (index 0)
    symbols.push({ whole: true, index: 0, text: 'Cm7' });
    return symbols;
  }
  if (isIiV && !isMinor) {
    // Major ii-v -> Dm7 on beat 1, G7 on beat 3
    symbols.push({ index: 0, text: 'Dm7' });
    symbols.push({ index: 4, text: 'G7' });
    return symbols;
  }

  if (isIiV && isMinor) {
    // Minor ii-v -> Dm7b5, G7#5
    symbols.push({ index: 0, text: 'Dm7b5' });
    // Minor ii-v should resolve to Dm7b5 → G7
    symbols.push({ index: 4, text: 'G7' });
    return symbols;
  }

  if (isV7 && !isV7Sharp5 && !isV13b9) {
    symbols.push({ index: 0, text: 'G7' });
    return symbols;
  }

  if (isV7Sharp5) {
    // prefer generic altered symbol
    symbols.push({ index: 0, text: 'G7alt' });
    return symbols;
  }

  if (tagStr.includes('b13') || tagStr.includes('b 13') || tagStr.includes('g7b13')) {
    symbols.push({ index: 0, text: 'G7b13' });
    return symbols;
  }

  // Tritone substitution (ii - bII7)
  if (tagStr.includes('tritone') || tagStr.includes('tritone sub') || tagStr.includes('tritone-sub')) {
    // Place Dm7 on beat 1 and Db7 (bII7) on beat 3
    symbols.push({ index: 0, text: 'Dm7' });
    symbols.push({ index: 4, text: 'Db7' });
    return symbols;
  }

  if (isV13b9) {
    symbols.push({ index: 0, text: 'G13(b9)' });
    return symbols;
  }

  return symbols;
}

export default { semitoneToName, computeChordSymbols };
