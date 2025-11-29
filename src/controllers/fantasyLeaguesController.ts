import { pool } from "../db";
import { getStatusId } from "../utils/fantasy";
import { createNotification } from "./notificationController";

// ================================================================
//                         CREAR LIGA
// ================================================================
export const createLeague = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;

        const {
            name,
            privacy = "public",
            description = null,
            maxTeams = null
        } = req.body;

        // VALIDACIÓN NOMBRE
        if (!name || name.trim().length < 3) {
            return res.status(400).json({ error: "El nombre debe tener al menos 3 caracteres" });
        }

        // VALIDACIÓN maxTeams
        if (maxTeams !== null && (isNaN(maxTeams) || maxTeams < 2 || maxTeams > 50)) {
            return res.status(400).json({ error: "maxTeams debe estar entre 2 y 50" });
        }

        // LIMITE DE LIGAS
        const countRes = await pool.query(
            `SELECT COUNT(*) 
             FROM hoopstats.fantasy_leagues 
             WHERE created_by = $1`,
            [userId]
        );

        if (Number(countRes.rows[0].count) >= 3) {
            return res.status(400).json({
                error: "Sólo podés crear hasta 3 ligas."
            });
        }

        const activeLeagueStatusId = await getStatusId("league", "active");

        // CREAR LIGA
        const leagueRes = await pool.query(
            `INSERT INTO hoopstats.fantasy_leagues 
                (name, description, created_by, privacy, max_teams, status_id)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, name, description, privacy, max_teams, created_by, status_id`,
            [
                name.trim(),
                description,
                userId,
                privacy,
                maxTeams,
                activeLeagueStatusId
            ]
        );

        const leagueId = leagueRes.rows[0].id;

        const membershipActiveId = await getStatusId("membership", "active");

        // AUTO-ASIGNAR ADMIN
        await pool.query(
            `
            INSERT INTO hoopstats.fantasy_league_teams 
                (league_id, fantasy_team_id, is_admin, status_id)
            SELECT $1, ft.id, true, $2
            FROM hoopstats.fantasy_teams ft
            WHERE ft.user_id = $3
            `,
            [leagueId, membershipActiveId, userId]
        );

        return res.json({
            message: "Liga creada correctamente",
            league: leagueRes.rows[0]
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error al crear la liga" });
    }
};


// ================================================================
//                TRAER TODAS LAS LIGAS
// ================================================================
export const getAllLeagues = async (req: any, res: any) => {
    try {
        const leaguesRes = await pool.query(`
            SELECT 
                fl.id,
                fl.name,
                fl.description,
                fl.privacy,
                fl.max_teams, 
                fl.created_at,

                sl.code AS status_code,
                sl.description AS status_description,

                u.username AS creator_username,

                (
                    SELECT COUNT(*)
                    FROM hoopstats.fantasy_league_teams flt
                    WHERE flt.league_id = fl.id
                ) AS current_users

            FROM hoopstats.fantasy_leagues fl
            JOIN hoopstats.users u 
                ON u.id = fl.created_by
            JOIN hoopstats.fantasy_league_statuses sl
                ON sl.id = fl.status_id
                AND sl.scope = 'league'

            ORDER BY fl.created_at DESC
        `);

        return res.json(leaguesRes.rows);

    } catch (err) {
        console.error("Error getAllLeagues:", err);
        return res.status(500).json({ error: "Error al obtener ligas" });
    }
};




// ================================================================
//                ACTUALIZAR PRIVACIDAD / INFO LIGA
// ================================================================
export const updateLeague = async (req: any, res: any) => {
    try {
        const adminId = req.user.userId;
        const leagueId = parseInt(req.params.leagueId);
        const { name, description, privacy } = req.body;

        // Verificar admin
        const check = await pool.query(
            `
            SELECT 1
            FROM hoopstats.fantasy_league_teams flt
            JOIN hoopstats.fantasy_teams ft ON ft.id = flt.fantasy_team_id
            WHERE flt.league_id = $1 AND flt.is_admin = true AND ft.user_id = $2
            `,
            [leagueId, adminId]
        );

        if (check.rows.length === 0) {
            return res.status(403).json({ error: "No sos admin de esta liga" });
        }

        await pool.query(
            `
            UPDATE hoopstats.fantasy_leagues
            SET name = COALESCE($1, name),
                description = COALESCE($2, description),
                privacy = COALESCE($3, privacy)
            WHERE id = $4
            `,
            [name, description, privacy, leagueId]
        );

        return res.json({ message: "Liga actualizada correctamente" });

    } catch (err) {
        console.error("Error updating league:", err);
        return res.status(500).json({ error: "Error al actualizar la liga" });
    }
};


