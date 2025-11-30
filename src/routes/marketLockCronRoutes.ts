import { Router } from "express";
import { runMarketLockCronController } from "../controllers/marketLockController";

const router = Router();

// No requiere auth, solo cron secret
router.get("/run", runMarketLockCronController);

export default router;
