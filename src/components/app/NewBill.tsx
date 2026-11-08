"use client";

import { ArrowRight, Camera, Check, Copy, Plus, Share2, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { formatMoney, SUPPORTED_CURRENCIES, sum, toCents, type Currency } from "@/core/money";
import type { ExtraCharge } from "@/core/types";
import { shrinkPhoto } from "@/lib/image";
import { Button } from "@/components/ui/Button";
import { MyRooms, saveMyToken, saveRoom } from "@/components/app/my-rooms";
import { SaveRoom } from "@/components/app/SaveRoom";
import { VoiceButton } from "@/components/app/VoiceButton";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toaster";

/* ---------- tipos locales ---------- */
interface Line {
  key: string;
  name: string;
  quantity: number;
  cents: number;
}
interface Created {
  code: string;
  hostPath: string;
}
type Step = "photo" | "review" | "table";
const STEPS: Step[] = ["photo", "review", "table"];

const uid = () => Math.random().toString(36).slice(2, 9);

async function api<T>(url: string, init: RequestInit & { token?: string; json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  const res = await fetch(url, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message ?? data.error ?? `Error ${res.status}`), { code: data.error });
  return data as T;
}

const ERRORS: Record<string, string> = {
  unreadable_receipt: "We couldn't read a receipt in that photo. Try a sharper, well-lit one — or add the items by hand.",
  unsupported_type: "Use a JPG, PNG or WebP photo.",
  image_too_large: "That photo is over 4 MB. Try a smaller one.",
  extraction_failed: "The reader is busy right now. Try again, or add the items by hand.",
};
const explain = (e: unknown) => (e instanceof Error ? ERRORS[(e as { code?: string }).code ?? ""] ?? e.message : "Something went wrong");

/* ---------- piezas pequeñas ---------- */
function Heading({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  return (
    <div className="mb-8">
      <p className="font-mono text-[11px] uppercase tracking-wide text-muted">{kicker}</p>
      <h1 className="display mt-2 text-5xl sm:text-6xl">{title}</h1>
      {sub && <p className="mt-4 text-[15px] leading-relaxed text-muted">{sub}</p>}
    </div>
  );
}

const field =
  "rounded-2xl border border-line bg-paper px-4 py-3 text-[15px] outline-none transition-colors placeholder:text-faint hover:bg-paper-2 focus:border-accent focus:bg-paper";

/** Campo de dinero propio: escribe "12.5" y al salir queda "12.50". Sin <input type=number> nativo. */
function MoneyField({ cents, onChange, label }: { cents: number; onChange: (c: number) => void; label: string }) {
  const [text, setText] = useState((cents / 100).toFixed(2));
  const [bad, setBad] = useState(false);
  return (
    <input
      aria-label={label}
      aria-invalid={bad || undefined}
      inputMode="decimal"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        try {
          const c = toCents(text);
          onChange(c);
          setText((c / 100).toFixed(2));
          setBad(false);
        } catch {
          setBad(true);
        }
      }}
      className={`${field} w-28 shrink-0 text-right font-mono tabular-nums ${bad ? "border-danger" : ""}`}
    />
  );
}