// ================================================================
//                      MIS LIGAS
// ================================================================
export const getMyLeagues = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;

        // 1) Ligas del usuario
        const leaguesRes = await pool.query(
            `
            SELECT 
                fl.*,
                flt.is_admin,
                flt.points AS my_points,
                flt.status_id AS my_status_id,
                sl.code AS my_status,
                sl.description AS my_status_desc,
                flt.joined_at,
                ft.id AS my_team_id,
                ft.name AS my_team_name
            FROM hoopstats.fantasy_league_teams flt
            JOIN hoopstats.fantasy_leagues fl ON fl.id = flt.league_id
            JOIN hoopstats.fantasy_teams ft ON ft.id = flt.fantasy_team_id
            JOIN hoopstats.fantasy_league_statuses sl ON sl.id = flt.status_id
            WHERE ft.user_id = $1
            ORDER BY fl.created_at DESC
            `,
            [userId]
        );

        const leagues = leaguesRes.rows;
        const response = [];

        for (const league of leagues) {
            const leagueId = league.id;

            // 2) Equipos dentro de la liga
            const teamsRes = await pool.query(
                `
                SELECT 
                    ft.id AS team_id,
                    ft.name AS team_name,
                    u.id AS user_id,
                    u.username AS owner,
                    flt.points,
                    sl.code AS status,
                    sl.description AS status_desc,
                    flt.is_admin
                FROM hoopstats.fantasy_league_teams flt
                JOIN hoopstats.fantasy_teams ft ON ft.id = flt.fantasy_team_id
                JOIN hoopstats.users u ON u.id = ft.user_id
                JOIN hoopstats.fantasy_league_statuses sl ON sl.id = flt.status_id
                WHERE flt.league_id = $1
                ORDER BY flt.points DESC
                `,
                [leagueId]
            );

            // 3) Últimos trades
            const tradesRes = await pool.query(
                `
                SELECT 
                    t.id,
                    t.player_id,
                    t.action,
                    t.created_at,
                    ft.name AS team_name,
                    u.username AS owner
                FROM hoopstats.fantasy_trades t
                JOIN hoopstats.fantasy_teams ft ON ft.id = t.fantasy_team_id
                JOIN hoopstats.users u ON u.id = ft.user_id
                WHERE t.league_id = $1
                ORDER BY t.created_at DESC
                LIMIT 10
                `,
                [leagueId]
            );

            response.push({
                league: {
                    id: league.id,
                    name: league.name,
                    description: league.description,
                    privacy: league.privacy,
                    status: league.status,
                    max_teams: league.max_teams,
                    created_at: league.created_at
                },
                me: {
                    team_id: league.my_team_id,
                    team_name: league.my_team_name,
                    is_admin: league.is_admin,
                    points: league.my_points,
                    status: league.my_status,
                    status_desc: league.my_status_desc,
                    joined_at: league.joined_at
                },
                teams: teamsRes.rows,
                recent_trades: tradesRes.rows
            });
        }

        return res.json(response);

    } catch (err) {
        console.error("Error fetching leagues:", err);
        return res.status(500).json({ error: "Error al obtener ligas" });
    }
};


