import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { TrueyyClient, type SessionRole } from "@trueyy/web-core";

export interface TrueyyTheme {
  primary?: string;
  radius?: string;
}

export interface TrueyyProviderProps {
  token: string;
  role?: SessionRole;
  baseUrl?: string;
  theme?: TrueyyTheme;
  onTokenExpiring?: () => Promise<string>;
  children: ReactNode;
}

interface Ctx {
  client: TrueyyClient;
  role: SessionRole;
  theme: TrueyyTheme;
}

const TrueyyContext = createContext<Ctx | null>(null);

export function TrueyyProvider({
  token,
  role,
  baseUrl,
  theme,
  onTokenExpiring,
  children,
}: TrueyyProviderProps) {
  const clientRef = useRef<TrueyyClient | null>(null);

  // Decode role from JWT aud claim if not provided. Browser-side decode
  // (no signature check — server enforces).
  const resolvedRole: SessionRole = useMemo(() => {
    if (role) return role;
    try {
      const parts = token.split(".");
      const payload = JSON.parse(atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/")));
      const aud = payload?.aud as SessionRole | undefined;
      if (aud === "candidate" || aud === "interviewer" || aud === "helper") {
        return aud;
      }
    } catch {
      /* ignore */
    }
    return "interviewer";
  }, [role, token]);

  // Lazily create the client during the first render so the context is
  // available synchronously — children (e.g. <TrueyyMonitor>) call
  // useTrueyyClient on mount, before any effect has run. Connect/disconnect
  // lifecycle is handled by the effect below.
  if (clientRef.current === null) {
    clientRef.current = new TrueyyClient({
      token,
      role: resolvedRole,
      ...(baseUrl !== undefined ? { baseUrl } : {}),
      ...(onTokenExpiring ? { onTokenExpiring } : {}),
    });
  }
  const client = clientRef.current;

  useEffect(() => {
    client.connect();
    return () => client.disconnect();
  }, [client]);

  const styleVars = useMemo<React.CSSProperties>(() => {
    const s: React.CSSProperties & Record<string, string> = {};
    if (theme?.primary) s["--trueyy-primary"] = theme.primary;
    if (theme?.radius) s["--trueyy-radius"] = theme.radius;
    return s;
  }, [theme?.primary, theme?.radius]);

  const ctxValue = useMemo<Ctx>(
    () => ({ client, role: resolvedRole, theme: theme ?? {} }),
    [client, resolvedRole, theme],
  );

  return (
    <div className="trueyy-root" style={styleVars}>
      <TrueyyContext.Provider value={ctxValue}>{children}</TrueyyContext.Provider>
    </div>
  );
}

export function useTrueyyContext(): Ctx {
  const c = useContext(TrueyyContext);
  if (!c) throw new Error("useTrueyyContext: must be inside <TrueyyProvider>");
  return c;
}

export function useTrueyyClient(): TrueyyClient {
  return useTrueyyContext().client;
}
