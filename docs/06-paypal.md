# 06 · PayPal

Código: `src/server/paypal/client.ts`

## AUTHORIZE vs CAPTURE (la base de "nadie paga hasta que todos pagan")

| Paso | API | Qué pasa con el dinero |
|---|---|---|
| Crear orden | `POST /v2/checkout/orders` con `intent: "AUTHORIZE"` | Nada todavía |
| Comprador aprueba | Botón PayPal (JS SDK) | Nada todavía |
| Autorizar | `POST /v2/checkout/orders/{id}/authorize` | **Retenido** en la cuenta del comprador |
| Cobrar | `POST /v2/payments/authorizations/{id}/capture` | **Cobrado** |
| Anular | `POST /v2/payments/authorizations/{id}/void` | **Liberado**, el comprador no pierde nada |

## Límites de tiempo

- **Honor period: 3 días.** Dentro de ese plazo PayPal garantiza que la captura funcionará.
- La autorización vive **29 días**, pero después del día 3 la captura puede fallar.
- **Decisión:** plazo de la sala por defecto **24 h**, máximo **72 h**.

## Webhooks que escuchamos

| Evento PayPal | Evento de la máquina de estados |
|---|---|
| `PAYMENT.AUTHORIZATION.CREATED` | `AUTHORIZED` |
| `PAYMENT.AUTHORIZATION.VOIDED` | `AUTHORIZATION_VOIDED` |
| `PAYMENT.CAPTURE.COMPLETED` | `CAPTURED` |
| `PAYMENT.CAPTURE.DENIED` | `CAPTURE_FAILED` |

Cada webhook:

1. **Se verifica la firma** con `verifyWebhook()` (`/v1/notifications/verify-webhook-signature`).
   Sin esto, cualquiera podría hacer POST diciendo "Juan ya pagó".
2. Se guarda en `webhook_events` usando el id del evento como clave primaria. Si ya existe, se ignora
   (PayPal reintenta envíos).
3. `custom_id` = `roomId:participantId:version` identifica a quién corresponde.

**Plan B:** el cliente también llama a `authorize` justo después de aprobar. El webhook confirma,
pero la demo no depende de él.

## Idempotencia

Cada llamada que mueve dinero envía `PayPal-Request-Id`:

| Llamada | Clave |
|---|---|
| Crear orden | `order-{room}-{participant}-v{version}` |
| Autorizar | `authorize-{orderId}` |
| Cobrar | `capture-{authorizationId}` |
| Anular | `void-{authorizationId}` |

Un doble clic, un reintento o un webhook duplicado **nunca cobra dos veces**.

## Configuración (Sandbox)

1. developer.paypal.com → Apps & Credentials → Sandbox → crear app → `CLIENT_ID` y `SECRET`.
2. Cuentas de prueba: Sandbox → Accounts (una *business* receptora y varias *personal* compradoras).
3. Webhooks: en la app, registrar `https://<tu-app>.vercel.app/api/webhooks/paypal` con los 4 eventos
   de arriba → copiar el `WEBHOOK_ID`.
4. Para desarrollo local: `cloudflared tunnel --url http://localhost:3000` y registrar esa URL.

## Monedas

PayPal **no soporta PEN** (soles). La app trabaja en USD por defecto. Lista en `SUPPORTED_CURRENCIES`
(`src/core/money.ts`): solo monedas con 2 decimales.

## Honestidad para el pitch: producción vs. demo

En la demo, el dinero de todos entra a **una** cuenta business (la plataforma) y luego se paga al
beneficiario. En el mundo real eso convierte a la plataforma en intermediario de dinero ajeno
(actividad regulada).

**En producción** se usaría **PayPal Multiparty / Commerce Platform**: el dinero va directo al
comercio/beneficiario y la plataforma solo cobra su comisión. Decirlo en el video suma puntos con
jueces de PayPal.
