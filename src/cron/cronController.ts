import crypto from "crypto";
import { Request, Response } from "express";
import { runFantasyCron } from "./fantasyCronController";
import { runPredictionCron } from "./predictionCronController";
import { runBestPlayersCron } from "./bestPlayersCronController";
import { runMarketLockCron } from "./marketLockCronController";
import { runDailyGamesCron } from "./dailyGamesCronController";

export const runAllCrons = async (req: Request, res: Response) => {
    // Solo POST
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const cronKeyHeader = req.headers["x-cron-key"];
    const secret = process.env.CRON_SECRET || "";

    if (!cronKeyHeader || typeof cronKeyHeader !== "string" || !secret) {
        console.warn("❌ Intento de cron sin key o sin secret configurado", {
            ip: req.ip,
            ua: req.headers["user-agent"],
        });
        return res.status(401).json({ error: "Unauthorized" });
    }

    // Comparación segura (timing-safe)
    const headerBuf = Buffer.from(cronKeyHeader);
    const secretBuf = Buffer.from(secret);

    let authorized = false;
    if (headerBuf.length === secretBuf.length) {
        authorized = crypto.timingSafeEqual(headerBuf, secretBuf);
    }

    if (!authorized) {
        console.warn("❌ Cron key inválida", {
            ip: req.ip,
            ua: req.headers["user-agent"],
        });
        return res.status(401).json({ error: "Unauthorized" });
    }

    try {
        // Si querés que un cron que falle no tire todo, podés usar Promise.allSettled.
        const dailyGames = await runDailyGamesCron();
        const fantasyResult = await runFantasyCron();
        const predictionResult = await runPredictionCron();
        const bestPlayersResult = await runBestPlayersCron();
        const marketLockResult = await runMarketLockCron();

        return res.json({
            message: "Todos los crons ejecutados correctamente",
            dailyGames,
            fantasy: fantasyResult,
            predictions: predictionResult,
            bestPlayers: bestPlayersResult,
            marketLock: marketLockResult,
        });

    } catch (err) {
        console.error("Error ejecutando crons:", err);
        return res.status(500).json({ error: "Error ejecutando crons" });
    }
};
