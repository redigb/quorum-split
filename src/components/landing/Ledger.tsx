"use client";

import { useRef } from "react";
import { PEOPLE, SPLIT, money, shareOf } from "./demo-bill";
import { EASE, MOTION_OK, gsap, useGSAP } from "./gsap";

type Row = {
  t: string;
  actor: string;
  event: string;
  detail: string;
  amount: string;
  pp: string;
  tone: "muted" | "hold" | "ok" | "accent";
};

const name = (id: string) => PEOPLE.find((p) => p.id === id)!.name;

const ROWS: Row[] = [
  {
    t: "21:42:07",
    actor: "AI",
    event: "BILL_EXTRACTED",
    detail: "7 lines · total matches",
    amount: money(SPLIT.grandTotalCents),
    pp: "—",
    tone: "muted",
  },
  {
    t: "21:43:31",
    actor: "Lucía",
    event: "ROOM_LOCKED",
    detail: "5 participants",
    amount: money(SPLIT.grandTotalCents),
    pp: "—",
    tone: "accent",
  },
  {
    t: "21:44:02",
    actor: "Sam",
    event: "AUTHORIZED",
    detail: "hold placed",
    amount: money(shareOf("sa")),
    pp: "AUTHORIZED",
    tone: "hold",
  },
  {
    t: "21:44:40",
    actor: "Mateo",
    event: "CLAIM_OPENED",
    detail: "Vinho Verde → Aiko",
    amount: money(1733),
    pp: "—",
    tone: "accent",
  },
  {
    t: "21:45:12",
    actor: "Aiko",
    event: "CLAIM_REJECTED",
    detail: "“I had the risotto”",
    amount: money(1733),
    pp: "—",
    tone: "muted",
  },
  ...["ma", "ai", "di", "lu"].map<Row>((id, i) => ({
    t: `21:4${6 + i}:${String(10 + i * 13).padStart(2, "0")}`,
    actor: name(id),
    event: "AUTHORIZED",
    detail: "hold placed",
    amount: money(shareOf(id)),
    pp: "AUTHORIZED",
    tone: "hold",
  })),
  {
    t: "21:49:52",
    actor: "Quorum",
    event: "CAPTURED",
    detail: "5 / 5 · all at once",
    amount: money(SPLIT.grandTotalCents),
    pp: "COMPLETED",
    tone: "ok",
  },
];

const TONE = {
  muted: "text-paper/60",
  hold: "text-hold",
  ok: "text-[#5ee39a]",
  accent: "text-[#a99cff]",
};

export function Ledger() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from(".ledger-head > *", {
          y: 40,
          autoAlpha: 0,
          stagger: 0.1,
          duration: 1,
          ease: EASE,
          scrollTrigger: { trigger: ".ledger-head", start: "top 80%" },
        });
        // Las filas se "imprimen" una a una
        gsap.from(".ledger-row", {
          autoAlpha: 0,
          x: -16,
          stagger: 0.12,
          duration: 0.5,
          ease: "power2.out",
          scrollTrigger: { trigger: ".ledger-table", start: "top 75%" },
        });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} id="ledger" aria-labelledby="ledger-title" className="bg-paper-2 py-28 text-ink sm:py-40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="ledger-head grid gap-8 md:grid-cols-[1.4fr_1fr] md:items-end">
          <div>
            <p className="mb-8 font-mono text-xs uppercase tracking-[0.18em] text-muted sm:text-[13px]">
              (06) — The ledger
            </p>
            <h2 id="ledger-title" className="display text-[clamp(2.6rem,6.5vw,6.5rem)] uppercase">
              Every cent leaves a trace.
            </h2>
          </div>
          <p className="max-w-sm text-lg leading-relaxed text-ink-2">
            An append-only log of every hold, claim and capture. “Who had the wine?” stops being an argument and becomes
            a row. Nobody can move their debt to you without your yes.
          </p>
        </div>

        <div className="ledger-table mt-16 overflow-x-auto rounded-card bg-ink text-paper shadow-[0_40px_80px_-40px_#171412a0]">
          <table className="w-full min-w-[720px] font-mono text-[13px]">
            <caption className="sr-only">Sample audit log for one dinner</caption>
            <thead>
              <tr className="border-b border-paper/15 text-left text-[11px] uppercase tracking-wider text-paper/50">
                {["Time", "Actor", "Event", "Detail", "Amount", "PayPal"].map((h) => (
                  <th key={h} scope="col" className={`px-4 py-3 font-medium ${h === "Amount" ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r, i) => (
                <tr key={i} className="ledger-row border-b border-paper/10 last:border-0 hover:bg-paper/5">
                  <td className="num px-4 py-3 text-paper/50">{r.t}</td>
                  <td className="px-4 py-3">{r.actor}</td>
                  <td className={`px-4 py-3 ${TONE[r.tone]}`}>{r.event}</td>
                  <td className="px-4 py-3 text-paper/70">{r.detail}</td>
                  <td className="num px-4 py-3 text-right">{r.amount}</td>
                  <td
                    className={`px-4 py-3 ${r.pp === "COMPLETED" ? TONE.ok : r.pp === "AUTHORIZED" ? TONE.hold : "text-paper/40"}`}
                  >
                    {r.pp}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
