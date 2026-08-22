"use client";

import { COLOR_RELEVANT_OPS, GROUPS, LABELS } from "@/lib/labeler/labels";
import { checklistDone, type LabelCounts } from "@/lib/labeler/types";

interface Props {
  currentIndex: number;
  counts: Record<string, LabelCounts>;
  onSelect: (index: number) => void;
  onClose: () => void;
}

export default function LabelMenu({ currentIndex, counts, onSelect, onClose }: Props) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 18, 26, 0.55)",
        zIndex: 50,
        display: "flex",
        justifyContent: "flex-start",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420,
          maxWidth: "90vw",
          height: "100%",
          overflowY: "auto",
          background: "#151922",
          color: "#e6e9f0",
          padding: "16px 18px 32px",
          boxShadow: "4px 0 24px rgba(0,0,0,0.4)",
          fontSize: 13,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <strong style={{ fontSize: 15 }}>Labels — all 71</strong>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "1px solid #3a4152",
              color: "#e6e9f0",
              borderRadius: 6,
              padding: "2px 10px",
              cursor: "pointer",
            }}
          >
            Esc ✕
          </button>
        </div>
        <div style={{ color: "#8b93a7", marginBottom: 14 }}>
          ● Phase 1 (label first) · ○ Phase 2 · ✓ checklist complete · click to jump
        </div>

        {GROUPS.map((group) => (
          <div key={group} style={{ marginBottom: 18 }}>
            <div
              style={{
                textTransform: "uppercase",
                letterSpacing: 1,
                fontSize: 11,
                color: "#8b93a7",
                borderBottom: "1px solid #2a3040",
                paddingBottom: 4,
                marginBottom: 6,
              }}
            >
              {group}
            </div>
            {LABELS.map((label, i) => {
              if (label.group !== group) return null;
              const c = counts[label.op];
              const done = checklistDone(c, COLOR_RELEVANT_OPS.includes(label.op));
              const active = i === currentIndex;
              return (
                <button
                  key={label.op}
                  onClick={() => onSelect(i)}
                  style={{
                    display: "flex",
                    width: "100%",
                    textAlign: "left",
                    alignItems: "baseline",
                    gap: 8,
                    padding: "5px 8px",
                    borderRadius: 6,
                    border: "none",
                    cursor: "pointer",
                    background: active ? "#2b3a55" : "transparent",
                    color: "inherit",
                  }}
                >
                  <span
                    style={{
                      color: label.phase === 1 ? "#7cc7ff" : "#5a6275",
                      width: 12,
                      flexShrink: 0,
                    }}
                  >
                    {label.phase === 1 ? "●" : "○"}
                  </span>
                  <span style={{ flexShrink: 0, fontWeight: active ? 700 : 500 }}>
                    {label.op}
                  </span>
                  <span
                    style={{
                      color: "#8b93a7",
                      fontSize: 11,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      flex: 1,
                    }}
                  >
                    {label.sketchHint}
                  </span>
                  <span style={{ flexShrink: 0, color: done ? "#4ade80" : "#5a6275" }}>
                    {c?.saves ?? 0}
                    {done ? " ✓" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
