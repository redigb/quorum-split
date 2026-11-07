# 10 · Plan y estado

Entrega: **12 de noviembre de 2026**. Hoy: 31 de octubre.

## Estado (6 nov)

| Módulo | Estado | Notas |
|---|---|---|
| Núcleo puro (`core/`: dinero, split, máquina de sala, claims) | ✅ | Testeado (70 tests) |
| IA (Groq: foto, dictado, voz, asignación) | ✅ | Validada con Zod; voz con idioma EN/ES |
| PayPal Orders v2 authorize→capture, void, webhooks firmados | ✅ | Probado en Sandbox hasta SETTLED; webhooks procesados en prod |
| Supabase (migraciones 0001–0003) y repositorios | ✅ | Acceso solo con service role; RLS cerrada |
| API routes | ✅ | Salas, mesa, voz, demo, lucky, ledger, archivo, webhook |
| Landing (GSAP) y app (mesa, anfitrión, demo, salas) | ✅ | PWA instalable |
| Modo demo (Split fair / Feeling lucky) | ✅ | Amigos simulados; el sorteo se amaña al invitado y se avisa |
| Feeling lucky con prueba verificable (SHA-256) | ✅ | |
| Voz: dictar la cuenta y asignar ítems | ✅ | |
| Libro mayor en AG Grid | ✅ | |
| Límite de peticiones en foto y voz | ✅ | En memoria por instancia (mejor esfuerzo) |
| Deploy Vercel + webhook registrado | ✅ | quorum-split.vercel.app |
| LICENSE (MIT) y README en inglés | ✅ | Falta rellenar el comprador Sandbox |
| Video + Devpost | ⏳ | |

## Modos y extras (referencia)

- **Demo** (`/demo`): crea una sala con tres amigos simulados; confirman solos (`sim_confirm_at`) y se capturan sin pasar por PayPal; quien prueba paga de verdad en Sandbox.
- **Feeling lucky**: todos dicen "I'm in", el servidor sortea con semilla criptográfica y publica `draw_proof`. En el demo cae siempre en el invitado (`rigged`).
- **Voz**: `POST /api/receipts/voice` (dictar la cuenta) y `POST /api/rooms/[code]/voice` (asignar ítems). Whisper recibe el idioma elegido (EN por defecto).
- **Archivo**: `rooms.archived_at`; la lista de salas tiene búsqueda, filtros y paginación.
- **Estado compartido**: sondeo cada 3 s y efectos perezosos en `guard()`. Supabase Realtime queda como mejora futura.

## Checklist de entrega

- [x] LICENSE (MIT) añadido; falta hacer público el repo y comprobar que GitHub lo detecta
- [x] README con instrucciones para correrlo
- [x] Demo desplegada funcionando con Sandbox
- [ ] Video ≤ 3 min
- [ ] Revisar requisitos exactos en la página de Devpost
