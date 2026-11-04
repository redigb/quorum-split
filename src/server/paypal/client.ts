/**
 * Cliente REST de PayPal (Orders v2 + Payments v2 + Webhooks). SOLO SERVIDOR.
 *
 * Flujo "nadie paga hasta que todos pagan":
 *   1. createAuthorizeOrder()  -> el botón de PayPal abre esta orden (intent AUTHORIZE)
 *   2. El participante aprueba en PayPal
 *   3. authorizeOrder()        -> PayPal RETIENE el dinero (no lo cobra). Guardamos authorizationId
 *   4. Cuando el 100% autorizó: captureAuthorization() a cada uno -> se COBRA
 *   5. Si vence el plazo o se cancela: voidAuthorization() -> se libera el dinero, nadie paga
 *
 * Una autorización tiene "honor period" de 3 días (se garantiza la captura) y vive 29 días.
 * Por eso el plazo máximo de una sala es de 72 horas (ver docs/07-paypal.md).
 */
import { toPayPalValue, type Cents, type Currency } from "@/core/money";

const BASE =
  process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Faltan PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET en .env.local");

  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new PayPalError(res.status, await res.text());
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

export class PayPalError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`PayPal ${status}: ${body}`);
    this.name = "PayPalError";
  }
}

/**
 * requestId = clave de idempotencia (PayPal-Request-Id). Si la misma llamada se repite
 * (reintento, doble clic, webhook duplicado), PayPal devuelve el resultado original
 * en vez de crear/cobrar dos veces.
 */
async function call<T>(method: "GET" | "POST", path: string, body?: unknown, requestId?: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new PayPalError(res.status, await res.text());
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

/* ---------- Órdenes ---------- */

export interface CreateOrderInput {
  roomId: string;
  participantId: string;
  amountCents: Cents;
  currency: Currency;
  description: string;
  /** Cambia si el monto cambia: así un monto nuevo genera una orden nueva y no reusa la vieja. */
  version: number;
}

export async function createAuthorizeOrder(input: CreateOrderInput): Promise<{ id: string }> {
  if (input.amountCents <= 0) throw new Error("El monto debe ser mayor a 0");
  return call<{ id: string }>(
    "POST",
    "/v2/checkout/orders",
    {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: input.participantId,
          custom_id: `${input.roomId}:${input.participantId}:${input.version}`, // vuelve en los webhooks
          description: input.description.slice(0, 127),
          amount: { currency_code: input.currency, value: toPayPalValue(input.amountCents) },
        },
      ],
    },
    `order-${input.roomId}-${input.participantId}-v${input.version}`,
  );
}

interface OrderResponse {
  id: string;
  status: string;
  purchase_units: Array<{
    custom_id?: string;
    amount?: { currency_code: string; value: string };
    payments?: {
      authorizations?: Array<{ id: string; status: string; amount: { currency_code: string; value: string }; expiration_time?: string }>;
    };
  }>;
}

export function getOrder(orderId: string) {
  return call<OrderResponse>("GET", `/v2/checkout/orders/${orderId}`);
}

/** Tras la aprobación del comprador: retiene el dinero y devuelve el id de la autorización. */
export async function authorizeOrder(orderId: string) {
  const order = await call<OrderResponse>("POST", `/v2/checkout/orders/${orderId}/authorize`, {}, `authorize-${orderId}`);
  const auth = order.purchase_units[0]?.payments?.authorizations?.[0];
  if (!auth) throw new Error("PayPal no devolvió una autorización");
  return {
    orderId: order.id,
    customId: order.purchase_units[0]?.custom_id,
    authorizationId: auth.id,
    status: auth.status,
    amount: auth.amount,
    expiresAt: auth.expiration_time,
  };
}

/* ---------- Autorizaciones ---------- */

export function captureAuthorization(authorizationId: string) {
  return call<{ id: string; status: string }>(
    "POST",
    `/v2/payments/authorizations/${authorizationId}/capture`,
    { final_capture: true },
    `capture-${authorizationId}`,
  );
}

export function voidAuthorization(authorizationId: string) {
  return call<Record<string, never>>(
    "POST",
    `/v2/payments/authorizations/${authorizationId}/void`,
    undefined,
    `void-${authorizationId}`,
  );
}

/* ---------- Webhooks ---------- */

/**
 * Verifica que el webhook venga realmente de PayPal. Sin esto, cualquiera podría
 * hacer POST a /api/webhooks/paypal diciendo "Juan ya pagó".
 */
export async function verifyWebhook(headers: Headers, rawBody: string): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw new Error("Falta PAYPAL_WEBHOOK_ID en .env.local");
  const result = await call<{ verification_status: string }>("POST", "/v1/notifications/verify-webhook-signature", {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
    webhook_id: webhookId,
    webhook_event: JSON.parse(rawBody),
  });
  return result.verification_status === "SUCCESS";
}

/** Eventos que escuchamos y a qué evento de la máquina de estados corresponden. */
export const WEBHOOK_EVENTS = {
  "PAYMENT.AUTHORIZATION.CREATED": "AUTHORIZED",
  "PAYMENT.AUTHORIZATION.VOIDED": "AUTHORIZATION_VOIDED",
  "PAYMENT.CAPTURE.COMPLETED": "CAPTURED",
  "PAYMENT.CAPTURE.DENIED": "CAPTURE_FAILED",
} as const;
