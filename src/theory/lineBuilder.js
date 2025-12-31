import { notesToIntervals } from "./intervals.js";
import { noteToDegree } from "./degrees.js";

export function buildJazzLine(notes, tripletStartIndex = -1) {
  const intervals = notesToIntervals(notes);

  const start = notes[0];
  const end = notes[notes.length - 1];

  // For 9-note lines, default triplet to last 3 notes
  let finalTripletIndex = tripletStartIndex;
  if (tripletStartIndex === -1 && notes.length === 9) {
    finalTripletIndex = 6; // last 3 notes
  }

  return {
    notes,
    intervals,

    start: {
      ...start,
      degree: noteToDegree(start)
    },

    end: {
      ...end,
      degree: noteToDegree(end)
    },

    length: notes.length,
    tripletStartIndex: finalTripletIndex
  };
}
