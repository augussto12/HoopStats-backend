import { pool } from "../db";
import { isMarketLocked } from "../services/market-lock";


// Obtener mi equipo de fantasy
export const getMyTeam = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;

        // Obtener equipo
        const teamRes = await pool.query(
            `SELECT id, user_id, name, total_points, budget 
             FROM hoopstats.fantasy_teams
             WHERE user_id = $1`,
            [userId]
        );

        if (teamRes.rows.length === 0) {
            return res.json({
                team: null,
                players: []
            });
        }

        const team = teamRes.rows[0];

        // Obtener jugadores
        const playersRes = await pool.query(
            `SELECT 
                fp.id AS fantasy_player_id,
                fp.player_id,
                fp.total_pts,
                fp.price,
                p.full_name,
                p.team_id
             FROM hoopstats.fantasy_players fp
             JOIN hoopstats.players p ON p.id = fp.player_id
             WHERE fp.fantasy_team_id = $1`,
            [team.id]
        );

        return res.json({
            team,
            players: playersRes.rows
        });

    } catch (err) {
        console.error("Error al obtener equipo:", err);
        return res.status(500).json({ error: "Error al obtener equipo" });
    }
};

// Crear equipo
export const createTeam = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const { name } = req.body;

        const exists = await pool.query(
            `SELECT * FROM hoopstats.fantasy_teams WHERE user_id = $1`,
            [userId]
        );

        if (exists.rows.length > 0) {
            return res.status(400).json({ error: "Ya tenés un equipo creado" });
        }

        const team = await pool.query(
            `INSERT INTO hoopstats.fantasy_teams (user_id, name, total_points, budget)
             VALUES ($1, $2, 0, 1000) 
             RETURNING *`,
            [userId, name || "Mi equipo"]
        );

        return res.json({
            message: "Equipo creado",
            team: team.rows[0]
        });

    } catch (err) {
        console.error("Error al crear equipo:", err);
        return res.status(500).json({ error: "Error al crear equipo" });
    }
};

