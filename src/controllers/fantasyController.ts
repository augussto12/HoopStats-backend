import { pool } from "../db";
import { isMarketLocked } from "../services/market-lock";


// Obtener mi equipo de fantasy
export const getMyTeam = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;

        // 1. Buscamos el equipo
        const teamRes = await pool.query(
            "SELECT * FROM hoopstats.fantasy_teams WHERE user_id = $1",
            [userId]
        );

        if (teamRes.rows.length === 0) {
            return res.json({ team: null, players: [] });
        }

        const team = teamRes.rows[0];

        // 2. Buscamos los jugadores (AQUÍ ESTÁ EL TRUCO)
        const playersRes = await pool.query(
            `SELECT 
                p.id AS player_id, 
                p.full_name, 
                fp.price, 
                fp.total_pts, 
                fp.is_captain  -- <--- ESTA LÍNEA ES OBLIGATORIA
             FROM hoopstats.fantasy_players fp
             JOIN hoopstats.players p ON fp.player_id = p.id
             WHERE fp.fantasy_team_id = $1
             ORDER BY fp.id ASC`,
            [team.id]
        );

        return res.json({
            team,
            players: playersRes.rows
        });
    } catch (err) {
        res.status(500).json({ error: "Error al obtener equipo" });
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
        u.username
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

        // Obtener el equipo CON trades_remaining
        const teamRes = await pool.query(
            `SELECT id, trades_remaining
             FROM hoopstats.fantasy_teams
             WHERE user_id = $1`,
            [userId]
        );

        if (teamRes.rows.length === 0) {
            return res.status(400).json({ error: "No tenés equipo todavía" });
        }

        const team = teamRes.rows[0];

        const limiteDiario = 2;

        return res.json({
            teamId: team.id,
            tradesHoy: limiteDiario - team.trades_remaining,
            tradesRestantes: team.trades_remaining,
            limiteDiario
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
    const normalizeIds = (x: any) =>
        Array.isArray(x)
            ? [...new Set(x.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0))]
            : [];

    const addIds = normalizeIds(req.body?.add);
    const dropIds = normalizeIds(req.body?.drop);

    // máximo 10 movimientos (ajustalo si querés)
    if (addIds.length > 10 || dropIds.length > 10) {
        return res.status(400).json({ error: "Demasiados cambios en una sola operación." });
    }

    // no permitir el mismo id en add y drop
    const overlap = addIds.filter((id) => dropIds.includes(id));
    if (overlap.length) {
        return res.status(400).json({ error: "No podés agregar y quitar el mismo jugador." });
    }

    try {
        const locked = await isMarketLocked();
        if (locked) {
            return res.status(403).json({
                error: "El mercado está bloqueado. Intentá mañana a las 07:00 AM."
            });
        }

        const userId = req.user.userId;

        const client = await pool.connect();
        try {
            const teamRes = await client.query(
                `SELECT id, budget, trades_remaining
         FROM hoopstats.fantasy_teams
         WHERE user_id = $1`,
                [userId]
            );

            if (teamRes.rows.length === 0) {
                return res.status(400).json({ error: "No tenés equipo creado" });
            }

            const team = {
                ...teamRes.rows[0],
                budget: Number(teamRes.rows[0].budget),
                trades_remaining: Number(teamRes.rows[0].trades_remaining),
            };

            const nuevosTrades = Math.max(addIds.length, dropIds.length);

            if (nuevosTrades === 0) {
                return res.status(400).json({ error: "No hay cambios para aplicar." });
            }

            if (team.trades_remaining < nuevosTrades) {
                return res.status(400).json({ error: "No te quedan trades disponibles hoy." });
            }

            await client.query("BEGIN");

            const movementTime = new Date();

            // ============================
            //           DROPS
            // ============================
            for (const playerId of dropIds) {
                const delRes = await client.query(
                    `DELETE FROM hoopstats.fantasy_players
           WHERE fantasy_team_id = $1 AND player_id = $2
           RETURNING price`,
                    [team.id, playerId]
                );

                if (delRes.rows.length > 0) {
                    const price = Number(delRes.rows[0].price);

                    await client.query(
                        `UPDATE hoopstats.fantasy_teams
             SET budget = budget + $1
             WHERE id = $2`,
                        [price, team.id]
                    );

                    team.budget += price;

                    await client.query(
                        `INSERT INTO hoopstats.fantasy_trades
             (fantasy_team_id, player_id, action, created_at)
             VALUES ($1, $2, 'drop', $3)`,
                        [team.id, playerId, movementTime]
                    );
                }
            }

            // ============================
            //            ADDS
            // ============================
            for (const playerId of addIds) {
                // (Opcional pero recomendado) evitar duplicados antes de insertar
                const dup = await client.query(
                    `SELECT 1 FROM hoopstats.fantasy_players
           WHERE fantasy_team_id = $1 AND player_id = $2`,
                    [team.id, playerId]
                );
                if (dup.rows.length) continue;

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

                team.budget -= price;

                await client.query(
                    `UPDATE hoopstats.fantasy_teams
           SET budget = $1
           WHERE id = $2`,
                    [team.budget, team.id]
                );

                await client.query(
                    `INSERT INTO hoopstats.fantasy_trades
           (fantasy_team_id, player_id, action, created_at)
           VALUES ($1, $2, 'add', $3)`,
                    [team.id, playerId, movementTime]
                );
            }

            await client.query(
                `UPDATE hoopstats.fantasy_teams
         SET trades_remaining = trades_remaining - $1
         WHERE id = $2`,
                [nuevosTrades, team.id]
            );

            await client.query("COMMIT");

            return res.json({
                message: "Cambios aplicados correctamente",
                movementTime,
            });

        } catch (error) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: "Error al hacer la transacción." });
        } finally {
            client.release();
        }

    } catch (err) {
        return res.status(500).json({ error: "Error inesperado" });
    }
};

