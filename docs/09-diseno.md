# 09 · Diseño (dirección visual)

> Estado: **landing construida** (`src/app/page.tsx`, `src/components/landing/`). Las pantallas de la app siguen
> la guía "Apple" de más abajo.

> **Decisión (5 nov):** la app usa **el mismo lenguaje visual de la landing** (papel crema, tinta cálida,
> violeta, Bricolage + Plex Mono, botones píldora). Lo de "Apple" de abajo se conserva solo como
> principios de interacción (una acción por pantalla, el monto como protagonista), **no** como paleta.
> **Sin controles nativos del navegador** (`alert`, `confirm`, `<select>`, toasts, etc.): todo propio en
> `src/components/ui` (`Toaster`/`useToast`, `ConfirmProvider`/`useConfirm`, `Select`, `Button`).

## Dos registros, una marca

| | Landing | App (flujo de pago) |
|---|---|---|
| Estilo | **Editorial cálido**: papel térmico, titulares gigantes condensados | **Apple**: silencio visual, una acción por pantalla |
| Fondo | crema `#fbf9ef` + secciones tinta `#171412` | blanco / `#F5F5F7` |
| Lo compartido | violeta `#3d2fa9` como único acento · verde = pagado · ámbar = en espera · montos en IBM Plex Mono tabular · el **anillo de quórum** | |

**Landing — referencia de estilo** (solo estilo; estructura y contenido son nuestros): plantilla Lumière (21st.app).

- Tipos: **Bricolage Grotesque** 800, `wdth 100`, `letter-spacing -0.045em`, `line-height .9` (titulares; gruesa y
  ancha como Youth, no condensada) · **Inter** 500 (texto) · **IBM Plex Mono** (etiquetas `(01) — …`, recibos, libro mayor).
- Fotos: Unsplash (licencia libre) en `public/photos`, registradas con crédito en `components/landing/photos.ts`.
- Secciones y su animación de scroll:
  1. Hero: fotos "tiradas" que se dispersan con el scroll + rastro de fotos/renglones del ticket que sigue al cursor.
  2. Galería: zoom-out fijado (una cena a pantalla completa → grilla de 9 mesas del mundo).
  3. Problema: foto que sigue al cursor por fila (desktop) / miniatura por fila (móvil).
  4. Cómo funciona: recibo fijo que evoluciona por paso.
  5. Casos de uso: scroll horizontal fijado con tarjetas de foto (revelado con máscara + parallax interno).
  6. Garantía: anillo de quórum interactivo · 7. Libro mayor · 8. Cierre: tornado 3D de fotos.
- Las iniciales, la marca y los montos llevan `translate="no"` (el traductor de Chrome convertía "M" en "METRO").
- Animación: **GSAP** (ScrollTrigger, SplitText, `useGSAP`) solo en la landing; `motion` queda para la app.
  Todo respeta `prefers-reduced-motion` (`gsap.matchMedia`). Los montos de la demo salen de `computeSplit`.

---

## App: el lenguaje de Apple

### Referencia: Wallet, Apple Pay, Settings

| Principio | Cómo se aplica en Quorum |
|---|---|
| **Una cosa por pantalla** | Cada paso del flujo es una pantalla con una sola acción principal |
| **El contenido es la interfaz** | El monto es lo más grande de la pantalla; la UI desaparece alrededor |
| **Profundidad sutil** | Tarjetas con fondo translúcido (blur), sombras suaves; nada de bordes duros |
| **Movimiento con propósito** | Animaciones tipo resorte al confirmar un pago o llenarse la barra; nunca decorativas |
| **Silencio visual** | Mucho espacio en blanco; máximo un color de acento |

## Tipografía

- Fuente: **Inter** (alternativa web libre más cercana a SF Pro), o `system-ui` para usar SF en Apple.
- Montos: números tabulares (`font-variant-numeric: tabular-nums`) para que no "bailen" al cambiar.
- Jerarquía: monto 48–64 px semibold · título 22 px · cuerpo 16 px · secundario 13 px gris.

## Color

- Base: blanco / gris muy claro (`#F5F5F7`), texto casi negro (`#1D1D1F`). Modo oscuro: `#000` / `#1C1C1E`.
- **Un solo acento** para acciones y progreso (propuesta: azul profundo o violeta).
- Verde **solo** para "pagado/confirmado"; ámbar para "pendiente/reclamo"; rojo solo para errores.
- El botón de PayPal mantiene su estilo oficial (dorado o negro); el resto de la UI no compite con él.

## Pantallas clave

1. **Inicio:** fondo limpio, título corto ("Split it. Settle it."), un botón grande "Sube tu ticket"
   y debajo, en pequeño, "o escríbelo / dícteselo".
2. **Revisión del ticket:** lista estilo recibo de Apple Wallet, ítems editables con un toque, el total
   impreso vs. el calculado con un check verde cuando coinciden.
3. **Asignación:** avatares circulares de las personas arriba; tocar un ítem y luego avatares.
   Campo de voz/texto flotante abajo.
4. **Sala del anfitrión:** anillo de progreso grande (estilo Activity rings) con "3 de 5 confirmaron",
   lista de personas con su estado.
5. **Enlace del participante:** su nombre, su monto enorme, desglose plegable, botón PayPal y la frase
   "No se te cobra hasta que todos confirmen".
6. **Confirmación:** animación de check + sonido corto + el anillo del grupo avanzando.
7. **Auditoría:** AG Grid con tema claro y minimalista (Quartz), columnas: hora, actor, evento, ítem,
   antes → después, monto, estado PayPal.

## Herramientas sugeridas

- Tailwind 4 + shadcn/ui (componentes base sobrios).
- `motion` (Framer Motion) para animaciones de resorte.
- Iconos: `lucide-react` (trazo fino, similar a SF Symbols).

## Landing: modo "Feeling lucky" y dock

- En "The guarantee" hay un segundo modo: si los 5 aceptan jugar (el anillo se cierra) se sortea con cartas y uno paga todo. El ganador se decide con `crypto.getRandomValues` y se registra un hash sha256 como prueba; PayPal: el perdedor autoriza el total (24 h). Se enmarca como juego entre amigos. Con movimiento reducido se muestra el resultado sin animar.
- `Dock.tsx`: nav lateral con iconos (solo lg+), píldora fija inferior (md+, oculta en hero, demo y cierre) y línea de progreso a la derecha.
