"use client";
import { useEffect, useState } from "react";
import { PROVIDERS, type ProviderId } from "@appuscholar/core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

let listener: ((from: ProviderId) => void) | null = null;

/** v1 showRateLimitAlert: names the provider that hit its limit and offers Groq. */
export function showRateLimit(current: ProviderId): void { listener?.(current); }

export function RateLimit({ onSwitchToGroq }: { onSwitchToGroq(): void }) {
  const [from, setFrom] = useState<ProviderId | null>(null);
  useEffect(() => {
    listener = (p) => setFrom((cur) => cur ?? p); // do not stack alerts when several requests fail together
    return () => { listener = null; };
  }, []);
  return (
    <Dialog open={!!from} onOpenChange={(o) => { if (!o) setFrom(null); }}>
      <DialogContent className="max-w-md" data-testid="ratelimit-dialog">
        {from && (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold text-purple-800">⏳ Free AI limit reached</DialogTitle>
              <DialogDescription data-testid="ratelimit-msg">
                {`You have hit the free request limit for ${PROVIDERS[from].name} for right now. Wait a minute, or switch to Groq, which usually allows more requests per minute.`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="primary" data-testid="ratelimit-groq" onClick={() => { setFrom(null); onSwitchToGroq(); }}>Switch to Groq now</Button>
              <Button variant="ghost" data-testid="ratelimit-wait" onClick={() => setFrom(null)}>Wait and try again in a minute</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
