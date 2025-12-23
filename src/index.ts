import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cron from "node-cron";
import { pool } from "./db";

import { configureSecurity } from "./config/security";
import { auth } from "./middlewares/auth";
import { requireEmailVerified } from "./middlewares/requireEmailVerified";
import { requireCronKey } from "./middlewares/requireCronKey";

import { runDailyGamesCron } from "./cron/dailyGamesCronController";
import { runFantasyCron } from "./cron/fantasyCronController";
import { runPredictionCron } from "./cron/predictionCronController";
import { runBestPlayersCron } from "./cron/bestPlayersCronController";
import { runMarketLockCron } from "./cron/marketLockCronController";
import { runWeeklyDreamTeamCron } from "./cron/dreamTeamCronController";
import { runInjuryScrapingCron } from "./cron/injuryReportCronController";

import nbaRoutes from "./routes/nbaRoutes";
import authRoutes from "./routes/authRoutes";
import fantasyRoutes from "./routes/fantasyRoutes";
import fantasyCronRoutes from "./routes/fantasyCronRoutes";
import fantasyLeaguesRoutes from "./routes/fantasyLeaguesRoutes";
import fantasyTradesRoutes from "./routes/fantasyTradesRoutes";
import leaguesMembershipRoutes from "./routes/leaguesMembershipRoutes";
import notificationRoutes from "./routes/notificationRoutes";
import playerRoutes from "./routes/playerRoutes";
import teamRoutes from "./routes/teamRoutes";
import predictionRoutes from "./routes/predictionRoutes";
import predictionCronRoutes from "./routes/predictionCronRoutes";
import userRoutes from "./routes/usersRoutes";
import cronRoutes from "./routes/cronRoutes";
import favoritesRoutes from "./routes/favoritesRoutes";
import bestPlayersRoutes from "./routes/bestPlayersRoutes";
import bestPlayersCronRoutes from "./routes/bestPlayersCronRoutes";
import marketLockRoutes from "./routes/marketLockRoutes";
import marketLockCronRoutes from "./routes/marketLockCronRoutes";
import dailyGamesCronRoutes from "./routes/dailyGamesCronRoutes";
import dreamTeamCronRoutes from "./routes/dreamTeamCronRoutes";
import gameRoutes from "./routes/gamesRoutes";
import { getInjuryReport } from "./controllers/nbaInjuriesController";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1);
app.use(express.json());

app.use(cors({
    origin: [
        "http://localhost:4200",
        "https://hoopstats.com.ar",
        "https://www.hoopstats.com.ar",
        "https://hoopstats.netlify.app",
        "https://localhost",
    ],
    credentials: false,
    allowedHeaders: ["Content-Type", "Authorization", "x-cron-key"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
}));

configureSecurity(app);

// --- SECCIÓN DE CRONS ---

// 1. CRON DE LESIONES (Triple ejecución: 07, 13 y 17 hs AR)
cron.schedule(
    "0 7,13,17 * * *",
    async () => {
        const client = await pool.connect();
        try {
            // Usamos un lock ID diferente (900002) para no interferir con el cron general
            const lock = await client.query("SELECT pg_try_advisory_lock(900002) AS ok");
            if (!lock.rows[0]?.ok) return;

            await runInjuryScrapingCron();
        } catch (err) {
            console.error("[CRON-INJURIES] Error:", err);
        } finally {
            try { await client.query("SELECT pg_advisory_unlock(900002)"); } catch { }
            client.release();
        }
    },
    { timezone: "America/Argentina/Buenos_Aires" }
);

// 2. CRON GENERAL (07:00 AR)
cron.schedule(
    "0 7 * * *",
    async () => {
        const client = await pool.connect();
        try {
            const lock = await client.query("SELECT pg_try_advisory_lock(900001) AS ok");
            if (!lock.rows[0]?.ok) return;

            const nowARG = new Date(
                new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" })
            );
            const dow = nowARG.getDay();

            await runDailyGamesCron();
            await runFantasyCron();
            await runPredictionCron();
            await runBestPlayersCron();
            await runMarketLockCron();

            if (dow === 1) {
                await runWeeklyDreamTeamCron();
            }
        } catch (err) {
            console.error("[CRON] Error crítico:", err);
        } finally {
            try { await client.query("SELECT pg_advisory_unlock(900001)"); } catch { }
            client.release();
        }
    },
    { timezone: "America/Argentina/Buenos_Aires" }
);

// --- RUTAS ---
app.use("/api/nba", nbaRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/fantasy", auth, requireEmailVerified, fantasyRoutes);
app.use("/api/notifications", auth, notificationRoutes);
app.use("/api/fantasy-leagues", auth, requireEmailVerified, fantasyLeaguesRoutes);
app.use("/api/fantasy-trades", auth, requireEmailVerified, fantasyTradesRoutes);
app.use("/api/fantasy-league-membership", auth, requireEmailVerified, leaguesMembershipRoutes);
app.use("/api/players", playerRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/predictions", auth, requireEmailVerified, predictionRoutes);
app.use("/api/users", userRoutes);
app.use("/api/favorites", auth, requireEmailVerified, favoritesRoutes);
app.use("/api/best-players", bestPlayersRoutes);
app.use("/api/market-lock", marketLockRoutes);
app.use("/games", gameRoutes);

// Ruta de Lesiones (Lee de la base de datos local)
app.get("/api/injuries", getInjuryReport);

app.use("/api/cron", requireCronKey, cronRoutes);
app.use("/api/fantasy-cron", requireCronKey, fantasyCronRoutes);
app.use("/api/prediction-cron", requireCronKey, predictionCronRoutes);
app.use("/api/best-players-cron", requireCronKey, bestPlayersCronRoutes);
app.use("/api/market-lock-cron", requireCronKey, marketLockCronRoutes);
app.use("/api/daily-games-cron", requireCronKey, dailyGamesCronRoutes);
app.use("/api/dream-team-cron", requireCronKey, dreamTeamCronRoutes);

app.get("/api/test", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
    console.log(`🚀 Backend escuchando en puerto ${PORT}`);

    // --- EJECUCIÓN MANUAL ÚNICA ---
    // Esta línea se ejecuta al arrancar el servidor para llenar la tabla por primera vez.
    // Una vez que veas en la consola "✅ DB: Reporte de lesiones actualizado", puedes borrarla o comentarla.
    //runInjuryScrapingCron();
});