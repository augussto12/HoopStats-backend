import { pool } from "../db";
import axios from "axios";
import { calcFantasyPoints } from "../utils/fantasy";

const API_URL = process.env.NBA_API_BASE_URL!;
const API_KEY = process.env.NBA_API_KEY!;
const SEASON = process.env.FANTASY_SEASON || "2025";

const headers = { "x-apisports-key": API_KEY };

// ----------------------------
// helpers
// ----------------------------
function toArgentina(dateUTC: string) {
    return new Date(
        new Date(dateUTC).toLocaleString("en-US", {
            timeZone: "America/Argentina/Buenos_Aires",
        })
    );
}

function isYesterdayValidArgStart(dateUTC: string): boolean {
    const local = toArgentina(dateUTC);
    return local.getHours() >= 7;
}

function getArgentinaDate(offsetDays: number = 0) {
    const now = new Date(
        new Date().toLocaleString("en-US", {
            timeZone: "America/Argentina/Buenos_Aires",
        })
    );
    now.setDate(now.getDate() + offsetDays);
    return now.toISOString().slice(0, 10);
}

async function apiGet(path: string, params: any = {}) {
    const url = `${API_URL}${path}`;
    const res = await axios.get(url, { headers, params });
    return res.data.response;
}

function parseMinutes(minStr: string) {
    if (!minStr) return 0;
    const [m, s] = minStr.split(":").map(Number);
    return m + (s > 0 ? 1 : 0);
}

// ----------------------------
// CRON
// ----------------------------
export const runFantasyCron = async () => {
    console.log("Iniciando Fantasy Cron...");

    try {
        const todayARG = getArgentinaDate(0);
        const yesterdayARG = getArgentinaDate(-1);

        // 1. Fetch games
        const gamesToday = await apiGet("/games", { date: todayARG, season: SEASON });
        const gamesYesterday = await apiGet("/games", { date: yesterdayARG, season: SEASON });

        const finishedToday = gamesToday.filter((g: any) => g.status.long === "Finished");
        const finishedYesterday = gamesYesterday
            .filter((g: any) => g.status.long === "Finished")
            .filter((g: any) => isYesterdayValidArgStart(g.date.start));

        const finishedGames = [...finishedToday, ...finishedYesterday];

        console.log(`Partidos finalizados HOY: ${finishedToday.length}`);
        console.log(`Partidos finalizados AYER válidos: ${finishedYesterday.length}`);

        if (finishedGames.length === 0) {
            console.log("No hay partidos válidos para procesar.");
            return;
        }

        // 2. Fetch fantasy players
        const fpRes = await pool.query(`
            SELECT id, fantasy_team_id, player_id
            FROM hoopstats.fantasy_players
        `);

        const fantasyPlayers = fpRes.rows;
        console.log(`Jugadores en fantasy: ${fantasyPlayers.length}`);

        if (fantasyPlayers.length === 0) {
            console.log("No hay jugadores de fantasy.");
            return;
        }

        const fantasyByPlayer = new Map<number, any[]>();
        for (const fp of fantasyPlayers) {
            const list = fantasyByPlayer.get(fp.player_id) ?? [];
            list.push(fp);
            fantasyByPlayer.set(fp.player_id, list);
        }

        // 3. Stats for teams involved
        const teamIds = new Set<number>();
        for (const g of finishedGames) {
            teamIds.add(g.teams.home.id);
            teamIds.add(g.teams.visitors.id);
        }

        const playerPointsMap = new Map<number, number>();

        for (const teamId of teamIds) {
            const stats = await apiGet("/players/statistics", {
                team: teamId,
                season: SEASON,
            });

            for (const s of stats) {
                const apiPlayerId = s.player.id;

                if (!fantasyByPlayer.has(apiPlayerId)) continue;

                const minutes = parseMinutes(s.min);
                if (minutes < 2) continue;

                const match = finishedGames.find((g) => g.id === s.game.id);
                if (!match) continue;

                const pts = Number(calcFantasyPoints(s).toFixed(1));
                if (pts === 0) continue;

                const prev = playerPointsMap.get(apiPlayerId) || 0;
                playerPointsMap.set(apiPlayerId, prev + pts);
            }
        }

        console.log(`Jugadores que sumaron puntos: ${playerPointsMap.size}`);

        if (playerPointsMap.size === 0) {
            console.log("Ningún jugador sumó puntos.");
            return;
        }

        // 4. Save results in DB
        console.log("Guardando en base de datos...");

        const client = await pool.connect();
        await client.query("BEGIN");

        try {
            // 4.1 actualizar fantasy_players
            for (const [playerId, pts] of playerPointsMap.entries()) {
                const fps = fantasyByPlayer.get(playerId)!;

                for (const fp of fps) {
                    await client.query(
                        `UPDATE hoopstats.fantasy_players
                         SET total_pts = COALESCE(total_pts, 0) + $1
                         WHERE id = $2`,
                        [pts, fp.id]
                    );
                }
            }

            // 4.2 calcular puntos por equipo
            const teamPointsMap = new Map<number, number>();
            for (const [playerId, pts] of playerPointsMap.entries()) {
                const fps = fantasyByPlayer.get(playerId)!;
                for (const fp of fps) {
                    const current = teamPointsMap.get(fp.fantasy_team_id) || 0;
                    teamPointsMap.set(fp.fantasy_team_id, current + pts);
                }
            }

            console.log(`Equipos que sumaron puntos: ${teamPointsMap.size}`);

            // 4.3 actualizar fantasy_teams
            for (const [teamId, pts] of teamPointsMap.entries()) {
                await client.query(
                    `UPDATE hoopstats.fantasy_teams
                     SET total_points = COALESCE(total_points, 0) + $1
                     WHERE id = $2`,
                    [pts, teamId]
                );
            }

            await client.query("COMMIT");
            console.log("Commit OK — Fantasy actualizado.");

        } catch (err) {
            console.error("Error en DB:", err);
            await client.query("ROLLBACK");
        } finally {
            client.release();
        }

        console.log("Cron finalizado correctamente.");

    } catch (err) {
        console.error("Error general del cron:", err);
    }
};
