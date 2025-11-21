import { runFantasyCron } from "./fantasyCronController";
import { runPredictionCron } from "./predictionCronController";


export const runAllCrons = async (req: any, res: any) => {

    if (req.headers["x-cron-key"] !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    try {
        const fantasyResult = await runFantasyCron();
        const predictionResult = await runPredictionCron();

        return res.json({
            message: "Todos los crons ejecutados correctamente",
            fantasy: fantasyResult,
            predictions: predictionResult,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error ejecutando crons" });
    }
};
