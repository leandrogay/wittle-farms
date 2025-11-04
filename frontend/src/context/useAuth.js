import { useContext } from "react";
import AuthCtx from "./auth-core";

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (ctx === null) {
    throw new Error("useAuth must be used within <AuthProvider>");
  }
  return ctx;
}
