"use client";

import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
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

const TONE_HEX = { muted: "#ffffff99", hold: "#f5b94a", ok: "#5ee39a", accent: "#a99cff" };

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({
  backgroundColor: "#171412",
  foregroundColor: "#fbf9ef",
  headerBackgroundColor: "#171412",
  headerTextColor: "#fbf9efa0",
  borderColor: "#fbf9ef26",
  rowHoverColor: "#fbf9ef0d",
  fontFamily: "var(--font-mono), ui-monospace, monospace",
  fontSize: 12,
  headerFontSize: 10,
  wrapperBorderRadius: 0,
});

/** El libro mayor de la landing en AG Grid (ordenable y filtrable), con datos reales: cada retención, cobro y cambio, con su monto y el estado en PayPal. */
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

  const currency = data.currency;
  const cols: ColDef<Row>[] = [
    {
      headerName: "Time",
      field: "at",
      width: 110,
      valueFormatter: (p) => new Date(p.value as string).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      cellStyle: { color: "#ffffff80" },
    },
    { headerName: "Actor", field: "actor", width: 130 },
    { headerName: "Event", field: "event", width: 160, cellStyle: (p) => ({ color: TONE_HEX[p.data?.tone ?? "muted"] }) },
    { headerName: "Detail", field: "detail", flex: 1, minWidth: 200, cellStyle: { color: "#ffffffb3" } },
    {
      headerName: "Amount",
      field: "amountCents",
      width: 120,
      type: "rightAligned",
      valueFormatter: (p) => (p.value === null || p.value === undefined ? "—" : formatMoney(p.value as number, currency, "en-US")),
    },
    {
      headerName: "PayPal",
      field: "paypal",
      width: 130,
      valueFormatter: (p) => (p.value as string | null) ?? "—",
      cellStyle: (p) => ({ color: p.value === "COMPLETED" ? "#5ee39a" : p.value === "AUTHORIZED" ? "#f5b94a" : p.value === "FAILED" ? "#ff8a85" : "#ffffff66" }),
    },
  ];

  return (
    <section aria-labelledby="ledger" className="mt-12">
      <h2 id="ledger" className="mb-3 font-mono text-[11px] uppercase tracking-wide text-muted">
        Ledger
      </h2>
      <div className="overflow-hidden rounded-3xl bg-ink shadow-[0_30px_60px_-40px_#171412a0]" translate="no">
        <AgGridReact<Row>
          theme={theme}
          rowData={data.rows}
          columnDefs={cols}
          defaultColDef={{ sortable: true, resizable: true, filter: true }}
          domLayout="autoHeight"
          suppressCellFocus
        />
      </div>
    </section>
  );
}