export const setCaptain = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const { teamId, playerId } = req.body; // <--- Recibimos ambos del body

        if (!teamId || !playerId) {
            return res.status(400).json({ error: "Faltan datos requeridos" });
        }

        // 1. Verificar mercado bloqueado
        const locked = await isMarketLocked();
        if (locked) {
            return res.status(403).json({
                error: "Mercado cerrado. No puedes cambiar el capitán mientras hay partidos."
            });
        }

        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            // 2. Seguridad: Verificar que el equipo pertenezca al usuario
            const teamCheck = await client.query(
                `SELECT id FROM hoopstats.fantasy_teams WHERE id = $1 AND user_id = $2`,
                [teamId, userId]
            );

            if (teamCheck.rows.length === 0) {
                return res.status(403).json({ error: "No tienes permiso sobre este equipo" });
            }

            // 3. Verificar que el jugador pertenezca a ese equipo
            const playerCheck = await client.query(
                `SELECT 1 FROM hoopstats.fantasy_players WHERE fantasy_team_id = $1 AND player_id = $2`,
                [teamId, playerId]
            );

            if (playerCheck.rows.length === 0) {
                return res.status(400).json({ error: "El jugador no integra este equipo" });
            }

            // 4. Operación Atómica: Quitar capitán actual y poner el nuevo
            await client.query(
                `UPDATE hoopstats.fantasy_players 
                 SET is_captain = false 
                 WHERE fantasy_team_id = $1`,
                [teamId]
            );

            await client.query(
                `UPDATE hoopstats.fantasy_players 
                 SET is_captain = true 
                 WHERE fantasy_team_id = $1 AND player_id = $2`,
                [teamId, playerId]
            );

            await client.query("COMMIT");
            return res.json({ message: "Capitán actualizado correctamente" });

        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error("Error al asignar capitán:", err);
        return res.status(500).json({ error: "Error interno del servidor" });
    }
};