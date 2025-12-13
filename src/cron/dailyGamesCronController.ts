import { pool } from "../db";
import axios from "axios";

const API_URL = process.env.NBA_API_BASE_URL!;
const API_KEY = process.env.NBA_API_KEY!;
const SEASON = process.env.FANTASY_SEASON || "2025";

const headers = { "x-apisports-key": API_KEY };

function pad(n: number) {
    return String(n).padStart(2, "0");
}

function getARGDate(d = new Date()) {
    return new Date(
        d.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" })
    );
}

function toYYYYMMDD(d: Date) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDaysStr(dateISO: string, delta: number): string {
    const [year, month, day] = dateISO.split("-").map(Number);
    const d = new Date(Date.UTC(year, month - 1, day));
    d.setUTCDate(d.getUTCDate() + delta);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function convertUTCtoARG(utc: string) {
    const utcDate = new Date(utc);
    return new Date(
        utcDate.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" })
    );
}

async function apiGet(path: string, params: any = {}) {
    if (!API_URL || !API_KEY) {
        throw new Error("NBA_API_BASE_URL o NBA_API_KEY no configurados");
    }

    const url = `${API_URL}${path}`;
    console.log("API-GET ->", url, params);

    try {
        const res = await axios.get(url, {
            headers,
            params,
            timeout: 15000,
        });
        console.log("API OK:", url, "items:", res.data.response?.length ?? 0);
        return res.data.response ?? [];
    } catch (err: any) {
        console.error("API ERROR:", {
            url,
            params,
            message: err.message,
            code: err.code,
            status: err.response?.status,
            data: err.response?.data,
        });
        throw err;
    }
}

export const runDailyGamesCron = async () => {
    console.log("------------------------------------------------------------");
    console.log("Iniciando DailyGamesCron:", new Date().toISOString());
    console.log("API_URL:", API_URL);
    console.log("SEASON:", SEASON);

    try {
        const todayARG = toYYYYMMDD(getARGDate());
        const prev = addDaysStr(todayARG, -1);
        const next = addDaysStr(todayARG, +1);

        console.log("FECHAS ARG ->", { prev, todayARG, next });

        console.log("Fetching games for prev/today/next...");
        const [gPrev, gDay, gNext] = await Promise.all([
            apiGet("/games", { date: prev, season: SEASON }),
            apiGet("/games", { date: todayARG, season: SEASON }),
            apiGet("/games", { date: next, season: SEASON }),
        ]);

        console.log("CANTIDADES ->", {
            prev: gPrev.length,
            today: gDay.length,
            next: gNext.length,
        });

        let all = [...gPrev, ...gDay, ...gNext];

        const before = all.length;
        all = Array.from(new Map(all.map((g: any) => [g.id, g])).values());
        console.log(`Duplicados removidos: ${before} -> ${all.length}`);

        console.log("Filtrando partidos que se juegan HOY en ARG...");
        const mapped = all
            .map((g: any) => ({
                ...g,
                argStart: convertUTCtoARG(g.date?.start),
            }))
            .filter((g: any) => g.argStart && toYYYYMMDD(g.argStart) === todayARG);

        console.log("Partidos HOY:", mapped.length);

        console.log("Borrando datos anteriores para:", todayARG);
        await pool.query(
            `DELETE FROM hoopstats.nba_games_daily WHERE date_arg = $1`,
            [todayARG]
        );

        console.log("Insertando partidos...");
        for (const g of mapped) {
            console.log(" -> Guardando game:", g.id);
            await pool.query(
                `INSERT INTO hoopstats.nba_games_daily 
         (game_id, date_arg, start_time, home_team, away_team, status, raw_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    g.id,
                    todayARG,
                    g.argStart,
                    g.teams?.home?.name ?? "",
                    g.teams?.visitors?.name ?? "",
                    g.status?.long ?? "",
                    g,
                ]
            );
        }

        console.log("DailyGamesCron FINALIZADO");
    } catch (err: any) {
        console.error("DailyGamesCron ERROR CRÍTICO:", {
            message: err.message,
            code: err.code,
            status: err.response?.status,
            data: err.response?.data,
        });

        throw err; 
    }
};
