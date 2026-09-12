import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import router from "./routes";
// @ts-expect-error The booking router is intentionally a CommonJS JavaScript module.
import bookingRoutes from "./routes/bookingRoutes.js";
// @ts-expect-error The auth router is intentionally a CommonJS JavaScript module.
import authRoutes from "./routes/authRoutes.js";

const app: Express = express();

app.use(helmet());
app.use(cors());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount at the root for the requested /health endpoint and under /api for
// the workspace's existing API service path.
app.use(router);
app.use("/api", router);
app.use("/api/auth", authRoutes);
app.use("/api/bookings", bookingRoutes);

export default app;
