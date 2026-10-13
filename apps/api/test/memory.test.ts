import { storeContract } from "./store.contract";
import { MemoryStore } from "../src/store/memory";
storeContract("memory", async () => new MemoryStore());
