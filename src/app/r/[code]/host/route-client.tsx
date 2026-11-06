"use client";

import { use } from "react";
import { Host } from "@/components/app/Host";

export function HostRoute({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  return <Host code={code} />;
}
