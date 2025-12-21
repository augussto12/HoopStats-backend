import { pool } from "../db";

export const runWeeklyDreamTeamCron = async () => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // 1. Obtener los 5 mejores jugadores por puntos
        const topPlayersRes = await client.query(`
            SELECT h.player_id, SUM(h.points) as total
            FROM player_fantasy_points_history h
            WHERE h.date_arg >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY h.player_id
            ORDER BY total DESC 
            LIMIT 5
        `);

        if (topPlayersRes.rows.length === 0) return;

        // 2. Definir semana y año
        const weekInfo = await client.query(`
            SELECT extract(week from CURRENT_DATE)::int as wk, 
                   extract(year from CURRENT_DATE)::int as yr
        `);
        const { wk, yr } = weekInfo.rows[0];

        // 3. Limpiar tabla simplificada
        await client.query(`
            DELETE FROM weekly_dream_team 
            WHERE week_number = $1 AND year = $2
        `, [wk, yr]);

        // 4. Insertar en la tabla simplificada (sin columna position)
        for (const p of topPlayersRes.rows) {
            await client.query(`
                INSERT INTO weekly_dream_team 
                (week_number, year, player_id, total_points)
                VALUES ($1, $2, $3, $4)
            `, [wk, yr, p.player_id, p.total]);
        }

        await client.query("COMMIT");
        console.log("✅ Dream Team guardado (sin posiciones).");
    } catch (e) {
        await client.query("ROLLBACK");
        console.error("❌ Error en el Cron:", e);
    } finally {
        client.release();
    }
};