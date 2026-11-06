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
