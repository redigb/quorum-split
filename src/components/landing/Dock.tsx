"use client";

import { ArrowUpRight, Dices, Home, Layers, Menu, ScrollText, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { PEOPLE } from "./demo-bill";

const LINKS = [
  { id: "top", label: "Home", Icon: Home },
  { id: "how", label: "How it works", Icon: Layers },
  { id: "cases", label: "Use cases", Icon: Dices },
  { id: "quorum", label: "The guarantee", Icon: ShieldCheck },
  { id: "ledger", label: "Ledger", Icon: ScrollText },
];
const SHORT: Record<string, string> = {
  top: "Home",
  how: "How",
  cases: "Cases",
  quorum: "Guarantee",
  ledger: "Ledger",
};
/** Secciones donde la píldora estorba (el hero, la demo, el cierre). */
const HIDE_ON = ["top", "quorum", "cta"];

/** Navegación lateral, píldora de acción fija y línea de progreso. Solo escritorio. */
export function Dock() {
  const [active, setActive] = useState("top");
  const [pill, setPill] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener("dock:toggle", toggle);
    return () => window.removeEventListener("dock:toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  useEffect(() => {
    const seen = new Set<string>();
    const ids = [...LINKS.map((l) => l.id), "cta"];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) seen.add(e.target.id);
          else seen.delete(e.target.id);
        }
        const cur = LINKS.map((l) => l.id).filter((id) => seen.has(id));
        if (cur.length) setActive(cur[cur.length - 1]);
        setPill(!HIDE_ON.some((id) => seen.has(id)) && window.scrollY > 200);
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        if (bar.current) bar.current.style.transform = `scaleY(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-ink/30 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <nav
        id="dock-nav"
        aria-label="Sections"
        className={`fixed z-50 gap-1 rounded-full border border-ink/10 bg-paper/95 p-1.5 shadow-xl backdrop-blur-md inset-x-3 bottom-3 justify-between lg:hidden ${open ? "flex" : "hidden"}`}
      >
        {LINKS.map(({ id, label, Icon }) => {
          const on = active === id;
          return (
            <a
              key={id}
              href={`#${id}`}
              onClick={() => setOpen(false)}
              aria-label={label}
              aria-current={on ? "true" : undefined}
              className={`group relative grid place-items-center rounded-full max-lg:flex-1 max-lg:gap-0.5 max-lg:py-2 lg:size-10 transition-colors ${on ? "bg-ink text-paper" : "text-ink/70 hover:bg-ink/10"}`}
            >
              <Icon aria-hidden className="size-[18px]" />
              <span className="font-mono text-[9px] lg:hidden">{SHORT[id]}</span>
              <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-full bg-ink px-3 py-1 font-mono text-[11px] text-paper opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                {label}
              </span>
            </a>
          );
        })}
      </nav>

      <div
        aria-hidden
        className="pointer-events-none fixed right-4 top-1/2 z-40 hidden h-40 w-0.5 -translate-y-1/2 rounded-full bg-ink/10 lg:block"
      >
        <div ref={bar} className="size-full origin-top rounded-full bg-accent" style={{ transform: "scaleY(0)" }} />
      </div>

      <div
        className={`fixed inset-x-0 bottom-5 z-40 hidden justify-center transition-all duration-500 md:flex ${
          pill ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"
        }`}
      >
        <div className="flex items-center gap-4 rounded-full border border-ink/10 bg-paper/90 py-2 pl-4 pr-2 shadow-xl backdrop-blur-md">
          <span className="flex -space-x-2">
            {PEOPLE.map((p) => (
              <Avatar key={p.id} person={p} size={26} />
            ))}
          </span>
          <span className="text-sm font-medium">Nobody pays until everybody pays</span>
          <a
            href="#cta"
            tabIndex={pill ? 0 : -1}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm text-paper transition-colors hover:bg-accent"
          >
            Split a bill <ArrowUpRight aria-hidden className="size-4" />
          </a>
        </div>
      </div>
    </>
  );
}

/** Botón de hamburguesa para la barra superior en móvil: abre el menú inferior. */
export function MenuButton() {
  return (
    <button
      type="button"
      aria-label="Menu"
      aria-controls="dock-nav"
      onClick={() => window.dispatchEvent(new Event("dock:toggle"))}
      className="grid size-10 place-items-center rounded-full border border-ink/15 lg:hidden"
    >
      <Menu aria-hidden className="size-5" />
    </button>
  );
}
