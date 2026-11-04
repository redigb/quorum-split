# Quorum 🤝

**Nobody pays until everybody pays.**

Quorum splits a restaurant bill among a group — even across countries — and only charges when the whole table has said yes.

![Next.js](https://img.shields.io/badge/Next.js-000?logo=nextdotjs&logoColor=white)
![PayPal](https://img.shields.io/badge/PayPal-003087?logo=paypal&logoColor=white)
![Groq](https://img.shields.io/badge/Groq-F55036)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white)
![GSAP](https://img.shields.io/badge/GSAP-88CE02?logo=greensock&logoColor=black)

## The problem

Splitting a bill is awkward: someone fronts the money, nobody remembers who had the wine, tax and tip are split unfairly, and friends abroad pay in another currency. The host ends up chasing everyone for weeks.

## How it works

1. 📸 **Snap it** — photo of the receipt (or just say what everyone had). AI reads every line and we check the sum against the printed total, to the cent.
2. 🧮 **Split it fair** — tap who had what. Shared dishes are split, tax and tip follow each plate. The math is a deterministic engine, never an AI guess.
3. 🔗 **Send the room** — everyone gets a link with their exact amount. No app, no sign-up. Each person *authorizes* their share with PayPal (a hold, not a charge).
4. ✅ **The quorum** — when the last person authorizes, everything is captured at once. If the deadline passes first, every hold is released and nobody is charged.

## Bonus: Feeling lucky 🎲

If everyone agrees, a card draw picks one person to pay the whole bill. Verifiable randomness, made for friends.

## Stack

- Next.js + React + Tailwind
- PayPal Orders v2 (authorize & capture)
- Groq (receipt vision + voice)
- Supabase (rooms and append-only ledger)
- GSAP (landing animations)
- Vitest (split engine tests)

## Run it

```bash
pnpm install
cp .env.example .env.local   # PayPal Sandbox, Groq and Supabase keys
pnpm dev                     # http://localhost:3000
pnpm test                    # split engine tests
```

## Docs

Product, architecture, split engine, state machines, PayPal, AI, security and design live in [`docs/`](docs/).

## Status

Hackathon project. Landing page and split engine are done; PayPal Sandbox, Groq and Supabase integrations are in progress.
