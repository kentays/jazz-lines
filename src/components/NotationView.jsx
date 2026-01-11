import { useEffect, useRef } from "react";
import {
  Renderer,
  Stave,
  StaveNote,
  Voice,
  Formatter,
  Beam,
  Accidental,
  Annotation,
  Tuplet
} from "vexflow";

import { noteToDegree } from "../theory/degrees";
import { computeChordSymbols } from "../theory/chords";

export default function NotationView({ notes, tags = [], highlightIndex = -1, tripletStartIndex = -1 }) {
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

    // Compute chord symbols from tags and attach them to the relevant notes (top annotations)
    const chordSymbols = computeChordSymbols(notes, tags || []);
    console.log('NotationView chordSymbols', chordSymbols, 'tags=', tags);
    chordSymbols.forEach((c) => {
      const idx = c.index;
      if (typeof idx === 'number' && idx >= 0 && idx < vexNotes.length) {
        const vn = vexNotes[idx];
        vn.addModifier(
          new Annotation(c.text)
            .setFont("Arial", 14)
            .setVerticalJustification(Annotation.VerticalJustify.TOP),
          0
        );
      }
    });

    // Create voice in 4/4 (soft mode avoids IncompleteVoice errors)
    const voice = new Voice({
      num_beats: 4,
      beat_value: 4
    }).setMode(Voice.Mode.SOFT);

    voice.addTickables(vexNotes);

    // Handle triplet and beaming
    const beams = [];
    const beamedIndices = new Set();
    let tuplet = null;
    
    const hasValidTriplet = tripletStartIndex >= 0 && tripletStartIndex + 3 <= vexNotes.length;
    
    // First, handle triplet if present - create a Tuplet
    if (hasValidTriplet) {
      const tripletNotes = vexNotes.slice(tripletStartIndex, tripletStartIndex + 3);
      if (tripletNotes.length === 3) {
        // Explicitly tell VexFlow this is 3 notes in the time of 2 eighths
        tuplet = new Tuplet(tripletNotes, {
          numNotes: 3,
          notesOccupied: 2,
          ratioed: false,
          location: Tuplet.LOCATION_TOP
        });
        // Also add a beam for visual connection of the triplet notes
        beams.push(new Beam(tripletNotes));
        beamedIndices.add(tripletStartIndex);
        beamedIndices.add(tripletStartIndex + 1);
        beamedIndices.add(tripletStartIndex + 2);
      }
    }

    // Then, beam notes in groups of 4, or pairs if fewer than 4 remain
    let i = 0;
    while (i < vexNotes.length) {
      // Skip if already beamed
      if (beamedIndices.has(i)) {
        i++;
        continue;
      }
      
      // Collect unbeamed notes starting from i, but stop at any beamed note
      const group = [];
      for (let j = i; j < vexNotes.length && group.length < 4; j++) {
        if (beamedIndices.has(j)) {
          // Stop collecting when we hit a beamed note
          break;
        }
        group.push(vexNotes[j]);
      }
      
      // Create a beam if we have 2 or more notes
      if (group.length >= 2) {
        beams.push(new Beam(group));
        console.log(`Creating beam with ${group.length} notes starting at index ${i}`);
      }
      
      // Move to next unprocessed index
      i += group.length > 0 ? group.length : 1;
    }

    console.log(`NotationView: ${vexNotes.length} notes, tripletStartIndex=${tripletStartIndex}, ${beams.length} beams + ${tuplet ? 1 : 0} tuplet`);
    if (hasValidTriplet) console.log(`  - Tuplet: notes [${tripletStartIndex}, ${tripletStartIndex+1}, ${tripletStartIndex+2}]`);

    // Format and draw
    new Formatter()
      .joinVoices([voice])
      .format([voice], 640);

    voice.draw(context, stave);

    // Draw whole-measure (stave-centered) chord symbols only when they are not
    // already attached to a specific note index (to avoid duplicates).
    chordSymbols.forEach((c) => {
      if (c.whole) {
        if (typeof c.index === 'number') {
          // already rendered on a note at that index; skip stave-centered draw
          return;
        }
        try {
          const text = c.text || '';
          // Stave was created at x=10 width=680 in this view
          const centerX = 10 + 680 / 2;
          const y = 30; // above the stave (stave y is 50)
          context.setFont("Arial", 14, "");
          if (typeof context.fillText === 'function') {
            context.fillText(text, centerX, y);
          }
        } catch (e) {
          console.warn('Failed to draw whole-measure chord symbol', e);
        }
      }
    });

    // Draw beams after the voice is drawn
    beams.forEach((b) => b.setContext(context).draw());
    
    // Draw tuplet (triplet) if present
    if (tuplet) {
      tuplet.setContext(context).draw();
    }
    
      // Make the generated SVG responsive by setting a viewBox and allowing the SVG to scale to container width.
      try {
        const svg = containerRef.current.querySelector('svg');
        if (svg) {
          svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
          svg.style.width = '100%';
          svg.style.height = 'auto';
          svg.setAttribute('preserveAspectRatio', 'xMinYMid meet');
        }
      } catch (e) {
        // ignore
      }
  }, [notes, tags, highlightIndex, tripletStartIndex]);

  return <div ref={containerRef} />;
}
