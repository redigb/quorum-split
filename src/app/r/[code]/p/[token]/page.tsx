import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { ParticipantRoute } from "./route-client";

// El enlace contiene un token privado: que no se indexe ni se mande como referrer.
export const metadata: Metadata = {
  title: "Your share — Quorum",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ParticipantPage({ params }: PageProps<"/r/[code]/p/[token]">) {
  return (
    <AppShell>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-3xl bg-paper-2" />}>
        <ParticipantRoute params={params} />
      </Suspense>
    </AppShell>
  );
}
