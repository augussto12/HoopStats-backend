import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cron from "node-cron";

import authRoutes from "./routes/authRoutes";
import { auth } from "./middlewares/auth";
import fantasyRoutes from "./routes/fantasyRoutes";
import fantasyLeaguesRoutes from "./routes/fantasyLeaguesRoutes";
import fantasyTradesRoutes from "./routes/fantasyTradesRoutes";
import leaguesMembershipRoutes from "./routes/leaguesMembershipRoutes";
import notificationRoutes from "./routes/notificationRoutes";
import playerRoutes from "./routes/playerRoutes";
import teamRoutes from "./routes/teamRoutes";
import predictionRoutes from "./routes/predictionRoutes";
import userRoutes from "./routes/usersRoutes";
import cronRoutes from "./routes/cronRoutes";
import favoritesRoutes from "./routes/favoritesRoutes";
import bestPlayersRoutes from "./routes/bestPlayersRoutes";
import marketLockRoutes from "./routes/marketLockRoutes";
import marketLockCronRoutes from "./routes/marketLockCronRoutes";

import { configureSecurity } from "./config/security";

dotenv.config();


// ──────────────────────────────────────────
//                CRON LOCAL
// ──────────────────────────────────────────
cron.schedule("0 10 * * *", async () => {
    console.log("⏱ Ejecutando cron LOCAL del backend (07:00 AR)...");

    try {
        const res = await fetch(
            "https://hoopstats-backend-production.up.railway.app/api/cron/run-all",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-cron-key": process.env.CRON_SECRET || "",
                },
            }
        );

        console.log("📡 Cron respondió:", res.status);
    } catch (err) {
        console.error("❌ Error en cron:", err);
    }
});

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
    ],
    credentials: true,
}));

// Body parser
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Seguridad
configureSecurity(app);

const PORT = process.env.PORT || 3000;

// ──────────────────────────────────────────
//                 RUTAS
// ──────────────────────────────────────────

app.use("/api/auth", authRoutes);
app.use("/api/fantasy", fantasyRoutes);
app.use("/api/notifications", notificationRoutes);

app.use("/api/fantasy-leagues", fantasyLeaguesRoutes);
app.use("/api/fantasy-trades", fantasyTradesRoutes);

app.use("/api/fantasy-league-membership", leaguesMembershipRoutes);

app.use("/api/players", playerRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/predictions", predictionRoutes);

app.use("/api/users", userRoutes);
app.use("/api/cron", cronRoutes);
app.use("/api/favorites", favoritesRoutes);
app.use("/api/best-players", bestPlayersRoutes);

app.use("/api/market-lock", marketLockRoutes);
app.use("/api/market-lock-cron", marketLockCronRoutes);

app.get("/api/test", (req, res) => res.json({ ok: true }));

app.get("/api/protected", auth, (req, res) => {
    res.json({ ok: true, user: req.user });
});

app.listen(PORT, () => {
    console.log(`🚀 Backend escuchando en puerto ${PORT}`);
});
