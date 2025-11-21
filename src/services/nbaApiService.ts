import axios from "axios";

const API_URL = process.env.NBA_API_BASE_URL;
const API_KEY = process.env.NBA_API_KEY as string;
const SEASON = "2025";

if (!API_KEY) {
    console.warn("[NBA API] Falta NBA_API_KEY en .env");
}

const headers = {
    "x-apisports-key": API_KEY,
};

async function get(path: string, params: Record<string, any> = {}) {
    const url = `${API_URL}${path}`;
    const res = await axios.get(url, { headers, params });
    return res.data.response;
}

// Partidos por fecha
export async function getGamesByDate(dateISO: string) {
    return get("/games", { season: SEASON, date: dateISO });
}

// Partidos en vivo
export async function getLiveGames() {
    return get("/games", { live: "all" });
}

// Stats de todos los jugadores de un partido
export async function getPlayerStatsByGame(gameId: number) {
    return get("/players/statistics", { game: gameId });
}
