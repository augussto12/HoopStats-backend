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
    return local.getHours() >= 7; // >= 07:00 AM Argentina
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

// ----------------------------
// CRON PRINCIPAL NUEVO
// ----------------------------

export const runFantasyCron = async () => {
    console.log("🔵 Ejecutando cron de fantasy...");

    // ----------------------------
    // LOG 1 — ENV VARS
    // ----------------------------
    console.log("🌍 ENV:", {
        API_URL: process.env.NBA_API_BASE_URL,
        API_KEY: process.env.NBA_API_KEY ? "OK" : "FALTA",
        SEASON: SEASON,
    });

    try {
        const todayARG = getArgentinaDate(0);
        const yesterdayARG = getArgentinaDate(-1);

        console.log("📅 Fechas ARG:", { todayARG, yesterdayARG });

        // ----------------------------
        // LOG 2 — FETCH DE PARTIDOS
        // ----------------------------
        console.log("📡 Buscando partidos del día y de ayer...");

        let gamesToday, gamesYesterday;

        try {
            gamesToday = await apiGet("/games", {
                date: todayARG,
                season: SEASON,
            });
            console.log("📊 gamesToday:", gamesToday.length);
        } catch (err) {
            console.error("❌ Error en API gamesToday:", err);
            throw err;
        }

        try {
            gamesYesterday = await apiGet("/games", {
                date: yesterdayARG,
                season: SEASON,
            });
            console.log("📊 gamesYesterday:", gamesYesterday.length);
        } catch (err) {
            console.error("❌ Error en API gamesYesterday:", err);
            throw err;
        }

        // ----------------------------
        // LOG 3 — FILTRADO
        // ----------------------------
        const finishedToday = gamesToday.filter(
            (g: any) => g.status.long === "Finished"
        );
        const finishedYesterday = gamesYesterday
            .filter((g: any) => g.status.long === "Finished")
            .filter((g: any) => isYesterdayValidArgStart(g.date.start));

        console.log("🏁 Finalizados HOY:", finishedToday.length);
        console.log("🏁 Finalizados AYER válidos:", finishedYesterday.length);

        const finishedGames = [...finishedToday, ...finishedYesterday];

        if (finishedGames.length === 0) {
            console.log("⚠️ No hay partidos válidos.");
            return { updated: false, reason: "No hay partidos válidos" };
        }

        // ----------------------------
        // LOG 4 — DB: FANTASY PLAYERS
        // ----------------------------
        console.log("🗄 Cargando jugadores fantasy...");

        let fantasyPlayers;
        try {
            const fpRes = await pool.query(`
                SELECT fp.id, fp.fantasy_team_id, fp.player_id
                FROM hoopstats.fantasy_players fp
            `);
            fantasyPlayers = fpRes.rows;
            console.log("👥 fantasyPlayers:", fantasyPlayers.length);
        } catch (err) {
            console.error("❌ Error consultando fantasy_players:", err);
            throw err;
        }

        if (fantasyPlayers.length === 0) {
            console.log("⚠️ No hay jugadores en fantasy.");
            return { updated: false, reason: "No hay jugadores en fantasy" };
        }

        // Mapa player_id → registros fantasy
        const fantasyByPlayer = new Map<number, any[]>();

        for (const fp of fantasyPlayers) {
            if (!fantasyByPlayer.has(fp.player_id)) {
                fantasyByPlayer.set(fp.player_id, []);
            }
            fantasyByPlayer.get(fp.player_id)!.push(fp);
        }

        // ----------------------------
        // LOG 5 — TEAMS
        // ----------------------------
        const teamIds = new Set<number>();
        for (const g of finishedGames) {
            teamIds.add(g.teams.home.id);
            teamIds.add(g.teams.visitors.id);
        }
        console.log("🏀 Teams para procesar:", [...teamIds]);

        // ----------------------------
        // LOG 6 — FETCH PLAYER STATS
        // ----------------------------
        const playerPointsMap = new Map<number, number>();

        for (const teamId of teamIds) {
            console.log(`📡 Buscando stats del team ${teamId}...`);
            let stats;
            try {
                stats = await apiGet("/players/statistics", {
                    season: SEASON,
                    team: teamId,
                });
                console.log(`📊 Stats recibidos: ${stats.length}`);
            } catch (err) {
                console.error(`❌ Error obteniendo stats team ${teamId}:`, err);
                continue; // Saltamos equipo si falla
            }

            for (const s of stats) {
                const playerId = s.player.id;

                if (!fantasyByPlayer.has(playerId)) continue;
                if (!finishedGames.find((g) => g.id === s.game.id)) continue;

                if (typeof s.min !== "number" || s.min < 2) {
                    console.log(`⏳ Player ${playerId} jugó menos de 2 min.`);
                    continue;
                }

                const pts = Number(calcFantasyPoints(s).toFixed(1));

                if (pts === 0) {
                    console.log(`⭕ Player ${playerId} puntuación = 0`);
                    continue;
                }

                const prev = playerPointsMap.get(playerId) || 0;
                playerPointsMap.set(playerId, prev + pts);
            }
        }

        console.log("🔥 playerPointsMap:", [...playerPointsMap.entries()]);

        if (playerPointsMap.size === 0) {
            console.log("⚠️ No hubo puntos que sumar.");
            return { updated: false, reason: "No hubo puntos" };
        }

        // ----------------------------
        // LOG 7 — GUARDADO EN DB
        // ----------------------------
        console.log("💾 Actualizando DB...");

        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            const teamPointsMap = new Map<number, number>();

            for (const [playerId, pts] of playerPointsMap.entries()) {
                const fps = fantasyByPlayer.get(playerId)!;

                for (const fp of fps) {
                    console.log(`📝 Sumando ${pts} a fantasyPlayer ${fp.id}`);

                    await client.query(
                        `UPDATE hoopstats.fantasy_players
                         SET total_pts = COALESCE(total_pts, 0) + $1
                         WHERE id = $2`,
                        [pts, fp.id]
                    );

                    const current = teamPointsMap.get(fp.fantasy_team_id) || 0;
                    teamPointsMap.set(fp.fantasy_team_id, current + pts);
                }
            }

            console.log("🔥 teamPointsMap:", [...teamPointsMap.entries()]);

            for (const [teamId, pts] of teamPointsMap.entries()) {
                console.log(`📝 Sumando ${pts} a fantasyTeam ${teamId}`);

                await client.query(
                    `UPDATE hoopstats.fantasy_teams
                     SET total_points = COALESCE(total_points, 0) + $1
                     WHERE id = $2`,
                    [pts, teamId]
                );
            }

            console.log("✅ COMMIT");
            await client.query("COMMIT");
        } catch (err) {
            console.error("❌ Error guardando puntos:", err);
            await client.query("ROLLBACK");
            console.log("↩️ ROLLBACK ejecutado");
            return { updated: false, reason: "Error guardando puntos" };
        } finally {
            client.release();
        }

        console.log("🎉 CRON COMPLETADO");

        return {
            updated: true,
            playersUpdated: playerPointsMap.size,
        };
    } catch (err) {
        console.error("🔥 Error en runFantasyCron:", err);
        return { updated: false, reason: "Error general" };
    }
};

