import type { Engine } from "../harness/engines";
import { writeFixture } from "../harness/fixture";
import type { V1 } from "../harness/v1";
import { exportBundle, seedSession } from "../v1import/capture";

const PASS = "correct horse battery";
/** 12 October 2026, 09:30 UTC, as in the v1import capture. */
const CLOCK_MS = Date.UTC(2026, 9, 12, 9, 30);

type Locked = { app: string; v: number; locked: boolean; enc: { alg: string; kdf: string; iter: number; salt: string; iv: string; z: number; aad: string }; exported: string; ct: string };

/**
 * bkEncrypt (v1 4024) draws a salt and an IV from crypto.getRandomValues and stamps `exported` from the clock, so two runs never agree. For --check to be able to say "same",
 * the page gets a generator seeded with a constant (a linear congruential one; salt and IV are bytes, the quality does not matter) and a clock that reads one instant.
 * Everything else is v1's: the key derivation (600,000 rounds), the AES-GCM call and the bundle it returns.
 */
function pinRandomAndClock(v1: V1): void {
  v1.window.eval(`(function () {
    const real = window.crypto;
    let x = 20261012;
    window.crypto = {
      subtle: real.subtle,
      getRandomValues(a) { for (let i = 0; i < a.length; i++) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; a[i] = x >>> 24; } return a; },
    };
    const T = ${CLOCK_MS};
    class FixedDate extends Date {
      constructor(...a) { if (a.length === 0) super(T); else super(...a); }
      static now() { return T; }
    }
    window.Date = FixedDate;
  })()`);
}

/** bkEncrypt, then v1's own bkDecrypt (4032) on what it returned, so the recorded bundle is known to open under v1 itself. */
async function lock(v1: V1, plain: string, z: 0 | 1): Promise<{ locked: Locked; plain: string; pass: string; node: string }> {
  const locked = await v1.call<Promise<Locked>>("bkEncrypt", plain, PASS);
  if (locked.enc.z !== z) throw new Error(`v1locked: bkEncrypt chose z = ${locked.enc.z}, wanted ${z}`);
  if (locked.enc.iter !== 600000) throw new Error(`v1locked: iter is ${locked.enc.iter}, v1 ships 600000`);
  const back = await v1.call<Promise<string>>("bkDecrypt", locked, PASS);
  if (back !== plain) throw new Error("v1locked: v1's bkDecrypt does not return the plain text it was given");
  return { locked, plain, pass: PASS, node: process.version };
}

/**
 * Two locked backups made by v1's bkEncrypt over the same plain bundle backupExportLocked (4062-4067) would write for the session of the v1import capture: one compressed (z = 1),
 * one not (z = 0). The browser v1 ships for has CompressionStream; jsdom has neither it nor the Response that bkStream (4019) reads the result through, so for z = 1 the capture
 * installs Node's CompressionStream, DecompressionStream and Response on the window, and for z = 0 it sets CompressionStream to undefined (bkEncrypt then skips compression, 4026).
 * Without Response, bkEncrypt would fall back to z = 0 silently, which is why the capture checks `enc.z`.
 * The ciphertext of the z = 1 bundle also depends on Node's zlib, so each file records the Node it was made on (`node`, beside `locked`, which stays exactly what bkEncrypt returned):
 * a Node upgrade makes --check say "differs" at $.node, with v1 unchanged, and the test opens the committed file either way.
 */
export const v1locked: Engine = {
  name: "v1locked",
  async capture(v1, { check }) {
    seedSession(v1);
    pinRandomAndClock(v1);
    const plain = JSON.stringify(exportBundle(v1));
    v1.window.CompressionStream = globalThis.CompressionStream;
    v1.window.DecompressionStream = globalThis.DecompressionStream;
    v1.window.Response = globalThis.Response;
    const gzip = await lock(v1, plain, 1);
    v1.window.CompressionStream = undefined;
    const uncompressed = await lock(v1, plain, 0);
    return [writeFixture("v1locked", "locked-gzip", gzip, v1, check), writeFixture("v1locked", "locked-plain", uncompressed, v1, check)];
  },
};
