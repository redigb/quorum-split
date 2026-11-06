"use client";

import { use } from "react";
import { Participant } from "@/components/app/Participant";

export function ParticipantRoute({ params }: { params: Promise<{ code: string; token: string }> }) {
  const { code, token } = use(params);
  return <Participant code={code} token={token} />;
}
