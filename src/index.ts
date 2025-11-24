import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/authRoutes";
import { auth } from "./middlewares/auth";
import fantasyRoutes from "./routes/fantasyRoutes";
import playerRoutes from "./routes/playerRoutes";
import teamRoutes from "./routes/teamRoutes";
import predictionRoutes from "./routes/predictionRoutes";
import userRoutes from "./routes/usersRoutes";
import cronRoutes from "./routes/cronRoutes";
import favoritesRoutes from "./routes/favoritesRoutes";
import bestPlayersRoutes from "./routes/bestPlayersRoutes";
import { configureSecurity } from "./config/security";

dotenv.config();

const app = express();

// Railway usa proxy
app.set("trust proxy", 1);

// CORS primero
app.use(cors({
    origin: [
        "http://localhost:4200",
        "https://hoopstats.com.ar",
        "https://www.hoopstats.com.ar",
        "https://hoopstats.netlify.app",
    ],
    credentials: true,
}));

// Body parser SIEMPRE antes de sanitize o helmet
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Seguridad después del body parser
configureSecurity(app);

const PORT = process.env.PORT || 3000;

// RUTAS
app.use("/api/auth", authRoutes);
app.use("/api/fantasy", fantasyRoutes);
app.use("/api/players", playerRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/predictions", predictionRoutes);
app.use("/api/users", userRoutes);
app.use("/api/cron", cronRoutes);
app.use("/api/favorites", favoritesRoutes);
app.use("/api/best-players", bestPlayersRoutes);

app.get("/api/test", (req, res) => res.json({ ok: true }));

app.get("/api/protected", auth, (req, res) => {
    res.json({ ok: true, user: req.user });
});

app.listen(PORT, () => {
    console.log(`🚀 Backend escuchando en puerto ${PORT}`);
});
