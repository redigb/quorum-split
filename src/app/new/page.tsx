import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { NewBill } from "@/components/app/NewBill";

export const metadata: Metadata = { title: "Split a bill — Quorum" };

export default function NewPage() {
  return (
    <AppShell>
      <NewBill />
    </AppShell>
  );
}