// ================================================================
//              TOGGLE DE ADMINISTRACIÓN (PROMOVER / REVOCAR)
// ================================================================
export const transferAdmin = async (req: any, res: any) => {
    try {
        const adminId = req.user.userId;
        const leagueId = parseInt(req.params.leagueId);
        const { targetUserId } = req.body;

        // 1. Validar que el usuario que hace la acción es admin
        const current = await pool.query(`
            SELECT ft.id AS team_id
            FROM hoopstats.fantasy_league_teams flt
            JOIN hoopstats.fantasy_teams ft ON ft.id = flt.fantasy_team_id
            WHERE flt.league_id = $1 AND ft.user_id = $2 AND flt.is_admin = true
        `, [leagueId, adminId]);

        if (current.rows.length === 0) {
            return res.status(403).json({ error: "No sos admin de esta liga" });
        }

        // 2. Verificar si el target actualmente es admin
        const target = await pool.query(`
            SELECT flt.is_admin
            FROM hoopstats.fantasy_league_teams flt
            JOIN hoopstats.fantasy_teams ft ON ft.id = flt.fantasy_team_id
            WHERE flt.league_id = $1 AND ft.user_id = $2
        `, [leagueId, targetUserId]);

        if (target.rows.length === 0) {
            return res.status(404).json({ error: "El usuario no forma parte de la liga" });
        }

        const isCurrentlyAdmin = target.rows[0].is_admin;

        // 3. Toggle admin
        const newStatus = !isCurrentlyAdmin;

        await pool.query(`
            UPDATE hoopstats.fantasy_league_teams flt
            SET is_admin = $3
            FROM hoopstats.fantasy_teams ft
            WHERE flt.league_id = $1
            AND ft.id = flt.fantasy_team_id
            AND ft.user_id = $2
        `, [leagueId, targetUserId, newStatus]);


        // 4. Obtener nombre de liga
        const leagueRes = await pool.query(`
            SELECT name FROM hoopstats.fantasy_leagues WHERE id = $1
        `, [leagueId]);

        const leagueName = leagueRes.rows[0].name;


        // 5. Notificación según acción
        if (newStatus) {
            await createNotification(
                targetUserId,
                "admin_promoted",
                "Ahora sos administrador",
                `Fuiste promovido a administrador en "${leagueName}"`,
                { leagueId }
            );
        } else {
            await createNotification(
                targetUserId,
                "admin_revoked",
                "Ya no sos administrador",
                `Has dejado de tener el rol de administrador en la liga "${leagueName}"`,
                { leagueId }
            );
        }

        return res.json({
            message: newStatus
                ? "Usuario promovido a administrador"
                : "El usuario ya no es administrador"
        });

    } catch (err) {
        console.error("Error toggling admin:", err);
        return res.status(500).json({ error: "Error al cambiar rol de administrador" });
    }
};




// ================================================================
//                     EXPULSAR USUARIO
// ================================================================
export const inactivateMember = async (req: any, res: any) => {
    try {
        const adminId = req.user.userId;
        const leagueId = parseInt(req.params.leagueId);
        const userId = parseInt(req.params.userId);

        const check = await pool.query(`
            SELECT 1
            FROM hoopstats.fantasy_league_teams flt
            JOIN hoopstats.fantasy_teams ft ON ft.id = flt.fantasy_team_id
            WHERE flt.league_id = $1 AND flt.is_admin = true AND ft.user_id = $2
        `, [leagueId, adminId]);

        if (check.rows.length === 0) {
            return res.status(403).json({ error: "No sos admin de esta liga" });
        }

        const inactiveId = await getStatusId("membership", "inactive");

        await pool.query(`
            UPDATE hoopstats.fantasy_league_teams flt
            SET status_id = $1
            FROM hoopstats.fantasy_teams ft
            WHERE flt.fantasy_team_id = ft.id
            AND ft.user_id = $2
            AND flt.league_id = $3
        `, [inactiveId, userId, leagueId]);

        // → Notificación
        const leagueRes = await pool.query(`SELECT name FROM hoopstats.fantasy_leagues WHERE id = $1`, [leagueId]);
        const leagueName = leagueRes.rows[0].name;

        await createNotification(
            userId,
            "membership_inactive",
            "Fuiste marcado como inactivo",
            `Tu participación en "${leagueName}" fue marcada como inactiva.`,
            { leagueId }
        );

        return res.json({ message: "Usuario marcado como inactivo" });

    } catch (err) {
        console.error("Error kicking member:", err);
        return res.status(500).json({ error: "Error al expulsar usuario" });
    }
};



// ================================================================
//                EQUIPOS DE LA LIGA
// ================================================================
export const getLeagueTeams = async (req: any, res: any) => {
    try {
        const leagueId = parseInt(req.params.leagueId);

        const teams = await pool.query(
            `
            SELECT 
                ft.id AS team_id,
                ft.name AS team_name,
                u.username AS owner,
                flt.is_admin,
                flt.points,
                sl.code AS status,
                sl.description AS status_desc
            FROM hoopstats.fantasy_league_teams flt
            JOIN hoopstats.fantasy_teams ft ON ft.id = flt.fantasy_team_id
            JOIN hoopstats.users u ON u.id = ft.user_id
            JOIN hoopstats.fantasy_league_statuses sl ON sl.id = flt.status_id
            WHERE flt.league_id = $1
            ORDER BY flt.points DESC
            `,
            [leagueId]
        );

        return res.json(teams.rows);

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error al obtener equipos de la liga" });
    }
};


