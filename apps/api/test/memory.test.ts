import { storeContract } from "./store.contract";
import { MemoryStore } from "../src/store/memory";
storeContract("memory", async () => ({
  store: new MemoryStore(),
  users: { a: "u-" + crypto.randomUUID(), b: "u-" + crypto.randomUUID() }
}));
