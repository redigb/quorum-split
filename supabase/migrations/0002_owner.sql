-- Cuentas opcionales: una sala se puede "reclamar" con el correo del anfitrión.
-- Crear y compartir una sala sigue sin requerir cuenta; la cuenta da panel "Mis salas" y acceso desde cualquier dispositivo.

alter table rooms add column owner_id uuid references auth.users(id) on delete set null;
create index rooms_owner_idx on rooms(owner_id, created_at desc);
