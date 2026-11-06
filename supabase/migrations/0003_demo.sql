-- Modo demo: amigos simulados que "confirman" solos.
-- sim_confirm_at = momento en que el servidor da por autorizada su parte (null = persona real).
alter table participants add column sim_confirm_at timestamptz;

-- Modo "Feeling lucky": si todos aceptan jugar, un sorteo decide quién paga la cuenta entera.
alter table rooms add column mode text not null default 'fair' check (mode in ('fair','lucky'));
alter table rooms add column draw_proof text;                  -- sha256(semilla:participantes): comprobante del sorteo
alter table rooms add column loser_id uuid references participants(id) on delete set null;
alter table participants add column lucky_ok boolean not null default false;  -- aceptó jugar

-- Archivo de salas: la dueña las oculta de su lista sin borrarlas (el libro mayor se conserva).
alter table rooms add column archived_at timestamptz;
