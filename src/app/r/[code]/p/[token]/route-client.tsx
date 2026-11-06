"use client";

import { use } from "react";
import { Table } from "@/components/app/Table";

/** Enlace personal (de quien el anfitrión sentó a mano): entra a la misma pantalla de la mesa con su token. */
export function ParticipantRoute({ params }: { params: Promise<{ code: string; token: string }> }) {
  const { code, token } = use(params);
  return <Table code={code.toUpperCase()} token={token} />;
}
