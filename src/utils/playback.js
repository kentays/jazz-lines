import * as Tone from "tone";

// Play a single line of notes with highlight callback
export async function playLine(notes, duration = "8n", onNotePlay) {
  await Tone.start();
  const synth = new Tone.Synth().toDestination();

  // Ensure transport is reset so schedules use time 0
  Tone.Transport.stop();
  Tone.Transport.cancel();
  Tone.Transport.bpm.value = 120;

  const noteDurationSeconds = Tone.Time(duration).toSeconds();
  const totalTime = noteDurationSeconds * notes.length;

  notes.forEach((noteObj, i) => {
    const time = noteDurationSeconds * i;
    const noteStr = `${noteObj.letter}${noteObj.accidental || ""}${noteObj.octave}`;

    Tone.Transport.schedule((timeStamp) => {
      synth.triggerAttackRelease(noteStr, duration, timeStamp);
      if (onNotePlay) onNotePlay(i);
    }, time);
  });

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
  const noteDurationSeconds = Tone.Time(duration).toSeconds();

  sequence.forEach((line, lineIdx) => {
    line.notes.forEach((noteObj, noteIdx) => {
      const noteStr = `${noteObj.letter}${noteObj.accidental || ""}${noteObj.octave}`;
      Tone.Transport.schedule((timeStamp) => {
        synth.triggerAttackRelease(noteStr, duration, timeStamp);
        if (onNotePlay) onNotePlay(lineIdx, noteIdx);
      }, timeOffset);

      timeOffset += noteDurationSeconds;
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