/* ---------- flujo ---------- */
export function NewBill() {
  const toast = useToast();

  const [step, setStep] = useState<Step>("photo");
  const [busy, setBusy] = useState(false);
  const [currency, setCurrency] = useState<Currency>("USD");
  const [merchant, setMerchant] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [charges, setCharges] = useState<ExtraCharge[]>([]);
  const [printed, setPrinted] = useState<number | null>(null);
  const [hostName, setHostName] = useState("");
  const [created, setCreated] = useState<Created | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const itemsTotal = sum(lines.map((l) => l.cents));
  const chargesTotal = sum(charges.map((c) => c.amountCents));
  const computed = itemsTotal + chargesTotal;
  const diff = printed === null ? 0 : printed - computed;
  const matches = diff === 0;
  const money = (c: number) => formatMoney(c, currency, "en-US");

  /* 1 · foto */
  async function readPhoto(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("image", await shrinkPhoto(file));
      form.set("currency", currency);
      const { draft } = await api<{
        draft: {
          merchant: string | null;
          currency: Currency;
          items: { name: string; quantity: number; lineTotalCents: number }[];
          charges: ExtraCharge[];
          printedTotalCents?: number;
          warnings: string[];
        };
      }>("/api/receipts/extract", { method: "POST", body: form });
      setMerchant(draft.merchant);
      setCurrency(draft.currency);
      setLines(draft.items.map((i) => ({ key: uid(), name: i.name, quantity: i.quantity, cents: i.lineTotalCents })));
      setCharges(draft.charges);
      setPrinted(draft.printedTotalCents ?? null);
      draft.warnings.forEach((w) => toast({ tone: "info", title: w }));
      setStep("review");
    } catch (e) {
      toast({ tone: "error", title: "Couldn't read the receipt", body: explain(e) });
    } finally {
      setBusy(false);
    }
  }

  /* 1b · cuenta dictada en voz: se suma a lo que ya hay (sirve en el paso de foto y en el de revisión) */
  type Dictation = {
    transcript: string;
    draft: {
      merchant: string | null;
      currency: Currency;
      items: { name: string; quantity: number; lineTotalCents: number }[];
      charges: ExtraCharge[];
      printedTotalCents?: number;
      warnings: string[];
    };
  };
  const describeDictation = (d: Dictation) => ({
    tone: "ok" as const,
    title: `Added ${d.draft.items.length} item${d.draft.items.length > 1 ? "s" : ""}`,
    body:
      d.draft.items.map((i) => `${i.quantity > 1 ? `${i.quantity}× ` : ""}${i.name} ${formatMoney(i.lineTotalCents, d.draft.currency, "en-US")}`).join(" · ") +
      (d.draft.charges.length ? ` · ${d.draft.charges.map((c) => `${c.label} ${formatMoney(c.amountCents, d.draft.currency, "en-US")}`).join(" · ")}` : "") +
      ". Check the amounts.",
  });
  function applyDictation(d: Dictation) {
    const fresh = lines.every((l) => !l.name.trim() && l.cents === 0); // sin nada útil aún: la voz manda
    setLines((ls) => [
      ...ls.filter((l) => l.name.trim() || l.cents !== 0),
      ...d.draft.items.map((i) => ({ key: uid(), name: i.name, quantity: i.quantity, cents: i.lineTotalCents })),
    ]);
    if (fresh) setCurrency(d.draft.currency);
    if (!merchant && d.draft.merchant) setMerchant(d.draft.merchant);
    if (d.draft.charges.length) setCharges((cs) => [...cs, ...d.draft.charges]);
    if (d.draft.printedTotalCents !== undefined) setPrinted(d.draft.printedTotalCents);
    setStep("review");
  }

  /* 3 · crear la mesa: queda abierta con UN enlace para todos */
  async function createRoom() {
    setBusy(true);
    try {
      const body = {
        hostName: hostName.trim(),
        merchant,
        currency,
        printedTotalCents: printed ?? undefined,
        items: lines.map((l) => ({ name: l.name, quantity: l.quantity, lineTotalCents: l.cents })),
        charges,
      };
      const r = await api<{ code: string; hostUrl: string; participants: { isHost: boolean; url: string }[] }>("/api/rooms", {
        method: "POST",
        json: body,
      });
      // El anfitrión también come: guarda su token de participante para marcar sus ítems desde este dispositivo.
      const mine = r.participants.find((x) => x.isHost);
      if (mine) saveMyToken(r.code, mine.url.split("/").pop()!);
      const hostPath = r.hostUrl.replace(/^https?:\/\/[^/]+/, "");
      saveRoom({ code: r.code, hostPath, merchant, createdAt: Date.now() });
      setCreated({ code: r.code, hostPath });
      setStep("table");
    } catch (e) {
      toast({ tone: "error", title: "Couldn't create the table", body: explain(e) });
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, title: string, body?: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ tone: "ok", title, body });
    } catch {
      toast({ tone: "error", title: "Couldn't copy", body: "Your browser blocked the clipboard." });
    }
  }

  const stepIndex = STEPS.indexOf(step);
  const tableUrl = created ? `${window.location.origin}/t/${created.code}` : "";
  const invite = `Join the table for ${merchant ?? "our bill"}: tap what you had and pay only your part. Nobody pays until everybody does. ${tableUrl}`;

  return (
    <div>
      {/* progreso */}
      <ol aria-label="Progress" className="mb-10 flex gap-1.5">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === stepIndex ? "step" : undefined} className="h-1 flex-1 overflow-hidden rounded-full bg-paper-3">
            <span className={`block h-full bg-accent transition-all duration-500 ${i <= stepIndex ? "w-full" : "w-0"}`} />
          </li>
        ))}
      </ol>

      {/* 1 · FOTO */}
      {step === "photo" && (
        <section className="stagger">
          <Heading kicker="(01) — The receipt" title="Snap the bill." sub="We read every line and check it against the printed total, to the cent." />
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            hidden
            onChange={(e) => {
              void readPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              void readPhoto(e.dataTransfer.files[0]);
            }}
            className={`grid w-full place-items-center gap-3 rounded-3xl border-2 border-dashed px-6 py-16 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              drag ? "border-accent bg-accent-soft" : "border-line bg-paper-2 hover:border-accent"
            } disabled:opacity-60`}
          >
            <span className="grid size-14 place-items-center rounded-full bg-ink text-paper">
              <Camera aria-hidden className="size-6" />
            </span>
            <span className="text-lg">{busy ? "Reading your receipt…" : "Take or choose a photo"}</span>
            <span className="font-mono text-[11px] uppercase tracking-wide text-muted">JPG · PNG · WebP · up to 4 MB</span>
          </button>
          <div className="mt-5 flex justify-center">
            <Button
              variant="ghost"
              onClick={() => {
                setLines([{ key: uid(), name: "", quantity: 1, cents: 0 }]);
                setStep("review");
              }}
            >
              Add the items by hand
            </Button>
          </div>
          <div className="mt-4">
            <VoiceButton
              url="/api/receipts/voice"
              getHeaders={async () => ({})}
              fields={{ currency }}
              describe={describeDictation}
              onDone={applyDictation}
              label="Or say it: “two pizzas at twenty, a beer, ten”"
            />
          </div>
          <MyRooms />
        </section>
      )}

      {/* 2 · REVISIÓN */}
      {step === "review" && (
        <section className="stagger">
          <Heading kicker="(02) — Check it" title="Does this look right?" sub={merchant ? `From ${merchant}. Tap any line to fix it.` : "Tap any line to fix it."} />
          <div className="mb-5 max-w-44">
            <Select
              label="Currency"
              value={currency}
              options={SUPPORTED_CURRENCIES.map((c) => ({ value: c, label: c }))}
              onChange={setCurrency}
            />
          </div>

          <ul className="divide-y divide-line rounded-3xl border border-line bg-paper-2 px-4">
            {lines.map((l) => (
              <li key={l.key} className="flex items-center gap-2 py-3">
                <input
                  aria-label="Item name"
                  value={l.name}
                  placeholder="Item"
                  onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, name: e.target.value } : x)))}
                  className={`${field} min-w-0 flex-1 border-transparent bg-transparent px-2`}
                />
                <MoneyField label={`Amount for ${l.name || "item"}`} cents={l.cents} onChange={(c) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, cents: c } : x)))} />
                <button
                  type="button"
                  aria-label={`Remove ${l.name || "item"}`}
                  onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                  className="grid size-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-paper-3 hover:text-danger"
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              </li>
            ))}
            {charges.map((c, i) => (
              <li key={i} className="flex items-center justify-between gap-2 py-3.5 text-[15px] text-muted">
                <span className="px-4">{c.label}</span>
                <span translate="no" className="font-mono tabular-nums">{money(c.amountCents)}</span>
              </li>
            ))}
          </ul>
          <Button variant="ghost" className="mt-3" onClick={() => setLines((ls) => [...ls, { key: uid(), name: "", quantity: 1, cents: 0 }])}>
            <Plus aria-hidden className="size-4" /> <span translate="no">Add item</span>
          </Button>
          <div className="mt-3">
            <VoiceButton
              url="/api/receipts/voice"
              getHeaders={async () => ({})}
              fields={{ currency }}
              describe={describeDictation}
              onDone={applyDictation}
              label="Or say it: “two pizzas at twenty, a beer, ten”"
            />
          </div>

          <div className="mt-8 rounded-3xl bg-ink p-6 text-paper">
            <div className="flex items-baseline justify-between font-mono text-[11px] uppercase tracking-wide text-paper/60">
              <span>Total we calculated</span>
              <span translate="no" className="text-2xl normal-case tracking-normal text-paper tabular-nums">{money(computed)}</span>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-paper/15 pt-4 text-sm">
              <span className="text-paper/70">Total printed on the receipt</span>
              <input
                aria-label="Printed total"
                inputMode="decimal"
                placeholder="optional"
                defaultValue={printed === null ? "" : (printed / 100).toFixed(2)}
                key={printed ?? "none"}
                onBlur={(e) => {
                  try {
                    setPrinted(e.target.value.trim() ? toCents(e.target.value) : null);
                  } catch {
                    toast({ tone: "error", title: "That total isn't a valid amount" });
                  }
                }}
                className="w-28 rounded-2xl border border-paper/20 bg-transparent px-3 py-2 text-right font-mono tabular-nums outline-none placeholder:text-paper/30 focus:border-paper"
              />
            </div>
            <p role="status" className={`mt-4 flex items-center gap-2 text-sm ${matches ? "text-[#7be2a6]" : "text-[#ff8a85]"}`}>
              {matches ? <Check aria-hidden className="size-4" /> : <X aria-hidden className="size-4" />}
              {printed === null
                ? "No printed total to compare — double-check the amounts."
                : matches
                  ? "It adds up to the cent."
                  : `Off by ${money(Math.abs(diff))} — a line is missing or misread.`}
            </p>
          </div>

          <label className="mt-8 block">
            <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-wide text-muted">Your name</span>
            <input
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
              placeholder="So your friends know who's organizing"
              maxLength={60}
              className={`${field} w-full`}
            />
          </label>

          <div className="mt-8 flex justify-between">
            <Button variant="ghost" onClick={() => setStep("photo")}>Back</Button>
            <Button
              busy={busy}
              disabled={lines.length === 0 || lines.some((l) => !l.name.trim() || l.cents === 0) || !matches || !hostName.trim()}
              onClick={createRoom}
            >
              Create the table <ArrowRight aria-hidden className="size-4" />
            </Button>
          </div>
        </section>
      )}

      {/* 3 · LA MESA */}
      {step === "table" && created && (
        <section className="stagger">
          <Heading
            kicker="(03) — One link"
            title="Send it to the table."
            sub="Everyone opens it, enters their name and taps what they had. When you close the table, each person pays only their part."
          />

          <div className="rounded-3xl bg-ink p-6 text-paper">
            <p className="font-mono text-[11px] uppercase tracking-wide text-paper/60">Table link</p>
            <p translate="no" className="mt-2 break-all font-mono text-lg">{tableUrl.replace(/^https?:\/\//, "")}</p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => void copy(tableUrl, "Table link copied")}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-paper/25 px-4 py-3 text-[15px] transition-colors hover:bg-paper/10"
              >
                <Copy aria-hidden className="size-4" /> Copy link
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(invite)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-paper px-4 py-3 text-[15px] text-ink transition-colors hover:bg-accent-soft"
              >
                <Share2 aria-hidden className="size-4" /> WhatsApp
              </a>
            </div>
          </div>

          <SaveRoom />
          <p className="mt-6 text-sm leading-relaxed text-muted">
            You run the table from the organizer page. It&apos;s saved on this device; copy your organizer link somewhere safe too.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="ghost"
              onClick={() => void copy(`${window.location.origin}${created.hostPath}`, "Organizer link copied", "Keep it private: it controls the table.")}
            >
              <Copy aria-hidden className="size-4" /> Copy organizer link
            </Button>
            <Link href={created.hostPath} className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 text-[15px] text-paper transition-colors hover:bg-accent">
              Open the table <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
