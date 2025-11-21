import { Router } from "express";
import { runAllCrons } from "../cron/cronController";

const router = Router();

router.post("/run-all", runAllCrons);

export default router;
