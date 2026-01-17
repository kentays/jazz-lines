import { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import LineInput from "./components/LineInput";
import NotationView from "./components/NotationView";
import Collapsible from "./components/Collapsible";
import { canConnect, SCALE_ORDER } from "./theory/connections";
import { parseMusicXmlToLines } from "./theory/musicXmlImporter";
import { parseNote } from "./theory/noteParser";
import { buildJazzLine } from "./theory/lineBuilder";
import { playLine, playSequence } from "./utils/playback";

// Ensure all lines have tripletStartIndex property
function normalizeLinesWithTriplet(lines) {
  return lines.map((line) => {
    if (typeof line.tripletStartIndex === "undefined") {
      // Default to 6 (last 3 notes) for 9-note lines, -1 for others
      return {
        ...line,
        tripletStartIndex: line.notes?.length === 9 ? 6 : -1
      };
    }
    return line;
  });
}

function App() {
  const BASE = (import.meta && import.meta.env && import.meta.env.BASE_URL) ? import.meta.env.BASE_URL : '/';
  const [lines, setLines] = useState(() => {
    const saved = localStorage.getItem("jazzLines");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return normalizeLinesWithTriplet(parsed.map((l) => ({ ...(l || {}), libraryId: l.libraryId ?? 'user' })));
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const [libraries, setLibraries] = useState(() => {
    try {
      const raw = localStorage.getItem('libraries');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  });

  const [currentSequence, setCurrentSequence] = useState([]);
  const [savedSequences, setSavedSequences] = useState(() => {
    const saved = localStorage.getItem("savedSequences");
    const parsed = saved ? JSON.parse(saved) : [];
    // Normalize sequences too
    return parsed.map((seq) =>
      Array.isArray(seq) ? seq.map((line) => ({
        ...line,
        tripletStartIndex: typeof line.tripletStartIndex === "undefined" 
          ? (line.notes?.length === 9 ? 6 : -1)
          : line.tripletStartIndex
      })) : seq
    );
  });

  // UI state: highlighting and edit buffers
  const [highlight, setHighlight] = useState({ area: null, lineIdx: -1, noteIdx: -1 });
  const [editingIndex, setEditingIndex] = useState(null);
  const [editText, setEditText] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editComment, setEditComment] = useState("");

  // Toggles: persist to localStorage
  const [connectAnywhere, setConnectAnywhere] = useState(() => {
    try { return localStorage.getItem('connectAnywhere') === 'true'; } catch (e) { return false; }
  });

  const [allowDuplicates, setAllowDuplicates] = useState(() => {
    try { return localStorage.getItem('allowDuplicates') === 'true'; } catch (e) { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem('connectAnywhere', connectAnywhere ? 'true' : 'false'); } catch (e) {}
  }, [connectAnywhere]);

  // Temporary preview overrides for available lines in Sequence Explorer (non-persistent)
  const [previewOverrides, setPreviewOverrides] = useState({});

  const adjustAvailableOctave = (globalIndex, delta) => {
    if (globalIndex < 0 || globalIndex >= lines.length) return;
    // Use current preview as the base if present so adjustments accumulate,
    // otherwise fall back to the stored line.
    const base = previewOverrides[globalIndex] || lines[globalIndex];
    if (!base || !base.notes) return;

    const newNotes = base.notes.map((n) => {
      const accidentalForParser = n.accidental === 'b' ? 'B' : (n.accidental === '#' ? '#' : '');
      const noteStr = `${n.letter}${accidentalForParser}${n.octave + delta}`;
      try {
        return parseNote(noteStr);
      } catch (e) {
        return { ...n };
      }
    });

    const newLine = buildJazzLine(newNotes, base.tripletStartIndex);
    // preserve non-note metadata
    if (base) {
      ['libraryId', 'tags', 'comment', 'start', 'end'].forEach(k => { if (base[k] !== undefined) newLine[k] = base[k]; });
    }

    setPreviewOverrides(prev => ({ ...prev, [globalIndex]: newLine }));
  };

  const clearPreviewFor = (globalIndex) => {
    setPreviewOverrides(prev => {
      const copy = { ...prev };
      delete copy[globalIndex];
      return copy;
    });
  };

  // Load default data on first visit
  

  useEffect(() => {
    try {
      localStorage.setItem('allowDuplicates', allowDuplicates ? 'true' : 'false');
    } catch (e) {
      // ignore
    }
  }, [allowDuplicates]);

  // Library selection modal state for imports/adds
  const [pendingImport, setPendingImport] = useState(null); // { lines: [...] }
  const [libraryDialogSelected, setLibraryDialogSelected] = useState('user');
  const [libraryDialogNewName, setLibraryDialogNewName] = useState('');
  const [libraryDialogComment, setLibraryDialogComment] = useState('');

  const openLibraryDialogForLines = (linesToImport) => {
    setPendingImport({ lines: linesToImport });
    setLibraryDialogSelected('user');
    setLibraryDialogNewName('');
    setLibraryDialogComment((linesToImport && linesToImport.length === 1 && linesToImport[0].comment) ? linesToImport[0].comment : '');
  };

  const confirmLibraryDialog = () => {
    if (!pendingImport) return;
    let targetId = libraryDialogSelected || 'user';
    if (libraryDialogNewName && libraryDialogNewName.trim() !== '') {
      const newId = createLibraryWithName(libraryDialogNewName.trim());
      if (newId) targetId = newId;
    }
    const toAdd = (pendingImport.lines || []).map((l) => ({ ...(l || {}), libraryId: l.libraryId ?? targetId, comment: (libraryDialogComment && libraryDialogComment.trim() !== '') ? libraryDialogComment.trim() : l.comment }));
    const updated = [...lines, ...toAdd];
    setLines(updated);
    try { localStorage.setItem('jazzLines', JSON.stringify(updated)); } catch (e) {}
    setPendingImport(null);
    setLibraryDialogNewName('');
    setLibraryDialogSelected('user');
    setLibraryDialogComment('');
  };

  const cancelLibraryDialog = () => {
    setPendingImport(null);
    setLibraryDialogNewName('');
    setLibraryDialogSelected('user');
    setLibraryDialogComment('');
  };

  const addLine = (line) => {
    // Open library selection modal for this single line
    openLibraryDialogForLines([ line ]);
  };

  const removeLine = (index) => {
    const updated = lines.filter((_, i) => i !== index);
    setLines(updated);
    localStorage.setItem("jazzLines", JSON.stringify(updated));
  };

  const clearLines = () => {
    const ok = window.confirm("Clear ALL saved lines? This will remove them permanently.");
    if (!ok) return;
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

  const exportLibrary = (libraryId) => {
    const libLines = lines.filter(l => (libraryId === 'user' ? (l.libraryId === 'user' || !l.libraryId) : l.libraryId === libraryId));
    if (!libLines || libLines.length === 0) {
      alert('No lines to export for this library.');
      return;
    }
    const lib = libraries.find(l => l.id === libraryId);
    const name = lib ? lib.name.replace(/[^a-z0-9\-_ ]/gi, '_') : (libraryId === 'user' ? 'personal_lines' : libraryId);
    const blob = new Blob([JSON.stringify(libLines, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.json`;
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
        // Open library selection modal to decide where to import these lines
        const normalized = normalizeLinesWithTriplet(imported);
        openLibraryDialogForLines(normalized);
        setCurrentSequence([]);
        setHighlight({ lineIdx: -1, noteIdx: -1 });
      } catch (err) {
        alert("Failed to import JSON: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  // Helpers for library visibility
  const isLibraryEnabled = (libraryId) => {
    if (!libraryId || libraryId === 'user') return true;
    const lib = libraries.find(l => l.id === libraryId);
    return lib ? !!lib.enabled : true;
  };

  const toggleLibraryEnabled = (id) => {
    const updated = libraries.map(l => l.id === id ? { ...l, enabled: !l.enabled } : l);
    setLibraries(updated);
    try { localStorage.setItem('libraries', JSON.stringify(updated)); } catch (e) {}
  };

  const createLibrary = () => {
    const name = window.prompt('New library name:');
    if (!name) return;
    createLibraryWithName(name);
  };

  // Create a library record programmatically and return its id. If the name collides, returns existing id.
  const createLibraryWithName = (name) => {
    const cleaned = String(name || '').trim();
    if (!cleaned) return null;
    let id = cleaned.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (!id) id = `lib_${Date.now()}`;
    // avoid collision
    if (libraries.find(l => l.id === id)) {
      return id; // existing
    }
    // ensure unique id by appending suffix if needed
    let uniqueId = id;
    let suffix = 1;
    while (libraries.find(l => l.id === uniqueId)) {
      uniqueId = `${id}_${suffix++}`;
    }
    const newLib = { id: uniqueId, name: cleaned, enabled: true, editable: true };
    const updated = [...libraries, newLib];
    setLibraries(updated);
    try { localStorage.setItem('libraries', JSON.stringify(updated)); } catch (e) {}
    return uniqueId;
  };

  const updateLineLibrary = (globalIndex, newLibraryId) => {
    if (globalIndex < 0 || globalIndex >= lines.length) return;
    const updatedLines = [...lines];
    const line = { ...(updatedLines[globalIndex] || {}) };
    line.libraryId = newLibraryId === 'user' ? 'user' : newLibraryId;
    updatedLines[globalIndex] = line;
    setLines(updatedLines);
    try { localStorage.setItem('jazzLines', JSON.stringify(updatedLines)); } catch (e) {}
  };

  const deleteLibrary = (id) => {
    const lib = libraries.find(l => l.id === id);
    if (!lib) return;
    const ok = window.confirm(`Delete library '${lib.name}' and all its lines? This cannot be undone.`);
    if (!ok) return;
    const updatedLibs = libraries.filter(l => l.id !== id);
    const updatedLines = lines.filter(line => line.libraryId !== id);
    setLibraries(updatedLibs);
    setLines(updatedLines);
    try { localStorage.setItem('libraries', JSON.stringify(updatedLibs)); } catch (e) {}
    try { localStorage.setItem('jazzLines', JSON.stringify(updatedLines)); } catch (e) {}
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

        // Open library selection modal to decide where to import these lines
        const normalized = normalizeLinesWithTriplet(importedLines);
        openLibraryDialogForLines(normalized);
        alert(`Imported ${importedLines.length} lines from MusicXML (choose target library in dialog)`);
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
    // clear any temporary previews after selection to avoid stale overrides
    setPreviewOverrides({});
  }; 

  const clearSequence = () => {
    if (currentSequence.length > 0) {
      const ok = window.confirm("Clear current sequence? This will remove all selected lines from the sequence.");
      if (!ok) return;
    }

    setCurrentSequence([]);
    setHighlight({ area: null, lineIdx: -1, noteIdx: -1 });
  };

  // Remove the last-added line from the current sequence (undo last selection)
  const removeLastFromSequence = () => {
    if (currentSequence.length === 0) {
      alert("No lines in the current sequence to remove.");
      return;
    }
    const newSeq = currentSequence.slice(0, -1);
    setCurrentSequence(newSeq);
    setHighlight({ area: null, lineIdx: -1, noteIdx: -1 });
  };

  const saveSequence = () => {
    if (currentSequence.length === 0) {
      alert("No sequence to save.");
      return;
    }
    const name = prompt("Enter a name for this sequence:");
    if (!name || name.trim() === "") return;
    const newSeq = { name: name.trim(), sequence: normalizeLinesWithTriplet([...currentSequence]) };
    const updated = [...savedSequences, newSeq];
    setSavedSequences(updated);
    localStorage.setItem("savedSequences", JSON.stringify(updated));
  };

  const loadSequence = (index) => {
    const seq = savedSequences[index];
    if (!seq) return;
    setCurrentSequence(normalizeLinesWithTriplet(Array.isArray(seq.sequence) ? seq.sequence : []));
    setHighlight({ area: null, lineIdx: -1, noteIdx: -1 });
  };

  const deleteSequence = (index) => {
    const updated = savedSequences.filter((_, i) => i !== index);
    setSavedSequences(updated);
    localStorage.setItem("savedSequences", JSON.stringify(updated));
  };

  const renameSequence = (index) => {
    const seq = savedSequences[index];
    if (!seq) return;
    const newName = prompt("Enter a new name for this sequence:", seq.name || "");
    if (!newName) return;
    const updated = [...savedSequences];
    updated[index] = { ...updated[index], name: newName.trim() };
    setSavedSequences(updated);
    localStorage.setItem("savedSequences", JSON.stringify(updated));
  };

  const exportSequences = () => {
    const blob = new Blob([JSON.stringify(savedSequences, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "saved_sequences.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const printSequence = () => {
    if (!currentSequence || currentSequence.length === 0) {
      alert('No sequence to print.');
      return;
    }
    // Create a temporary container in the main DOM and render NotationViews
    const printContainer = document.createElement('div');
    printContainer.id = 'print-sequence-temp';
    printContainer.style.position = 'fixed';
    printContainer.style.left = '0';
    printContainer.style.top = '0';
    printContainer.style.width = '100%';
    printContainer.style.zIndex = '9999';
    printContainer.style.backgroundColor = 'white';
    printContainer.style.padding = '20px';
    printContainer.style.maxHeight = '100vh';
    printContainer.style.overflowY = 'auto';
    document.body.appendChild(printContainer);

    // Render each NotationView in the container
    const root = ReactDOM.createRoot(printContainer);
    const components = currentSequence.map((line, idx) => (
      <div key={idx} style={{ marginBottom: '30px', pageBreakInside: 'avoid' }}>
              <NotationView notes={line.notes} tags={line.tags ?? []} highlightIndex={highlight.area === 'available' && highlight.lineIdx === lines.indexOf(line) ? highlight.noteIdx : -1} tripletStartIndex={line.tripletStartIndex ?? -1} />
      </div>
    ));
    root.render(<>{components}</>);

    // Wait for render, add print styles, trigger print, then cleanup
    setTimeout(() => {
      // Add styles to hide everything except print container during print
      const styleEl = document.createElement('style');
      styleEl.id = 'print-sequence-style';
      styleEl.textContent = `
        @media print {
          body > * { display: none !important; }
          #print-sequence-temp { display: block !important; position: static !important; max-height: none !important; overflow: visible !important; width: 100% !important; }
          #print-sequence-temp > div { page-break-inside: avoid; }
        }
      `;
      document.head.appendChild(styleEl);

      // Trigger print
      window.print();

      // Cleanup after print dialog closes (user confirms or cancels)
      setTimeout(() => {
        root.unmount();
        printContainer.remove();
        styleEl.remove();
      }, 500);
    }, 600);
  };

  const importSequences = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        if (!Array.isArray(imported)) throw new Error("Invalid JSON");
        setSavedSequences(imported);
        localStorage.setItem("savedSequences", JSON.stringify(imported));
        alert(`Imported ${imported.length} sequences`);
      } catch (err) {
        alert("Failed to import sequences: " + err.message);
      }
    };
    reader.readAsText(file);
    event.target.value = null;
  };

  const loadDefaults = () => {
    const ok = window.confirm("Load default library and sequences? This will replace your current data.");
    if (!ok) return;
    
      Promise.all([
      fetch(`${BASE}jazz_lines.json`).then((res) => {
        if (!res.ok) throw new Error(`Failed to load jazz_lines.json: ${res.status}`);
        return res.json();
      }),
      fetch(`${BASE}saved_sequences.json`).then((res) => {
        if (!res.ok) throw new Error(`Failed to load saved_sequences.json: ${res.status}`);
        return res.json();
      })
    ])
      .then(([linesData, sequencesData]) => {
        if (Array.isArray(linesData)) {
          const normalizedLines = normalizeLinesWithTriplet(linesData);
          setLines(normalizedLines);
          localStorage.setItem("jazzLines", JSON.stringify(normalizedLines));
        }
        if (Array.isArray(sequencesData)) {
          const normalizedSequences = sequencesData.map((seq) =>
            Array.isArray(seq) ? normalizeLinesWithTriplet(seq) : seq
          );
          setSavedSequences(normalizedSequences);
          localStorage.setItem("savedSequences", JSON.stringify(normalizedSequences));
        }
        setCurrentSequence([]);
        setHighlight({ area: null, lineIdx: -1, noteIdx: -1 });
        alert("Default library and sequences loaded!");
      })
      .catch((err) => {
        console.error("Failed to load defaults:", err);
        alert("Failed to load default files: " + err.message);
      });
  };

  // Load only default lines (library)
  const loadDefaultLines = () => {
    const ok = window.confirm("Load default libraries? This will add default libraries (Jazz Lines, Hexatonic Lines, Major ii-v Lines) to your library.");
    if (!ok) return;

    const DEFAULTS = [
      { path: `${BASE}jazz_lines.json`, id: "jazz_lines", name: "Jazz Lines" },
      { path: `${BASE}hexatonic_lines.json`, id: "hexatonic_lines", name: "Hexatonic Lines" },
      { path: `${BASE}major_ii-v_lines.json`, id: "major_ii-v_lines", name: "Major ii-V Lines" }
    ];

    Promise.allSettled(DEFAULTS.map(d => fetch(d.path).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })))
      .then((results) => {
        const addedLines = [];
        const addedLibs = [];
        const updatedLibs = [];
        const skipped = [];

        results.forEach((res, i) => {
          const def = DEFAULTS[i];
          if (res.status === 'fulfilled' && Array.isArray(res.value)) {
            const normalized = normalizeLinesWithTriplet(res.value).map((ln) => ({ ...(ln || {}), libraryId: def.id }));
            const exists = libraries.find(l => l.id === def.id);
            if (!exists) {
              // add new library and its lines
              addedLibs.push(def.id);
              addedLines.push(...normalized);
            } else {
              // library exists — ask the user whether to replace its lines
              const wantReplace = window.confirm(`${def.name} is already loaded. Replace its lines with the default version?`);
              if (wantReplace) {
                updatedLibs.push(def.id);
                // remove old lines from this library, then add fresh ones
                // we'll remove them below when building finalLines
                addedLines.push(...normalized);
              } else {
                skipped.push(def.id);
              }
            }
          } else {
            skipped.push(def.id);
          }
        });

        if (addedLibs.length === 0 && updatedLibs.length === 0) {
          alert('No default libraries were added or updated. They may already be loaded or failed to fetch.');
          return;
        }

        // Create library records for newly added libraries
        const newLibRecords = addedLibs.map(id => {
          const def = DEFAULTS.find(d => d.id === id);
          return { id: def.id, name: def.name, enabled: true, editable: false };
        });
        const updatedLibsState = [...libraries, ...newLibRecords];

        // Remove replaced libraries' old lines
        let finalLines = [...lines];
        updatedLibs.forEach(id => { finalLines = finalLines.filter(l => l.libraryId !== id); });
        finalLines = [...finalLines, ...addedLines];

        setLines(finalLines);
        setLibraries(updatedLibsState);
        try { localStorage.setItem('jazzLines', JSON.stringify(finalLines)); } catch (e) {}
        try { localStorage.setItem('libraries', JSON.stringify(updatedLibsState)); } catch (e) {}

        const summary = [];
        if (addedLibs.length) summary.push(`Added: ${addedLibs.join(', ')}`);
        if (updatedLibs.length) summary.push(`Replaced: ${updatedLibs.join(', ')}`);
        if (skipped.length) summary.push(`Skipped/Failed: ${skipped.join(', ')}`);
        alert(`Libraries update complete. ${summary.join(' / ')}`);
      })
      .catch((err) => {
        console.error("Failed to load default libraries:", err);
        alert("Failed to load default libraries: " + err.message);
      });
  };

  // Load only default saved sequences
  const loadDefaultSequences = () => {
    const ok = window.confirm("Load default sequences? This will replace your saved sequences.");
    if (!ok) return;
    fetch(`${BASE}saved_sequences.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load saved_sequences.json: ${res.status}`);
        return res.json();
      })
      .then((sequencesData) => {
        if (Array.isArray(sequencesData)) {
          const normalizedSequences = sequencesData.map((seq) =>
            Array.isArray(seq) ? normalizeLinesWithTriplet(seq) : seq
          );
          setSavedSequences(normalizedSequences);
          localStorage.setItem("savedSequences", JSON.stringify(normalizedSequences));
          alert("Default sequences loaded!");
        }
      })
      .catch((err) => {
        console.error("Failed to load default sequences:", err);
        alert("Failed to load default sequences: " + err.message);
      });
  };

  const clearAllSequences = () => {
    if (savedSequences.length === 0) {
      alert("No saved sequences to clear.");
      return;
    }
    const ok = window.confirm("Clear ALL saved sequences? This will remove them permanently.");
    if (!ok) return;
    setSavedSequences([]);
    localStorage.removeItem("savedSequences");
    alert("All saved sequences cleared.");
  };

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

    // Rebuild line metadata, preserving triplet position
    const updatedLine = buildJazzLine(newNotes, lines[globalIndex].tripletStartIndex);

    // Preserve original metadata (library assignment, comment, tags, start/end, and any other fields)
    if (oldLine) {
      if (typeof oldLine.libraryId !== 'undefined') updatedLine.libraryId = oldLine.libraryId;
      if (typeof oldLine.tripletStartIndex !== 'undefined') updatedLine.tripletStartIndex = oldLine.tripletStartIndex;
      const preservedKeys = Object.keys(oldLine).filter(k => !(k in updatedLine));
      preservedKeys.forEach(k => { updatedLine[k] = oldLine[k]; });
    }

    // Update lines array
    const updatedLines = [...lines];
    updatedLines[globalIndex] = updatedLine;
    setLines(updatedLines);
    localStorage.setItem("jazzLines", JSON.stringify(updatedLines));

    // Also update any occurrences in currentSequence that referenced the old line object
    const updatedSequence = currentSequence.map((item) => (item === oldLine ? updatedLine : item));
    setCurrentSequence(updatedSequence);
  };

  // Adjust octave for a specific sequence line (temporary, doesn't save)
  const adjustSequenceOctave = (seqIdx, delta) => {
    if (seqIdx < 0 || seqIdx >= currentSequence.length) return;

    const oldLine = currentSequence[seqIdx];

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

    // Rebuild line metadata, preserving triplet position
    const newLine = buildJazzLine(newNotes, currentSequence[seqIdx].tripletStartIndex);

    // Update currentSequence with the new line object
    const newSequence = [...currentSequence];
    newSequence[seqIdx] = newLine;
    setCurrentSequence(newSequence);
  };

  // Adjust triplet position for a saved line (globalIndex)
  const adjustLineTriplet = (globalIndex, delta) => {
    if (globalIndex < 0 || globalIndex >= lines.length) return;

    const line = lines[globalIndex];
    if (!line.notes || line.notes.length < 3) return; // Need at least 3 notes for triplet

    let newTripletIndex = line.tripletStartIndex ?? -1;
    if (newTripletIndex === -1) {
      newTripletIndex = Math.max(0, line.notes.length - 3); // Default to last 3
    }

    newTripletIndex += delta * 2; // Move by 2 notes (quarter note = 2 eighth notes)

    // Validate bounds: triplet must have 3 consecutive notes
    if (newTripletIndex < 0) newTripletIndex = 0;
    if (newTripletIndex + 3 > line.notes.length) newTripletIndex = line.notes.length - 3;

    const updatedLine = { ...line, tripletStartIndex: newTripletIndex };
    const updatedLines = [...lines];
    updatedLines[globalIndex] = updatedLine;
    setLines(updatedLines);
    localStorage.setItem("jazzLines", JSON.stringify(updatedLines));

    // Also update in currentSequence if it references this line
    const updatedSequence = currentSequence.map((item) => 
      item === line ? updatedLine : item
    );
    setCurrentSequence(updatedSequence);
  };

  // Adjust triplet position for a sequence line (temporary, doesn't save)
  const adjustSequenceTriplet = (seqIdx, delta) => {
    if (seqIdx < 0 || seqIdx >= currentSequence.length) return;

    const line = currentSequence[seqIdx];
    if (!line.notes || line.notes.length < 3) return;

    let newTripletIndex = line.tripletStartIndex ?? -1;
    if (newTripletIndex === -1) {
      newTripletIndex = Math.max(0, line.notes.length - 3);
    }

    newTripletIndex += delta * 2;

    if (newTripletIndex < 0) newTripletIndex = 0;
    if (newTripletIndex + 3 > line.notes.length) newTripletIndex = line.notes.length - 3;

    const updatedLine = { ...line, tripletStartIndex: newTripletIndex };
    const newSequence = [...currentSequence];
    newSequence[seqIdx] = updatedLine;
    setCurrentSequence(newSequence);
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
    setEditTags(getCanonicalFunctionTag(line.tags || []));
    setEditComment(line.comment || "");
  };

  // Map existing tags array to a canonical single function-tag string
  function getCanonicalFunctionTag(tagsArray) {
    const tagStr = (tagsArray || []).map(t => String(t).toLowerCase()).join(' ');
    if (!tagStr || tagStr.trim() === '') return '';
    if (tagStr.includes('ii-v') || tagStr.includes('i i-v')) {
      if (tagStr.includes('minor') || tagStr.includes('min')) return 'minor ii-v';
      return 'major ii-v';
    }
    if (tagStr.includes('tritone')) return 'tritone sub';
    if (tagStr.includes('static') && tagStr.includes('minor')) return 'static minor';
    if (tagStr.includes('h/w') || tagStr.includes('hw') || tagStr.includes('diminished')) return 'h/w diminished';
    if (tagStr.includes('phrygian') || tagStr.includes('b13')) return 'phrygian dominant';
    if (tagStr.includes('altered') || tagStr.includes('#5')) return 'altered dominant';
    if (tagStr.includes('v7') || tagStr.includes('dominant')) return 'dominant 7';
    if (tagStr.includes('13') || tagStr.includes('b9') || tagStr.includes('13b9')) return 'h/w diminished';
    // fallback: keep first tag
    const first = (tagsArray || [])[0];
    return first ? String(first).toLowerCase() : '';
  }

  const cancelEditLine = () => {
    setEditingIndex(null);
    setEditText("");
    setEditTags("");
    setEditComment("");
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
      // attach user comment
      if (typeof editComment === 'string' && editComment.trim() !== '') {
        updatedLine.comment = editComment.trim();
      } else {
        updatedLine.comment = undefined;
      }

      // Preserve original metadata (library assignment, triplet position, any other fields)
      const originalLine = lines[editingIndex];
      if (originalLine) {
        if (typeof originalLine.libraryId !== 'undefined') updatedLine.libraryId = originalLine.libraryId;
        if (typeof originalLine.tripletStartIndex !== 'undefined') updatedLine.tripletStartIndex = originalLine.tripletStartIndex;
        // preserve any other fields the original had that buildJazzLine doesn't set
        const preservedKeys = Object.keys(originalLine).filter(k => !(k in updatedLine));
        preservedKeys.forEach(k => { updatedLine[k] = originalLine[k]; });
      }

      const updatedLines = [...lines];
      const oldLine = updatedLines[editingIndex];
      updatedLines[editingIndex] = updatedLine;
      setLines(updatedLines);
      try { localStorage.setItem("jazzLines", JSON.stringify(updatedLines)); } catch (e) {}

      // Update any occurrences in currentSequence that referenced the old line object
      const updatedSequence = currentSequence.map(item => (item === oldLine ? updatedLine : item));
      setCurrentSequence(updatedSequence);

      // clear editing state
      setEditingIndex(null);
      setEditText("");
      setEditTags("");
      setEditComment("");
    } catch (err) {
      alert("Failed to parse notes: " + err.message);
    }
  };

  // Categorize a list of lines by musical function for display
  const categorizeByFunction = (linesList) => {
    const buckets = {
      'Major ii-v': [],
      'Minor ii-v': [],
      'Static Minor': [],
      'Dominant 7': [],
      'Altered Dominant': [],
      'Phrygian Dominant': [],
      'H/W Diminished': [],
      'Tritone Sub': [],
      'Other': []
    };

    linesList.forEach((line) => {
      const tags = (line.tags || []).map(t => String(t).toLowerCase());
      const tagStr = tags.join(' ');

      if (tagStr.includes('ii-v') || tagStr.includes('i i-v') ) {
        if (tagStr.includes('minor') || tagStr.includes('min')) buckets['Minor ii-v'].push(line);
        else buckets['Major ii-v'].push(line);
        return;
      }

      if (tagStr.includes('static') && tagStr.includes('minor')) {
        buckets['Static Minor'].push(line);
        return;
      }

      if (tagStr.includes('altered') || tagStr.includes('#5') || tagStr.includes('v7#5') || tagStr.includes('g7alt')) {
        buckets['Altered Dominant'].push(line);
        return;
      }

      if (tagStr.includes('v7') || tagStr.includes('v 7') || tagStr.includes('dominant')) {
        buckets['Dominant 7'].push(line);
        return;
      }

      if (tagStr.includes('phrygian') || tagStr.includes('b13')) {
        buckets['Phrygian Dominant'].push(line);
        return;
      }

      if (tagStr.includes('h/w') || tagStr.includes('hw') || tagStr.includes('diminished') || tagStr.includes('13') || tagStr.includes('b9')) {
        buckets['H/W Diminished'].push(line);
        return;
      }

      if (tagStr.includes('tritone')) {
        buckets['Tritone Sub'].push(line);
        return;
      }

      buckets['Other'].push(line);
    });

    return buckets;
  };

  return (
    <div style={{ padding: 20, fontFamily: "Arial, sans-serif" }}>
      <h1>🎷Jazz Line Sequence Explorer</h1>

      {/* Line Input and Controls */}
      <Collapsible title="📚Library & Import" defaultOpen={false} right={<span style={{ fontSize: 12, color: "#666" }}>{lines.length} lines</span>}>
        <LineInput onLineCreated={addLine} />
        <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={clearLines}>Clear All Lines</button>
          <button onClick={loadDefaultLines} style={{ backgroundColor: "#4CAF50", color: "white" }}>Load Default Libraries</button>
          <input type="file" accept=".json" onChange={importJSON} />
        </div>
        {pendingImport && (
          <div style={{ position: 'fixed', left: 0, top: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
            <div style={{ background: '#fff', padding: 18, borderRadius: 8, width: 520, maxWidth: '94%' }}>
              <h3 style={{ marginTop: 0 }}>Import Target</h3>
              <div style={{ marginBottom: 8, color: '#444' }}>{(pendingImport.lines || []).length} line(s) to import</div>
              <div style={{ marginBottom: 8 }}>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>Choose existing library</label>
                <select id="lib-select" value={libraryDialogSelected} onChange={(e) => setLibraryDialogSelected(e.target.value)} style={{ width: '100%', padding: 8 }}>
                  <option value="user">Personal (My Lines)</option>
                  {libraries.map(lib => (
                    <option key={lib.id} value={lib.id}>{lib.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>Or create new library</label>
                <input placeholder="New library name" value={libraryDialogNewName} onChange={(e) => setLibraryDialogNewName(e.target.value)} style={{ width: '100%', padding: 8 }} />
              </div>
              <div style={{ marginTop: 8 }}>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>Add a comment / note</label>
                <textarea placeholder="Optional comment for imported lines" value={libraryDialogComment} onChange={(e) => setLibraryDialogComment(e.target.value)} style={{ width: '100%', padding: 8, minHeight: 64 }} />
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={cancelLibraryDialog}>Cancel</button>
                <button onClick={confirmLibraryDialog} style={{ backgroundColor: '#4CAF50', color: '#fff', padding: '6px 12px', border: 'none', borderRadius: 4 }}>Confirm</button>
              </div>
            </div>
          </div>
        )}
        <div style={{ marginTop: 10 }}>
          <label style={{ display: 'block', marginTop: 8 }}>
            Import MusicXML (each measure → one line):
            <input type="file" accept=".xml,.musicxml" onChange={importMusicXml} />
          </label>
        </div>

        <div style={{ marginTop: 12, borderTop: '1px dashed #eee', paddingTop: 12 }}>
          <h4 style={{ margin: 0, marginBottom: 8 }}>Libraries</h4>
          {libraries.length === 0 && <div style={{ color: '#666', marginBottom: 8 }}>No libraries loaded</div>}
          {libraries.map((lib) => (
            <div key={lib.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={!!lib.enabled} onChange={() => toggleLibraryEnabled(lib.id)} />
                <strong>{lib.name}</strong>
              </label>
              <span style={{ color: '#666', fontSize: 12 }}>
                ({lines.filter(l => l.libraryId === lib.id).length} lines)
              </span>
              <button onClick={() => exportLibrary(lib.id)} style={{ marginLeft: 8 }}>Export</button>
              {lib.editable && (
                <button onClick={() => deleteLibrary(lib.id)} style={{ marginLeft: 'auto' }}>Delete</button>
              )}
            </div>
          ))}
          {/* Export personal lines if present */}
          {lines.some(l => !l.libraryId || l.libraryId === 'user') && (
            <div style={{ marginTop: 8 }}>
              <button onClick={() => exportLibrary('user')}>Export Personal Lines</button>
            </div>
          )}
          <div style={{ marginTop: 6 }}>
            <button onClick={createLibrary}>➕ Create New Library</button>
          </div>
        </div>
      </Collapsible>

      {/* Sequence Explorer */}
      <Collapsible title="🎸Sequence Explorer" defaultOpen={true} right={<span style={{ fontSize: 12, color: "#666" }}>{currentSequence.length} lines</span>}>

        <div style={{ marginTop: 10 }}>
          <div style={{ background: '#f8f9fa', padding: 10, borderRadius: 6, border: '1px solid #eee' }}>
            <strong>Tip:</strong> Select a starting line from the "Available Lines" groups below to begin a sequence. After choosing the first line, the panel will show subsequent available lines organized by musical relationship (half-step up/down, whole-step up/down, chord-tone up/down).
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={connectAnywhere} onChange={(e) => setConnectAnywhere(e.target.checked)} />
            🔗 Connect Anywhere — show all lines grouped by their starting note
          </label>
        </div>

        <div style={{ marginTop: 8 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={allowDuplicates} onChange={(e) => setAllowDuplicates(e.target.checked)} />
            👥 Allow duplicate lines in sequence
          </label>
        </div>

        <h4 style={{ marginTop: 8}}>Current Sequence</h4>
        {currentSequence.length > 0 && (
          <div style={{ marginTop: 0, marginBottom: 6}}>
            <button onClick={() => playSequence(currentSequence, "8n", (lineIdx, noteIdx) => setHighlight({ area: 'sequence', lineIdx, noteIdx }))}>
              ▶️ Play Full Sequence
            </button>
            <button style={{ marginLeft: 12 }} onClick={saveSequence}>💾 Save Sequence</button>
            <button style={{ marginLeft: 12 }} onClick={printSequence}>🖨️ Print Sequence</button>
            <button style={{ marginLeft: 12 }} onClick={removeLastFromSequence}>↩️ Remove Last</button>
            <button style={{ marginLeft: 12 }} onClick={clearSequence}>❎ Clear Sequence</button>
          </div>
        )}
        {currentSequence.length > 0 && (
          <div style={{ marginTop: 10, marginBottom: 10 }}>
            <div style={{ background: '#f8f9fa', padding: 10, borderRadius: 6, border: '1px solid #eee' }}>
              <strong>Tip:</strong> Octave and triplet position changes in the sequence explorer are temporary. To make permanent changes to a line, edit it in the "All Lines" section below.
            </div>
          </div>
        )}

        <div style={{ position: 'relative' }}>
          {currentSequence.length === 0 && <div style={{ color: '#666' }}>No lines selected</div>}
              {currentSequence.map((line, idx) => (
            <div key={idx} style={{ border: "1px solid #f0f0f0", padding: 10, marginBottom: 10, background: '#fff' }}>
              <p style={{ margin: 0, marginBottom: 6 }}>Line {lines.indexOf(line) + 1}: {line.start.degree} → {line.end.degree}</p>
              <NotationView notes={line.notes} tags={line.tags ?? []} highlightIndex={highlight.area === 'sequence' && highlight.lineIdx === idx ? highlight.noteIdx : -1} tripletStartIndex={line.tripletStartIndex ?? -1} />
              <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                <button onClick={() => playLine(line.notes, "8n", (noteIdx) => setHighlight({ area: 'sequence', lineIdx: idx, noteIdx }), line.tripletStartIndex ?? -1)}>
                  Play Line
                </button>
                <button onClick={() => adjustSequenceOctave(idx, -1)}>Octave -</button>
                <button onClick={() => adjustSequenceOctave(idx, +1)}>Octave +</button>
                {line.notes && line.notes.length === 9 && (
                  <>
                    <button onClick={() => adjustSequenceTriplet(idx, -1)} title="Move triplet back">Triplet ←</button>
                    <button onClick={() => adjustSequenceTriplet(idx, +1)} title="Move triplet forward">Triplet →</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {(() => {
          // If there's no sequence yet, or Connect Anywhere is active, show all saved lines grouped by their start degree
          if (currentSequence.length === 0 || connectAnywhere) {
            const groups = {};
            lines.forEach((line) => {
              if (!isLibraryEnabled(line.libraryId)) return; // skip lines from disabled libraries
              if (!allowDuplicates && currentSequence.includes(line)) return; // exclude already-selected lines when duplicates not allowed
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
                <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 8 }}>
                  {orderedKeys.map((key) => (
                    <Collapsible key={`${key}-${currentSequence.length}`} title={`${key} (${groups[key].length})`} defaultOpen={false}>
                      {groups[key].length === 0 ? (
                        <div style={{ color: '#666', padding: 8 }}>No lines</div>
                      ) : (
                        (() => {
                          const funcBuckets = categorizeByFunction(groups[key]);
                          const funcOrder = ['Major ii-v', 'Minor ii-v', 'Static Minor', 'Dominant 7', 'Altered Dominant', 'Phrygian Dominant', 'H/W Diminished', 'Tritone Sub', 'Other'];
                          return funcOrder
                            .filter((fKey) => funcBuckets[fKey] && funcBuckets[fKey].length > 0)
                            .map((fKey) => (
                              <div key={`${key}-${fKey}`} style={{ marginBottom: 8 }}>
                                <h5 style={{ margin: '6px 0' }}>{fKey} ({funcBuckets[fKey].length})</h5>
                                {funcBuckets[fKey].map((subLine, si) => {
                                  const globalIndex = lines.indexOf(subLine);
                                  return (
                                    <div key={si} style={{ border: "1px solid #eee", padding: 8, marginBottom: 8, borderRadius: 4 }}>
                                        <p style={{ margin: 0, marginBottom: 6 }}>Line {globalIndex + 1}: {subLine.start.degree} → {subLine.end.degree}
                                          {currentSequence.includes(subLine) && (
                                            <span style={{ marginLeft: 8, fontSize: 12, color: '#a00' }}>Duplicate in sequence</span>
                                          )}
                                        </p>

                                      {editingIndex === globalIndex ? (
                                        <div>
                                          <textarea rows={3} style={{ width: '100%' }} value={editText} onChange={(e) => setEditText(e.target.value)} />
                                          <div style={{ marginTop: 6 }}>
                                            <label style={{ fontSize: 12 }}>Function</label>
                                            <select style={{ width: '100%', marginTop: 4 }} value={editTags} onChange={(e) => setEditTags(e.target.value)}>
                                              <option value="">Other</option>
                                              <option value="major ii-v">Major ii-v</option>
                                              <option value="minor ii-v">Minor ii-v</option>
                                              <option value="static minor">Static Minor</option>
                                              <option value="dominant 7">Dominant 7</option>
                                              <option value="altered dominant">Altered Dominant</option>
                                              <option value="phrygian dominant">Phrygian Dominant</option>
                                              <option value="h/w diminished">H/W Diminished</option>
                                              <option value="tritone sub">Tritone Sub</option>
                                            </select>
                                          </div>
                                          <div style={{ marginTop: 6 }}>
                                            <label style={{ fontSize: 12 }}>Comment / Notes</label>
                                            <textarea rows={2} style={{ width: '100%', marginTop: 6 }} value={editComment} onChange={(e) => setEditComment(e.target.value)} />
                                          </div>
                                          <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                                            <button onClick={saveEditLine}>Save</button>
                                            <button onClick={cancelEditLine}>Cancel</button>
                                          </div>
                                        </div>
                                      ) : (
                                        <>
                                          <NotationView notes={(previewOverrides[globalIndex] || subLine).notes} tags={(previewOverrides[globalIndex] || subLine).tags ?? []} highlightIndex={highlight.area === 'available' && highlight.lineIdx === globalIndex ? highlight.noteIdx : -1} tripletStartIndex={(previewOverrides[globalIndex] || subLine).tripletStartIndex ?? -1} />
                                          <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                                            <button onClick={() => selectLine(previewOverrides[globalIndex] || subLine)} style={{ backgroundColor: "#4CAF50", color: "white" }}>Select</button>
                                            <button onClick={() => startEditLine(globalIndex)}>Edit</button>
                                            <button onClick={() => playLine((previewOverrides[globalIndex] || subLine).notes, "8n", (noteIdx) => setHighlight({ area: 'available', lineIdx: globalIndex, noteIdx }), (previewOverrides[globalIndex] || subLine).tripletStartIndex ?? -1)}>
                                              Play Line
                                            </button>
                                            <button onClick={() => adjustAvailableOctave(globalIndex, -1)}>Octave -</button>
                                            <button onClick={() => adjustAvailableOctave(globalIndex, +1)}>Octave +</button>
                                            {subLine.notes && subLine.notes.length === 9 && (
                                              <>
                                                <button onClick={() => adjustLineTriplet(globalIndex, -1)} title="Move triplet back">Triplet ←</button>
                                                <button onClick={() => adjustLineTriplet(globalIndex, +1)} title="Move triplet forward">Triplet →</button>
                                              </>
                                            )}
                                          </div>
                                          {/* tags shown only in edit UI */}
                                            {subLine.comment && (
                                              <div style={{ marginTop: 6, fontSize: 12, color: '#444' }}>Note: {subLine.comment}</div>
                                            )}
                                        </>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ));
                        })()
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
            tied: [],
            halfUp: [],
            halfDown: [],
            wholeUp: [],
            wholeDown: [],
            chordUp: [],
            chordDown: []
          };

          lines.forEach((line) => {
            if (!isLibraryEnabled(line.libraryId)) return; // skip lines from disabled libraries
            if (!allowDuplicates && currentSequence.includes(line)) return; // exclude already selected unless duplicates allowed
            const startDeg = line.start?.degree;
            const startIdx = startDeg ? SCALE_ORDER.indexOf(startDeg) : -1;
            if (startIdx === endIdx) {
              buckets.tied.push(line);
              return;
            }

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
            { key: 'Tied (Same note)', items: buckets.tied },
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
              <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 8 }}>
                {groups.map((g) => (
                  <Collapsible key={`${g.key}-${currentSequence.length}`} title={`${g.key} (${g.items.length})`} defaultOpen={false}>
                        {g.items.length === 0 ? (
                          <div style={{ color: '#666', padding: 8 }}>No lines</div>
                        ) : (
                          (() => {
                            const funcBuckets = categorizeByFunction(g.items);
                            const funcOrder = ['Major ii-v', 'Minor ii-v', 'Static Minor', 'Dominant 7', 'Altered Dominant', 'Phrygian Dominant', 'H/W Diminished', 'Tritone Sub', 'Other'];
                            return funcOrder
                              .filter((fKey) => funcBuckets[fKey] && funcBuckets[fKey].length > 0)
                              .map((fKey) => (
                              <div key={`${g.key}-${fKey}`} style={{ marginBottom: 8 }}>
                                <h5 style={{ margin: '6px 0' }}>{fKey} ({funcBuckets[fKey].length})</h5>
                                {funcBuckets[fKey].length === 0 ? (
                                  <div style={{ color: '#666', padding: 8 }}>No lines</div>
                                ) : (
                                  funcBuckets[fKey].map((subLine, si) => {
                                    const globalIndex = lines.indexOf(subLine);
                                    return (
                                      <div key={si} style={{ border: "1px solid #eee", padding: 8, marginBottom: 8, borderRadius: 4 }}>
                                        <p style={{ margin: 0, marginBottom: 6 }}>Line {globalIndex + 1}: {subLine.start.degree} → {subLine.end.degree}
                                          {currentSequence.includes(subLine) && (
                                            <span style={{ marginLeft: 8, fontSize: 12, color: '#a00' }}>Duplicate in sequence</span>
                                          )}
                                        </p>

                                        {editingIndex === globalIndex ? (
                                          <div>
                                            <textarea rows={3} style={{ width: '100%' }} value={editText} onChange={(e) => setEditText(e.target.value)} />
                                            <div style={{ marginTop: 6 }}>
                                                <label style={{ fontSize: 12 }}>Function</label>
                                                <select style={{ width: '100%', marginTop: 4 }} value={editTags} onChange={(e) => setEditTags(e.target.value)}>
                                                  <option value="">Other</option>
                                                  <option value="major ii-v">Major ii-v</option>
                                                  <option value="minor ii-v">Minor ii-v</option>
                                                  <option value="static minor">Static Minor</option>
                                                  <option value="dominant 7">Dominant 7</option>
                                                  <option value="altered dominant">Altered Dominant</option>
                                                  <option value="phrygian dominant">Phrygian Dominant</option>
                                                  <option value="h/w diminished">H/W Diminished</option>
                                                  <option value="tritone sub">Tritone Sub</option>
                                                </select>
                                              </div>
                                              <div style={{ marginTop: 6 }}>
                                                <label style={{ fontSize: 12 }}>Comment / Notes</label>
                                                <textarea rows={2} style={{ width: '100%', marginTop: 6 }} value={editComment} onChange={(e) => setEditComment(e.target.value)} />
                                              </div>
                                              <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                                                <button onClick={saveEditLine}>Save</button>
                                                <button onClick={cancelEditLine}>Cancel</button>
                                              </div>
                                        </div>
                                        ) : (
                                          <>
                                            <NotationView notes={(previewOverrides[globalIndex] || subLine).notes} tags={(previewOverrides[globalIndex] || subLine).tags ?? []} highlightIndex={highlight.area === 'available' && highlight.lineIdx === globalIndex ? highlight.noteIdx : -1} tripletStartIndex={(previewOverrides[globalIndex] || subLine).tripletStartIndex ?? -1} />
                                              <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                <button onClick={() => selectLine(previewOverrides[globalIndex] || subLine)}>Select</button>
                                                <button onClick={() => startEditLine(globalIndex)}>Edit</button>
                                                <button onClick={() => playLine((previewOverrides[globalIndex] || subLine).notes, "8n", (noteIdx) => setHighlight({ area: 'available', lineIdx: globalIndex, noteIdx }), (previewOverrides[globalIndex] || subLine).tripletStartIndex ?? -1)}>
                                                  Play Line
                                                </button>
                                                <button onClick={() => adjustAvailableOctave(globalIndex, -1)}>Octave -</button>
                                                <button onClick={() => adjustAvailableOctave(globalIndex, +1)}>Octave +</button>
                                              {subLine.notes && subLine.notes.length === 9 && (
                                                <>
                                                  <button onClick={() => adjustLineTriplet(globalIndex, -1)} title="Move triplet back">Triplet ←</button>
                                                  <button onClick={() => adjustLineTriplet(globalIndex, +1)} title="Move triplet forward">Triplet →</button>
                                                </>
                                              )}
                                              
                                            </div>
                                            {/* tags shown only in edit UI */}
                                              {subLine.comment && (
                                                <div style={{ marginTop: 6, fontSize: 12, color: '#444' }}>Note: {subLine.comment}</div>
                                              )}
                                          </>
                                        )}
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            ));
                          })()
                        )}
                  </Collapsible>
                ))}
              </div>
            </div>
          );
        })()}

      </Collapsible>

      {/* Saved Sequences */}
      <Collapsible title="💾 Saved Sequences" defaultOpen={false} right={<span style={{ fontSize: 12, color: "#666" }}>{savedSequences.length}</span>}>
        {savedSequences.length === 0 && <div style={{ color: '#666' }}>No saved sequences</div>}
        <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={exportSequences}>Export Sequences</button>
          <button onClick={loadDefaultSequences} style={{ backgroundColor: "#4CAF50", color: "white" }}>Load Default Sequences</button>
          <button onClick={clearAllSequences} style={{ marginLeft: 8 }}>Clear All Sequences</button>
          <input type="file" accept=".json" onChange={importSequences} />
        </div>
        {savedSequences.map((seq, idx) => (
          <div key={idx} style={{ border: "1px solid #eee", padding: 10, marginBottom: 8, borderRadius: 4 }}>
            <strong>{seq.name}</strong> ({seq.sequence.length} lines)
            <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
              <button onClick={() => loadSequence(idx)}>Load</button>
              <button onClick={() => renameSequence(idx)}>Rename</button>
              <button onClick={() => deleteSequence(idx)} style={{ marginLeft: 'auto' }}>Delete</button>
            </div>
          </div>
        ))}
      </Collapsible>

      <Collapsible title="📈All Lines" defaultOpen={false} right={<span style={{ fontSize: 12, color: "#666" }}>{lines.length}</span>}>
        <div style={{ marginTop: 10, marginBottom: 10 }}>
            <div style={{ background: '#f8f9fa', padding: 10, borderRadius: 6, border: '1px solid #eee' }}>
              <strong>Tip:</strong> Permanently edit lines here. Changes will reflect in any sequences using these lines.
            </div>
        </div>
        {lines.length === 0 && <div style={{ color: '#666' }}>No saved lines</div>}
        
        {/* Group lines by their start degree */}
        {(() => {
          const groups = {};
          lines.forEach((line) => {
            if (!isLibraryEnabled(line.libraryId)) return; // skip lines from disabled libraries
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
                {(() => {
                const funcBuckets = categorizeByFunction(groups[key]);
                const funcOrder = ['Major ii-v', 'Minor ii-v', 'Static Minor', 'Dominant 7', 'Altered Dominant', 'Phrygian Dominant', 'H/W Diminished', 'Tritone Sub', 'Other'];
                return funcOrder
                  .filter((fKey) => funcBuckets[fKey] && funcBuckets[fKey].length > 0)
                  .map((fKey) => (
                    <div key={`${key}-all-${fKey}`} style={{ marginBottom: 10 }}>
                      <h5 style={{ margin: '6px 0' }}>{fKey} ({funcBuckets[fKey].length})</h5>
                      {funcBuckets[fKey].map((subLine, si) => {
                        const globalIndex = lines.indexOf(subLine);
                        return (
                          <div key={si} style={{ border: "1px solid #eee", padding: 10, marginBottom: 8 }}>
                            <p style={{ margin: 0, marginBottom: 6 }}>Line {globalIndex + 1}: {subLine.start.degree} → {subLine.end.degree}</p>

                            {editingIndex === globalIndex ? (
                              <div>
                                <textarea rows={3} style={{ width: '100%' }} value={editText} onChange={(e) => setEditText(e.target.value)} />
                                <div style={{ marginTop: 6 }}>
                                  <label style={{ fontSize: 12 }}>Function</label>
                                  <select style={{ width: '100%', marginTop: 4 }} value={editTags} onChange={(e) => setEditTags(e.target.value)}>
                                    <option value="">Other</option>
                                    <option value="major ii-v">Major ii-v</option>
                                    <option value="minor ii-v">Minor ii-v</option>
                                    <option value="static minor">Static Minor</option>
                                    <option value="dominant 7">Dominant 7</option>
                                    <option value="altered dominant">Altered Dominant</option>
                                    <option value="phrygian dominant">Phrygian Dominant</option>
                                    <option value="h/w diminished">H/W Diminished</option>
                                    <option value="tritone sub">Tritone Sub</option>
                                  </select>
                                </div>
                                <div style={{ marginTop: 6 }}>
                                  <label style={{ fontSize: 12 }}>Comment / Notes</label>
                                  <textarea rows={2} style={{ width: '100%', marginTop: 6 }} value={editComment} onChange={(e) => setEditComment(e.target.value)} />
                                </div>
                                <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                                  <button onClick={saveEditLine}>Save</button>
                                  <button onClick={cancelEditLine}>Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <NotationView notes={subLine.notes} tags={subLine.tags ?? []} highlightIndex={highlight.area === 'available' && highlight.lineIdx === globalIndex ? highlight.noteIdx : -1} tripletStartIndex={subLine.tripletStartIndex ?? -1} />
                                <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                                  <button onClick={() => startEditLine(globalIndex)}>Edit</button>
                                  <button onClick={() => playLine(subLine.notes, "8n", (noteIdx) => setHighlight({ area: 'available', lineIdx: globalIndex, noteIdx }), subLine.tripletStartIndex ?? -1)}>
                                    Play Line
                                  </button>
                                  <button onClick={() => adjustLineOctave(globalIndex, -1)}>Octave -</button>
                                  <button onClick={() => adjustLineOctave(globalIndex, +1)}>Octave +</button>
                                  {subLine.notes && subLine.notes.length === 9 && (
                                    <>
                                      <button onClick={() => adjustLineTriplet(globalIndex, -1)} title="Move triplet back">Triplet ←</button>
                                      <button onClick={() => adjustLineTriplet(globalIndex, +1)} title="Move triplet forward">Triplet →</button>
                                    </>
                                  )}
                                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <label style={{ fontSize: 12, color: '#666' }}>Library</label>
                                    <select value={subLine.libraryId || 'user'} onChange={(e) => updateLineLibrary(globalIndex, e.target.value)} style={{ padding: 6 }}>
                                      <option value="user">Personal (My Lines)</option>
                                      {libraries.map(lib => (
                                        <option key={lib.id} value={lib.id}>{lib.name}</option>
                                      ))}
                                    </select>
                                    <button onClick={() => removeLine(globalIndex)}>Delete Line</button>
                                  </div>
                                </div>
                                {/* tags shown only in edit UI */}
                                {subLine.comment && (
                                  <div style={{ marginTop: 6, fontSize: 12, color: '#444' }}>Note: {subLine.comment}</div>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ));
              })()}
            </Collapsible>
          ));
        })()}
      </Collapsible>
    {/* Footer */}
    <footer style={footerStyle}>
      © {new Date().getFullYear()}{" "}
      <a
        href="https://kentays.github.io"
        target="_blank"
        rel="noopener noreferrer"
      >
        Kenta Shimakawa
      </a>{" "}
      ·{" "}
      <a
        href="https://kentays.bandcamp.com"
        target="_blank"
        rel="noopener noreferrer"
      >
        Bandcamp
      </a>
    </footer>
  </div>
);
}

const footerStyle = {
  marginTop: "40px",
  padding: "12px 0",
  textAlign: "center",
  fontSize: "12px",
  color: "#777",
  opacity: 0.85,
};

export default App;
