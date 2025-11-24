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

app.set("trust proxy", true);

configureSecurity(app);
const PORT = process.env.PORT || 3000;

// ==========================
// CORS CONFIG
// ==========================

const allowedOrigins: (string | RegExp)[] = [
    "http://localhost:4200",
    "https://hoopstats.com.ar",
    "https://www.hoopstats.com.ar",
    "https://hoopstats.netlify.app",
];

if (process.env.FRONTEND_URL) {
    allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
    origin: allowedOrigins,
    credentials: true,
}));

app.use(express.json());

// ==========================
// RUTAS
// ==========================

app.use("/api/auth", authRoutes);
app.use("/api/fantasy", fantasyRoutes);
app.use("/api/players", playerRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/predictions", predictionRoutes);
app.use("/api/users", userRoutes);
app.use("/api/cron", cronRoutes);
app.use("/api/favorites", favoritesRoutes);
app.use("/api/best-players", bestPlayersRoutes);

// ==========================
// TEST ROUTES
// ==========================

app.get("/api/test", (req, res) => {
    res.json({ ok: true });
});

app.get("/api/protected", auth, (req, res) => {
    res.json({
        ok: true,
        user: req.user,
    });
});

// ==========================
// SERVER START
// ==========================

app.listen(PORT, () => {
    console.log(`🚀 Backend escuchando en puerto ${PORT}`);
});