// ================================================================
//                     RANKING
// ================================================================
export const getLeagueRanking = async (req: any, res: any) => {
    try {
        const leagueId = parseInt(req.params.leagueId);
        const activeId = await getStatusId("membership", "active");

        const ranking = await pool.query(
            `
            SELECT 
                ft.id AS team_id,
                ft.name AS team_name,
                u.username AS owner,
                ltu.points AS league_points
            FROM hoopstats.fantasy_league_teams ltu
            JOIN hoopstats.fantasy_teams ft ON ft.id = ltu.fantasy_team_id
            JOIN hoopstats.users u ON u.id = ft.user_id
            WHERE ltu.league_id = $1
            AND ltu.status_id = $2
            ORDER BY ltu.points DESC
            `,
            [leagueId, activeId]
        );

        return res.json(ranking.rows);

    } catch (err) {
        console.error("Error getting league ranking:", err);
        return res.status(500).json({ error: "Error al obtener ranking" });
    }
};


// ================================================================
//             LIGAS CREADAS POR EL USUARIO (ADMIN PANEL)
// ================================================================
export const getMyCreatedLeagues = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;

        const leaguesRes = await pool.query(
            `
            SELECT *
            FROM hoopstats.fantasy_leagues
            WHERE created_by = $1
            ORDER BY created_at DESC
            `,
            [userId]
        );

        const leagues = leaguesRes.rows;
        const response = [];

        for (const league of leagues) {
            const leagueId = league.id;

            // Miembros
            const membersRes = await pool.query(
                `
                SELECT 
                    u.id,
                    u.username,
                    u.email,
                    flt.is_admin,
                    sl.code AS status,
                    sl.description AS status_desc
                FROM hoopstats.fantasy_league_teams flt
                JOIN hoopstats.fantasy_teams ft ON ft.id = flt.fantasy_team_id
                JOIN hoopstats.users u ON u.id = ft.user_id
                JOIN hoopstats.fantasy_league_statuses sl ON sl.id = flt.status_id
                WHERE flt.league_id = $1
                `,
                [leagueId]
            );

            const members = membersRes.rows.map(m => ({
                id: m.id,
                username: m.username,
                email: m.email,
                role: m.is_admin ? "admin" : "member",
                status: m.status,
                status_desc: m.status_desc,
                origin: "team"
            }));

            // Invitaciones
            const invitesRes = await pool.query(
                `
                SELECT 
                    i.id AS invite_id,
                    i.invited_user_id AS user_id,
                    u.username,
                    u.email,
                    sl.code AS status,
                    sl.description AS status_desc
                FROM hoopstats.fantasy_league_invites i
                JOIN hoopstats.users u ON u.id = i.invited_user_id
                JOIN hoopstats.fantasy_league_statuses sl ON sl.id = i.status_id
                WHERE i.league_id = $1
                AND sl.code IN ('pending', 'rejected')   -- 🔥 FILTRO CLAVE
                `,
                [leagueId]
            );

            const invites = invitesRes.rows.map(i => ({
                id: i.user_id,
                username: i.username,
                email: i.email,
                status: i.status,
                status_desc: i.status_desc,
                invite_id: i.invite_id,
                role: "member",
                origin: "invite"
            }));

            response.push({
                league,
                members: [...members, ...invites]
            });
        }

        return res.json(response);

    } catch (err) {
        console.error("Error getMyCreatedLeagues:", err);
        return res.status(500).json({ error: "Error al obtener ligas creadas" });
    }
};