// Agregar jugador
export const addPlayer = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const playerId = parseInt(req.params.playerId);

        const playerRes = await pool.query(
            "SELECT id, price FROM hoopstats.players WHERE id = $1",
            [playerId]
        );

        if (playerRes.rows.length === 0) {
            return res.status(404).json({ error: "Jugador no encontrado" });
        }

        const player = playerRes.rows[0];
        player.price = Number(player.price);

        const teamRes = await pool.query(
            `SELECT id, budget FROM hoopstats.fantasy_teams WHERE user_id = $1`,
            [userId]
        );

        if (teamRes.rows.length === 0) {
            return res.status(400).json({ error: "No tenés equipo creado" });
        }

        const team = teamRes.rows[0];
        team.budget = Number(team.budget);

        // No hay límite diario
        // No se registra trade
        // Solo agrega para completar o sumar uno más

        if (team.budget < player.price) {
            return res.status(400).json({ error: "No tenés presupuesto suficiente" });
        }

        const duplicate = await pool.query(
            `SELECT 1 FROM hoopstats.fantasy_players
             WHERE fantasy_team_id = $1 AND player_id = $2`,
            [team.id, playerId]
        );

        if (duplicate.rows.length > 0) {
            return res.status(400).json({ error: "El jugador ya está en tu equipo" });
        }

        await pool.query("BEGIN");

        // Insertar jugador
        const insert = await pool.query(
            `INSERT INTO hoopstats.fantasy_players (fantasy_team_id, player_id, price)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [team.id, playerId, player.price]
        );

        // Actualizar presupuesto
        await pool.query(
            `UPDATE hoopstats.fantasy_teams
             SET budget = budget - $1
             WHERE id = $2`,
            [player.price, team.id]
        );

        await pool.query("COMMIT");

        return res.json({
            message: "Jugador agregado",
            player: insert.rows[0]
        });

    } catch (err) {
        console.error("Error al agregar jugador:", err);
        await pool.query("ROLLBACK");
        return res.status(500).json({ error: "Error al agregar jugador" });
    }
};


// quitar jugador del equipo
export const removePlayer = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const playerId = parseInt(req.params.playerId);

        const teamRes = await pool.query(
            `SELECT id FROM hoopstats.fantasy_teams WHERE user_id = $1`,
            [userId]
        );

        if (teamRes.rows.length === 0) {
            return res.status(400).json({ error: "No tenés equipo" });
        }

        const teamId = teamRes.rows[0].id;

        const player = await pool.query(
            `SELECT * FROM hoopstats.fantasy_players 
             WHERE fantasy_team_id = $1 AND player_id = $2`,
            [teamId, playerId]
        );

        if (player.rows.length === 0) {
            return res.status(404).json({ error: "Ese jugador no está en tu equipo" });
        }

        await pool.query("BEGIN");

        const price = player.rows[0].price;

        // Eliminar jugador
        await pool.query(
            `DELETE FROM hoopstats.fantasy_players
             WHERE fantasy_team_id = $1 AND player_id = $2`,
            [teamId, playerId]
        );

        // Devolver presupuesto
        await pool.query(
            `UPDATE hoopstats.fantasy_teams
             SET budget = budget + $1
             WHERE id = $2`,
            [price, teamId]
        );

        await pool.query("COMMIT");

        return res.json({ message: "Jugador eliminado" });

    } catch (err) {
        console.error("Error al eliminar jugador:", err);
        await pool.query("ROLLBACK");
        return res.status(500).json({ error: "Error al eliminar jugador" });
    }
};





// Ranking Global
export const getRanking = async (req: any, res: any) => {
    try {
        const ranking = await pool.query(
            `SELECT
                ft.id,
                ft.name,
                ft.total_points,
                u.username,
                u.email
             FROM hoopstats.fantasy_teams ft
             JOIN hoopstats.users u ON u.id = ft.user_id
             ORDER BY ft.total_points DESC`
        );

        return res.json(ranking.rows);

    } catch (err) {
        console.error("Error al obtener ranking:", err);
        return res.status(500).json({ error: "Error al obtener ranking" });
    }
};


// Actualizar nombre del equipo
export const updateTeamName = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const { name } = req.body;

        if (!name || name.trim().length < 3) {
            return res.status(400).json({ error: "El nombre debe tener al menos 3 caracteres" });
        }

        const teamRes = await pool.query(
            `SELECT id FROM hoopstats.fantasy_teams WHERE user_id = $1`,
            [userId]
        );

        if (teamRes.rows.length === 0) {
            return res.status(400).json({ error: "No tenés equipo creado" });
        }

        const teamId = teamRes.rows[0].id;

        const update = await pool.query(
            `UPDATE hoopstats.fantasy_teams
             SET name = $1
             WHERE id = $2
             RETURNING id, name, total_points, budget`,
            [name.trim(), teamId]
        );

        return res.json({
            message: "Nombre actualizado",
            team: update.rows[0]
        });

    } catch (err) {
        console.error("Error al actualizar nombre:", err);
        return res.status(500).json({ error: "Error al actualizar nombre" });
    }
};

export const getTradesToday = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;

        // Obtener el equipo
        const teamRes = await pool.query(
            `SELECT id FROM hoopstats.fantasy_teams WHERE user_id = $1`,
            [userId]
        );

        if (teamRes.rows.length === 0) {
            return res.status(400).json({ error: "No tenés equipo todavía" });
        }

        const teamId = teamRes.rows[0].id;

        // Contar trades HOY
        const tradesRes = await pool.query(
            `SELECT COUNT(*) AS total
             FROM hoopstats.fantasy_trades
             WHERE fantasy_team_id = $1
             AND created_at::date = CURRENT_DATE`,
            [teamId]
        );

        const tradesHoy = Number(tradesRes.rows[0].total);
        const tradesRestantes = Math.max(0, 2 - tradesHoy);

        return res.json({
            teamId,
            tradesHoy,
            tradesRestantes,
            limiteDiario: 2
        });

    } catch (err) {
        console.error("Error al obtener trades de hoy:", err);
        return res.status(500).json({ error: "Error al obtener trades de hoy" });
    }
};

export const getMyTransactions = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;

        // Obtener el teamId
        const teamRes = await pool.query(
            `SELECT id FROM hoopstats.fantasy_teams WHERE user_id = $1`,
            [userId]
        );

        if (teamRes.rows.length === 0) {
            return res.status(400).json({ error: "No tenés equipo creado" });
        }

        const teamId = teamRes.rows[0].id;

        // Obtener historial
        const transRes = await pool.query(
            `SELECT 
                t.id,
                t.action,
                t.player_id,
                p.full_name,
                t.created_at
            FROM hoopstats.fantasy_trades t
            JOIN hoopstats.players p ON p.id = t.player_id
            WHERE t.fantasy_team_id = $1
            ORDER BY t.created_at DESC`,
            [teamId]
        );

        return res.json(transRes.rows);

    } catch (err) {
        console.error("Error al obtener transacciones:", err);
        return res.status(500).json({ error: "Error al obtener transacciones" });
    }
};


export const applyTrades = async (req: any, res: any) => {
    try {
        // 🚫 Chequear Market Lock
        if (await isMarketLocked()) {
            return res.status(403).json({
                error: "El mercado está bloqueado. Intentá mañana a las 07:00 AM."
            });
        }

        const userId = req.user.userId;
        const { add = [], drop = [] } = req.body;

        const client = await pool.connect();

        try {
            const teamRes = await client.query(
                `SELECT id, budget FROM hoopstats.fantasy_teams WHERE user_id = $1`,
                [userId]
            );

            if (teamRes.rows.length === 0) {
                client.release();
                return res.status(400).json({ error: "No tenés equipo creado" });
            }

            const team = teamRes.rows[0];

            // Límite diario
            const todayRes = await client.query(
                `SELECT COUNT(*) AS total
                 FROM hoopstats.fantasy_trades
                 WHERE fantasy_team_id = $1
                   AND created_at::date = CURRENT_DATE`,
                [team.id]
            );

            const usadosHoy = Number(todayRes.rows[0].total);
            const nuevosTrades = add.length + drop.length;

            if (usadosHoy + nuevosTrades > 2) {
                client.release();
                return res.status(400).json({ error: "Te pasás del límite diario de 2 trades" });
            }

            await client.query("BEGIN");

            const movementTime = new Date();

            const leaguesRes = await client.query(
                `SELECT league_id
                 FROM hoopstats.fantasy_league_teams
                 WHERE fantasy_team_id = $1`,
                [team.id]
            );

            // DROPS
            for (const playerId of drop) {
                const delRes = await client.query(
                    `DELETE FROM hoopstats.fantasy_players
                     WHERE fantasy_team_id = $1 AND player_id = $2
                     RETURNING price`,
                    [team.id, playerId]
                );

                if (delRes.rows.length > 0) {
                    const price = delRes.rows[0].price;

                    await client.query(
                        `UPDATE hoopstats.fantasy_teams
                         SET budget = budget + $1
                         WHERE id = $2`,
                        [price, team.id]
                    );

                    for (const row of leaguesRes.rows) {
                        await client.query(
                            `INSERT INTO hoopstats.fantasy_trades
                             (fantasy_team_id, player_id, action, created_at, league_id)
                             VALUES ($1, $2, 'drop', $3, $4)`,
                            [team.id, playerId, movementTime, row.league_id]
                        );
                    }

                    if (leaguesRes.rows.length === 0) {
                        await client.query(
                            `INSERT INTO hoopstats.fantasy_trades
                             (fantasy_team_id, player_id, action, created_at, league_id)
                             VALUES ($1, $2, 'drop', $3, NULL)`,
                            [team.id, playerId, movementTime]
                        );
                    }
                }
            }

            // ADDS
            for (const playerId of add) {
                const pRes = await client.query(
                    `SELECT price FROM hoopstats.players WHERE id = $1`,
                    [playerId]
                );

                if (pRes.rows.length === 0) continue;

                const price = Number(pRes.rows[0].price);

                if (team.budget < price) {
                    throw new Error("No tenés presupuesto suficiente");
                }

                await client.query(
                    `INSERT INTO hoopstats.fantasy_players
                     (fantasy_team_id, player_id, price)
                     VALUES ($1, $2, $3)`,
                    [team.id, playerId, price]
                );

                // actualizar budget (para siguientes adds)
                team.budget -= price;

                await client.query(
                    `UPDATE hoopstats.fantasy_teams
                     SET budget = $1
                     WHERE id = $2`,
                    [team.budget, team.id]
                );

                for (const row of leaguesRes.rows) {
                    await client.query(
                        `INSERT INTO hoopstats.fantasy_trades
                         (fantasy_team_id, player_id, action, created_at, league_id)
                         VALUES ($1, $2, 'add', $3, $4)`,
                        [team.id, playerId, movementTime, row.league_id]
                    );
                }

                if (leaguesRes.rows.length === 0) {
                    await client.query(
                        `INSERT INTO hoopstats.fantasy_trades
                         (fantasy_team_id, player_id, action, created_at, league_id)
                         VALUES ($1, $2, 'add', $3, NULL)`,
                        [team.id, playerId, movementTime]
                    );
                }
            }

            await client.query("COMMIT");
            client.release();

            return res.json({
                message: "Cambios aplicados correctamente",
                movementTime
            });

        } catch (error) {
            await client.query("ROLLBACK");
            client.release();
            return res.status(400).json({ error: "Error al hacer la transacción." });
        }

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error inesperado" });
    }
};



export const getGroupedTransactionsByTeam = async (req: any, res: any) => {
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
        console.error("Error:", err);
        return res.status(500).json({ error: "Error al agrupar trades" });
    }
};
