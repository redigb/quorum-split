import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Sin 0/O/1/I para que el código se pueda dictar sin confundirse.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newRoomCode(length = 6): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Token privado del enlace (anfitrión o participante). Solo se guarda su hash. */
export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenMatches(token: string, storedHash: string): boolean {
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
