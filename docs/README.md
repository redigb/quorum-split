# Quorum — documentación

> **Nobody pays until everybody pays.**
> Sube la foto de la cuenta, la IA la reparte y cada persona paga su parte con PayPal.
> El dinero solo se cobra cuando **todo el grupo** confirmó.

## ¿Para qué existe este proyecto?

Dividir una cuenta entre varias personas sigue siendo un caos: alguien paga todo, calcula a mano
y luego persigue a los demás para que le devuelvan. Las pasarelas de pago son **1 a 1**; el
consumo real es **grupal**.

Quorum convierte un ticket (foto, voz o texto) en una **sala de cobro** donde:

1. La **IA (Groq)** lee el ticket y entiende quién consumió qué.
2. Un **motor determinista** calcula cuánto debe cada persona, al centavo.
3. Cada persona **autoriza** su parte con PayPal (el dinero se retiene, no se cobra).
4. Cuando el 100% autorizó, se **cobra a todos a la vez**. Si alguien no paga a tiempo, se anula todo
   y nadie pierde dinero.
5. Todo queda en un **libro de auditoría** inmutable (vista con AG Grid).

## Índice

| # | Documento | Qué responde |
|---|---|---|
| 01 | [Producto](01-producto.md) | Problema, propuesta, nombre, pitch, alcance |
| 02 | [Flujo de usuario](02-flujo-usuario.md) | Cómo llega y usa la app cada tipo de usuario |
| 03 | [Arquitectura](03-arquitectura.md) | Stack, carpetas, cómo viajan los datos |
| 04 | [Motor de cálculo](04-motor-de-calculo.md) | Cómo se reparte el dinero sin perder un centavo |
| 05 | [Máquinas de estado](05-maquinas-de-estado.md) | Estados de la sala, del pago y de los reclamos |
| 06 | [PayPal](06-paypal.md) | AUTHORIZE / CAPTURE / VOID, webhooks, límites |
| 07 | [IA](07-ia.md) | Qué hace Groq, qué NO puede hacer |
| 08 | [Seguridad](08-seguridad.md) | Ataques humanos y técnicos, y cómo se bloquean |
| 09 | [Diseño](09-diseno.md) | Dirección visual (estilo Apple) para la UI |
| 10 | [Plan](10-plan.md) | Estado actual y pendientes hasta la entrega |

## Mapa rápido del código

```
src/
  core/            ← LÓGICA PURA (sin red, sin BD). Testeada. El corazón del producto.
    money.ts         dinero en centavos, parseo de montos, reparto exacto
    split.ts         motor de cálculo: ítems + impuestos + propina -> parte de cada uno
    room-machine.ts  máquina de estados de la sala ("nadie paga hasta que todos pagan")
    claims.ts        reclamos con consenso ("eso no es mío, es de Carlos")
    types.ts         tipos del dominio
  server/          ← SOLO SERVIDOR (usa claves secretas)
    ai/              Groq: leer ticket, asignar por voz/texto, interpretar reclamos
    paypal/          Orders v2: crear, autorizar, cobrar, anular, verificar webhooks
  app/             ← Next.js (UI y API routes) — pendiente
supabase/migrations/ ← esquema de la base de datos
docs/                ← estás aquí
```

## Comandos

```bash
pnpm install
cp .env.example .env.local   # completar credenciales
pnpm test                    # tests del núcleo
pnpm dev                     # http://localhost:3000
```
