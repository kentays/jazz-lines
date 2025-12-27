import { parseNote } from "../theory/noteParser";
import { buildJazzLine } from "../theory/lineBuilder";

export default function LineInput({ onLineCreated }) {
  const handleSubmit = (e) => {
    e.preventDefault();

    const raw = e.target.notes.value;

    const noteStrings = raw
      .split(",")
      .map(n => n.trim())
      .filter(n => n.length > 0)
      .map(n => n.toUpperCase());

    try {
      const notes = noteStrings.map(parseNote);
      const line = buildJazzLine(notes);

      onLineCreated(line);
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <textarea
        name="notes"
        rows="3"
        style={{ width: "100%" }}
        placeholder="A5, G5, E5, D5"
      />
      <br />
      <button type="submit">Render notation</button>
    </form>
  );
}
