import { useState } from "react";

export default function Collapsible({ title, defaultOpen = true, children, right }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{ border: "1px solid #e0e0e0", borderRadius: 6, marginBottom: 12, overflow: "hidden" }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          cursor: "pointer",
          background: "#fafafa",
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontWeight: 600 }}>{open ? "▾" : "▸"} {title}</div>
        {right ? <div style={{ opacity: 0.8 }}>{right}</div> : null}
      </div>

      {open && <div style={{ padding: 12 }}>{children}</div>}
    </div>
  );
}
