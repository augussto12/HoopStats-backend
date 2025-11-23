import { pool } from "../db";

// ==========================
// GET /best-players/latest
// ==========================
export const getBestPlayersLatest = async (req: any, res: any) => {
    try {
        const dayRes = await pool.query(`
            SELECT id, date 
            FROM hoopstats.days 
            ORDER BY date DESC 
            LIMIT 1
        `);

        if (dayRes.rows.length === 0) {
            return res.json([]);
        }

        const dayId = dayRes.rows[0].id;

        const playersRes = await pool.query(`
            SELECT category, player_name AS player, value
            FROM hoopstats.best_players_by_day
            WHERE day_id = $1
            ORDER BY category
        `, [dayId]);

        return res.json(playersRes.rows);

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error obteniendo best players." });
    }
};


// ==========================
// GET /best-players/:date
// ==========================
export const getBestPlayersByDate = async (req: any, res: any) => {
    try {
        const { date } = req.params;

        const dayRes = await pool.query(`
            SELECT id
            FROM hoopstats.days
            WHERE date = $1
        `, [date]);

        if (!dayRes.rows.length) {
            return res.json([]);
        }

        const dayId = dayRes.rows[0].id;

        const playersRes = await pool.query(`
            SELECT category, player_name AS player, value
            FROM hoopstats.best_players_by_day
            WHERE day_id = $1
            ORDER BY category
        `, [dayId]);

        return res.json(playersRes.rows);

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error obteniendo best players por fecha." });
    }
};
