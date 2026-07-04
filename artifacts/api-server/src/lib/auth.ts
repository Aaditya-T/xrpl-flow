import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function sessionSecret(): string {
  return process.env["XRPL_FLOW_SESSION_SECRET"] || "dev-only-change-me";
}

export type MarketplaceUser = {
  address: string;
  displayName?: string;
};

export function createSessionToken(user: MarketplaceUser): string {
  const payload = {
    sub: user.address,
    name: user.displayName || user.address,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", sessionSecret()).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string | undefined): MarketplaceUser | null {
  if (!token || !token.includes(".")) return null;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;
  const expected = crypto.createHmac("sha256", sessionSecret()).update(encodedPayload).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as { sub?: string; name?: string; exp?: number };
    if (!payload.sub || !payload.exp || Date.now() > payload.exp) return null;
    return { address: payload.sub, displayName: payload.name };
  } catch {
    return null;
  }
}

export function currentUser(req: Request): MarketplaceUser | null {
  const header = req.header("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : req.cookies?.["xrpl_flow_session"];
  return verifySessionToken(token);
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  res.locals["user"] = user;
  next();
}

export function signedState(payload: Record<string, unknown>): string {
  const encodedPayload = base64url(JSON.stringify({ ...payload, iat: Date.now() }));
  const signature = crypto.createHmac("sha256", sessionSecret()).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifySignedState<T extends Record<string, unknown>>(state: string | undefined, ttlMs = 10 * 60 * 1000): T | null {
  if (!state || !state.includes(".")) return null;
  const [encodedPayload, signature] = state.split(".");
  if (!encodedPayload || !signature) return null;
  const expected = crypto.createHmac("sha256", sessionSecret()).update(encodedPayload).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as T & { iat?: number };
    if (!payload.iat || Date.now() - payload.iat > ttlMs) return null;
    return payload;
  } catch {
    return null;
  }
}