// ================================================================
//             LIGAS DE LAS QUE SOY ADMIN
// ================================================================
export const getLeaguesWhereImAdmin = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;

        // 1) TRAER LIGAS DONDE SOY ADMIN
        const leaguesRes = await pool.query(
            `
            SELECT fl.*
            FROM hoopstats.fantasy_leagues fl
            JOIN hoopstats.fantasy_league_teams flt ON flt.league_id = fl.id
            JOIN hoopstats.fantasy_teams ft ON ft.id = flt.fantasy_team_id
            WHERE ft.user_id = $1
            AND flt.is_admin = true
            ORDER BY fl.created_at DESC
            `,
            [userId]
        );

        const leagues = leaguesRes.rows;
        const response = [];

        // 2) RECORRER LIGAS PARA ARMAR LA MISMA ESTRUCTURA DE getMyCreatedLeagues
        for (const league of leagues) {
            const leagueId = league.id;

            // --- MIEMBROS ---
            const membersRes = await pool.query(
                `
            SELECT 
                u.id,
                u.username,
                u.email,
                flt.is_admin,
                sl.code AS status,
                sl.description AS status_desc
            FROM hoopstats.fantasy_league_teams flt
            JOIN hoopstats.fantasy_teams ft ON ft.id = flt.fantasy_team_id
            JOIN hoopstats.users u ON u.id = ft.user_id
            JOIN hoopstats.fantasy_league_statuses sl ON sl.id = flt.status_id
            WHERE flt.league_id = $1
            AND sl.code IN ('active', 'pending') 
            `,
                [leagueId]
            );


            const members = membersRes.rows.map(m => ({
                id: m.id,
                username: m.username,
                email: m.email,
                role: m.is_admin ? "admin" : "member",
                status: m.status,
                status_desc: m.status_desc,
                origin: "team"
            }));

            // --- INVITACIONES ---
            const invitesRes = await pool.query(
                `
            SELECT 
                i.id AS invite_id,
                i.invited_user_id AS user_id,
                u.username,
                u.email,
                sl.code AS status,
                sl.description AS status_desc
            FROM hoopstats.fantasy_league_invites i
            JOIN hoopstats.users u ON u.id = i.invited_user_id
            JOIN hoopstats.fantasy_league_statuses sl ON sl.id = i.status_id
            WHERE i.league_id = $1
            AND sl.code = 'pending' 
            `,
                [leagueId]
            );


            const invites = invitesRes.rows.map(i => ({
                id: i.user_id,
                username: i.username,
                email: i.email,
                status: i.status,
                status_desc: i.status_desc,
                invite_id: i.invite_id,
                role: "member",
                origin: "invite"
            }));

            // MISMA ESTRUCTURA QUE getMyCreatedLeagues
            response.push({
                league,
                members: [...members, ...invites]
            });
        }

        return res.json(response);

    } catch (err) {
        console.error("Error getLeaguesWhereImAdmin:", err);
        return res.status(500).json({ error: "Error al obtener ligas administradas" });
    }
};


export const getLeagueDetails = async (req: any, res: any) => {
    try {
        const leagueId = parseInt(req.params.leagueId);

        if (isNaN(leagueId)) {
            return res.status(400).json({ error: "ID de liga inválido" });
        }

        // Datos básicos de la liga
        const leagueRes = await pool.query(`
            SELECT *
            FROM hoopstats.fantasy_leagues
            WHERE id = $1
        `, [leagueId]);

        if (leagueRes.rows.length === 0) {
            return res.status(404).json({ error: "Liga no encontrada" });
        }

        const league = leagueRes.rows[0];

        // Equipos + puntos reales
        const teamsRes = await pool.query(`
            SELECT 
                ft.id AS team_id,
                ft.name AS team_name,
                u.username AS owner,
                COALESCE(flt.points, 0) AS points
            FROM hoopstats.fantasy_league_teams flt
            JOIN hoopstats.fantasy_teams ft ON ft.id = flt.fantasy_team_id
            JOIN hoopstats.users u ON u.id = ft.user_id
            WHERE flt.league_id = $1
            ORDER BY flt.points DESC
        `, [leagueId]);

        return res.json({
            league,
            teams: teamsRes.rows
        });

    } catch (err) {
        console.error("Error getLeagueDetails:", err);
        return res.status(500).json({ error: "Error al obtener datos de liga" });
    }
};



// ================================================================
//                          ESTADO ADMIN
// ================================================================
export const getMyAdminStatus = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;

        const result = await pool.query(
            `
            SELECT 1
            FROM hoopstats.fantasy_league_teams flt
            JOIN hoopstats.fantasy_teams ft
              ON ft.id = flt.fantasy_team_id
            WHERE ft.user_id = $1
              AND flt.is_admin = true
            LIMIT 1
            `,
            [userId]
        );

        return res.json({ isAdmin: result.rowCount! > 0 });

    } catch (err) {
        console.error("Error getMyAdminStatus:", err);
        return res.status(500).json({ error: "Error al obtener estado admin" });
    }
};


