# Quorum 🤝

**Nobody pays until everybody pays.**

Quorum splits a restaurant bill among a group — even across countries — and only charges when the whole table has said yes. Built for the PayPal AI Hackathon.

**Live demo:** https://quorum-split.vercel.app · **Try it without sign-up:** https://quorum-split.vercel.app/demo

![Next.js](https://img.shields.io/badge/Next.js-000?logo=nextdotjs&logoColor=white)
![PayPal](https://img.shields.io/badge/PayPal-003087?logo=paypal&logoColor=white)
![Groq](https://img.shields.io/badge/Groq-F55036)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white)
![AG Grid](https://img.shields.io/badge/AG%20Grid-ledger-1f6feb)
![License: MIT](https://img.shields.io/badge/License-MIT-green)

## The problem

Splitting a bill is awkward: someone fronts the money, nobody remembers who had the wine, tax and tip are split unfairly, and friends abroad pay in another currency. The host ends up chasing everyone for weeks.

## How it works

1. 📸 **Snap it** — photo of the receipt, or just *say* what everyone had. AI reads every line and we check the sum against the printed total, to the cent.
2. 🧮 **Split it fair** — everyone opens the same table link and taps what they had (or says it out loud). Shared dishes are split, tax and tip follow each plate. The math is a deterministic engine in integer cents, never an AI guess.
3. 💳 **Authorize, don't pay** — each person *authorizes* their exact share with PayPal (a hold, not a charge).
4. ✅ **The quorum** — when the last person authorizes, every hold is captured at once. If the deadline passes first, every hold is released and nobody is charged.

### Feeling lucky 🎲

If everyone agrees, a card draw picks one person to pay the whole bill. The server draws with a cryptographic seed and publishes a SHA-256 proof, so the result is verifiable.

## Where PayPal and AI are used

**PayPal** (Sandbox): Orders v2 with `intent=AUTHORIZE`, then capture of every authorization only when the room reaches quorum; void on expiry; signed webhooks (`PAYMENT.AUTHORIZATION.*`, `PAYMENT.CAPTURE.*`) verified against `PAYPAL_WEBHOOK_ID`; an append-only ledger shown in the app (AG Grid) with each PayPal status.

**AI** (Groq): receipt vision (`qwen/qwen3.8-27b`), bill dictation and per-person voice assignment (Whisper `whisper-large-v3-turbo` + `openai/gpt-oss-120b`). AI only reads and interprets; money is always computed by the deterministic engine.

## Test it (for judges)

No installation needed — use the hosted demo.

1. Open https://quorum-split.vercel.app/demo and pick **Split fair** or **Feeling lucky**. Three friends are simulated and confirm on their own; you are the last to pay.
2. When asked to pay, log in with this **PayPal Sandbox buyer** (test money only, nothing real is charged):

   | | |
   |---|---|
   | Email | `TODO_BUYER_EMAIL@personal.example.com` |
   | Password | `TODO_BUYER_PASSWORD` |

3. Approve the authorization. When your hold lands, the room captures everything and shows **Settled**, with every step in the Ledger.

To try the real flow with real people: go to `/new`, upload a receipt photo or dictate the bill, send the single table link to friends, and everybody pays with Sandbox accounts.

## Stack

- Next.js 16 (App Router) + React 19 + Tailwind 4 + TypeScript
- PayPal Orders v2 (authorize & capture) + webhooks
- Groq (vision, speech-to-text, text)
- Supabase (rooms and append-only ledger)
- AG Grid Community (ledger table), GSAP (animations)
- Vitest (split engine, state machine)

## Run it locally

Requires Node 20+, pnpm, a PayPal Sandbox app, a Groq key and a Supabase project.

```bash
pnpm install
cp .env.example .env.local        # fill in the keys
# apply supabase/migrations/0001..0003 in the Supabase SQL editor
pnpm dev                          # http://localhost:3000
pnpm test                         # split engine + state machine tests
```

Secrets live only in `.env.local` / the hosting provider and are never committed. The Sandbox buyer above is the only credential in this repo.

## Docs

Product, architecture, split engine, state machines, PayPal, AI, security and design live in [`docs/`](docs/).

## What was built during the hackathon

The whole project (engine, PayPal flow, AI, demo mode, Feeling lucky, voice, ledger) was built during the Submission Period.

## Credits and licenses

Code: [MIT](LICENSE) © 2026 Renzo RD ([@redigb](https://github.com/redigb)). Photos from Unsplash (credited in the landing footer). Fonts: Bricolage Grotesque and IBM Plex Mono (SIL OFL). Animations: GSAP. Ledger grid: AG Grid Community (MIT).
