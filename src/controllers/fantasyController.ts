import { pool } from "../db";
import { isMarketLocked } from "../services/market-lock";


// Obtener mi equipo de fantasy
export const getMyTeam = async (req: any, res: any) => {

    try {
        const userId = req.user.userId;

        const teamRes = await pool.query(
            "SELECT * FROM hoopstats.fantasy_teams WHERE user_id = $1",
            [userId]
        );

        if (teamRes.rows.length === 0) {
            return res.json({ team: null, players: [] });
        }

        const team = teamRes.rows[0];

        const playersRes = await pool.query(
            `SELECT 
                p.id AS player_id, 
                p.full_name, 
                fp.price, 
                fp.total_pts, 
                fp.is_captain 
             FROM hoopstats.fantasy_players fp
             JOIN hoopstats.players p ON fp.player_id = p.id
             WHERE fp.fantasy_team_id = $1`,
            [team.id]
        );

        return res.json({
            team,
            players: playersRes.rows
        });

    } catch (err) {
        console.error("💥 [BE] /fantasy/my-team ERROR", err);
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
    const reqId = Math.random().toString(36).slice(2, 8);
    const t0 = Date.now();
    const log = (...a: any[]) => console.log(`🔁 [applyTrades ${reqId}]`, ...a);
    const logErr = (...a: any[]) => console.error(`💥 [applyTrades ${reqId}]`, ...a);

    const normalizeIds = (x: any) =>
        Array.isArray(x)
            ? [...new Set(x.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0))]
            : [];

    const addIds = normalizeIds(req.body?.add);
    const dropIds = normalizeIds(req.body?.drop);

    log("START", "user:", req.user?.userId, "add:", addIds, "drop:", dropIds);

    if (addIds.length > 10 || dropIds.length > 10) {
        return res.status(400).json({ error: "Demasiados cambios en una sola operación." });
    }

    const overlap = addIds.filter((id) => dropIds.includes(id));
    if (overlap.length) {
        return res.status(400).json({ error: "No podés agregar y quitar el mismo jugador." });
    }

    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "No autenticado" });

    const client = await pool.connect();
    let inTx = false;

    try {
        // ✅ Arrancá transacción primero (para que TODO use el mismo client)
        log("BEGIN...");
        await client.query("BEGIN");
        inTx = true;

        // 🔥 Evita cuelgues infinitos
        await client.query(`SET LOCAL lock_timeout = '1500ms'`);
        await client.query(`SET LOCAL statement_timeout = '8000ms'`);

        // ✅ Market lock usando el MISMO CLIENT (clave para que no se cuelgue)
        log("Check market lock (same tx/client)...");
        const locked = await isMarketLocked(client);
        log("Market lock =", locked);

        if (locked) {
            await client.query("ROLLBACK");
            inTx = false;
            return res.status(403).json({
                error: "El mercado está bloqueado. Intentá mañana a las 07:00 AM."
            });
        }

        // ✅ Lock del equipo: FOR UPDATE NOWAIT (si hay otra request, responde 409, no cuelga)
        log("Lock team row (FOR UPDATE NOWAIT)...");
        const teamRes = await client.query(
            `SELECT id, budget, trades_remaining
       FROM hoopstats.fantasy_teams
       WHERE user_id = $1
       FOR UPDATE NOWAIT`,
            [userId]
        );

        if ((teamRes.rowCount ?? 0) === 0) {
            await client.query("ROLLBACK");
            inTx = false;
            return res.status(400).json({ error: "No tenés equipo creado" });
        }

        const teamId = Number(teamRes.rows[0].id);
        let budget = Number(teamRes.rows[0].budget);
        const tradesRemaining = Number(teamRes.rows[0].trades_remaining);

        const nuevosTrades = Math.max(addIds.length, dropIds.length);
        if (nuevosTrades === 0) {
            await client.query("ROLLBACK");
            inTx = false;
            return res.status(400).json({ error: "No hay cambios para aplicar." });
        }

        if (tradesRemaining < nuevosTrades) {
            await client.query("ROLLBACK");
            inTx = false;
            return res.status(400).json({ error: "No te quedan trades disponibles hoy." });
        }

        const movementTime = new Date();

        // ============================
        //           DROPS
        // ============================
        for (const playerId of dropIds) {
            log("DROP", playerId);

            const delRes = await client.query(
                `DELETE FROM hoopstats.fantasy_players
         WHERE fantasy_team_id = $1 AND player_id = $2
         RETURNING price`,
                [teamId, playerId]
            );

            if ((delRes.rowCount ?? 0) > 0) {
                const price = Number(delRes.rows[0].price);

                await client.query(
                    `UPDATE hoopstats.fantasy_teams
           SET budget = budget + $1
           WHERE id = $2`,
                    [price, teamId]
                );

                budget += price;

                await client.query(
                    `INSERT INTO hoopstats.fantasy_trades
           (fantasy_team_id, player_id, action, created_at)
           VALUES ($1, $2, 'drop', $3)`,
                    [teamId, playerId, movementTime]
                );
            }
        }

        // ============================
        //            ADDS
        // ============================
        for (const playerId of addIds) {
            log("ADD", playerId);

            const dup = await client.query(
                `SELECT 1 FROM hoopstats.fantasy_players
         WHERE fantasy_team_id = $1 AND player_id = $2`,
                [teamId, playerId]
            );
            if ((dup.rowCount ?? 0) > 0) continue;

            const pRes = await client.query(
                `SELECT price FROM hoopstats.players WHERE id = $1`,
                [playerId]
            );
            if ((pRes.rowCount ?? 0) === 0) continue;

            const price = Number(pRes.rows[0].price);

            if (budget < price) {
                throw new Error("No tenés presupuesto suficiente");
            }

            await client.query(
                `INSERT INTO hoopstats.fantasy_players (fantasy_team_id, player_id, price)
         VALUES ($1, $2, $3)`,
                [teamId, playerId, price]
            );

            await client.query(
                `UPDATE hoopstats.fantasy_teams
         SET budget = budget - $1
         WHERE id = $2`,
                [price, teamId]
            );

            budget -= price;

            await client.query(
                `INSERT INTO hoopstats.fantasy_trades
         (fantasy_team_id, player_id, action, created_at)
         VALUES ($1, $2, 'add', $3)`,
                [teamId, playerId, movementTime]
            );
        }

        await client.query(
            `UPDATE hoopstats.fantasy_teams
       SET trades_remaining = trades_remaining - $1
       WHERE id = $2`,
            [nuevosTrades, teamId]
        );

        await client.query("COMMIT");
        inTx = false;

        log(`END OK total=${Date.now() - t0} ms`);
        return res.json({ message: "Cambios aplicados correctamente", movementTime });

    } catch (e: any) {
        // Si otra request ya lockeó el team -> NOWAIT da 55P03
        if (e?.code === "55P03") {
            if (inTx) {
                try { await client.query("ROLLBACK"); } catch { }
            }
            return res.status(409).json({ error: "Ya hay un trade en curso. Esperá un segundo y reintentá." });
        }

        logErr("ERROR:", e);

        if (inTx) {
            try { await client.query("ROLLBACK"); } catch { }
        }

        return res.status(400).json({ error: e?.message || "Error al hacer la transacción." });

    } finally {
        client.release();
    }
};


