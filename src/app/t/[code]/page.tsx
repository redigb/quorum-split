import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { TableRoute } from "./route-client";
import { PageSkeleton } from "@/components/ui/Skeleton";

export const metadata: Metadata = {
  title: "Join the table — Quorum",
  robots: { index: false, follow: false },
};

export default function TablePage({ params }: PageProps<"/t/[code]">) {
  return (
    <AppShell>
      <Suspense fallback={<PageSkeleton />}>
        <TableRoute params={params} />
      </Suspense>
    </AppShell>
  );
}
