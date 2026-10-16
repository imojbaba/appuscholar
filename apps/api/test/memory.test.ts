import { storeContract } from "./store.contract";
import { MemoryStore } from "../src/store/memory";
storeContract("memory", async () => {
  const store = new MemoryStore();
  const users = { a: "u-" + crypto.randomUUID(), b: "u-" + crypto.randomUUID() };
  // The drizzle contract env inserts both users rows up front; mirror that here.
  await store.ensureUser(users.a, `${users.a}@contract.local`);
  await store.ensureUser(users.b, `${users.b}@contract.local`);
  return { store, users };
});
