/** A stand-in for the BroadcastChannel the writing window and the pop-out share (lib/popout/channel.ts): it records what is posted and delivers what a test sends. */
export class FakeChannel {
  sent: unknown[] = [];
  throwOnPost = false;
  private listeners = new Set<(ev: MessageEvent) => void>();
  postMessage(m: unknown): void {
    if (this.throwOnPost) throw new DOMException("closed", "InvalidStateError");
    this.sent.push(m);
  }
  addEventListener(_type: "message", l: (ev: MessageEvent) => void): void { this.listeners.add(l); }
  removeEventListener(_type: "message", l: (ev: MessageEvent) => void): void { this.listeners.delete(l); }
  /** A message from the other window. */
  deliver(data: unknown): void { for (const l of [...this.listeners]) l({ data } as MessageEvent); }
  get listening(): number { return this.listeners.size; }
}
