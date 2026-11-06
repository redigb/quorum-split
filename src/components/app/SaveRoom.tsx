"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { claimLocalRooms } from "@/components/app/my-rooms";
import { EmailLogin } from "@/components/app/EmailLogin";
import { useSession } from "@/lib/auth-client";

/** Cierra el flujo del anfitrión: con cuenta, la sala queda guardada; sin cuenta, se ofrece el correo (opcional). */
export function SaveRoom() {
  const session = useSession();
  const token = session?.access_token;
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!token) return;
    let off = false;
    void claimLocalRooms(token).then(() => !off && setSaved(true));
    return () => {
      off = true;
    };
  }, [token]);

  if (session === undefined) return null;

  if (session) {
    return (
      <p role="status" className="mt-6 flex items-center gap-2 rounded-2xl bg-paper-2 p-4 text-[15px]">
        <Check aria-hidden className="size-5 shrink-0 text-ok" />
        <span>
          {saved ? "Saved to your account." : "Saving to your account…"}{" "}
          <Link href="/rooms" className="underline underline-offset-4 hover:text-accent">See all your rooms</Link>
        </span>
      </p>
    );
  }

  return (
    <div className="mt-6 rounded-3xl border border-line bg-paper-2 p-5">
      <p className="text-[15px]">
        <span className="font-semibold">Keep this room safe.</span>{" "}
        <span className="text-muted">Save it to your email to follow it from any device and see how much was collected. Optional.</span>
      </p>
      <div className="mt-4">
        <EmailLogin redirectPath="/rooms" cta="Save it" />
      </div>
    </div>
  );
}
