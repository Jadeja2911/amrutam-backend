import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import router from "./routes";
// @ts-expect-error The booking router is intentionally a CommonJS module
import bookingRoutes from "./routes/bookingRoutes.js";
// @ts-expect-error The auth router is intentionally a CommonJS module
import authRoutes from "./routes/authRoutes.js";
// @ts-expect-error The availability router is intentionally a CommonJS module
import availabilityRoutes from "./routes/availabilityRoutes.js";
// @ts-expect-error The consultation router is intentionally a CommonJS module
import consultationRoutes from "./routes/consultationRoutes.js";
// @ts-expect-error The search router is intentionally a CommonJS module
import searchRoutes from "./routes/searchRoutes.js";
// @ts-expect-error The analytics router is intentionally a CommonJS module
import analyticsRoutes from "./routes/analyticsRoutes.js";
// @ts-expect-error The observability middleware is intentionally a CommonJS module
import { requestLogger, metricsHandler } from "./middleware/observability.js";
import rateLimit from "express-rate-limit";

const app: Express = express();

app.use(helmet());
app.use(cors());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

const bookingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many booking requests, please slow down." },
});

// Mount at the root for the requested /health endpoint and
// the workspace's existing API service path.
app.use(router);
app.use("/api", router);
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/bookings", bookingLimiter, bookingRoutes);
app.use("/api/availability", availabilityRoutes);
app.use("/api/consultations", consultationRoutes);
app.use("/api/doctors", searchRoutes);
app.use("/api/admin", analyticsRoutes);
app.get("/metrics", metricsHandler);

export default app;