// ================================================================
//                     ELIMINAR USUARIO DE LA LIGA
// ================================================================
export const deleteMember = async (req: any, res: any) => {
    try {
        const adminId = req.user.userId;
        const leagueId = parseInt(req.params.leagueId);
        const userId = parseInt(req.params.userId);

        // Verificar admin
        const check = await pool.query(`
            SELECT 1
            FROM hoopstats.fantasy_league_teams flt
            JOIN hoopstats.fantasy_teams ft ON ft.id = flt.fantasy_team_id
            WHERE flt.league_id = $1
            AND flt.is_admin = true
            AND ft.user_id = $2
        `, [leagueId, adminId]);

        if (check.rows.length === 0) {
            return res.status(403).json({ error: "No sos admin de esta liga" });
        }

        // ❗ No podés borrar al creador
        const league = await pool.query(`SELECT created_by, name FROM hoopstats.fantasy_leagues WHERE id = $1`, [leagueId]);

        if (league.rows[0].created_by === userId) {
            return res.status(403).json({ error: "No podés eliminar al creador de la liga" });
        }

        // Eliminar
        const deleteRes = await pool.query(`
            DELETE FROM hoopstats.fantasy_league_teams flt
            USING hoopstats.fantasy_teams ft
            WHERE flt.fantasy_team_id = ft.id
            AND ft.user_id = $1
            AND flt.league_id = $2
            RETURNING flt.fantasy_team_id
        `, [userId, leagueId]);

        if (deleteRes.rows.length === 0) {
            return res.status(404).json({ error: "El usuario no pertenece a esta liga" });
        }

        // → Notificación
        await createNotification(
            userId,
            "member_deleted",
            "Fuiste eliminado de la liga",
            `Fuiste eliminado permanentemente de la liga "${league.rows[0].name}"`,
            { leagueId }
        );

        return res.json({ message: "Usuario eliminado definitivamente de la liga" });

    } catch (err) {
        console.error("Error deleting member:", err);
        return res.status(500).json({ error: "Error al eliminar usuario" });
    }
};

export const isMemberOfLeague = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const leagueId = parseInt(req.params.leagueId);

        const result = await pool.query(
            `
            SELECT flt.is_admin
            FROM hoopstats.fantasy_league_teams flt
            JOIN hoopstats.fantasy_teams ft ON ft.id = flt.fantasy_team_id
            WHERE flt.league_id = $1
            AND ft.user_id = $2
            LIMIT 1
            `,
            [leagueId, userId]
        );

        if (result.rows.length === 0) {
            return res.json({ isMember: false, isAdmin: false });
        }

        return res.json({
            isMember: true,
            isAdmin: result.rows[0].is_admin
        });

    } catch (err) {
        console.error("Error isMember:", err);
        return res.status(500).json({ error: "Error al verificar membresía" });
    }
};

export const leaveLeague = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const leagueId = parseInt(req.params.leagueId);

        // No dejar salir al creador
        const league = await pool.query(
            `SELECT created_by, name FROM hoopstats.fantasy_leagues WHERE id = $1`,
            [leagueId]
        );

        if (league.rows.length === 0) {
            return res.status(404).json({ error: "Liga no encontrada" });
        }

        if (league.rows[0].created_by === userId) {
            return res.status(403).json({
                error: "El creador no puede abandonar la liga"
            });
        }

        // Eliminar membresía
        const deleteRes = await pool.query(
            `
            DELETE FROM hoopstats.fantasy_league_teams flt
            USING hoopstats.fantasy_teams ft
            WHERE flt.fantasy_team_id = ft.id
            AND ft.user_id = $1
            AND flt.league_id = $2
            RETURNING flt.fantasy_team_id
            `,
            [userId, leagueId]
        );

        if (deleteRes.rows.length === 0) {
            return res.status(404).json({
                error: "No sos miembro de la liga"
            });
        }

        return res.json({ message: "Abandonaste la liga correctamente" });

    } catch (err) {
        console.error("Error leaveLeague:", err);
        return res.status(500).json({ error: "Error al abandonar liga" });
    }
};
