"use client";

import { useEffect, useState } from "react";
import { formatMoney, type Currency } from "@/core/money";
import { hostHeaders } from "@/lib/auth-client";

interface Row {
  at: string;
  actor: string;
  event: string;
  detail: string;
  amountCents: number | null;
  paypal: string | null;
  tone: "muted" | "hold" | "ok" | "accent";
}

const TONE = {
  muted: "text-paper/60",
  hold: "text-hold",
  ok: "text-[#5ee39a]",
  accent: "text-[#a99cff]",
};

/** El libro mayor de la landing, con datos reales: cada retención, cobro y cambio, con su monto y el estado en PayPal. */
export function LedgerTable({ code, token, refreshKey }: { code: string; token: string; refreshKey: string }) {
  const [data, setData] = useState<{ currency: Currency; rows: Row[] } | null>(null);

  useEffect(() => {
    let off = false;
    void (async () => {
      try {
        const res = await fetch(`/api/rooms/${code}/ledger`, { headers: await hostHeaders(token), cache: "no-store" });
        if (res.ok && !off) setData(await res.json());
      } catch {
        /* se reintenta en el siguiente cambio */
      }
    })();
    return () => {
      off = true;
    };
  }, [code, token, refreshKey]);

  if (!data || data.rows.length === 0) return null;

  return (
    <section aria-labelledby="ledger" className="mt-12">
      <h2 id="ledger" className="mb-3 font-mono text-[11px] uppercase tracking-wide text-muted">
        Ledger
      </h2>
      <div className="overflow-x-auto rounded-3xl bg-ink text-paper shadow-[0_30px_60px_-40px_#171412a0]">
        <table className="w-full min-w-[640px] font-mono text-[12px]">
          <caption className="sr-only">Every event in this room, with amounts and PayPal status</caption>
          <thead>
            <tr className="border-b border-paper/15 text-left text-[10px] uppercase tracking-wider text-paper/50">
              {["Time", "Actor", "Event", "Detail", "Amount", "PayPal"].map((h) => (
                <th key={h} scope="col" className={`px-3.5 py-3 font-medium ${h === "Amount" ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody translate="no">
            {data.rows.map((r, i) => (
              <tr key={i} className="border-b border-paper/10 last:border-0 hover:bg-paper/5">
                <td className="px-3.5 py-2.5 tabular-nums text-paper/50">
                  {new Date(r.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </td>
                <td className="px-3.5 py-2.5">{r.actor}</td>
                <td className={`px-3.5 py-2.5 ${TONE[r.tone]}`}>{r.event}</td>
                <td className="px-3.5 py-2.5 text-paper/70">{r.detail}</td>
                <td className="px-3.5 py-2.5 text-right tabular-nums">
                  {r.amountCents === null ? "—" : formatMoney(r.amountCents, data.currency, "en-US")}
                </td>
                <td
                  className={`px-3.5 py-2.5 ${
                    r.paypal === "COMPLETED" ? TONE.ok : r.paypal === "AUTHORIZED" ? TONE.hold : r.paypal === "FAILED" ? "text-[#ff8a85]" : "text-paper/40"
                  }`}
                >
                  {r.paypal ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
