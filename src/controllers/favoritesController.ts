import { pool } from "../db";

export const getFavorites = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;

        const players = await pool.query(
            `SELECT p.*
             FROM hoopstats.favorite_players fp
             JOIN hoopstats.players p ON p.id = fp.player_id
             WHERE fp.user_id = $1`,
            [userId]
        );

        const teams = await pool.query(
            `SELECT t.*
             FROM hoopstats.favorite_teams ft
             JOIN hoopstats.teams t ON t.id = ft.team_id
             WHERE ft.user_id = $1`,
            [userId]
        );

        return res.json({
            players: players.rows,
            teams: teams.rows
        });
    } catch (err) {
        console.error("Error al obtener favoritos:", err);
        return res.status(500).json({ error: "Error al obtener favoritos" });
    }
};

export const addFavorite = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const { type, id } = req.body;

        // Validar tipo
        if (!["player", "team"].includes(type)) {
            return res.status(400).json({ error: "Tipo inválido" });
        }

        // Validar ID
        const favId = Number(id);
        if (!Number.isInteger(favId) || favId <= 0) {
            return res.status(400).json({ error: "ID inválido" });
        }

        // Verificar que exista el recurso
        if (type === "player") {
            const exists = await pool.query(
                `SELECT 1 FROM hoopstats.players WHERE id = $1`,
                [favId]
            );
            if (exists.rows.length === 0) {
                return res.status(404).json({ error: "Jugador no encontrado" });
            }

            await pool.query(
                `INSERT INTO hoopstats.favorite_players (user_id, player_id)
                 VALUES ($1, $2)
                 ON CONFLICT (user_id, player_id) DO NOTHING`,
                [userId, favId]
            );

        } else {
            const exists = await pool.query(
                `SELECT 1 FROM hoopstats.teams WHERE id = $1`,
                [favId]
            );
            if (exists.rows.length === 0) {
                return res.status(404).json({ error: "Equipo no encontrado" });
            }

            await pool.query(
                `INSERT INTO hoopstats.favorite_teams (user_id, team_id)
                 VALUES ($1, $2)
                 ON CONFLICT (user_id, team_id) DO NOTHING`,
                [userId, favId]
            );
        }

        return res.json({ message: "Favorito agregado" });

    } catch (err) {
        console.error("Error al agregar favorito:", err);
        return res.status(500).json({ error: "Error al agregar favorito" });
    }
};

export const removeFavorite = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const { type, id } = req.params;

        // Validar tipo
        if (!["player", "team"].includes(type)) {
            return res.status(400).json({ error: "Tipo inválido" });
        }

        // Validar ID
        const favId = Number(id);
        if (!Number.isInteger(favId) || favId <= 0) {
            return res.status(400).json({ error: "ID inválido" });
        }

        if (type === "player") {
            await pool.query(
                `DELETE FROM hoopstats.favorite_players
                 WHERE user_id = $1 AND player_id = $2`,
                [userId, favId]
            );
        } else {
            await pool.query(
                `DELETE FROM hoopstats.favorite_teams
                 WHERE user_id = $1 AND team_id = $2`,
                [userId, favId]
            );
        }

        return res.json({ message: "Favorito eliminado" });

    } catch (err) {
        console.error("Error al eliminar favorito:", err);
        return res.status(500).json({ error: "Error al eliminar favorito" });
    }
};

