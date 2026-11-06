import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { TableRoute } from "./route-client";

export const metadata: Metadata = {
  title: "Join the table — Quorum",
  robots: { index: false, follow: false },
};

export default function TablePage({ params }: PageProps<"/t/[code]">) {
  return (
    <AppShell>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-3xl bg-paper-2" />}>
        <TableRoute params={params} />
      </Suspense>
    </AppShell>
  );
}
