import { notesToIntervals } from "./intervals";
import { noteToDegree } from "./degrees";

export function buildJazzLine(notes) {
  const intervals = notesToIntervals(notes);

  const start = notes[0];
  const end = notes[notes.length - 1];

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

    length: notes.length
  };
}
