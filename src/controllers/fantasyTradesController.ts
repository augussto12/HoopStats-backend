import { pool } from "../db";

// ================================================================
//           TRADES COMBINADOS - POR EQUIPO
// ================================================================
export const getGroupedTradesByTeam = async (req: any, res: any) => {
    try {
        const teamId = parseInt(req.params.teamId);

        const grouped = await pool.query(
            `
            SELECT
                t.created_at AS timestamp,
                ft.name AS team_name,
                u.username AS user_name,
                ARRAY_AGG(p.full_name ORDER BY p.full_name) FILTER (WHERE t.action = 'add') AS entran,
                ARRAY_AGG(p.full_name ORDER BY p.full_name) FILTER (WHERE t.action = 'drop') AS salen
            FROM hoopstats.fantasy_trades t
            JOIN hoopstats.players p ON p.id = t.player_id
            JOIN hoopstats.fantasy_teams ft ON ft.id = t.fantasy_team_id
            JOIN hoopstats.users u ON u.id = ft.user_id
            WHERE t.fantasy_team_id = $1
            GROUP BY t.created_at, ft.name, u.username
            ORDER BY t.created_at DESC
            `,
            [teamId]
        );

        return res.json(grouped.rows);

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error al obtener trades del equipo" });
    }
};

// ================================================================
//           TRADES COMBINADOS - POR LIGA
// ================================================================
export const getGroupedTradesByLeague = async (req: any, res: any) => {
    try {
        const leagueId = parseInt(req.params.leagueId);

        const grouped = await pool.query(
            `
            SELECT
                t.created_at AS timestamp,
                ft.name AS team_name,
                u.username AS user_name,
                ARRAY_AGG(p.full_name ORDER BY p.full_name) FILTER (WHERE t.action = 'add') AS entran,
                ARRAY_AGG(p.full_name ORDER BY p.full_name) FILTER (WHERE t.action = 'drop') AS salen
            FROM hoopstats.fantasy_trades t
            JOIN hoopstats.players p ON p.id = t.player_id
            JOIN hoopstats.fantasy_teams ft ON ft.id = t.fantasy_team_id
            JOIN hoopstats.users u ON u.id = ft.user_id
            WHERE t.league_id = $1
            GROUP BY t.created_at, ft.name, u.username
            ORDER BY t.created_at DESC
            `,
            [leagueId]
        );

        return res.json(grouped.rows);

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error al obtener trades de la liga" });
    }
};

// ================================================================
//                       MERCADO DE LA LIGA
// ================================================================
export const getLeagueMarket = async (req: any, res: any) => {
    try {
        const leagueId = parseInt(req.params.leagueId);

        const market = await pool.query(
            `
            SELECT
                p.full_name,
                SUM(CASE WHEN t.action = 'add' THEN 1 ELSE 0 END) AS total_adds,
                SUM(CASE WHEN t.action = 'drop' THEN 1 ELSE 0 END) AS total_drops
            FROM hoopstats.fantasy_trades t
            JOIN hoopstats.players p ON p.id = t.player_id
            WHERE t.league_id = $1
            GROUP BY p.full_name
            ORDER BY total_adds DESC, total_drops DESC
            LIMIT 100
            `,
            [leagueId]
        );

        return res.json(market.rows);

    } catch (err) {
        console.error("Error in market:", err);
        return res.status(500).json({ error: "Error al obtener mercado" });
    }
};
