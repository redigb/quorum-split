# 04 · Motor de cálculo

Código: `src/core/money.ts`, `src/core/split.ts` · Tests: `*.test.ts`

## Reglas no negociables

1. **Todo el dinero es entero en centavos.** `$12.50` es `1250`. Nunca floats (`0.1 + 0.2 !== 0.3`).
2. **La IA no calcula.** Solo dice qué ítem es de quién. Los montos los calcula este motor.
3. **Ley de conservación:** `suma de las partes === subtotal + cargos === total impreso`.
   Si falta o sobra 1 centavo, se lanza `SplitError` y **no se crea ninguna orden en PayPal**.
4. **Determinismo:** la misma entrada da siempre la misma salida, sin importar el orden.

## Paso 1 · Repartir cada ítem

Cada ítem tiene asignados con un **peso**:

| Caso | Asignación | Resultado ($15.00) |
|---|---|---|
| Solo Juan | juan:1 | Juan 15.00 |
| A medias | ana:1, juan:1 | 7.50 / 7.50 |
| Entre 3 | ana:1, carlos:1, juan:1 | 5.00 / 5.00 / 5.00 |
| 2 porciones vs 1 | ana:2, juan:1 | 10.00 / 5.00 |

## Paso 2 · Repartir cargos globales

Impuesto, propina, servicio, delivery, descuentos:

- **`proportional`** (por defecto): según lo que consumió cada uno. Quien pidió más, paga más impuesto.
- **`equal`**: partes iguales (útil para delivery).

## El problema del centavo perdido: "mayor resto"

$1.00 entre 3 = 33.33… Si redondeas cada parte da 0.99. ¿Quién paga el centavo que falta?

`allocate(total, pesos)`:

1. Cada uno recibe la parte entera hacia abajo: `[33, 33, 33]` → faltan 1.
2. Los centavos que faltan van a quien tenía **mayor resto** decimal.
3. Empate → al primero en orden estable (por id).

```
allocate(100, [1,1,1]) → [34, 33, 33]   suma = 100 ✔
allocate(10,  [3,3,3]) → [4, 3, 3]      suma = 10  ✔
```

Hay un test de propiedad que prueba 500 casos aleatorios y verifica que la suma siempre cuadra.

## Ejemplo completo

Cena: Parrilla $50 (Juan), Ensalada $10 (Ana), Nachos $15 (los 3), Cerveza $8 (Carlos),
Impuesto $15, Propina 15% = $12.45.

| | Ítems | Impuesto + propina (proporcional) | Total |
|---|---|---|---|
| Juan | 55.00 | 18.19 | 73.19 |
| Ana | 15.00 | 4.96 | 19.96 |
| Carlos | 13.00 | 4.30 | 17.30 |
| **Total** | **83.00** | **27.45** | **110.45** ✔ |

Estos números están fijados en el test "coincide con el ejemplo de docs" de `split.test.ts`.
Los 2 centavos sobrantes del impuesto fueron a Juan y Carlos (mayor resto).

## Errores posibles (`SplitError.code`)

| Código | Cuándo | Qué muestra la UI |
|---|---|---|
| `UNASSIGNED_ITEM` | Un ítem no tiene dueño | Resaltar el ítem: "¿De quién es esto?" |
| `UNKNOWN_PARTICIPANT` | La IA inventó un participante | Se descarta la propuesta |
| `TOTAL_MISMATCH` | No cuadra con el ticket (`details.differenceCents`) | "Falta $0.50 vs el ticket, revisa los montos" |
| `NEGATIVE_SHARE` | Un descuento deja a alguien en negativo | Reasignar el descuento |
| `INVARIANT_BROKEN` | Bug del motor (no debería pasar nunca) | Bloqueo total |

## Parseo de montos (`toCents`)

Acepta formatos de tickets reales: `"12.50"`, `"12,50"`, `"1,234.56"`, `"1.234,56"`, `"$ 40.00"`, `"S/ 7.90"`.

Regla de ambigüedad: un solo separador seguido de **exactamente 3 dígitos** se toma como **miles**
(`"1.234"` = 1234). Si llega como `number` (12.345), siempre es decimal.

## Cuando cambia un monto con la sala abierta

`changedParticipants(antes, después)` dice a quién le cambió el total. Si esa persona ya había
autorizado en PayPal, su autorización se **anula** y debe volver a confirmar el monto nuevo
(su retención era por el monto viejo).
