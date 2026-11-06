import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { HostRoute } from "./route-client";
import { PageSkeleton } from "@/components/ui/Skeleton";

// El enlace del anfitrión es su llave: que no se indexe ni viaje como referrer.
export const metadata: Metadata = {
  title: "Your room — Quorum",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function HostPage({ params }: PageProps<"/r/[code]/host">) {
  return (
    <AppShell back={{ href: "/rooms", label: "Your rooms" }}>
      <Suspense fallback={<PageSkeleton />}>
        <HostRoute params={params} />
      </Suspense>
    </AppShell>
  );
}
