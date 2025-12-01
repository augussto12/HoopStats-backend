import { Router } from "express";
import { runDailyGamesCron } from "../cron/dailyGamesCronController";

const router = Router();

router.get("/run", runDailyGamesCron);

export default router;
