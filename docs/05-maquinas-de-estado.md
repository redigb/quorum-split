# 05 · Máquinas de estado

Código: `src/core/room-machine.ts`, `src/core/claims.ts`

## Por qué un reducer puro

```ts
reduceRoom(estado, evento) → { estado, efectos }
```

- El **evento** viene del usuario, de un webhook de PayPal o del cron.
- Los **efectos** son órdenes para el servidor: `VOID_AUTHORIZATION`, `CAPTURE_ALL`,
  `PAYOUT_BENEFICIARY`, `NOTIFY_HOST`, `NOTIFY_PARTICIPANT`.
- Una transición inválida lanza `TransitionError`. Ejemplo: cobrar una sala que no llegó al 100%
  es **imposible por código**.

## 1 · Sala

```mermaid
stateDiagram-v2
  [*] --> DRAFT
  DRAFT --> OPEN: LOCK_SHARES (montos confirmados)
  DRAFT --> CANCELLED: HOST_CANCELLED
  OPEN --> FUNDED: 100% autorizado y 0 reclamos → efecto CAPTURE_ALL
  OPEN --> EXPIRED: DEADLINE_REACHED → VOID a todos
  OPEN --> CANCELLED: HOST_CANCELLED → VOID a todos
  FUNDED --> OPEN: AUTHORIZATION_VOIDED
  FUNDED --> CAPTURING: CAPTURE_STARTED
  FUNDED --> CANCELLED: HOST_CANCELLED
  CAPTURING --> SETTLED: todos CAPTURED → efecto PAYOUT_BENEFICIARY
  CAPTURING --> FAILED: CAPTURE_FAILED → NOTIFY_HOST
  FAILED --> SETTLED: se resuelve y todos quedan CAPTURED
  SETTLED --> [*]
  EXPIRED --> [*]
  CANCELLED --> [*]
```

| Estado | Significado | ¿Alguien perdió dinero? |
|---|---|---|
| DRAFT | El anfitrión revisa ítems | No hay dinero en juego |
| OPEN | Enlaces activos, juntando autorizaciones | Dinero retenido, no cobrado |
| FUNDED | 100% autorizado: se dispara el cobro | Retenido |
| CAPTURING | Cobrando | En proceso |
| SETTLED | Todo cobrado ✔ | — |
| EXPIRED / CANCELLED | Se anuló todo | **No**: las retenciones se liberan |
| FAILED | Falló algún cobro | Requiere acción del anfitrión |

## 2 · Pago de cada participante

```mermaid
stateDiagram-v2
  [*] --> UNPAID
  [*] --> EXEMPT: parte = 0 o anfitrión que ya pagó
  UNPAID --> ORDER_CREATED: abre el botón PayPal
  ORDER_CREATED --> AUTHORIZED: aprueba (dinero retenido)
  AUTHORIZED --> VOIDED: cambió su monto / venció / cancelado
  VOIDED --> ORDER_CREATED: vuelve a confirmar
  AUTHORIZED --> CAPTURED: cobro
  AUTHORIZED --> FAILED: cobro rechazado
```

### Casos límite cubiertos por tests

| Caso | Comportamiento |
|---|---|
| Webhook duplicado (PayPal reintenta) | Idempotente: no cambia nada |
| Alguien autoriza **después** de vencer | Se anula automáticamente, no se cobra |
| Reclamo abierto y todos autorizaron | No se cobra hasta cerrar el reclamo |
| Reclamo cambia el monto de alguien ya autorizado | Se anula su autorización; debe re-confirmar |
| Evento de un participante inexistente o exento | `TransitionError` |
| Cancelar cuando ya se está cobrando | `TransitionError` |

## 3 · Reclamos con consenso

```mermaid
stateDiagram-v2
  [*] --> PENDING_ACK: PUSH ("eso es de Carlos")
  PENDING_ACK --> ACCEPTED: Carlos acepta → deuda movida
  PENDING_ACK --> ESCALATED: Carlos rechaza / 3 min sin respuesta
  ESCALATED --> RESOLVED: anfitrión decide KEEP / MOVE / SPLIT_ALL
  PENDING_ACK --> RESOLVED: anfitrión decide antes
```

| Tipo | Ejemplo | Regla |
|---|---|---|
| **PULL** | "Yo invito la cerveza de Juan" | Asumo deuda ajena → **se aplica al instante** |
| **PUSH** | "Esa cerveza la pidió Carlos" | Paso mi deuda a otro → **requiere que Carlos acepte** |

Decisiones del anfitrión:

- `KEEP`: se queda con quien la tenía.
- `MOVE`: pasa al destinatario.
- `SPLIT_ALL`: la porción en disputa se reparte entre todos.

Reglas anti-"papa caliente":

- Solo puedes empujar algo **que es tuyo** (no puedes mover la deuda de otro).
- Solo el **destinatario** puede aceptar (Juan no puede auto-aprobar su propio reclamo).
- Máximo **2 PUSH por persona**; después decide el anfitrión.
- No se permiten dos reclamos abiertos sobre el mismo ítem.
- Mientras haya reclamos abiertos, la sala **no se cobra**.
