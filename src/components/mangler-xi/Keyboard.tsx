"use client";
import type { TileState } from "@/lib/tiles";

const ROWS = ["QWERTYUIOPÅ", "ASDFGHJKLØÆ", "ZXCVBNM"];

export function Keyboard({ states, onKey, disabled }: { states: Record<string, Exclude<TileState, "space">>; onKey: (k: string) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 select-none" role="group" aria-label="Tastatur">
      {ROWS.map((row, ri) => (
        <div key={row} className="flex justify-center gap-1">
          {ri === 2 && (
            <button type="button" className="key key-wide" onClick={() => onKey("ENTER")} disabled={disabled} aria-label="Send inn">
              GJETT
            </button>
          )}
          {row.split("").map((k) => (
            <button type="button" key={k} className={`key ${states[k] ? `key-${states[k]}` : ""}`} onClick={() => onKey(k)} disabled={disabled} aria-label={k}>
              {k}
            </button>
          ))}
          {ri === 2 && (
            <button type="button" className="key key-wide" onClick={() => onKey("BACKSPACE")} disabled={disabled} aria-label="Slett">
              ⌫
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
