import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { Rooms } from "@/components/app/Rooms";

export const metadata: Metadata = { title: "Your rooms — Quorum", robots: { index: false } };

export default function RoomsPage() {
  return (
    <AppShell back={{ href: "/new", label: "New bill" }}>
      <Rooms />
    </AppShell>
  );
}
