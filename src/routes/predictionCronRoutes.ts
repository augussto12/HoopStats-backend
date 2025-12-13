import { Router } from "express";
import { runPredictionCron } from "../cron/predictionCronController";

const router = Router();

router.get("/run", async (req, res) => {
    try {
        await runPredictionCron();
        return res.status(200).json({ message: "Prediction Cron ejecutado correctamente" });
    } catch (err) {
        console.error("Error ejecutando PredictionCron desde endpoint:", err);
        return res.status(500).json({ error: "Error ejecutando Prediction Cron" });
    }
});

export default router;
