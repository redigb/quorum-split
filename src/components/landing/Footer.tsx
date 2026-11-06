import { ArrowUpRight } from "lucide-react";
import { CREDITS, PHOTOS } from "./photos";
import Link from "next/link";

const PRODUCT = [
  { href: "#how", label: "How it works" },
  { href: "#cases", label: "Use cases" },
  { href: "#quorum", label: "The guarantee" },
  { href: "#ledger", label: "Audit ledger" },
];

const STACK = ["PayPal Orders v2", "Groq vision & voice", "Supabase Realtime", "Next.js 16", "GSAP"];

export function Footer() {
  const credits = [...new Map(Object.values(PHOTOS).map((p) => [p.by, p])).values()];

  return (
    <footer className="grain relative overflow-hidden bg-ink text-paper">
      <div className="mx-auto max-w-7xl px-4 pt-20 sm:px-6 sm:pt-28">
        <div className="grid gap-14 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-paper/60">
              Nobody pays until everybody pays
            </p>
            <p className="mt-5 max-w-sm text-lg leading-snug text-paper/85">
              Split payments for groups that cross borders. Snap the bill, split it to the cent, charge only at 100%.
            </p>
            <Link
              href="/new"
              className="group mt-8 inline-flex items-center gap-2 rounded-full bg-paper px-6 py-3.5 text-ink transition-colors hover:bg-accent hover:text-paper"
            >
              Split a bill
              <ArrowUpRight aria-hidden className="size-4 transition-transform duration-300 group-hover:rotate-45" />
            </Link>
            <p className="mt-10 font-mono text-xs uppercase tracking-[0.18em] text-paper/60">Built by</p>
            <a
              href="https://github.com/redigb"
              target="_blank"
              rel="noreferrer"
              translate="no"
              className="group mt-3 inline-flex items-center gap-3 text-lg transition-colors hover:text-hold"
            >
              <svg aria-hidden viewBox="0 0 16 16" className="size-6 fill-current">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
              </svg>
              <span>
                Renzo RD <span className="text-paper/55">· @redigb</span>
              </span>
            </a>
          </div>

          <nav aria-label="Footer">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-paper/60">Product</p>
            <ul className="mt-5 space-y-3">
              {PRODUCT.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="text-lg transition-colors hover:text-hold">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-paper/60">Built with</p>
            <ul className="mt-5 space-y-3">
              {STACK.map((s) => (
                <li key={s} className="text-lg text-paper/85">
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Wordmark gigante, recortada por el borde inferior */}
      <p
        aria-hidden
        translate="no"
        className="display pointer-events-none mt-16 select-none whitespace-nowrap text-center text-[clamp(4.5rem,23vw,24rem)] uppercase leading-[0.72] text-paper/95 sm:mt-24"
        style={{ marginBottom: "-0.06em" }}
      >
        Quorum<span className="text-accent">.</span>
      </p>

      <div className="relative z-10 border-t border-paper/15 bg-ink">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 font-mono text-[11px] uppercase tracking-wider text-paper/65 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <p>© 2026 Quorum · Built for the PayPal hackathon · PayPal Sandbox demo</p>
          <details className="group sm:max-w-md sm:text-right">
            <summary className="cursor-pointer list-none underline decoration-paper/30 underline-offset-4 transition-colors hover:text-paper">
              Photo credits ({credits.length}) · Unsplash
            </summary>
            <p className="mt-3 text-[11px] normal-case leading-relaxed tracking-normal text-paper/70">
              {CREDITS.join(" · ")}
            </p>
          </details>
        </div>
      </div>
    </footer>
  );
}
