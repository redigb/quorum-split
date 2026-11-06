"use client";

import { ArrowRight, Camera, Check, Copy, Plus, Share2, Sparkles, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { formatMoney, SUPPORTED_CURRENCIES, sum, toCents, type Currency } from "@/core/money";
import type { ExtraCharge } from "@/core/types";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/Confirm";
import { MyRooms, saveRoom } from "@/components/app/my-rooms";
import { SaveRoom } from "@/components/app/SaveRoom";
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
  hostToken: string;
  hostUrl: string;
  participants: { id: string; name: string; isHost: boolean; url: string }[];
  itemIds: string[]; // mismo orden que `lines`
}
interface Locked {
  deadlineAt: string;
  shares: { participantId: string; totalCents: number }[];
}
type Step = "photo" | "review" | "people" | "assign" | "links";
const STEPS: Step[] = ["photo", "review", "people", "assign", "links"];

const uid = () => Math.random().toString(36).slice(2, 9);
const DEADLINES = [
  { value: "6", label: "6 hours" },
  { value: "24", label: "24 hours", hint: "Recommended" },
  { value: "48", label: "48 hours" },
  { value: "72", label: "72 hours", hint: "Max. PayPal honors the hold for 3 days" },
] as const;

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
  UNASSIGNED_ITEM: "Every item needs at least one person.",
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

function Initial({ name, on, size = "size-10" }: { name: string; on?: boolean; size?: string }) {
  return (
    <span
      translate="no"
      className={`grid ${size} shrink-0 place-items-center rounded-full font-mono text-sm uppercase transition-colors ${
        on ? "bg-accent text-paper" : "bg-paper-3 text-ink"
      }`}
    >
      {name.trim().charAt(0) || "?"}
    </span>
  );
}

