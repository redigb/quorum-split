"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export interface Option<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

/** Selector propio (reemplaza al <select> nativo). Teclado: ↑ ↓ Inicio Fin Enter Esc. */
export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const selected = options.findIndex((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const openList = () => {
    setActive(Math.max(selected, 0));
    setOpen(true);
  };
  const pick = (i: number) => {
    onChange(options[i].value);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    const last = options.length - 1;
    const move = (i: number) => {
      e.preventDefault();
      setActive(i);
    };
    if (e.key === "ArrowDown") move(Math.min(active + 1, last));
    else if (e.key === "ArrowUp") move(Math.max(active - 1, 0));
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(last);
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(active);
    } else if (e.key === "Escape" || e.key === "Tab") setOpen(false);
  };

  return (
    <div ref={root} className={`relative ${open ? "z-30" : ""}`}>
      <span id={`${id}-label`} className="mb-1.5 block font-mono text-[11px] uppercase tracking-wide text-muted">
        {label}
      </span>
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-labelledby={`${id}-label`}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-paper px-4 py-3 text-left text-[15px] transition-colors hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span className="truncate">{options[selected]?.label ?? "—"}</span>
        <ChevronDown aria-hidden className={`size-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-labelledby={`${id}-label`}
          className="pop-in absolute inset-x-0 top-full z-30 mt-2 max-h-64 overflow-auto rounded-2xl border border-line bg-paper p-1.5 shadow-xl"
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === selected}
              onPointerEnter={() => setActive(i)}
              onClick={() => pick(i)}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-[15px] ${
                i === active ? "bg-accent-soft" : ""
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate">{o.label}</span>
                {o.hint && <span className="block truncate text-xs text-muted">{o.hint}</span>}
              </span>
              {i === selected && <Check aria-hidden className="size-4 shrink-0 text-accent" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
