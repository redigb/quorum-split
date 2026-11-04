/**
 * Dinero en CENTAVOS ENTEROS. Nunca usamos floats para montos.
 * 0.1 + 0.2 !== 0.3 en JavaScript: un float en un sistema de pagos es un bug esperando a pasar.
 */

export type Cents = number;

/** Monedas que PayPal acepta y que tienen 2 decimales. (PEN NO está soportado por PayPal.) */
export const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "MXN", "BRL"] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(c: string): c is Currency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(c);
}

export function assertCents(value: number, label = "amount"): asserts value is Cents {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} debe ser un entero de centavos, recibido: ${value}`);
  }
}

/**
 * Convierte un monto decimal (string o number, como lo devuelve la IA u OCR) a centavos.
 * Parsea el texto en vez de multiplicar por 100 para no arrastrar errores de float.
 *   "12.5" -> 1250, "1,234.56" -> 123456, 12.345 -> 1235 (redondeo half-up)
 */
export function toCents(input: string | number): Cents {
  const raw = typeof input === "number" ? input.toFixed(6) : input;
  const cleaned = raw.trim().replace(/[^\d.,-]/g, "");
  if (cleaned === "" || cleaned === "-") throw new Error(`Monto inválido: "${input}"`);

  const normalized = normalizeSeparators(cleaned);

  const match = /^(-)?(\d*)(?:\.(\d*))?$/.exec(normalized);
  if (!match) throw new Error(`Monto inválido: "${input}"`);
  const [, sign, intPart = "", fracPart = ""] = match;

  const whole = Number(intPart || "0");
  const frac2 = Number((fracPart + "00").slice(0, 2));
  const roundUp = Number(fracPart[2] ?? "0") >= 5 ? 1 : 0;
  const cents = whole * 100 + frac2 + roundUp;
  assertCents(cents);
  return sign ? -cents : cents;
}

/**
 * Decide qué separador es el decimal:
 *  - "1,234.56" / "1.234,56": el ÚLTIMO separador que aparece es el decimal.
 *  - Un solo tipo de separador repetido ("1.234.567"): son miles.
 *  - Un solo separador seguido de exactamente 3 dígitos ("1,234"): miles.
 *  - Cualquier otro caso ("12,50", "12.5"): decimal.
 */
function normalizeSeparators(s: string): string {
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    return lastComma > lastDot
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  }
  const sep = lastComma >= 0 ? "," : lastDot >= 0 ? "." : null;
  if (!sep) return s;
  const count = s.split(sep).length - 1;
  const digitsAfter = s.length - s.lastIndexOf(sep) - 1;
  if (count > 1 || digitsAfter === 3) return s.split(sep).join("");
  return sep === "," ? s.replace(",", ".") : s;
}

/** Centavos -> "12.34" (formato exacto que exige la API de PayPal en amount.value). */
export function toPayPalValue(cents: Cents): string {
  assertCents(cents);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function formatMoney(cents: Cents, currency: Currency, locale = "es-PE"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

export function sum(values: readonly Cents[]): Cents {
  return values.reduce((acc, v) => acc + v, 0);
}

/**
 * Reparto por "mayor resto" (Hamilton): divide `total` en partes proporcionales a `weights`
 * garantizando que la suma de las partes sea EXACTAMENTE `total`.
 * Los centavos sobrantes van a quienes tienen mayor resto; en empate, al de menor índice
 * (determinista: la misma entrada siempre da la misma salida).
 *
 *   allocate(100, [1, 1, 1]) -> [34, 33, 33]
 */
export function allocate(total: Cents, weights: readonly number[]): Cents[] {
  assertCents(total, "total");
  if (weights.length === 0) {
    if (total === 0) return [];
    throw new Error("No se puede repartir un monto entre cero participantes");
  }
  if (weights.some((w) => !Number.isSafeInteger(w) || w < 0)) {
    throw new Error("Los pesos deben ser enteros >= 0");
  }

  const weightSum = weights.reduce((a, b) => a + b, 0);
  // Si todos los pesos son 0, repartimos en partes iguales.
  const effective = weightSum === 0 ? weights.map(() => 1) : weights;
  const W = weightSum === 0 ? weights.length : weightSum;

  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);

  const base = effective.map((w) => Math.floor((abs * w) / W));
  const remainders = effective.map((w, i) => ({ i, r: (abs * w) % W }));
  let leftover = abs - sum(base);

  remainders.sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of remainders) {
    if (leftover === 0) break;
    if (effective[i] === 0) continue;
    base[i] += 1;
    leftover -= 1;
  }
  return base.map((v) => v * sign);
}
