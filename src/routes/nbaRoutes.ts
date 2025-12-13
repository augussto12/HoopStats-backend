import { Router } from "express";
import axios from "axios";

const router = Router();

const API_URL = process.env.NBA_API_BASE_URL!; // ej: https://v2.nba.api-sports.io
const API_KEY = process.env.NBA_API_KEY!;

if (!API_URL || !API_KEY) {
    console.warn("Falta NBA_API_BASE_URL o NBA_API_KEY en el backend");
}


router.use(async (req, res) => {
    try {
        if (req.method !== "GET") {
            return res.status(405).json({ error: "Método no permitido" });
        }

        const path = req.path;
        const url = `${API_URL}${path}`;

        console.log("NBA PROXY:", url, req.query);

        const resp = await axios.get(url, {
            headers: {
                "x-apisports-key": API_KEY,
            },
            params: req.query, // date, season, team, etc.
        });

        return res.status(resp.status).json(resp.data);
    } catch (err: any) {
        console.error("NBA proxy error:", {
            message: err.message,
            status: err.response?.status,
            data: err.response?.data,
        });

        return res
            .status(err.response?.status || 500)
            .json({ error: "Error hablando con la NBA API" });
    }
});

export default router;