export const setCaptain = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const { teamId, playerId } = req.body;

        if (!teamId || !playerId) {
            return res.status(400).json({ error: "Faltan datos requeridos" });
        }

        const locked = await isMarketLocked();
        if (locked) {
            return res.status(403).json({ error: "Mercado cerrado. No puedes cambiar el capitán mientras hay partidos." });
        }

        // ✅ 1 sola query: verifica equipo del usuario + que el jugador esté en el equipo
        const q = `
      WITH team_ok AS (
        SELECT 1
        FROM hoopstats.fantasy_teams
        WHERE id = $1 AND user_id = $2
      ),
      player_ok AS (
        SELECT 1
        FROM hoopstats.fantasy_players
        WHERE fantasy_team_id = $1 AND player_id = $3
          AND EXISTS (SELECT 1 FROM team_ok)
      ),
      clear AS (
        UPDATE hoopstats.fantasy_players
        SET is_captain = false
        WHERE fantasy_team_id = $1
          AND EXISTS (SELECT 1 FROM player_ok)
        RETURNING 1
      ),
      setcap AS (
        UPDATE hoopstats.fantasy_players
        SET is_captain = true
        WHERE fantasy_team_id = $1 AND player_id = $3
          AND EXISTS (SELECT 1 FROM player_ok)
        RETURNING 1
      )
      SELECT
        EXISTS (SELECT 1 FROM team_ok) AS team_ok,
        EXISTS (SELECT 1 FROM player_ok) AS player_ok,
        (SELECT count(*) FROM setcap) AS updated;
    `;

        const r = await pool.query(q, [teamId, userId, playerId]);

        const teamOk = r.rows[0]?.team_ok;
        const playerOk = r.rows[0]?.player_ok;
        const updated = Number(r.rows[0]?.updated || 0);

        if (!teamOk) return res.status(403).json({ error: "No tienes permiso sobre este equipo" });
        if (!playerOk) return res.status(400).json({ error: "El jugador no integra este equipo" });
        if (updated === 0) return res.status(400).json({ error: "No se pudo actualizar capitán" });

        return res.json({ message: "Capitán actualizado correctamente" });
    } catch (err) {
        console.error("Error al asignar capitán:", err);
        return res.status(500).json({ error: "Error interno del servidor" });
    }
};

