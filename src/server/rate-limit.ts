/**
 * Límite de peticiones por IP para las rutas que gastan cuota de IA (foto, voz).
 * En memoria y por instancia: en serverless es un freno de mejor esfuerzo contra abuso, no una garantía.
 */
const hits = new Map<string, number[]>();

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

/** Devuelve una respuesta 429 si `request` superó `max` llamadas en `windowMs`; si no, null. */
export function limited(request: Request, bucket: string, max: number, windowMs: number): Response | null {
  const now = Date.now();
  const key = `${bucket}:${clientIp(request)}`;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    const retry = Math.ceil((windowMs - (now - recent[0])) / 1000);
    return Response.json({ error: "rate_limited", retryAfter: retry }, { status: 429, headers: { "Retry-After": String(retry) } });
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  return null;
}
