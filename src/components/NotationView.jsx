import { useEffect, useRef } from "react";
import {
  Renderer,
  Stave,
  StaveNote,
  Voice,
  Formatter,
  Beam,
  Accidental,
  Annotation
} from "vexflow";

import { noteToDegree } from "../theory/degrees";

export default function NotationView({ notes, highlightIndex = -1 }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!notes || notes.length === 0) return;

    // Clear previous SVG
    containerRef.current.innerHTML = "";

    // Create renderer
    const renderer = new Renderer(
      containerRef.current,
      Renderer.Backends.SVG
    );

    renderer.resize(700, 200);
    const context = renderer.getContext();

    // Create stave
    const stave = new Stave(10, 50, 680);
    stave.addClef("treble");
    stave.setContext(context).draw();

    // Convert your notes into VexFlow notes
    const vexNotes = notes.map((note) => {
      const key = `${note.letter.toLowerCase()}${note.accidental}/${note.octave}`;

      return new StaveNote({
        clef: "treble",
        keys: [key],
        duration: "8"
      });
    });

    // Track accidentals seen earlier in the line (by letter+octave)
    const seenAcc = {};

    // Apply accidentals, add degree labels, highlight start/end and active note
    vexNotes.forEach((vexNote, i) => {
      const note = notes[i];
      const pk = `${note.letter}${note.octave}`; // pitch key for accidental scope

      // If this note has an explicit accidental, render it and record it
      if (note.accidental === "#") {
        vexNote.addModifier(new Accidental("#"), 0);
        seenAcc[pk] = "#";
      } else if (note.accidental === "b") {
        vexNote.addModifier(new Accidental("b"), 0);
        seenAcc[pk] = "b";
      } else {
        // No explicit accidental: if earlier in the line this same pitch had an accidental,
        // we should render a natural sign to cancel it.
        if (seenAcc[pk] === "#" || seenAcc[pk] === "b") {
          vexNote.addModifier(new Accidental("n"), 0);
          seenAcc[pk] = ""; // natural cancels for remainder
        }
      }

      // Add degree annotation
      const degree = noteToDegree(note); // "1", "b3", "#2", etc.
      vexNote.addModifier(
        new Annotation(degree)
          .setFont("Arial", 12)
          .setVerticalJustification(Annotation.VerticalJustify.BOTTOM),
        0
      );

      // Default start/end styling
      if (i === 0) {
        vexNote.setStyle({ fillStyle: "green", strokeStyle: "green" });
      } else if (i === notes.length - 1) {
        vexNote.setStyle({ fillStyle: "red", strokeStyle: "red" });
      }

      // If this note is the active (highlighted) note, override style
      if (i === highlightIndex) {
        vexNote.setStyle({ fillStyle: "orange", strokeStyle: "orange" });
      }
    });

    // Create voice (soft mode avoids IncompleteVoice errors)
    const voice = new Voice({
      num_beats: vexNotes.length,
      beat_value: 8
    }).setMode(Voice.Mode.SOFT);

    voice.addTickables(vexNotes);

    // Beam groups of 4 notes together, remainder notes stay unbeamed
    const beams = [];
    for (let i = 0; i < vexNotes.length; i += 4) {
      const group = vexNotes.slice(i, i + 4);
      if (group.length === 4) {
        beams.push(new Beam(group));
      }
    }

    // Format and draw
    new Formatter()
      .joinVoices([voice])
      .format([voice], 640);

    voice.draw(context, stave);

    // Draw beams after the voice is drawn
    beams.forEach((b) => b.setContext(context).draw());
  }, [notes, highlightIndex]);

  return <div ref={containerRef} />;
}
