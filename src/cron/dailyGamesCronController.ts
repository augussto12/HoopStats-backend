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

    const client = await pool.connect(); // Usamos un cliente único para la transacción

    try {
        const todayARG = toYYYYMMDD(getARGDate());
        const prev = addDaysStr(todayARG, -1);
        const next = addDaysStr(todayARG, +1);

        // 1) Fetch de datos (Fuera de la transacción para no bloquear la DB mientras esperamos la API)
        const [gPrev, gDay, gNext] = await Promise.all([
            apiGet("/games", { date: prev, season: SEASON }),
            apiGet("/games", { date: todayARG, season: SEASON }),
            apiGet("/games", { date: next, season: SEASON }),
        ]);

        let all = [...gPrev, ...gDay, ...gNext];

        // Remover duplicados por ID
        all = Array.from(new Map(all.map((g: any) => [g.id, g])).values());

        // Filtrar solo los que arrancan hoy en horario ARG
        const mapped = all
            .map((g: any) => ({
                ...g,
                argStart: convertUTCtoARG(g.date?.start),
            }))
            .filter((g: any) => g.argStart && toYYYYMMDD(g.argStart) === todayARG);

        console.log(`Partidos filtrados para insertar hoy (${todayARG}):`, mapped.length);

        // 2) Operaciones de Base de Datos (Transaccionales)
        await client.query("BEGIN");

        // Borramos lo que hubiera de hoy
        await client.query(
            `DELETE FROM nba_games_daily WHERE date_arg = $1`,
            [todayARG]
        );

        if (mapped.length > 0) {
            // Preparamos el Batch Insert
            // Campos: game_id, date_arg, start_time, home_team, away_team, status, raw_json
            const valuesPlaceholder = mapped.map((_, i) =>
                `($${i * 7 + 1}, $${i * 7 + 2}, $${i * 7 + 3}, $${i * 7 + 4}, $${i * 7 + 5}, $${i * 7 + 6}, $${i * 7 + 7})`
            ).join(',');

            const flatValues = mapped.flatMap(g => [
                g.id,
                todayARG,
                g.argStart,
                g.teams?.home?.name ?? "",
                g.teams?.visitors?.name ?? "",
                g.status?.long ?? "",
                JSON.stringify(g) // Aseguramos que el objeto sea string si la columna es JSON o TEXT
            ]);

            const insertQuery = `
                INSERT INTO nba_games_daily 
                (game_id, date_arg, start_time, home_team, away_team, status, raw_json)
                VALUES ${valuesPlaceholder}
            `;

            await client.query(insertQuery, flatValues);
        }

        await client.query("COMMIT");
        console.log("DailyGamesCron FINALIZADO EXITOSAMENTE");

    } catch (err: any) {
        if (client) await client.query("ROLLBACK");
        console.error("DailyGamesCron ERROR CRÍTICO:", err.message);
        throw err;
    } finally {
        client.release();
    }
};