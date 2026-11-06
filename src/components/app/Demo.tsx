"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { saveMyToken, saveRoom } from "@/components/app/my-rooms";
import { Button } from "@/components/ui/Button";

/** Arma una mesa de ejemplo (amigos simulados) y lleva a quien prueba directo a pagar su parte. */
export function Demo() {
  const router = useRouter();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  const start = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/demo", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (!res.ok) throw new Error();
      const d = (await res.json()) as { code: string; hostUrl: string; myToken: string; tablePath: string };
      saveMyToken(d.code, d.myToken);
      saveRoom({ code: d.code, hostPath: d.hostUrl.replace(/^https?:\/\/[^/]+/, ""), merchant: "Trattoria Quorum (demo)", createdAt: Date.now() });
      router.replace(d.tablePath);
    } catch {
      setFailed(true);
    }
  }, [router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void start();
  }, [start]);

  return (
    <section>
      <p className="font-mono text-[11px] uppercase tracking-wide text-muted">Demo</p>
      <h1 className="display mt-2 text-5xl sm:text-6xl">{failed ? "Couldn't set it up." : "Setting the table…"}</h1>
      <p className="mt-4 text-[15px] leading-relaxed text-muted">
        {failed
          ? "Something went wrong creating the demo. Try again in a moment."
          : "We're seating three friends and splitting a dinner bill. You'll be the last one to pay."}
      </p>
      {failed ? (
        <Button className="mt-8" onClick={() => void start()}>
          Try again
        </Button>
      ) : (
        <div className="mt-8 h-2 w-40 animate-pulse rounded-full bg-paper-3" aria-hidden />
      )}
    </section>
  );
}
