# 03 · Arquitectura

## Stack

| Capa | Tecnología | Motivo |
|---|---|---|
| App + API | **Next.js 16** (App Router) + TypeScript | Frontend, API y webhook en un solo deploy |
| UI | Tailwind 4 (+ shadcn/ui cuando se haga la UI) | Rápido y consistente |
| Tabla | AG Grid Community | Vista de auditoría (premio AG Grid) |
| Base de datos | **Supabase** (Postgres) | Ledger, salas, pagos |
| Tiempo real | Supabase Realtime **Broadcast** | La barra de progreso se actualiza en vivo |
| Archivos | Supabase Storage | Fotos de tickets |
| IA | **Groq** (visión, texto, Whisper) | Rápido y con capa gratuita |
| Pagos | **PayPal** Orders v2 (REST) + JS SDK (botón) | AUTHORIZE / CAPTURE |
| Validación | Zod | Todo lo que viene de la IA o del usuario |
| Tests | Vitest | Núcleo financiero |
| Deploy | Vercel | URL pública para webhooks + cron |

## Principio de diseño: núcleo puro + bordes

```
           ┌───────────────────────────────────────────────┐
  UI  ───► │  app/ (páginas + API routes)                  │
           │      │                                        │
           │      ▼                                        │
           │  server/ai  ──► Groq     server/paypal ──► PayPal
           │      │  (propone)              ▲ (ejecuta)    │
           │      ▼                         │              │
           │  ┌──────────── core/ ──────────┴───────────┐  │
           │  │ money · split · room-machine · claims   │  │
           │  │ SIN red, SIN BD, 100% testeado          │  │
           │  │ Decide TODO lo que toca dinero          │  │
           │  └─────────────────────────────────────────┘  │
           │      │                                        │
           │      ▼                                        │
           │  Supabase (estado + ledger append-only)       │
           └───────────────────────────────────────────────┘
```

- **`core/` no importa nada externo.** Recibe datos, devuelve datos o errores. Por eso se puede
  testear al 100% y razonar sobre él.
- **La IA está en el borde**: produce *propuestas*. El núcleo las valida.
- **PayPal está en el borde**: ejecuta lo que el núcleo ordena (los "efectos" de la máquina de estados).

## Patrón de cada acción en el servidor

```
1. Autenticar el token del enlace (anfitrión o participante)
2. Cargar estado de la sala desde Supabase
3. core: reduceRoom(estado, evento) → { estado nuevo, efectos }
4. Guardar estado + escribir en ledger_events (misma transacción)
5. Ejecutar efectos en PayPal (VOID, CAPTURE...) con claves de idempotencia
6. Broadcast a la sala por Realtime
```

## Carpetas

```
src/
  core/                    ✅ hecho
  server/ai/               ✅ hecho (falta probar con API key real)
  server/paypal/           ✅ hecho (falta probar con Sandbox)
  server/db/               ⏳ cliente Supabase + repositorios
  app/
    page.tsx               ⏳ inicio = subir ticket
    r/[code]/host/         ⏳ sala del anfitrión (?t=token)
    r/[code]/p/[token]/    ⏳ enlace del participante
    r/[code]/audit/        ⏳ ledger con AG Grid
    api/
      receipts/extract     ⏳ foto → borrador
      rooms                ⏳ crear sala
      rooms/[code]/assign  ⏳ texto/voz → asignaciones
      rooms/[code]/lock    ⏳ confirmar montos, abrir sala
      rooms/[code]/orders  ⏳ crear orden PayPal del participante
      rooms/[code]/orders/[id]/authorize ⏳
      rooms/[code]/claims  ⏳ reclamos (+ respond / resolve)
      webhooks/paypal      ⏳ eventos de PayPal (verificados)
      cron/tick            ⏳ vencer plazos y reclamos sin respuesta
supabase/migrations/       ✅ esquema inicial
```

## Identidad sin login

- Al crear la sala se generan tokens aleatorios: uno de **anfitrión** y uno por **participante**.
- En la BD solo se guarda el **hash** (sha256) del token.
- El enlace del participante es `/r/K7P2QX/p/<token>`: quien tiene el enlace es esa persona.
- Riesgo aceptado: si alguien reenvía su enlace, otro puede pagar por él (no es un problema: pagar
  la parte de otro no daña a nadie). Lo que un enlace **no** puede hacer es modificar la cuenta de otros.

## Tiempo real

Vercel (serverless) no mantiene WebSockets abiertos. El servidor, después de cada cambio, publica en
el canal `room:<code>` de **Supabase Realtime Broadcast** y el navegador escucha ese canal. No se expone
ninguna tabla al navegador (RLS cerrado).

Plan B si Realtime falla en la demo: el cliente consulta el estado cada 2 s.
