import * as Tone from "tone";

// Play a single line of notes with highlight callback
// Play a single line of notes with highlight callback.
// Accepts optional `tripletStartIndex` to play three notes in time of two eighths.
export async function playLine(notes, duration = "8n", onNotePlay, tripletStartIndex = -1) {
  await Tone.start();
  const synth = new Tone.Synth().toDestination();

  // Ensure transport is reset so schedules use time 0
  Tone.Transport.stop();
  Tone.Transport.cancel();
  Tone.Transport.bpm.value = 120;

  const baseNoteSeconds = Tone.Time(duration).toSeconds();
  const tripletNoteSeconds = baseNoteSeconds * (2 / 3); // three in time of two

  // Schedule notes, adjusting timing for triplet notes
  let timeCursor = 0;
  notes.forEach((noteObj, i) => {
    const isTriplet = tripletStartIndex >= 0 && i >= tripletStartIndex && i < tripletStartIndex + 3;
    const thisDuration = isTriplet ? tripletNoteSeconds : baseNoteSeconds;
    const noteStr = `${noteObj.letter}${noteObj.accidental || ""}${noteObj.octave}`;

    Tone.Transport.schedule((timeStamp) => {
      synth.triggerAttackRelease(noteStr, thisDuration, timeStamp);
      if (onNotePlay) onNotePlay(i);
    }, timeCursor);

    timeCursor += thisDuration;
  });

  const totalTime = timeCursor;

  if (onNotePlay) {
    Tone.Transport.schedule(() => onNotePlay(-1), totalTime);
  }

  // cleanup: stop transport and dispose synth after playback finishes
  Tone.Transport.schedule(() => {
    try {
      Tone.Transport.stop();
      Tone.Transport.cancel();
    } catch (e) {
      // ignore
    }
    try {
      synth.dispose();
    } catch (e) {
      // ignore
    }
  }, totalTime + 0.01);

  // Start slightly in the future to ensure schedules at time 0 fire reliably
  Tone.Transport.start("+0.01");
}

// Play a full sequence of lines with highlight callback
export async function playSequence(sequence, duration = "8n", onNotePlay) {
  await Tone.start();
  const synth = new Tone.Synth().toDestination();

  // Reset transport
  Tone.Transport.stop();
  Tone.Transport.cancel();
  Tone.Transport.bpm.value = 120;

  let timeOffset = 0;
  const baseNoteSeconds = Tone.Time(duration).toSeconds();
  const tripletNoteSeconds = baseNoteSeconds * (2 / 3);

  sequence.forEach((line, lineIdx) => {
    const tripletStart = line.tripletStartIndex ?? -1;
    line.notes.forEach((noteObj, noteIdx) => {
      const isTriplet = tripletStart >= 0 && noteIdx >= tripletStart && noteIdx < tripletStart + 3;
      const thisDurationSeconds = isTriplet ? tripletNoteSeconds : baseNoteSeconds;
      const noteStr = `${noteObj.letter}${noteObj.accidental || ""}${noteObj.octave}`;

      Tone.Transport.schedule((timeStamp) => {
        synth.triggerAttackRelease(noteStr, thisDurationSeconds, timeStamp);
        if (onNotePlay) onNotePlay(lineIdx, noteIdx);
      }, timeOffset);

      timeOffset += thisDurationSeconds;
    });
  });

  if (onNotePlay) {
    Tone.Transport.schedule(() => onNotePlay(-1, -1), timeOffset);
  }

  // cleanup after whole sequence
  Tone.Transport.schedule(() => {
    try {
      Tone.Transport.stop();
      Tone.Transport.cancel();
    } catch (e) {}
    try {
      synth.dispose();
    } catch (e) {}
  }, timeOffset + 0.01);

  Tone.Transport.start("+0.01");
}
