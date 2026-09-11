import { Router, type IRouter } from "express";
import { getHealth } from "../controllers/health.controller";

const router: IRouter = Router();

router.get("/health", getHealth);
router.get("/healthz", getHealth);

export default router;
