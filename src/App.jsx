import { useState } from "react";
import LineInput from "./components/LineInput";
import NotationView from "./components/NotationView";
import Collapsible from "./components/Collapsible";
import { canConnect, SCALE_ORDER } from "./theory/connections";
import { parseMusicXmlToLines } from "./theory/musicXmlImporter";
import { parseNote } from "./theory/noteParser";
import { buildJazzLine } from "./theory/lineBuilder";
import { playLine, playSequence } from "./utils/playback";

function App() {
  const [lines, setLines] = useState(() => {
    const saved = localStorage.getItem("jazzLines");
    return saved ? JSON.parse(saved) : [];
  });

  const [currentSequence, setCurrentSequence] = useState([]);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editText, setEditText] = useState("");
  const [editTags, setEditTags] = useState("");
  // highlight: { area: 'available'|'sequence'|null, lineIdx: number, noteIdx: number }
  const [highlight, setHighlight] = useState({ area: null, lineIdx: -1, noteIdx: -1 });

  const addLine = (line) => {
    const updated = [...lines, line];
    setLines(updated);
    localStorage.setItem("jazzLines", JSON.stringify(updated));
  };

  const removeLine = (index) => {
    const updated = lines.filter((_, i) => i !== index);
    setLines(updated);
    localStorage.setItem("jazzLines", JSON.stringify(updated));
  };

  const clearLines = () => {
    setLines([]);
    setCurrentSequence([]);
    setHighlight({ area: null, lineIdx: -1, noteIdx: -1 });
    localStorage.removeItem("jazzLines");
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(lines, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "jazz_lines.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJSON = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        if (!Array.isArray(imported)) throw new Error("Invalid JSON");
        setLines(imported);
        localStorage.setItem("jazzLines", JSON.stringify(imported));
        setCurrentSequence([]);
        setHighlight({ lineIdx: -1, noteIdx: -1 });
      } catch (err) {
        alert("Failed to import JSON: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  const importMusicXml = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
  const xml = e.target.result;
  const importedLines = parseMusicXmlToLines(xml);
        if (!Array.isArray(importedLines) || importedLines.length === 0) {
          alert("No lines found in MusicXML file.");
          return;
        }

        const updated = [...lines, ...importedLines];
        setLines(updated);
        localStorage.setItem("jazzLines", JSON.stringify(updated));
        alert(`Imported ${importedLines.length} lines from MusicXML`);
      } catch (err) {
        alert("Failed to import MusicXML: " + err.message);
      }
    };
    reader.readAsText(file);
    // reset input
    event.target.value = null;
  };

  const selectLine = (line) => {
    const newSequence = [...currentSequence, line];
    setCurrentSequence(newSequence);
  }; 

  const clearSequence = () => {
    if (currentSequence.length > 0) {
      const ok = window.confirm("Clear current sequence? This will remove all selected lines from the sequence.");
      if (!ok) return;
    }

    setCurrentSequence([]);
    setHighlight({ area: null, lineIdx: -1, noteIdx: -1 });
  };

  // ...existing code...

  // Adjust octave for a specific saved line (globalIndex into `lines`)
  const adjustLineOctave = (globalIndex, delta) => {
    if (globalIndex < 0 || globalIndex >= lines.length) return;

    const oldLine = lines[globalIndex];

    // Build new notes with adjusted octave
    const newNotes = oldLine.notes.map((n) => {
      const accidentalForParser = n.accidental === 'b' ? 'B' : (n.accidental === '#' ? '#' : '');
      const noteStr = `${n.letter}${accidentalForParser}${n.octave + delta}`;
      try {
        return parseNote(noteStr);
      } catch (e) {
        // fallback: keep original note if parse fails
        return { ...n };
      }
    });

    // Rebuild line metadata
    const updatedLine = buildJazzLine(newNotes);

    // Update lines array
    const updatedLines = [...lines];
    updatedLines[globalIndex] = updatedLine;
    setLines(updatedLines);
    localStorage.setItem("jazzLines", JSON.stringify(updatedLines));

    // Also update any occurrences in currentSequence that referenced the old line object
    const updatedSequence = currentSequence.map((item) => (item === oldLine ? updatedLine : item));
    setCurrentSequence(updatedSequence);
  };

  // Helpers for editing a saved line
  function notesToRawString(notes) {
    return notes.map(n => {
      const acc = n.accidental === 'b' ? 'B' : (n.accidental === '#' ? '#' : '');
      return `${n.letter}${acc}${n.octave}`;
    }).join(', ');
  }

  const startEditLine = (globalIndex) => {
    const line = lines[globalIndex];
    if (!line) return;
    setEditingIndex(globalIndex);
    setEditText(notesToRawString(line.notes));
    setEditTags((line.tags || []).join(', '));
  };

  const cancelEditLine = () => {
    setEditingIndex(null);
    setEditText("");
    setEditTags("");
  };

  const saveEditLine = () => {
    if (editingIndex === null) return;
    const raw = editText;
    const noteStrings = raw
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(s => s.toUpperCase());

    try {
      const notes = noteStrings.map(parseNote);
      const updatedLine = buildJazzLine(notes);

      // attach tags from editTags (comma-separated)
      const tags = editTags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);
      if (tags.length > 0) updatedLine.tags = tags;

      const updatedLines = [...lines];
      const oldLine = updatedLines[editingIndex];
      updatedLines[editingIndex] = updatedLine;
      setLines(updatedLines);
      localStorage.setItem("jazzLines", JSON.stringify(updatedLines));

      // Update any occurrences in currentSequence that referenced the old line object
      const updatedSequence = currentSequence.map(item => (item === oldLine ? updatedLine : item));
      setCurrentSequence(updatedSequence);

      // clear editing state
      setEditingIndex(null);
      setEditText("");
      setEditTags("");
    } catch (err) {
      alert("Failed to parse notes: " + err.message);
    }
  };

  return (
    <div style={{ padding: 20, fontFamily: "Arial, sans-serif" }}>
      <h1>Jazz Line Sequence Explorer</h1>

      {/* Line Input and Controls */}
      <Collapsible title="📚Library & Import" defaultOpen={false} right={<span style={{ fontSize: 12, color: "#666" }}>{lines.length} lines</span>}>
        <LineInput onLineCreated={addLine} />
        <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={clearLines}>Clear All Lines</button>
          <button onClick={exportJSON}>Export JSON</button>
          <input type="file" accept=".json" onChange={importJSON} />
        </div>
        <div style={{ marginTop: 10 }}>
          <label style={{ display: 'block', marginTop: 8 }}>
            Import MusicXML (each measure → one line):
            <input type="file" accept=".xml,.musicxml" onChange={importMusicXml} />
          </label>
        </div>
      </Collapsible>

      {/* Sequence Explorer */}
      <Collapsible title="Sequence Explorer" defaultOpen={true} right={<span style={{ fontSize: 12, color: "#666" }}>{currentSequence.length} lines</span>}>

        <div style={{ marginTop: 10 }}>
          <div style={{ background: '#f8f9fa', padding: 10, borderRadius: 6, border: '1px solid #eee' }}>
            <strong>Tip:</strong> Select a starting line from the "Available Lines" groups below to begin a sequence. After choosing the first line, the panel will show subsequent available lines organized by musical relationship (half-step up/down, whole-step up/down, chord-tone up/down).
          </div>
        </div>

        <h4 style={{ marginTop: 8 }}>Current Sequence</h4>
        {currentSequence.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <button onClick={() => playSequence(currentSequence, "8n", (lineIdx, noteIdx) => setHighlight({ area: 'sequence', lineIdx, noteIdx }))}>
              Play Full Sequence
            </button>
            <button style={{ marginLeft: 12 }} onClick={clearSequence}>Clear Sequence</button>
          </div>
        )}

        <div style={{ position: 'relative' }}>
          {currentSequence.length === 0 && <div style={{ color: '#666' }}>No lines selected</div>}
          {currentSequence.map((line, idx) => (
            <div key={idx} style={{ border: "1px solid #f0f0f0", padding: 10, marginBottom: 10, background: '#fff' }}>
              <p style={{ margin: 0, marginBottom: 6 }}>Line {lines.indexOf(line) + 1}: {line.start.degree} → {line.end.degree}</p>
              <NotationView notes={line.notes} highlightIndex={highlight.area === 'sequence' && highlight.lineIdx === idx ? highlight.noteIdx : -1} />
              <button style={{ marginTop: 6 }} onClick={() => playLine(line.notes, "8n", (noteIdx) => setHighlight({ area: 'sequence', lineIdx: idx, noteIdx }))}>
                Play Line
              </button>
            </div>
          ))}
        </div>

        {(() => {
          // If there's no sequence yet, show all saved lines grouped by their start degree inside collapsible dropdowns
          if (currentSequence.length === 0) {
            const groups = {};
            lines.forEach((line) => {
              const key = line.start?.degree || 'unknown';
              if (!groups[key]) groups[key] = [];
              groups[key].push(line);
            });

            // Order groups by SCALE_ORDER then any remaining
            const orderedKeys = [];
            SCALE_ORDER.forEach(k => { if (groups[k]) orderedKeys.push(k); });
            Object.keys(groups).forEach(k => { if (!orderedKeys.includes(k)) orderedKeys.push(k); });

            const total = Object.values(groups).reduce((s, a) => s + a.length, 0);

            return (
              <div>
                <h4 style={{ marginTop: 6 }}>Available Lines <span style={{ marginLeft: 8, fontSize: 12, color: '#666' }}>({total})</span></h4>
                <div style={{ maxHeight: 420, overflowY: 'auto', paddingRight: 8 }}>
                  {orderedKeys.map((key) => (
                    <Collapsible key={key} title={`${key} (${groups[key].length})`} defaultOpen={false}>
                      {groups[key].length === 0 ? (
                        <div style={{ color: '#666', padding: 8 }}>No lines</div>
                      ) : (
                        groups[key].map((line, i) => {
                          const globalIndex = lines.indexOf(line);
                          return (
                            <div key={i} style={{ border: "1px solid #eee", padding: 8, marginBottom: 8, borderRadius: 4 }}>
                              <p style={{ margin: 0, marginBottom: 6 }}>Line {globalIndex + 1}: {line.start.degree} → {line.end.degree}</p>

                              {editingIndex === globalIndex ? (
                                <div>
                                  <textarea rows={3} style={{ width: '100%' }} value={editText} onChange={(e) => setEditText(e.target.value)} />
                                  <div style={{ marginTop: 6 }}>
                                    <label style={{ fontSize: 12 }}>Function tags (comma-separated):</label>
                                    <input style={{ width: '100%', marginTop: 4 }} value={editTags} onChange={(e) => setEditTags(e.target.value)} />
                                  </div>
                                  <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                                    <button onClick={saveEditLine}>Save</button>
                                    <button onClick={cancelEditLine}>Cancel</button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <NotationView notes={line.notes} highlightIndex={-1} />
                                  <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                                    <button onClick={() => selectLine(line)}>Select</button>
                                    <button onClick={() => startEditLine(globalIndex)}>Edit</button>
                                    <button onClick={() => playLine(line.notes, "8n", (noteIdx) => setHighlight({ area: 'available', lineIdx: globalIndex, noteIdx }))}>
                                      Play Line
                                    </button>
                                    <button onClick={() => adjustLineOctave(globalIndex, -1)}>Octave -</button>
                                    <button onClick={() => adjustLineOctave(globalIndex, +1)}>Octave +</button>
                                  </div>
                                  {line.tags && line.tags.length > 0 && (
                                    <div style={{ marginTop: 6, fontSize: 12, color: '#444' }}>Tags: {line.tags.join(', ')}</div>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })
                      )}
                    </Collapsible>
                  ))}
                </div>
              </div>
            );
          }

          // After first selection, organize available lines into categories
          const last = currentSequence[currentSequence.length - 1];
          const endDeg = last.end?.degree;
          const endIdx = endDeg ? SCALE_ORDER.indexOf(endDeg) : -1;
          const n = SCALE_ORDER.length;
          const CHORD_TONES = ["1", "3", "5", "7"];

          function circularDistance(a, b) {
            const diff = Math.abs(a - b);
            return Math.min(diff, n - diff);
          }

          function forwardDistance(a, b) {
            return (b - a + n) % n;
          }

          function nearestChordToneAboveIndex(idx) {
            for (let i = 1; i <= n; i++) {
              const candidate = (idx + i) % n;
              if (CHORD_TONES.includes(SCALE_ORDER[candidate])) return candidate;
            }
            return null;
          }

          function nearestChordToneBelowIndex(idx) {
            for (let i = 1; i <= n; i++) {
              const candidate = (idx - i + n) % n;
              if (CHORD_TONES.includes(SCALE_ORDER[candidate])) return candidate;
            }
            return null;
          }

          const buckets = {
            halfUp: [],
            halfDown: [],
            wholeUp: [],
            wholeDown: [],
            chordUp: [],
            chordDown: []
          };

          lines.forEach((line) => {
            if (currentSequence.includes(line)) return; // exclude already selected
            const startDeg = line.start?.degree;
            const startIdx = startDeg ? SCALE_ORDER.indexOf(startDeg) : -1;
            if (startIdx === -1 || endIdx === -1) return;

            const chromDist = circularDistance(endIdx, startIdx);
            const fwd = forwardDistance(endIdx, startIdx);

            if (chromDist === 1) {
              if (fwd === 1) buckets.halfUp.push(line);
              else buckets.halfDown.push(line);
              return;
            }

            if (chromDist === 2) {
              if (fwd === 2) buckets.wholeUp.push(line);
              else buckets.wholeDown.push(line);
              return;
            }

            const aboveIdx = nearestChordToneAboveIndex(endIdx);
            const belowIdx = nearestChordToneBelowIndex(endIdx);
            if (aboveIdx !== null && startIdx === aboveIdx) {
              buckets.chordUp.push(line);
              return;
            }
            if (belowIdx !== null && startIdx === belowIdx) {
              buckets.chordDown.push(line);
              return;
            }
          });

          const groups = [
            { key: 'Half step up', items: buckets.halfUp },
            { key: 'Half step down', items: buckets.halfDown },
            { key: 'Whole step up', items: buckets.wholeUp },
            { key: 'Whole step down', items: buckets.wholeDown },
            { key: 'Chord tone up', items: buckets.chordUp },
            { key: 'Chord tone down', items: buckets.chordDown }
          ];

          return (
            <div>
              <h4 style={{ marginTop: 6 }}>Available Lines <span style={{ marginLeft: 8, fontSize: 12, color: '#666' }}>(total {Object.values(buckets).reduce((s, a) => s + a.length, 0)})</span></h4>
              <div style={{ maxHeight: 420, overflowY: 'auto', paddingRight: 8 }}>
                {groups.map((g) => (
                  <Collapsible key={g.key} title={`${g.key} (${g.items.length})`} defaultOpen={false}>
                    {g.items.length === 0 ? (
                      <div style={{ color: '#666', padding: 8 }}>No lines</div>
                    ) : (
                      g.items.map((line, i) => {
                        const globalIndex = lines.indexOf(line);
                        return (
                          <div key={i} style={{ border: "1px solid #eee", padding: 8, marginBottom: 8, borderRadius: 4 }}>
                            <p style={{ margin: 0, marginBottom: 6 }}>Line {globalIndex + 1}: {line.start.degree} → {line.end.degree}</p>

                            {editingIndex === globalIndex ? (
                              <div>
                                <textarea rows={3} style={{ width: '100%' }} value={editText} onChange={(e) => setEditText(e.target.value)} />
                                <div style={{ marginTop: 6 }}>
                                  <label style={{ fontSize: 12 }}>Function tags (comma-separated):</label>
                                  <input style={{ width: '100%', marginTop: 4 }} value={editTags} onChange={(e) => setEditTags(e.target.value)} />
                                </div>
                                <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                                  <button onClick={saveEditLine}>Save</button>
                                  <button onClick={cancelEditLine}>Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <NotationView notes={line.notes} highlightIndex={-1} />
                                <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                                  <button onClick={() => selectLine(line)}>Select</button>
                                  <button onClick={() => startEditLine(globalIndex)}>Edit</button>
                                  <button onClick={() => playLine(line.notes, "8n", (noteIdx) => setHighlight({ area: 'available', lineIdx: globalIndex, noteIdx }))}>
                                    Play Line
                                  </button>
                                  <button onClick={() => adjustLineOctave(globalIndex, -1)}>Octave -</button>
                                  <button onClick={() => adjustLineOctave(globalIndex, +1)}>Octave +</button>
                                  <button onClick={() => removeLine(globalIndex)} style={{ marginLeft: 'auto' }}>Remove</button>
                                </div>
                                {line.tags && line.tags.length > 0 && (
                                  <div style={{ marginTop: 6, fontSize: 12, color: '#444' }}>Tags: {line.tags.join(', ')}</div>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })
                    )}
                  </Collapsible>
                ))}
              </div>
            </div>
          );
        })()}

      </Collapsible>

      {/* sequence is shown inside the Sequence Explorer collapsible above */}

      <Collapsible title="📈All Lines" defaultOpen={false} right={<span style={{ fontSize: 12, color: "#666" }}>{lines.length}</span>}>
        {lines.length === 0 && <div style={{ color: '#666' }}>No saved lines</div>}

        {/* Group lines by their start degree */}
        {(() => {
          const groups = {};
          lines.forEach((line) => {
            const key = line.start?.degree || "unknown";
            if (!groups[key]) groups[key] = [];
            groups[key].push(line);
          });

          // Determine ordered keys: follow SCALE_ORDER, then any others
          const orderedKeys = [];
          SCALE_ORDER.forEach(k => { if (groups[k]) orderedKeys.push(k); });
          Object.keys(groups).forEach(k => { if (!orderedKeys.includes(k)) orderedKeys.push(k); });

          return orderedKeys.map((key) => (
            <Collapsible key={key} title={`${key}`} defaultOpen={false} right={<span style={{ color: '#666', fontSize: 12 }}>({groups[key].length})</span>}>
              {groups[key].map((line, idx) => {
                const globalIndex = lines.indexOf(line);
                return (
                  <div key={idx} style={{ border: "1px solid #eee", padding: 10, marginBottom: 8 }}>
                    <p style={{ margin: 0, marginBottom: 6 }}>Line {globalIndex + 1}: {line.start.degree} → {line.end.degree}</p>

                    {editingIndex === globalIndex ? (
                      <div>
                        <textarea rows={3} style={{ width: '100%' }} value={editText} onChange={(e) => setEditText(e.target.value)} />
                        <div style={{ marginTop: 6 }}>
                          <label style={{ fontSize: 12 }}>Function tags (comma-separated):</label>
                          <input style={{ width: '100%', marginTop: 4 }} value={editTags} onChange={(e) => setEditTags(e.target.value)} />
                        </div>
                        <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                          <button onClick={saveEditLine}>Save</button>
                          <button onClick={cancelEditLine}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <NotationView notes={line.notes} highlightIndex={-1} />
                        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                          <button onClick={() => startEditLine(globalIndex)}>Edit</button>
                          <button onClick={() => playLine(line.notes, "8n", (noteIdx) => setHighlight({ area: 'available', lineIdx: globalIndex, noteIdx }))}>
                            Play Line
                          </button>
                          <button onClick={() => adjustLineOctave(globalIndex, -1)}>Octave -</button>
                          <button onClick={() => adjustLineOctave(globalIndex, +1)}>Octave +</button>
                          <button onClick={() => removeLine(globalIndex)} style={{ marginLeft: 'auto' }}>Delete</button>
                        </div>
                        {line.tags && line.tags.length > 0 && (
                          <div style={{ marginTop: 6, fontSize: 12, color: '#444' }}>Tags: {line.tags.join(', ')}</div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </Collapsible>
          ));
        })()}
      </Collapsible>
    </div>
  );
}

export default App;
