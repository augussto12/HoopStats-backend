import { pool } from "../db";
import axios from "axios";
import { calcFantasyPoints } from "../utils/fantasy";
import { createNotification } from "../controllers/notificationController";

const API_URL = process.env.NBA_API_BASE_URL!;
const API_KEY = process.env.NBA_API_KEY!;
const SEASON = process.env.FANTASY_SEASON || "2025";

const headers = { "x-apisports-key": API_KEY };

// ----------------------------
// Helpers fecha ARG
// ----------------------------
function pad(n: number) {
    return String(n).padStart(2, "0");
}

function toYYYYMMDD(d: Date) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getArgentinaDate(offsetDays: number = 0) {
    const now = new Date(
        new Date().toLocaleString("en-US", {
            timeZone: "America/Argentina/Buenos_Aires",
        })
    );
    now.setDate(now.getDate() + offsetDays);
    return toYYYYMMDD(now);
}

async function apiGet(path: string, params: any = {}) {
    if (!API_URL || !API_KEY) {
        throw new Error("NBA_API_BASE_URL o NBA_API_KEY no configurados");
    }

    const url = `${API_URL}${path}`;
    const res = await axios.get(url, {
        headers,
        params,
        timeout: 15000, // ✅ evita colgarse
    });
    return res.data.response ?? [];
}

function parseMinutes(minStr: string) {
    if (!minStr) return 0;
    const [m, s] = minStr.split(":").map(Number);
    return m + (s > 0 ? 1 : 0);
}

