# 08 · Seguridad

> Los humanos mienten, se hacen los vivos y juegan con las máquinas.
> El sistema asume que **todo input es hostil** hasta validarlo.

## Las 4 leyes

1. **Conservación del dinero:** la suma de las partes es exactamente el total. Verificado por código
   antes de crear órdenes (`SplitError`).
2. **Consenso para mover deuda:** solo puedes asumir deuda (PULL), nunca imponerla (PUSH requiere aceptación).
3. **Todo o nada:** nadie es cobrado hasta que el 100% autorizó. Si no se llega a tiempo, se libera todo.
4. **Auditoría inmutable:** `ledger_events` es append-only (un trigger impide UPDATE/DELETE).

## Ataques humanos

| Ataque | Ejemplo | Defensa | Dónde |
|---|---|---|---|
| Perro muerto | Promete pagar y desaparece | AUTHORIZE + plazo; al vencer, VOID a todos | `room-machine.ts` |
| Papa caliente | Juan → Carlos → Pedro → … | PUSH requiere aceptación; máx 2 por persona; anfitrión arbitra | `claims.ts` |
| Mover deuda ajena | Ana empuja la cerveza de Juan | Solo puedes empujar lo que es tuyo | `claims.ts` |
| Auto-aprobación | Juan acepta su propio reclamo | Solo el destinatario responde | `claims.ts` |
| Cambiar monto tras autorizar | Reclamo después de que todos pagaron | Reclamos abiertos bloquean el cobro; montos cambiados → re-autorizar | `room-machine.ts` |
| Pagar tarde | Aprueba en PayPal después del plazo | Se anula automáticamente | `room-machine.ts` |

## Ataques técnicos

| Ataque | Defensa | Dónde |
|---|---|---|
| Prompt injection | Input marcado como datos; salida acotada a 4 intenciones; validación de ids | `server/ai/` |
| La IA inventa ítems/personas | Zod + verificación contra la sala | `schemas.ts`, `split.ts` |
| Webhook falso ("Juan pagó") | Verificación de firma con PayPal | `paypal/client.ts` |
| Webhook repetido | Tabla `webhook_events` (PK = id) + máquina idempotente | BD + `room-machine.ts` |
| Doble cobro | `PayPal-Request-Id` en cada operación de dinero | `paypal/client.ts` |
| Errores de float | Centavos enteros en todo el sistema | `money.ts` |
| Leer salas ajenas | RLS cerrado; solo el servidor accede; tokens hasheados | `0001_init.sql` |
| Adivinar enlaces | Tokens aleatorios largos (≥128 bits), no ids secuenciales | API (pendiente) |
| Fuga de claves | Secretos sin prefijo `NEXT_PUBLIC_`; `.env.local` ignorado por git | `.env.example` |
| Abuso de la IA (costo) | Límite de mensajes por participante; texto truncado a 500 caracteres | `groq.ts` + API |

## Pendiente de implementar en la capa API

- [ ] Rate limit por IP en `/api/receipts/extract` (protege la cuota de Groq).
- [ ] Generación de tokens con `crypto.randomBytes(24)` y comparación de hash.
- [ ] Transacción BD: estado + ledger en la misma operación.
- [ ] Validar tamaño y tipo de imagen subida (máx ~5 MB, jpeg/png/webp).
