import { Router } from "express";
import { runBestPlayersCron } from "../cron/bestPlayersCronController";

const router = Router();

router.get("/run", async (req, res) => {
    try {
        await runBestPlayersCron();
        return res.status(200).json({ message: "Best Players Cron ejecutado correctamente" });
    } catch (err) {
        console.error("Error ejecutando BestPlayersCron desde endpoint:", err);
        return res.status(500).json({ error: "Error ejecutando Best Players Cron" });
    }
});

export default router;
