import { pool } from "../db";

export const getDailyGames = async (req: any, res: any) => {
    try {
        const date = req.params.date
            || new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

        const result = await pool.query(
            `SELECT 
                id,
                game_id,
                date_arg,
                start_time,
                home_team,
                away_team,
                status,
                raw_json
             FROM hoopstats.nba_games_daily
             WHERE date_arg = $1
             ORDER BY start_time ASC`,
            [date]
        );

        return res.json({
            date,
            total: result.rows.length,
            games: result.rows
        });

    } catch (err) {
        console.error("❌ getDailyGames error:", err);
        return res.status(500).json({ error: "Error obteniendo partidos del día" });
    }
};