// ----------------------------
// CRON PRINCIPAL
// ----------------------------
export const runFantasyCron = async () => {
    console.log("FantasyCron START");
    const client = await pool.connect(); // 1. Usamos el cliente desde el inicio para mayor seguridad

    try {
        const todayARG = getArgentinaDate(0);
        const yesterdayARG = getArgentinaDate(-1);

        // API Calls (Fuera de la transacción para no bloquear la DB)
        const [gamesToday, gamesYesterday] = await Promise.all([
            apiGet("/games", { date: todayARG, season: SEASON }),
            apiGet("/games", { date: yesterdayARG, season: SEASON }),
        ]);

        const finishedGames = [...gamesYesterday, ...gamesToday].filter(
            (g: any) => g?.status?.long === "Finished"
        );

        if (finishedGames.length === 0) {
            console.log("FantasyCron END (no finished games)");
            //client.release(); // Importante liberar aquí
            return;
        }

        // 2. Iniciamos Transacción
        await client.query("BEGIN");

        // Reset trades
        await client.query(`UPDATE fantasy_teams SET trades_remaining = 2`);

        const finishedIds = finishedGames.map((g: any) => g.id);
        const processedRes = await client.query(
            `SELECT game_id FROM fantasy_games_processed WHERE game_id = ANY($1::int[])`,
            [finishedIds]
        );

        const processedSet = new Set<number>(processedRes.rows.map((r: any) => Number(r.game_id)));
        const gamesToProcess = finishedGames.filter((g: any) => !processedSet.has(g.id));

        if (gamesToProcess.length === 0) {
            console.log("FantasyCron END (no new games to process)");
            await client.query("COMMIT");
            //client.release();
            return;
        }

        // 3. Cache de jugadores
        const fpRes = await client.query(`SELECT id, fantasy_team_id, player_id, is_captain FROM fantasy_players`);
        const fantasyByPlayer = new Map<number, any[]>();
        for (const fp of fpRes.rows) {
            const list = fantasyByPlayer.get(fp.player_id) ?? [];
            list.push(fp);
            fantasyByPlayer.set(fp.player_id, list);
        }

        const teamIds = new Set<number>();
        for (const g of gamesToProcess as any[]) {
            teamIds.add(g.teams.home.id);
            teamIds.add(g.teams.visitors.id);
        }

        const gameIdSet = new Set<number>(gamesToProcess.map((g: any) => g.id));
        const teamPointsAccumulator = new Map<number, number>();

        // 4. Procesamiento de Stats
        for (const teamId of teamIds) {
            const stats = await apiGet("/players/statistics", { team: teamId, season: SEASON });

            for (const s of stats as any[]) {
                const playerId = s.player.id;
                const gameId = s.game.id;

                if (parseMinutes(s.min) < 2 || !gameIdSet.has(gameId)) continue;

                const basePts = Number(calcFantasyPoints(s).toFixed(1));
                if (basePts <= 0) continue;

                const fullName = `${s.player.firstname} ${s.player.lastname}`;

                // INSERT/UPDATE de jugador
                await client.query(`
                    INSERT INTO players (id, full_name, team_id, price)
                    VALUES ($1, $2, $3, $4) 
                    ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name
                `, [playerId, fullName, teamId, 100.00]);

                await client.query(`
                    INSERT INTO player_fantasy_points_history (player_id, game_id, date_arg, points)
                    VALUES ($1, $2, $3, $4) ON CONFLICT (player_id, game_id) DO NOTHING
                `, [playerId, gameId, yesterdayARG, basePts]);

                if (fantasyByPlayer.has(playerId)) {
                    for (const fp of fantasyByPlayer.get(playerId)!) {
                        const pointsToAward = fp.is_captain ? basePts * 2 : basePts;
                        const currentTotal = teamPointsAccumulator.get(fp.fantasy_team_id) || 0;
                        teamPointsAccumulator.set(fp.fantasy_team_id, currentTotal + pointsToAward);

                        await client.query(`
                            INSERT INTO fantasy_team_player_points_history (fantasy_team_id, player_id, date, points_earned)
                            VALUES ($1, $2, $3, $4)
                            ON CONFLICT (fantasy_team_id, player_id, date) 
                            DO UPDATE SET points_earned = fantasy_team_player_points_history.points_earned + EXCLUDED.points_earned
                        `, [fp.fantasy_team_id, playerId, yesterdayARG, pointsToAward]);

                        await client.query(
                            `UPDATE fantasy_players SET total_pts = COALESCE(total_pts, 0) + $1 WHERE id = $2`,
                            [pointsToAward, fp.id]
                        );
                    }
                }
            }
        }

        // 5. Totales y Notificaciones
        for (const [teamId, totalDayPts] of teamPointsAccumulator.entries()) {
            await client.query(`UPDATE fantasy_teams SET total_points = COALESCE(total_points, 0) + $1 WHERE id = $2`, [totalDayPts, teamId]);
            await client.query(`UPDATE fantasy_league_teams SET points = COALESCE(points, 0) + $1 WHERE fantasy_team_id = $2`, [totalDayPts, teamId]);
            await client.query(`
                INSERT INTO fantasy_teams_history (fantasy_team_id, date, points_earned)
                VALUES ($1, $2, $3)
                ON CONFLICT (fantasy_team_id, date) DO UPDATE SET points_earned = fantasy_teams_history.points_earned + EXCLUDED.points_earned
            `, [teamId, yesterdayARG, totalDayPts]);

            // Obtener datos para notificación
            const teamInfo = await client.query(`SELECT user_id, name FROM fantasy_teams WHERE id = $1`, [teamId]);
            if (teamInfo.rows.length > 0) {
                const team = teamInfo.rows[0];
                // Lanzamos la notificación sin await para que si falla el servicio de notis no se caiga el cron
                createNotification(
                    team.user_id,
                    "FANTASY_POINTS",
                    "Resumen de Jornada",
                    `¡Tu equipo ${team.name} sumó ${totalDayPts.toFixed(2)} puntos!`,
                    { points: Number(totalDayPts.toFixed(2)), date: yesterdayARG }
                ).catch(err => console.error("Notification Error:", err));
            }
        }

        // 6. Finalizar juegos procesados
        for (const gameId of gamesToProcess.map((g: any) => g.id)) {
            await client.query(`INSERT INTO fantasy_games_processed (game_id) VALUES ($1) ON CONFLICT DO NOTHING`, [gameId]);
        }

        await client.query("COMMIT");
        console.log("FantasyCron END OK");

    } catch (err) {
        if (client) await client.query("ROLLBACK");
        console.error("Error general del FantasyCron:", err);
    } finally {
        client.release();
    }
};