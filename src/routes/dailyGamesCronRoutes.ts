import { Router } from "express";
import { runDailyGamesCron } from "../cron/dailyGamesCronController";

const router = Router();

router.get("/run", async (req, res) => {
    try {
        await runDailyGamesCron();
        return res.status(200).json({ message: "Daily Games Cron ejecutado correctamente" });
    } catch (err) {
        console.error("Error ejecutando DailyGamesCron desde endpoint:", err);
        return res.status(500).json({ error: "Error ejecutando Daily Games Cron" });
    }
});

export default router;
