import { Router } from "express";
import { runWeeklyDreamTeamCron } from "../cron/dreamTeamCronController";

const router = Router();

// Endpoint para disparar manualmente el proceso del Dream Team Semanal
router.get("/run", async (req, res) => {
    try {
        await runWeeklyDreamTeamCron();
        return res.status(200).json({ 
            message: "Dream Team Semanal procesado" 
        });
    } catch (err) {
        console.error("Error ejecutando DreamTeamCron desde endpoint:", err);
        return res.status(500).json({ error: "Error ejecutando el Dream Team Semanal" });
    }
});

export default router;