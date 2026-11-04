-- Quorum: esquema inicial.
-- Todos los montos en CENTAVOS (bigint). Nunca numeric/float para dinero en la app.
-- Seguridad: RLS activado SIN políticas => el navegador (anon key) no puede leer ni escribir nada.
-- Solo el servidor (service role) accede. El tiempo real va por Supabase Realtime Broadcast.

create extension if not exists pgcrypto;

-- ---------- Salas ----------
create table rooms (
  id                     uuid primary key default gen_random_uuid(),
  code                   text not null unique,              -- código corto para el enlace: /r/K7P2QX
  status                 text not null default 'DRAFT'
                         check (status in ('DRAFT','OPEN','FUNDED','CAPTURING','SETTLED','EXPIRED','CANCELLED','FAILED')),
  currency               char(3) not null default 'USD',
  merchant               text,
  receipt_image_path     text,                              -- Supabase Storage
  printed_total_cents    bigint,
  host_token_hash        text not null,                     -- sha256 del token del enlace de anfitrión
  beneficiary_email      text,                              -- PayPal de quien recibe el dinero (se pide al final)
  deadline_at            timestamptz,                       -- máx. 72h por el "honor period" de PayPal
  shares_version         int not null default 0,            -- sube cada vez que cambian los montos
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- ---------- Participantes ----------
create table participants (
  id                 uuid primary key default gen_random_uuid(),
  room_id            uuid not null references rooms(id) on delete cascade,
  name               text not null,
  is_host            boolean not null default false,
  access_token_hash  text not null,                         -- cada persona tiene su enlace privado
  payment_status     text not null default 'UNPAID'
                     check (payment_status in ('UNPAID','ORDER_CREATED','AUTHORIZED','CAPTURED','VOIDED','FAILED','EXEMPT')),
  share_cents        bigint not null default 0 check (share_cents >= 0),
  push_count         int not null default 0,                -- anti-troll: máx. 2 reclamos PUSH
  created_at         timestamptz not null default now()
);
create index on participants(room_id);

-- ---------- Ítems del ticket ----------
create table items (
  id                uuid primary key default gen_random_uuid(),
  room_id           uuid not null references rooms(id) on delete cascade,
  position          int not null,
  name              text not null,
  quantity          numeric not null default 1,
  line_total_cents  bigint not null                         -- negativo = descuento
);
create index on items(room_id);

create table item_assignments (
  item_id         uuid not null references items(id) on delete cascade,
  participant_id  uuid not null references participants(id) on delete cascade,
  weight          int not null default 1 check (weight > 0),
  primary key (item_id, participant_id)
);

-- ---------- Cargos globales (impuesto, propina, servicio, delivery) ----------
create table charges (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references rooms(id) on delete cascade,
  kind          text not null check (kind in ('tax','tip','service','delivery','other')),
  label         text not null,
  amount_cents  bigint not null,
  split         text not null default 'proportional' check (split in ('proportional','equal'))
);

-- ---------- Reclamos ("eso no es mío") ----------
create table claims (
  id                   uuid primary key default gen_random_uuid(),
  room_id              uuid not null references rooms(id) on delete cascade,
  item_id              uuid not null references items(id) on delete cascade,
  from_participant_id  uuid not null references participants(id),
  to_participant_id    uuid not null references participants(id),
  status               text not null check (status in ('PENDING_ACK','ACCEPTED','ESCALATED','RESOLVED')),
  host_decision        text check (host_decision in ('KEEP','MOVE','SPLIT_ALL')),
  reason               text,
  created_at           timestamptz not null default now(),
  closed_at            timestamptz
);
create index on claims(room_id);

-- ---------- Pagos en PayPal (1 fila por orden; un participante puede tener varias si su monto cambió) ----------
create table paypal_payments (
  id                uuid primary key default gen_random_uuid(),
  room_id           uuid not null references rooms(id) on delete cascade,
  participant_id    uuid not null references participants(id),
  shares_version    int not null,                           -- versión de montos con la que se creó
  order_id          text not null unique,
  authorization_id  text unique,
  capture_id        text unique,
  amount_cents      bigint not null check (amount_cents > 0),
  currency          char(3) not null,
  status            text not null check (status in ('CREATED','AUTHORIZED','CAPTURED','VOIDED','FAILED')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on paypal_payments(room_id);

-- ---------- Libro mayor de eventos (append-only: la auditoría que muestra AG Grid) ----------
create table ledger_events (
  id          bigint generated always as identity primary key,
  room_id     uuid not null references rooms(id) on delete cascade,
  type        text not null,                 -- ROOM_LOCKED, ITEM_REASSIGNED, AUTHORIZED, CAPTURED, CLAIM_OPENED...
  actor       text not null,                 -- participant:<id> | host | ai | paypal | system
  payload     jsonb not null default '{}',   -- antes/después, montos, regla aplicada
  created_at  timestamptz not null default now()
);
create index on ledger_events(room_id, created_at);

create function forbid_ledger_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'ledger_events es solo de escritura (append-only)';
end $$;
create trigger ledger_append_only before update or delete on ledger_events
  for each row execute function forbid_ledger_mutation();

-- ---------- Webhooks recibidos (idempotencia: PayPal puede reenviar el mismo evento) ----------
create table webhook_events (
  id            text primary key,              -- id del evento de PayPal
  event_type    text not null,
  payload       jsonb not null,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz
);

-- ---------- Métricas del embudo (para medir el flujo) ----------
create table analytics_events (
  id          bigint generated always as identity primary key,
  room_id     uuid references rooms(id) on delete set null,
  name        text not null,   -- landing_viewed, receipt_uploaded, room_created, link_opened, paid...
  props       jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

-- ---------- RLS: todo cerrado al navegador ----------
alter table rooms             enable row level security;
alter table participants      enable row level security;
alter table items             enable row level security;
alter table item_assignments  enable row level security;
alter table charges           enable row level security;
alter table claims            enable row level security;
alter table paypal_payments   enable row level security;
alter table ledger_events     enable row level security;
alter table webhook_events    enable row level security;
alter table analytics_events  enable row level security;
