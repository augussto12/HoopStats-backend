import { Router } from "express";
import { auth } from "../middlewares/auth";
import { getMarketLock } from "../controllers/marketLockController";

const router = Router();

router.get("/", auth, getMarketLock);

export default router;
