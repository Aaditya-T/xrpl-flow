import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
const allowedOrigins = (process.env["CORS_ORIGIN"] || process.env["PUBLIC_APP_ORIGIN"] || "")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, origin || true);
      return;
    }
    callback(new Error("Origin is not allowed by CORS."));
  },
}));
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "64kb" }));

app.use("/api", router);

export default app;
