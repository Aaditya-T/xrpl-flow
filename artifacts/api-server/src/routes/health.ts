import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { rateLimit } from "../lib/rateLimit";

const router: IRouter = Router();

router.get("/healthz", rateLimit({ keyPrefix: "healthz", windowMs: 60_000, max: 120 }), (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export default router;
