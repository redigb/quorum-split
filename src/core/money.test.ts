import { describe, expect, it } from "vitest";
import { allocate, sum, toCents, toPayPalValue } from "./money";

describe("toCents", () => {
  it.each([
    ["12.5", 1250],
    ["12,50", 1250],
    ["1,234.56", 123456],
    ["1.234,56", 123456],
    ["1,234", 123400],
    ["1.234.567", 123456700],
    ["$ 40.00", 4000],
    ["S/ 7.90", 790],
    ["0.1", 10],
    ["12.345", 1234500], // ambiguo: 1 separador + 3 dígitos = miles (formato LatAm "12.345")
    ["12.3456", 1235], // 4+ decimales = decimal con redondeo
    ["-3.20", -320],
  ])("%s -> %i", (input, expected) => {
    expect(toCents(input)).toBe(expected);
  });

  it("acepta números sin errores de float", () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(12.345)).toBe(1235); // un number siempre es decimal
  });

  it("rechaza basura", () => {
    expect(() => toCents("abc")).toThrow();
  });
});

describe("toPayPalValue", () => {
  it("formatea con 2 decimales exactos", () => {
    expect(toPayPalValue(1250)).toBe("12.50");
    expect(toPayPalValue(5)).toBe("0.05");
    expect(toPayPalValue(100000)).toBe("1000.00");
  });
});

describe("allocate (mayor resto)", () => {
  it("la suma siempre es exacta", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(sum(allocate(100, [1, 1, 1]))).toBe(100);
  });

  it("respeta pesos", () => {
    expect(allocate(900, [2, 1])).toEqual([600, 300]);
  });

  it("es determinista y reparte centavos sobrantes por mayor resto", () => {
    expect(allocate(10, [3, 3, 3])).toEqual([4, 3, 3]);
    expect(allocate(10, [3, 3, 3])).toEqual(allocate(10, [3, 3, 3]));
  });

  it("maneja negativos (descuentos)", () => {
    expect(allocate(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
  });

  it("pesos todos en cero -> partes iguales", () => {
    expect(allocate(10, [0, 0])).toEqual([5, 5]);
  });

  it("no le da centavos a quien tiene peso 0", () => {
    expect(allocate(101, [0, 1, 1])).toEqual([0, 51, 50]);
  });

  it("propiedad: para muchos casos aleatorios la suma cuadra", () => {
    for (let n = 0; n < 500; n++) {
      const total = Math.floor(Math.random() * 1_000_000) - 200_000;
      const weights = Array.from({ length: 1 + Math.floor(Math.random() * 8) }, () => Math.floor(Math.random() * 50));
      expect(sum(allocate(total, weights))).toBe(total);
    }
  });
});
