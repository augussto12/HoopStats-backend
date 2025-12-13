import { Router } from "express";
import { runFantasyCron } from "../cron/fantasyCronController";

const router = Router();

router.get("/run", async (req, res) => {
    try {
        await runFantasyCron();
        return res.status(200).json({ message: "Fantasy Cron ejecutado correctamente" });
    } catch (err) {
        console.error("Error ejecutando FantasyCron desde endpoint:", err);
        return res.status(500).json({ error: "Error ejecutando Fantasy Cron" });
    }
});

export default router;
