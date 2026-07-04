import { Router } from "express";
import type { Request } from "express";
import { createSessionToken, signedState, verifySessionToken, verifySignedState } from "../lib/auth";
import { rateLimit } from "../lib/rateLimit";

const router = Router();

const XAMAN_AUTHORIZE_URL = process.env["XAMAN_AUTHORIZE_URL"] || "https://oauth2.xumm.app/auth";
const XAMAN_TOKEN_URL = process.env["XAMAN_TOKEN_URL"] || "https://oauth2.xumm.app/token";
const XAMAN_USERINFO_URL = process.env["XAMAN_USERINFO_URL"] || "https://oauth2.xumm.app/userinfo";

function publicBaseUrl(req: Request): string {
  return process.env["PUBLIC_API_BASE_URL"] || `${req.protocol}://${req.get("host")}`;
}

function sanitizeReturnTo(value: unknown): string {
  const text = typeof value === "string" ? value : "/";
  try {
    const url = new URL(text, "http://localhost");
    return `${url.pathname}${url.search}${url.hash}`.startsWith("//") ? "/" : text;
  } catch {
    return "/";
  }
}

router.get("/auth/me", (req, res) => {
  const header = req.header("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : req.cookies?.["xrpl_flow_session"];
  res.json({ user: verifySessionToken(token) });
});

router.get("/auth/xaman/start", rateLimit({ keyPrefix: "xaman-start", windowMs: 60_000, max: 20 }), (req, res) => {
  const clientId = process.env["XAMAN_CLIENT_ID"];
  if (!clientId) {
    res.status(501).json({ error: "Xaman OAuth is not configured. Set XAMAN_CLIENT_ID and XAMAN_CLIENT_SECRET." });
    return;
  }
  const redirectUri = `${publicBaseUrl(req)}/api/auth/xaman/callback`;
  const state = signedState({ returnTo: sanitizeReturnTo(req.query["returnTo"]) });
  const url = new URL(XAMAN_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "openid profile");
  url.searchParams.set("state", state);
  res.json({ authorizationUrl: url.toString() });
});

router.get("/auth/xaman/callback", rateLimit({ keyPrefix: "xaman-callback", windowMs: 60_000, max: 30 }), async (req, res) => {
  const clientId = process.env["XAMAN_CLIENT_ID"];
  const clientSecret = process.env["XAMAN_CLIENT_SECRET"];
  const code = typeof req.query["code"] === "string" ? req.query["code"] : "";
  const state = verifySignedState<{ returnTo?: string }>(typeof req.query["state"] === "string" ? req.query["state"] : undefined);
  if (!clientId || !clientSecret || !code || !state) {
    res.status(400).send("Invalid Xaman OAuth callback.");
    return;
  }

  const redirectUri = `${publicBaseUrl(req)}/api/auth/xaman/callback`;
  const tokenResponse = await fetch(XAMAN_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!tokenResponse.ok) {
    res.status(502).send("Xaman token exchange failed.");
    return;
  }
  const tokenJson = await tokenResponse.json() as { access_token?: string };
  if (!tokenJson.access_token) {
    res.status(502).send("Xaman did not return an access token.");
    return;
  }
  const userResponse = await fetch(XAMAN_USERINFO_URL, {
    headers: { authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!userResponse.ok) {
    res.status(502).send("Xaman userinfo request failed.");
    return;
  }
  const userInfo = await userResponse.json() as Record<string, unknown>;
  const address = String(userInfo["account"] || userInfo["sub"] || "");
  if (!address) {
    res.status(502).send("Xaman profile did not include an account address.");
    return;
  }
  const session = createSessionToken({ address, displayName: String(userInfo["name"] || address) });
  res.cookie("xrpl_flow_session", session, { httpOnly: true, sameSite: "lax", secure: process.env["NODE_ENV"] === "production", maxAge: 7 * 24 * 60 * 60 * 1000 });
  const returnTo = sanitizeReturnTo(state.returnTo || "/");
  const joiner = returnTo.includes("?") ? "&" : "?";
  res.redirect(`${returnTo}${joiner}xrplFlowSession=${encodeURIComponent(session)}`);
});

router.post("/auth/xaman/dev-session", rateLimit({ keyPrefix: "xaman-dev", windowMs: 60_000, max: 10 }), (req, res) => {
  if (process.env["NODE_ENV"] === "production") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const address = typeof req.body?.address === "string" ? req.body.address.trim() : "";
  if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address)) {
    res.status(400).json({ error: "A classic XRPL address is required for dev sign-in." });
    return;
  }
  const token = createSessionToken({ address });
  res.json({ token, user: { address } });
});

export default router;
