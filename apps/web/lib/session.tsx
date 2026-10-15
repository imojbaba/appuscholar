"use client";
import { createContext, useContext } from "react";

/** The signed-in account, provided by the (app) layout together with its server-side sign-out action. */
export type SessionInfo = { email: string; signOutAction: () => Promise<void> };
const Ctx = createContext<SessionInfo>({ email: "", signOutAction: async () => {} });
export const SessionProvider = Ctx.Provider;
export function useSession() { return useContext(Ctx); }
