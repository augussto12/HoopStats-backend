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

function addDaysStr(dateISO: string, delta: number) {
    const d = new Date(dateISO + "T00:00:00");
    d.setDate(d.getDate() + delta);
    return toYYYYMMDD(getARGDate(d));
}

async function apiGet(path: string, params: any = {}) {
    const url = `${API_URL}${path}`;
    const res = await axios.get(url, { headers, params });
    return res.data.response;
}

function convertUTCtoARG(utc: string) {
    const utcDate = new Date(utc);
    return new Date(
        utcDate.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" })
    );
}

export const runDailyGamesCron = async () => {
    try {

        const todayARG = toYYYYMMDD(getARGDate());
        const prev = addDaysStr(todayARG, -1);
        const next = addDaysStr(todayARG, +1);


        // 1) Fetch 3 days (igual que en el front)
        const [gPrev, gDay, gNext] = await Promise.all([
            apiGet("/games", { date: prev, season: SEASON }),
            apiGet("/games", { date: todayARG, season: SEASON }),
            apiGet("/games", { date: next, season: SEASON }),
        ]);

        let all = [...gPrev, ...gDay, ...gNext];

        // 2) Remove duplicates
        all = Array.from(new Map(all.map(g => [g.id, g])).values());

        // 3) Convert and filter games that actually happen today in Argentina
        const mapped = all
            .map((g: any) => ({
                ...g,
                argStart: convertUTCtoARG(g.date.start)
            }))
            .filter(g => toYYYYMMDD(g.argStart) === todayARG);


        // 4) Clean old data for today
        await pool.query(
            `DELETE FROM hoopstats.nba_games_daily WHERE date_arg = $1`,
            [todayARG]
        );

        // 5) Insert new records
        for (const g of mapped) {
            await pool.query(
                `INSERT INTO hoopstats.nba_games_daily 
                (game_id, date_arg, start_time, home_team, away_team, status, raw_json)
                VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    g.id,
                    todayARG,
                    g.argStart,
                    g.teams.home.name,
                    g.teams.visitors.name,
                    g.status?.long || "",
                    g
                ]
            );
        }


    } catch (err) {
        console.error("DailyGamesCron error:", err);
    }
};
