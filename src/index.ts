import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cron from "node-cron";
import { pool } from "./db";

import { runDailyGamesCron } from "./cron/dailyGamesCronController";
import { runFantasyCron } from "./cron/fantasyCronController";
import { runPredictionCron } from "./cron/predictionCronController";
import { runBestPlayersCron } from "./cron/bestPlayersCronController";
import { runMarketLockCron } from "./cron/marketLockCronController";
import { runWeeklyDreamTeamCron } from "./cron/dreamTeamCronController";

import { auth } from "./middlewares/auth";
import { configureSecurity } from "./config/security";

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
import gameRoutes from "./routes/gamesRoutes"
import nbaRoutes from "./routes/nbaRoutes"
import dreamTeamCronRoutes from "./routes/dreamTeamCronRoutes";
import { requireEmailVerified } from "./middlewares/requireEmailVerified";
import { requireCronKey } from "./middlewares/requireCronKey";

dotenv.config();


// ──────────────────────────────────────────
//                CRON LOCAL (07:00 AR)
// ──────────────────────────────────────────
cron.schedule(
    "0 7 * * *",
    async () => {
        const client = await pool.connect();

        try {
            const lock = await client.query(
                "SELECT pg_try_advisory_lock(900001) AS ok"
            );

            if (!lock.rows[0].ok) {
                console.log("[CRON] Otra instancia ya ejecutó el cron. Skip.");
                return;
            }

            const now = new Date();

            // Obtenemos un string con la fecha/hora actual en ARG
            const argentinaTime = now.toLocaleString("en-US", {
                timeZone: "America/Argentina/Buenos_Aires"
            });

            // Creamos un objeto de fecha basado en ese string para sacar el día real allá
            const dayOfWeek = new Date(argentinaTime).getDay();


            console.log(
                "⏱ [CRON] Ejecutando crons (07:00 AR)...",
                now.toISOString()
            );

            await runDailyGamesCron();
            await runFantasyCron();
            await runPredictionCron();
            await runBestPlayersCron();
            await runMarketLockCron();

            // 3. EJECUTAR DREAM TEAM SOLO LOS LUNES (Day 1)
            if (dayOfWeek === 1) {
                console.log("[CRON] Confirmado Lunes en Argentina: Ejecutando Dream Team...");
                await runWeeklyDreamTeamCron();
            }

            console.log("[CRON] Todos los crons terminaron OK.");
        } catch (err) {
            console.error("[CRON] Error ejecutando crons:", err);
        } finally {
            await client.query("SELECT pg_advisory_unlock(900001)");
            client.release();
            console.log("[CRON] Lock liberado.");
        }
    },
    { timezone: "America/Argentina/Buenos_Aires" }
);



const app = express();

// Railway usa proxy
app.set("trust proxy", 1);

// CORS
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



// Seguridad
configureSecurity(app);

const PORT = process.env.PORT || 3000;

// ──────────────────────────────────────────
//                 RUTAS
// ──────────────────────────────────────────
app.use("/api/nba", nbaRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/fantasy", auth, requireEmailVerified, fantasyRoutes);
app.use("/api/fantasy-cron", requireCronKey, fantasyCronRoutes);
app.use("/api/notifications", auth, notificationRoutes);

app.use("/api/fantasy-leagues", auth, requireEmailVerified, fantasyLeaguesRoutes);
app.use("/api/fantasy-trades", auth, requireEmailVerified, fantasyTradesRoutes);
app.use("/api/fantasy-league-membership", auth, requireEmailVerified, leaguesMembershipRoutes);

app.use("/api/players", playerRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/predictions", auth, requireEmailVerified, predictionRoutes);
app.use("/api/prediction-cron", requireCronKey, predictionCronRoutes);

app.use("/api/users", userRoutes);
app.use("/api/cron", requireCronKey, cronRoutes);
app.use("/api/favorites", auth, requireEmailVerified, favoritesRoutes);
app.use("/api/best-players", bestPlayersRoutes);
app.use("/api/best-players-cron", requireCronKey, bestPlayersCronRoutes);
app.use("/api/dream-team-cron", requireCronKey, dreamTeamCronRoutes);
app.use("/api/market-lock", marketLockRoutes);
app.use("/api/market-lock-cron", requireCronKey, marketLockCronRoutes);
app.use("/api/daily-games-cron", requireCronKey, dailyGamesCronRoutes);
app.use("/games", gameRoutes);
app.get("/api/test", (req, res) => res.json({ ok: true }));

app.get("/api/protected", auth, (req, res) => {
    res.json({ ok: true, user: req.user });
});

app.listen(PORT, () => {
    console.log(`🚀 Backend escuchando en puerto ${PORT}`);
});
