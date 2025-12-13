import { Router } from "express";
import { runMarketLockCron } from "../cron/marketLockCronController";

const router = Router();

router.get("/run", async (req, res) => {
    try {
        await runMarketLockCron();
        return res.status(200).json({ message: "Market Lock Cron ejecutado correctamente" });
    } catch (err) {
        console.error("Error ejecutando MarketLockCron desde endpoint:", err);
        return res.status(500).json({ error: "Error ejecutando Market Lock Cron" });
    }
});

export default router;
