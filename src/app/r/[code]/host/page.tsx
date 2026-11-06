import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { HostRoute } from "./route-client";

// El enlace del anfitrión es su llave: que no se indexe ni viaje como referrer.
export const metadata: Metadata = {
  title: "Your room — Quorum",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function HostPage({ params }: PageProps<"/r/[code]/host">) {
  return (
    <AppShell back={{ href: "/rooms", label: "Your rooms" }}>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-3xl bg-paper-2" />}>
        <HostRoute params={params} />
      </Suspense>
    </AppShell>
  );
}
