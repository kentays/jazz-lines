import { parseNote } from "./noteParser";
import { buildJazzLine } from "./lineBuilder";

// Parse a MusicXML string and return an array of line objects (one per measure)
export function parseMusicXmlToLines(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "application/xml");

  const measures = Array.from(doc.querySelectorAll("measure"));
  const lines = [];

  measures.forEach((measure) => {
    const notes = [];

    // iterate notes in the measure
    const noteElements = Array.from(measure.querySelectorAll("note"));
    noteElements.forEach((noteEl) => {
      // skip rests
      if (noteEl.querySelector("rest")) return;

      const pitch = noteEl.querySelector("pitch");
      if (!pitch) return;

      const step = pitch.querySelector("step")?.textContent;
      const alterEl = pitch.querySelector("alter");
      const alter = alterEl ? Number(alterEl.textContent) : 0;
      const octave = pitch.querySelector("octave")?.textContent;

      if (!step || !octave) return;

      // MusicXML alter: 1 -> sharp, -1 -> flat
      const accidentalStr = alter === 1 ? "#" : alter === -1 ? "B" : "";

      // Build a string compatible with parseNote (e.g. A#4 or EB5)
      const noteStr = `${step.toUpperCase()}${accidentalStr}${octave}`;

      try {
        const noteObj = parseNote(noteStr);
        notes.push(noteObj);
      } catch (e) {
        // ignore unparsable notes
        console.warn("Skipping note in MusicXML: ", noteStr, e.message);
      }
    });

    if (notes.length > 0) {
      const line = buildJazzLine(notes);
      lines.push(line);
    }
  });

  return lines;
}