/* ---------- flujo ---------- */
export function NewBill() {
  const toast = useToast();
  const confirm = useConfirm();

  const [step, setStep] = useState<Step>("photo");
  const [busy, setBusy] = useState(false);
  const [currency, setCurrency] = useState<Currency>("USD");
  const [merchant, setMerchant] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [charges, setCharges] = useState<ExtraCharge[]>([]);
  const [printed, setPrinted] = useState<number | null>(null);
  const [hostName, setHostName] = useState("");
  const [others, setOthers] = useState<string[]>([]);
  const [draftName, setDraftName] = useState("");
  const [created, setCreated] = useState<Created | null>(null);
  const [assign, setAssign] = useState<Record<string, string[]>>({}); // itemId -> participantIds
  const [aiText, setAiText] = useState("");
  const [deadline, setDeadline] = useState<(typeof DEADLINES)[number]["value"]>("24");
  const [locked, setLocked] = useState<Locked | null>(null);
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
      form.set("image", file);
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

  /* 3 · crear la sala (borrador) y traer los ids reales de los ítems */
  async function createRoom() {
    setBusy(true);
    try {
      const body = {
        hostName: hostName.trim(),
        participantNames: others,
        merchant,
        currency,
        printedTotalCents: printed ?? undefined,
        items: lines.map((l) => ({ name: l.name, quantity: l.quantity, lineTotalCents: l.cents })),
        charges,
      };
      const r = await api<{ code: string; hostUrl: string; participants: Created["participants"] }>("/api/rooms", {
        method: "POST",
        json: body,
      });
      const hostToken = new URL(r.hostUrl).searchParams.get("t")!;
      const room = await api<{ items: { id: string }[] }>(`/api/rooms/${r.code}`, { token: hostToken });
      setCreated({ ...r, hostToken, itemIds: room.items.map((i) => i.id) });
      saveRoom({ code: r.code, hostPath: r.hostUrl.replace(/^https?:\/\/[^/]+/, ""), merchant, createdAt: Date.now(), links: r.participants.map((x) => ({ id: x.id, name: x.name, url: x.url })) });
      setAssign({});
      setStep("assign");
    } catch (e) {
      toast({ tone: "error", title: "Couldn't create the room", body: explain(e) });
    } finally {
      setBusy(false);
    }
  }

  /* 4 · asignar */
  const toggle = (itemId: string, pid: string) =>
    setAssign((a) => {
      const cur = a[itemId] ?? [];
      return { ...a, [itemId]: cur.includes(pid) ? cur.filter((x) => x !== pid) : [...cur, pid] };
    });

  async function askAi() {
    if (!created || !aiText.trim()) return;
    setBusy(true);
    try {
      const r = await api<{ proposal: { itemId: string; assignees: { participantId: string }[] }[]; ignored: string[] }>(
        `/api/rooms/${created.code}/assign`,
        { method: "POST", token: created.hostToken, json: { text: aiText } },
      );
      setAssign((a) => ({
        ...a,
        ...Object.fromEntries(r.proposal.filter((p) => p.assignees.length).map((p) => [p.itemId, p.assignees.map((x) => x.participantId)])),
      }));
      toast({
        tone: r.ignored.length ? "info" : "ok",
        title: r.ignored.length ? "Suggestion applied, with gaps" : "Suggestion applied",
        body: r.ignored.length ? "Check the items that are still empty." : "Review it and tap to adjust.",
      });
    } catch (e) {
      toast({ tone: "error", title: "Couldn't use that", body: explain(e) });
    } finally {
      setBusy(false);
    }
  }

  async function lock() {
    if (!created) return;
    const ok = await confirm({
      title: "Lock this split?",
      body: "Everyone gets their link with their exact amount. You won't be able to change the items after this.",
      confirmLabel: "Lock and share",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api<Locked>(`/api/rooms/${created.code}/lock`, {
        method: "POST",
        token: created.hostToken,
        json: {
          deadlineHours: Number(deadline),
          assignments: created.itemIds.map((itemId) => ({
            itemId,
            assignees: (assign[itemId] ?? []).map((participantId) => ({ participantId, weight: 1 })),
          })),
        },
      });
      setLocked(r);
      setStep("links");
      toast({ tone: "ok", title: "Room is open", body: "Share the links. Nobody pays until everybody does." });
    } catch (e) {
      toast({ tone: "error", title: "Couldn't lock the split", body: explain(e) });
    } finally {
      setBusy(false);
    }
  }

  const everyoneAssigned = created ? created.itemIds.every((id) => (assign[id] ?? []).length > 0) : false;
  const stepIndex = STEPS.indexOf(step);
  const peopleReady = hostName.trim().length > 0 && others.length > 0;
  const people = useMemo(() => created?.participants ?? [], [created]);

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
        <section>
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
          <MyRooms />
        </section>
      )}

      {/* 2 · REVISIÓN */}
      {step === "review" && (
        <section>
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
            <Plus aria-hidden className="size-4" /> Add item
          </Button>

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

          <div className="mt-8 flex justify-between">
            <Button variant="ghost" onClick={() => setStep("photo")}>Back</Button>
            <Button disabled={lines.length === 0 || lines.some((l) => !l.name.trim() || l.cents === 0) || !matches} onClick={() => setStep("people")}>
              Continue <ArrowRight aria-hidden className="size-4" />
            </Button>
          </div>
        </section>
      )}

      {/* 3 · PERSONAS */}
      {step === "people" && (
        <section>
          <Heading kicker="(03) — The table" title="Who's splitting?" sub="Just first names. Everyone gets their own private link — no app, no sign-up." />
          <label className="block">
            <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-wide text-muted">You</span>
            <input value={hostName} onChange={(e) => setHostName(e.target.value)} placeholder="Your name" maxLength={60} className={`${field} w-full`} />
          </label>

          <form
            className="mt-6"
            onSubmit={(e) => {
              e.preventDefault();
              const n = draftName.trim();
              if (!n) return;
              if (others.some((o) => o.toLowerCase() === n.toLowerCase()) || n.toLowerCase() === hostName.trim().toLowerCase()) {
                toast({ tone: "info", title: `${n} is already at the table` });
                return;
              }
              setOthers((o) => [...o, n]);
              setDraftName("");
            }}
          >
            <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-wide text-muted">Everyone else</span>
            <div className="flex gap-2">
              <input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Add a name" maxLength={60} className={`${field} min-w-0 flex-1`} />
              <Button type="submit" aria-label="Add person" className="px-4">
                <Plus aria-hidden className="size-5" />
              </Button>
            </div>
          </form>

          <ul className="mt-5 flex flex-wrap gap-2">
            {others.map((n) => (
              <li key={n} className="flex items-center gap-2 rounded-full bg-paper-2 py-1.5 pl-1.5 pr-3 text-[15px]">
                <Initial name={n} size="size-7" />
                {n}
                <button type="button" aria-label={`Remove ${n}`} onClick={() => setOthers((o) => o.filter((x) => x !== n))} className="text-muted hover:text-danger">
                  <X aria-hidden className="size-4" />
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-10 flex justify-between">
            <Button variant="ghost" onClick={() => setStep("review")}>Back</Button>
            <Button disabled={!peopleReady} busy={busy} onClick={createRoom}>
              Continue <ArrowRight aria-hidden className="size-4" />
            </Button>
          </div>
        </section>
      )}

      {/* 4 · ASIGNACIÓN */}
      {step === "assign" && created && (
        <section>
          <Heading kicker="(04) — Who had what" title="Tap to assign." sub="Shared dish? Tap more than one person and it's split evenly. Tax and tip follow each plate." />

          <div className="rounded-3xl border border-line bg-paper-2 p-4">
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-muted">
                <Sparkles aria-hidden className="size-3.5 text-accent" /> Or just say it
              </span>
              <textarea
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder={`e.g. "${lines[0]?.name || "The first dish"} is ${others[0]}'s, the rest we split evenly"`}
                className={`${field} w-full resize-none`}
              />
            </label>
            <Button className="mt-3 w-full" busy={busy} disabled={!aiText.trim()} onClick={askAi}>
              Suggest an assignment
            </Button>
          </div>

          <ul className="mt-6 space-y-3">
            {lines.map((l, idx) => {
              const itemId = created.itemIds[idx];
              const chosen = assign[itemId] ?? [];
              return (
                <li key={itemId} className="rounded-3xl border border-line bg-paper p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[15px]">{l.name}</span>
                    <span translate="no" className="font-mono text-sm tabular-nums text-muted">{money(l.cents)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {people.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={chosen.includes(p.id)}
                        aria-label={`${p.name} — ${l.name}`}
                        onClick={() => toggle(itemId, p.id)}
                        className="flex flex-col items-center gap-1 rounded-2xl p-1 focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        <Initial name={p.name} on={chosen.includes(p.id)} />
                        <span className="max-w-14 truncate text-[11px] text-muted">{p.name}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setAssign((a) => ({ ...a, [itemId]: chosen.length === people.length ? [] : people.map((p) => p.id) }))}
                      className="ml-auto rounded-full border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide transition-colors hover:bg-paper-2"
                    >
                      {chosen.length === people.length ? "Clear" : "Everyone"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-6 max-w-xs">
            <Select label="Time to pay" value={deadline} options={DEADLINES} onChange={setDeadline} />
            <p className="mt-2 text-xs text-muted">If the table isn&apos;t complete by then, every hold is released and nobody is charged.</p>
          </div>

          <div className="mt-8 flex justify-end">
            <Button disabled={!everyoneAssigned} busy={busy} onClick={lock}>
              {everyoneAssigned ? "Lock the split" : `${created.itemIds.filter((id) => !(assign[id] ?? []).length).length} item(s) left`}
              <ArrowRight aria-hidden className="size-4" />
            </Button>
          </div>
        </section>
      )}

      {/* 5 · ENLACES */}
      {step === "links" && created && locked && (
        <section>
          <Heading kicker="(05) — Send the room" title="Everyone gets a link." sub={`Open until ${new Date(locked.deadlineAt).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}. Nobody is charged until the last person confirms.`} />
          <ul className="space-y-3">
            {created.participants.map((p) => {
              const amount = locked.shares.find((s) => s.participantId === p.id)?.totalCents ?? 0;
              const text = `${p.name}, your share of ${merchant ?? "the bill"} is ${money(amount)}. Nobody pays until everybody does: ${p.url}`;
              return (
                <li key={p.id} className="flex items-center gap-3 rounded-3xl border border-line bg-paper-2 p-4">
                  <Initial name={p.name} on />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px]">
                      {p.name}
                      {p.isHost && <span className="ml-2 font-mono text-[11px] uppercase text-muted">you</span>}
                    </p>
                    <p translate="no" className="font-mono text-lg tabular-nums">{money(amount)}</p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Copy ${p.name}'s link`}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(p.url);
                        toast({ tone: "ok", title: "Link copied", body: p.name });
                      } catch {
                        toast({ tone: "error", title: "Couldn't copy", body: "Your browser blocked the clipboard." });
                      }
                    }}
                    className="grid size-10 place-items-center rounded-full border border-line transition-colors hover:bg-paper-3"
                  >
                    <Copy aria-hidden className="size-4" />
                  </button>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(text)}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Share ${p.name}'s link on WhatsApp`}
                    className="grid size-10 place-items-center rounded-full bg-ink text-paper transition-colors hover:bg-accent"
                  >
                    <Share2 aria-hidden className="size-4" />
                  </a>
                </li>
              );
            })}
          </ul>
          <SaveRoom />
          <p className="mt-6 text-sm leading-relaxed text-muted">
            Your own link is the key to this room — it&apos;s saved on this device, but copy it somewhere safe too.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="ghost"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(created.hostUrl);
                  toast({ tone: "ok", title: "Host link copied", body: "Keep it private: it controls the room." });
                } catch {
                  toast({ tone: "error", title: "Couldn't copy", body: "Your browser blocked the clipboard." });
                }
              }}
            >
              <Copy aria-hidden className="size-4" /> Copy my host link
            </Button>
            <Link href={created.hostUrl.replace(/^https?:\/\/[^/]+/, "")} className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 text-[15px] text-paper transition-colors hover:bg-accent">
              Follow the room <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
