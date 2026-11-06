# 10 · Plan y estado

Entrega: **12 de noviembre de 2026**. Hoy: 31 de octubre.

## Estado

| Módulo | Estado | Notas |
|---|---|---|
| Proyecto Next.js 16 + Tailwind + Vitest | ✅ | `pnpm test` |
| `core/money` (centavos, parseo, reparto) | ✅ | Testeado |
| `core/split` (motor de cálculo) | ✅ | Testeado |
| `core/room-machine` (sala) | ✅ | Testeado |
| `core/claims` (reclamos con consenso) | ✅ | Testeado |
| `server/ai` (Groq + validaciones) | 🟡 | Validaciones testeadas; falta probar con API key real |
| `server/paypal` (Orders v2) | 🟡 | Falta probar contra Sandbox |
| Esquema Supabase | 🟡 | Escrito; falta aplicarlo en un proyecto Supabase |
| `server/db` (repositorios) | ⏳ | |
| API routes | ⏳ | Ver lista en [03-arquitectura](03-arquitectura.md) |
| Landing (GSAP) | 🟡 | `src/components/landing`, ver [09-diseno](09-diseno.md). **Pendiente:** conectar con el flujo real (botones "Split a bill" → `/new`, "Your rooms" → `/rooms`) y mostrar el flujo de uso |
| UI de la app | ⏳ | Dirección en [09-diseno](09-diseno.md) |
| AG Grid auditoría | ⏳ | |
| Deploy Vercel + webhook registrado | ⏳ | |
| Video + Devpost | ⏳ | |

## Calendario

| Fecha | Entregable |
|---|---|
| 1 nov | Credenciales en `.env.local`; probar Groq con 3 tickets reales; probar PayPal Sandbox (crear → autorizar → capturar) con un script |
| 2 nov | Supabase: aplicar migración; `server/db`; deploy inicial en Vercel |
| 3–4 nov | API: extracción, crear sala, asignar, lock |
| 5–6 nov | API: órdenes, authorize, webhook, cron de plazos; Realtime |
| 7–8 nov | UI: las 6 pantallas del flujo |
| 9 nov | AG Grid auditoría; reclamos (si hay tiempo) |
| 10 nov | Pulido, datos de demo, README, LICENSE |
| 11 nov | Video de 3 min (inglés) + Devpost |
| 12 nov | Margen. No planificar trabajo |

## Checklist de entrega

- [ ] Repositorio público con LICENSE
- [ ] README con instrucciones para correrlo
- [ ] Demo desplegada funcionando con Sandbox
- [ ] Video ≤ 3 min
- [ ] Revisar requisitos exactos en la página de Devpost
