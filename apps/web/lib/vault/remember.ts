/* "Remember on this computer" for the vault, as v1's remembered keys: the vault opens on this device without the passphrase.
   Each account gets one IndexedDB record (database "appuscholar", store "appu_vault", key = user id) holding a random AES-GCM
   device key created non-extractable (a CryptoKey is structured-cloneable, so IndexedDB keeps the object, never its bytes)
   and the vault key's raw bytes encrypted under it. Script on the page can use the device key but not read it out, so the
   stored ciphertext alone opens nothing. Forgetting deletes the whole record. */

const DB_NAME = "appuscholar";
const STORE = "appu_vault";
const IV_BYTES = 12;

type Remembered = { deviceKey: CryptoKey; iv: Uint8Array<ArrayBuffer>; ct: ArrayBuffer; passWrapped: string; savedAt: number };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("no-indexeddb")); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Runs one request in its own transaction and resolves when the transaction has committed. */
async function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = op(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function rememberVault(userId: string, passWrapped: string, vkRaw: ArrayBuffer): Promise<void> {
  const deviceKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, deviceKey, vkRaw);
  const rec: Remembered = { deviceKey, iv, ct, passWrapped, savedAt: Date.now() };
  await run("readwrite", (s) => s.put(rec, userId));
}

/** The vault key's raw bytes remembered for this account, or null when there are none or they no longer open. */
export async function readRemembered(userId: string): Promise<ArrayBuffer | null> {
  const rec = (await run("readonly", (s) => s.get(userId))) as Remembered | undefined;
  if (!rec) return null;
  try { return await crypto.subtle.decrypt({ name: "AES-GCM", iv: rec.iv }, rec.deviceKey, rec.ct); } catch { return null; }
}

export async function forgetRemembered(userId: string): Promise<void> {
  await run("readwrite", (s) => s.delete(userId));
}

export async function hasRemembered(userId: string): Promise<boolean> {
  return (await run("readonly", (s) => s.count(userId))) > 0;
}
