import { ArrowUpRight } from "lucide-react";
import { MenuButton } from "./Dock";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#cases", label: "Use cases" },
  { href: "#quorum", label: "The guarantee" },
  { href: "#ledger", label: "Ledger" },
];

export function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-3 sm:px-6">
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-7xl items-center justify-between gap-4 rounded-full border border-line bg-paper/75 py-2 pl-5 pr-2 backdrop-blur-md"
      >
        <a href="#top" translate="no" className="display text-2xl tracking-tight" aria-label="Quorum, home">
          QUORUM<span className="text-accent">.</span>
        </a>

        <ul className="hidden items-center gap-7 font-mono text-[13px] uppercase tracking-wide text-muted md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="transition-colors hover:text-ink">
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <a
            href="#quorum"
            className="group inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2.5 text-sm text-paper transition-colors hover:bg-accent"
          >
            Split a bill
            <ArrowUpRight
              aria-hidden
              className="size-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            />
          </a>
          <MenuButton />
        </div>
      </nav>
    </header>
  );
}
