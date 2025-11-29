import { runFantasyCron } from "./fantasyCronController";
import { runPredictionCron } from "./predictionCronController";
import { runBestPlayersCron } from "./bestPlayersCronController";
import { runMarketLockCron } from "./marketLockCronController";
import { runDailyGamesCron } from "./dailyGamesCronController";

export const runAllCrons = async (req: any, res: any) => {
    if (req.headers["x-cron-key"] !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    try {
        const dailyGames = await runDailyGamesCron(); 
        const fantasyResult = await runFantasyCron();
        const predictionResult = await runPredictionCron();
        const bestPlayersResult = await runBestPlayersCron(); 
        const marketLockResult = await runMarketLockCron(); 

        return res.json({
            message: "Todos los crons ejecutados correctamente",
            dailyGames,
            //fantasy: fantasyResult,
            //predictions: predictionResult,
            //bestPlayers: bestPlayersResult,
            marketLock: marketLockResult,
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error ejecutando crons" });
    }
};
