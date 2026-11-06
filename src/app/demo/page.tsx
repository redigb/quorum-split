import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { Demo } from "@/components/app/Demo";

export const metadata: Metadata = {
  title: "Try the demo — Quorum",
  robots: { index: false, follow: false },
};

export default function DemoPage() {
  return (
    <AppShell back={{ href: "/", label: "Home" }}>
      <Demo />
    </AppShell>
  );
}
