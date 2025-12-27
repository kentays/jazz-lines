export function notesToIntervals(notes) {
  if (notes.length < 2) return [];

  const intervals = [];

  for (let i = 1; i < notes.length; i++) {
    intervals.push(notes[i].midi - notes[i - 1].midi);
  }

  return intervals;
}
