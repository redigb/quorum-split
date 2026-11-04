# 01 · Producto

## El nombre: **Quorum**

Un *quórum* es el mínimo de miembros que deben estar presentes para que una decisión sea válida.
En nuestra app **el pago solo se ejecuta cuando el grupo completo confirmó**: es literalmente
un quórum aplicado al dinero. El nombre cuenta la mecánica central del producto.

- **Tagline:** *Nobody pays until everybody pays.*
- Corto, se pronuncia igual en inglés y español, funciona en Devpost y en un video.
- Alternativas consideradas: *Tably*, *Kitty* (el "pozo" de dinero en inglés), *Allsettled*.
- Antes de usarlo fuera de la hackathon: revisar marcas y dominios (existen empresas llamadas Quorum).

## El problema

Las pasarelas de pago son **1 pagador → 1 receptor**. El consumo real es grupal:

| Dolor | Qué pasa hoy |
|---|---|
| Datos caóticos | La cuenta es una foto arrugada o 15 mensajes de WhatsApp |
| Matemática injusta | Dividir entre N ignora quién pidió el plato de $50 y quién el de $10. Impuesto y propina deberían ser proporcionales |
| Riesgo del organizador | Alguien paga todo y se vuelve cobrador de sus amigos |
| El "perro muerto" | Alguien promete pagar y desaparece |
| Disputas | "Yo no tomé esa cerveza" y nadie sabe quién dice la verdad |

## La propuesta

1. **Foto o voz → cuenta estructurada** (IA).
2. **Cálculo exacto y justo** (motor determinista, no IA).
3. **Sala de cobro compartible** por WhatsApp, sin registro.
4. **Cobro garantizado**: cada uno *autoriza*; se cobra solo al llegar al 100%.
5. **Reclamos con consenso**: nadie puede pasarle su deuda a otro sin que el otro acepte.
6. **Auditoría inmutable** de cada movimiento.

## ¿Por qué PayPal y no Yape?

Siendo honestos: **en una cena local en Perú, Yape gana** (0% comisión, todos lo tienen).
Quorum se enfoca donde Yape no llega:

- **Grupos que cruzan fronteras:** viajes, amigos en distintos países, turistas.
- **Montos grandes** donde importa que nadie se escape (la autorización garantiza el cobro).
- **Moneda internacional** (USD/EUR). *Nota: PayPal no soporta PEN; usamos USD.*

Pitch: **"Split payments for groups that cross borders."**

## Alcance para la hackathon

**Sí entra (ruta crítica):**
foto/voz → ítems → asignación → cálculo → sala → autorizaciones → cobro → auditoría.

**Si sobra tiempo:**
chat de reclamos con IA, payout al beneficiario.

**No entra:**
integración nativa con WhatsApp, validación GPS/EXIF, escrow B2B multi-proveedor, SDK embebible tipo Clerk.
Se mencionan en el video como *roadmap*.

## Premios a los que apunta

- Comercio agéntico / PayPal + IA: la IA convierte lenguaje natural en órdenes de PayPal con guardrails.
- AG Grid: la vista de auditoría del libro mayor.
- *(Verificar en Devpost las reglas y categorías exactas antes de enviar.)*
