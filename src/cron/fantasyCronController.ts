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

function parseMinutes(minStr: string) {
    if (!minStr) return 0;

    // API usually sends "12:34", "3:21" or null
    const [m, s] = minStr.split(":").map(Number);
    const total = m + (s > 0 ? 1 : 0);

    return total;
}

export const runFantasyCron = async () => {
    console.log("🟣 Iniciando Fantasy Cron (DEBUG MODE)");
    console.log("ENV:", {
        API_URL,
        API_KEY: API_KEY ? "OK" : "MISSING",
        SEASON,
    });

    try {
        const todayARG = getArgentinaDate(0);
        const yesterdayARG = getArgentinaDate(-1);

        console.log("📅 Fechas ARG:", { todayARG, yesterdayARG });

        // FETCH GAMES
        console.log("📡 Fetching games for:", { todayARG, yesterdayARG });

        const gamesToday = await apiGet("/games", { date: todayARG, season: SEASON });
        const gamesYesterday = await apiGet("/games", { date: yesterdayARG, season: SEASON });

        console.log("📊 GamesToday:", gamesToday.length);
        console.log("📊 GamesYesterday:", gamesYesterday.length);

        const finishedToday = gamesToday.filter((g: any) => g.status.long === "Finished");
        const finishedYesterday = gamesYesterday
            .filter((g: any) => g.status.long === "Finished")
            .filter((g: any) => isYesterdayValidArgStart(g.date.start));

        console.log("🏁 Finished Today:", finishedToday.length);
        console.log("🏁 Finished Yesterday:", finishedYesterday.length);

        const finishedGames = [...finishedToday, ...finishedYesterday];

        if (finishedGames.length === 0) {
            console.log("⚠️ No finished games found.");
            return;
        }

        // LOAD FANTASY PLAYERS
        console.log("🗄 Fetching fantasy players...");

        const fpRes = await pool.query(`
            SELECT id, fantasy_team_id, player_id
            FROM hoopstats.fantasy_players
        `);

        const fantasyPlayers = fpRes.rows;

        console.log("👥 Fantasy Players (DB):", fantasyPlayers.length);
        console.log("🟣 Player IDs in DB:", fantasyPlayers.map(fp => fp.player_id));

        const fantasyByPlayer = new Map<number, any[]>();
        for (const fp of fantasyPlayers) {
            if (!fantasyByPlayer.has(fp.player_id)) {
                fantasyByPlayer.set(fp.player_id, []);
            }
            fantasyByPlayer.get(fp.player_id)!.push(fp);
        }

        // TEAMS TO PROCESS
        const teamIds = new Set();
        for (const g of finishedGames) {
            teamIds.add(g.teams.home.id);
            teamIds.add(g.teams.visitors.id);
        }

        console.log("🏀 Teams to process:", [...teamIds]);

        const playerPointsMap = new Map();

        // MAIN LOOP
        for (const teamId of teamIds) {
            console.log(`\n-------------------------------------`);
            console.log(`📡 Fetching stats for Team ${teamId}`);
            console.log(`-------------------------------------`);

            const stats = await apiGet("/players/statistics", {
                team: teamId,
                season: SEASON,
            });

            console.log(`📊 Stats Received: ${stats.length}`);

            for (const s of stats) {
                const apiPlayerId = s.player.id;
                const minutesStr = s.min;
                const minutes = parseMinutes(minutesStr);

                console.log(`\n🧍 Player ${apiPlayerId}`);
                console.log(`  • Name: ${s.player.firstname} ${s.player.lastname}`);
                console.log(`  • API Minutes: "${minutesStr}" → Parsed: ${minutes}`);
                console.log(`  • In Fantasy?`, fantasyByPlayer.has(apiPlayerId));

                if (!fantasyByPlayer.has(apiPlayerId)) {
                    console.log("  ❌ Player not in fantasy → SKIP");
                    continue;
                }

                if (minutes < 2) {
                    console.log("  ❌ Played < 2 minutes → SKIP");
                    continue;
                }

                // Check if the game matches
                const match = finishedGames.find((g: any) => g.id === s.game.id);
                console.log(`  • GameID: ${s.game.id} → Matches finished games?`, !!match);

                if (!match) {
                    console.log("  ❌ Stats not from a finished match → SKIP");
                    continue;
                }

                const pts = Number(calcFantasyPoints(s).toFixed(1));
                console.log(`  • Fantasy Points Calc: ${pts}`);

                if (pts === 0) {
                    console.log("  ❌ Points = 0 → SKIP");
                    continue;
                }

                console.log("  ✅ VALID PLAYER → ADDING POINTS");

                const prev = playerPointsMap.get(apiPlayerId) || 0;
                playerPointsMap.set(apiPlayerId, prev + pts);
            }
        }

        console.log("\n🔥 FINAL playerPointsMap:", [...playerPointsMap.entries()]);

        if (playerPointsMap.size === 0) {
            console.log("⚠️ No points to assign. (Probably IDs mismatch or minute filter)");
            return;
        }

        console.log("\n💾 Saving to database...");

        const client = await pool.connect();
        await client.query("BEGIN");

        try {
            for (const [playerId, pts] of playerPointsMap.entries()) {
                const fps = fantasyByPlayer.get(playerId)!;

                for (const fp of fps) {
                    console.log(`📝 Updating fantasyPlayer ${fp.id} (+${pts} pts)`);

                    await client.query(
                        `UPDATE hoopstats.fantasy_players
                         SET total_pts = COALESCE(total_pts, 0) + $1
                         WHERE id = $2`,
                        [pts, fp.id]
                    );
                }
            }

            await client.query("COMMIT");
            console.log("🎉 COMMIT OK");
        } catch (err) {
            console.error("❌ Error updating DB:", err);
            await client.query("ROLLBACK");
            console.log("↩️ ROLLBACK DONE");
        } finally {
            client.release();
        }

        console.log("🎯 CRON FINALIZADO");
    } catch (err) {
        console.error("🔥 CRON ERROR:", err);
    }
};

