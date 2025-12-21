import { pool } from "../db";
import { getStatusId, getUsername } from "../utils/fantasy";
import { createNotification } from "./notificationController";

// Helper para IDs
const toPositiveInt = (value: any) => {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
};

// ================================================================
//                 USUARIO PIDE UNIRSE A LIGA
// ================================================================
export const requestJoinLeague = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const leagueId = toPositiveInt(req.params.leagueId);

        if (!leagueId) {
            return res.status(400).json({ error: "ID de liga inválido" });
        }

        const leagueRes = await pool.query(
            `
            SELECT 
                name, 
                privacy, 
                created_by,
                max_teams
            FROM fantasy_leagues 
            WHERE id = $1
            `,
            [leagueId]
        );

        if (leagueRes.rows.length === 0) {
            return res.status(404).json({ error: "Liga no encontrada" });
        }

        const {
            name: leagueName,
            privacy,
            created_by,
            max_teams
        } = leagueRes.rows[0];

        // Normalizamos maxTeams (puede venir como string/number/null desde PG)
        const maxTeams =
            max_teams === null || max_teams === undefined
                ? null
                : Number(max_teams);

        const teamRes = await pool.query(
            `SELECT id FROM fantasy_teams WHERE user_id = $1`,
            [userId]
        );

        if (teamRes.rows.length === 0) {
            return res.status(400).json({ error: "Debés crear un equipo primero" });
        }

        const teamId = teamRes.rows[0].id;

        // ya está en la liga
        const exists = await pool.query(
            `
            SELECT 1 
            FROM fantasy_league_teams
            WHERE league_id = $1 AND fantasy_team_id = $2
            `,
            [leagueId, teamId]
        );

        if (exists.rows.length > 0) {
            return res.status(400).json({ error: "Ya estás en esta liga" });
        }

        // 🔐 Chequeo de capacidad (si la liga tiene max_teams definido)
        if (maxTeams !== null) {
            const countRes = await pool.query(
                `
                SELECT COUNT(*) 
                FROM fantasy_league_teams
                WHERE league_id = $1
                `,
                [leagueId]
            );

            const currentTeams = Number(countRes.rows[0].count);

            if (currentTeams >= maxTeams) {
                return res.status(400).json({
                    error: "La liga ya alcanzó el máximo de equipos permitido"
                });
            }
        }

        // Liga pública → se une directamente
        if (privacy === "public") {
            const activeId = await getStatusId("membership", "active");

            const membershipInsert = await pool.query(
                `
                INSERT INTO fantasy_league_teams 
                    (league_id, fantasy_team_id, status_id)
                VALUES ($1, $2, $3)
                RETURNING id
                `,
                [leagueId, teamId, activeId]
            );

            const membershipId = membershipInsert.rows[0].id;
            const byUserName = await getUsername(userId);

            await createNotification(
                created_by,
                "join",
                "Nuevo miembro en tu liga",
                `${byUserName} se unió a ${leagueName}`,
                { membershipId, leagueId, byUserId: userId, byUserName, leagueName }
            );

            return res.json({ message: "Te uniste a la liga (pública)" });
        }

        // Liga privada → crea solicitud pending
        const pendingId = await getStatusId("request", "pending");

        // ¿Ya tiene una solicitud pendiente para esta liga?
        const existingRequest = await pool.query(
            `
            SELECT 1
            FROM fantasy_league_requests
            WHERE league_id = $1
              AND user_id = $2
              AND status_id = $3
            `,
            [leagueId, userId, pendingId]
        );

        if (existingRequest.rows.length > 0) {
            return res.status(400).json({
                error: "Ya tenés una solicitud pendiente para esta liga"
            });
        }

        const reqInsert = await pool.query(
            `
            INSERT INTO fantasy_league_requests
                (league_id, user_id, status_id)
            VALUES ($1, $2, $3)
            RETURNING id
            `,
            [leagueId, userId, pendingId]
        );

        const requestId = reqInsert.rows[0].id;
        const byUserName = await getUsername(userId);

        await createNotification(
            created_by,
            "join_request",
            "Nueva solicitud de unión",
            `${byUserName} pidió unirse a ${leagueName}`,
            { requestId, leagueId, byUserId: userId, byUserName, leagueName }
        );

        return res.json({ message: "Solicitud enviada al administrador" });

    } catch (err) {
        console.error("Error request join:", err);
        return res.status(500).json({ error: "Error al pedir unirse" });
    }
};


// ================================================================
//              ADMIN APRUEBA SOLICITUD
// ================================================================
export const approveJoinRequest = async (req: any, res: any) => {
    try {
        const adminId = req.user.userId;
        const requestId = toPositiveInt(req.params.requestId);

        if (!requestId) {
            return res.status(400).json({ error: "ID de solicitud inválido" });
        }

        const reqRes = await pool.query(
            `
            SELECT lr.*, fl.created_by, fl.name AS league_name
            FROM fantasy_league_requests lr
            JOIN fantasy_leagues fl ON fl.id = lr.league_id
            WHERE lr.id = $1
            `,
            [requestId]
        );

        if (reqRes.rows.length === 0) {
            return res.status(404).json({ error: "Solicitud no encontrada" });
        }

        const request = reqRes.rows[0];

        if (request.created_by !== adminId) {
            return res.status(403).json({ error: "No sos admin de esta liga" });
        }

        const team = await pool.query(
            `SELECT id FROM fantasy_teams WHERE user_id = $1`,
            [request.user_id]
        );

        if (team.rows.length === 0) {
            return res.status(400).json({ error: "El usuario no tiene equipo" });
        }

        const teamId = team.rows[0].id;

        const activeId = await getStatusId("membership", "active");
        const acceptedId = await getStatusId("request", "accepted");

        await pool.query(
            `
            INSERT INTO fantasy_league_teams
                (league_id, fantasy_team_id, status_id)
            VALUES ($1, $2, $3)
            `,
            [request.league_id, teamId, activeId]
        );

        await pool.query(
            `
            UPDATE fantasy_league_requests
            SET status_id = $1
            WHERE id = $2
            `,
            [acceptedId, requestId]
        );

        await createNotification(
            request.user_id,
            "join_request_approved",
            "Solicitud aprobada",
            `Fuiste aceptado en la liga ${request.league_name}`,
            { requestId, leagueId: request.league_id }
        );

        return res.json({ message: "Solicitud aprobada" });

    } catch (err) {
        console.error("Error approving join:", err);
        return res.status(500).json({ error: "Error al aprobar solicitud" });
    }
};


// ================================================================
//                    ADMIN RECHAZA SOLICITUD
// ================================================================
export const rejectJoinRequest = async (req: any, res: any) => {
    try {
        const adminId = req.user.userId;
        const requestId = toPositiveInt(req.params.requestId);

        if (!requestId) {
            return res.status(400).json({ error: "ID de solicitud inválido" });
        }

        const reqRes = await pool.query(
            `
            SELECT lr.*, fl.created_by, fl.name AS league_name
            FROM fantasy_league_requests lr
            JOIN fantasy_leagues fl ON fl.id = lr.league_id
            WHERE lr.id = $1
            `,
            [requestId]
        );

        if (reqRes.rows.length === 0) {
            return res.status(404).json({ error: "Solicitud no encontrada" });
        }

        const request = reqRes.rows[0];

        if (request.created_by !== adminId) {
            return res.status(403).json({ error: "No sos admin de esta liga" });
        }

        const rejectedId = await getStatusId("request", "rejected");

        await pool.query(
            `
            UPDATE fantasy_league_requests
            SET status_id = $1
            WHERE id = $2
            `,
            [rejectedId, requestId]
        );

        await createNotification(
            request.user_id,
            "join_request_rejected",
            "Solicitud rechazada",
            `Tu solicitud para unirte a la liga ${request.league_name} fue rechazada`,
            { requestId, leagueId: request.league_id }
        );

        return res.json({ message: "Solicitud rechazada" });

    } catch (err) {
        console.error("Error rejecting join:", err);
        return res.status(500).json({ error: "Error al rechazar solicitud" });
    }
};



// ================================================================
//                     CANCELAR REQUEST (usuario)
// ================================================================
export const cancelRequest = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const requestId = toPositiveInt(req.params.requestId);

        if (!requestId) {
            return res.status(400).json({ error: "ID de solicitud inválido" });
        }

        const pendingId = await getStatusId("request", "pending");

        const result = await pool.query(
            `
            DELETE FROM fantasy_league_requests
            WHERE id = $1 AND user_id = $2 AND status_id = $3
            RETURNING id
            `,
            [requestId, userId, pendingId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Solicitud no encontrada o ya procesada" });
        }

        return res.json({ message: "Solicitud cancelada" });

    } catch (err) {
        console.error("Error cancel request:", err);
        return res.status(500).json({ error: "Error al cancelar solicitud" });
    }
};


// ================================================================
//                  ADMIN INVITA USUARIO
// ================================================================
export const inviteUserToLeague = async (req: any, res: any) => {
    try {
        const adminId = req.user.userId;
        const leagueId = toPositiveInt(req.params.leagueId);
        const rawUserId = req.body?.userId;
        const userId = toPositiveInt(rawUserId);

        if (!leagueId) {
            return res.status(400).json({ error: "ID de liga inválido" });
        }
        if (!userId) {
            return res.status(400).json({ error: "ID de usuario inválido" });
        }

        // Verificar admin
        const check = await pool.query(
            `
            SELECT 1
            FROM fantasy_league_teams flt
            JOIN fantasy_teams ft ON ft.id = flt.fantasy_team_id
            WHERE flt.league_id = $1 
              AND flt.is_admin = true 
              AND ft.user_id = $2
            `,
            [leagueId, adminId]
        );

        if (check.rows.length === 0) {
            return res.status(403).json({ error: "No sos admin de esta liga" });
        }

        // Obtener nombre de liga
        const leagueRes = await pool.query(
            `SELECT name FROM fantasy_leagues WHERE id = $1`,
            [leagueId]
        );

        if (leagueRes.rows.length === 0) {
            return res.status(404).json({ error: "Liga no encontrada" });
        }

        const leagueName = leagueRes.rows[0].name;
        const pendingId = await getStatusId("invite", "pending");

        const invInsert = await pool.query(
            `
            INSERT INTO fantasy_league_invites
                (league_id, invited_user_id, invited_by, status_id)
            VALUES ($1, $2, $3, $4)
            RETURNING id
            `,
            [leagueId, userId, adminId, pendingId]
        );

        const inviteId = invInsert.rows[0].id;

        await createNotification(
            userId,
            "invite_received",
            "Nueva invitación",
            `Fuiste invitado a unirte a la liga "${leagueName}"`,
            { inviteId, leagueId, leagueName }
        );

        return res.json({ message: "Invitación enviada" });

    } catch (err) {
        console.error("Error inviting:", err);
        return res.status(500).json({ error: "Error al invitar" });
    }
};



// ================================================================
//                       USUARIO ACEPTA INVITE
// ================================================================
export const acceptInvite = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const inviteId = toPositiveInt(req.params.inviteId);

        if (!inviteId) {
            return res.status(400).json({ error: "ID de invitación inválido" });
        }

        const inviteRes = await pool.query(
            `
            SELECT i.*, fl.created_by, fl.name AS league_name
            FROM fantasy_league_invites i
            JOIN fantasy_leagues fl ON fl.id = i.league_id
            WHERE i.id = $1
            `,
            [inviteId]
        );

        const invite = inviteRes.rows[0];

        if (!invite) {
            return res.status(404).json({ error: "Invitación no encontrada" });
        }

        if (invite.invited_user_id !== userId) {
            return res.status(403).json({ error: "No podés aceptar esta invitación" });
        }

        const team = await pool.query(
            `SELECT id FROM fantasy_teams WHERE user_id = $1`,
            [userId]
        );

        if (team.rows.length === 0) {
            return res.status(400).json({
                error: "Tenés que crear tu equipo antes de unirte a una liga."
            });
        }

        const teamId = team.rows[0].id;
        const activeId = await getStatusId("membership", "active");
        const acceptedId = await getStatusId("invite", "accepted");

        await pool.query(
            `
            INSERT INTO fantasy_league_teams 
                (league_id, fantasy_team_id, is_admin, status_id)
            VALUES ($1, $2, false, $3)
            `,
            [invite.league_id, teamId, activeId]
        );

        await pool.query(
            `
            UPDATE fantasy_league_invites
            SET status_id = $1
            WHERE id = $2
            `,
            [acceptedId, inviteId]
        );

        const userName = await getUsername(userId);

        await createNotification(
            invite.created_by,
            "invite_accepted",
            "Invitación aceptada",
            `${userName} aceptó tu invitación a la liga "${invite.league_name}"`,
            { inviteId, leagueId: invite.league_id, byUserId: userId, byUserName: userName }
        );

        return res.json({ message: "Te uniste a la liga" });

    } catch (err) {
        console.error("Error accepting invite:", err);
        return res.status(500).json({ error: "Error al aceptar invitación" });
    }
};



// ================================================================
//                      RECHAZAR INVITACIÓN
// ================================================================
export const rejectInvite = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const inviteId = toPositiveInt(req.params.inviteId);

        if (!inviteId) {
            return res.status(400).json({ error: "ID de invitación inválido" });
        }

        const inviteRes = await pool.query(
            `
            SELECT i.*, fl.created_by, fl.name AS league_name
            FROM fantasy_league_invites i
            JOIN fantasy_leagues fl ON fl.id = i.league_id
            WHERE i.id = $1
            `,
            [inviteId]
        );

        const invite = inviteRes.rows[0];

        if (!invite) {
            return res.status(404).json({ error: "Invitación no encontrada" });
        }

        if (invite.invited_user_id !== userId) {
            return res.status(403).json({ error: "No podés rechazar esta invitación" });
        }

        const rejectedId = await getStatusId("invite", "rejected");

        // Cambiar estado a rechazado
        await pool.query(
            `
            UPDATE fantasy_league_invites
            SET status_id = $1
            WHERE id = $2
            `,
            [rejectedId, inviteId]
        );

        const userName = await getUsername(userId);

        await createNotification(
            invite.created_by,
            "invite_rejected",
            "Invitación rechazada",
            `${userName} rechazó tu invitación a la liga "${invite.league_name}"`,
            { inviteId, leagueId: invite.league_id, byUserId: userId, byUserName: userName }
        );

        return res.json({ message: "Invitación rechazada" });

    } catch (err) {
        console.error("Error rejecting invite:", err);
        return res.status(500).json({ error: "Error al rechazar invitación" });
    }
};




// ================================================================
//               LISTAR MIS INVITACIONES PENDIENTES
// ================================================================
export const getMyInvites = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;

        const invites = await pool.query(
            `
            SELECT 
                i.id AS invite_id,
                i.league_id,
                fl.name AS league_name,
                fl.created_by,
                u.username AS invited_by_name,
                i.status_id,
                sl.code AS status,
                sl.description AS status_desc,
                i.created_at
            FROM fantasy_league_invites i
            JOIN fantasy_leagues fl ON fl.id = i.league_id
            JOIN users u ON u.id = i.invited_by
            JOIN fantasy_league_statuses sl ON sl.id = i.status_id
            WHERE i.invited_user_id = $1
            ORDER BY i.id DESC
            `,
            [userId]
        );

        return res.json(invites.rows);

    } catch (err) {
        console.error("Error getMyInvites:", err);
        return res.status(500).json({ error: "Error al obtener invitaciones" });
    }
};




// ================================================================
//                 CANCELAR INVITE (ADMIN)
// ================================================================
export const cancelInvite = async (req: any, res: any) => {
    try {
        const adminId = req.user.userId;
        const inviteId = toPositiveInt(req.params.inviteId);

        if (!inviteId) {
            return res.status(400).json({ error: "ID de invitación inválido" });
        }

        const inviteRes = await pool.query(
            `
            SELECT i.*, fl.name AS league_name
            FROM fantasy_league_invites i
            JOIN fantasy_leagues fl ON fl.id = i.league_id
            WHERE i.id = $1
            `,
            [inviteId]
        );

        const invite = inviteRes.rows[0];

        if (!invite) {
            return res.status(404).json({ error: "Invitación no encontrada" });
        }

        if (invite.invited_by !== adminId) {
            return res.status(403).json({ error: "No podés cancelar esta invitación" });
        }

        await pool.query(
            `DELETE FROM fantasy_league_invites WHERE id = $1`,
            [inviteId]
        );

        await createNotification(
            invite.invited_user_id,
            "invite_canceled",
            "Invitación cancelada",
            `La invitación a la liga "${invite.league_name}" fue cancelada`,
            { leagueId: invite.league_id }
        );

        return res.json({ message: "Invitación cancelada" });

    } catch (err) {
        console.error("Error canceling invite:", err);
        return res.status(500).json({ error: "Error al cancelar invitación" });
    }
};



// ================================================================
//                       HACER ADMIN
// ================================================================
export const promoteToAdmin = async (req: any, res: any) => {
    try {
        const adminId = req.user.userId;
        const leagueId = toPositiveInt(req.params.leagueId);
        const targetUserId = toPositiveInt(req.params.userId);

        if (!leagueId) {
            return res.status(400).json({ error: "ID de liga inválido" });
        }
        if (!targetUserId) {
            return res.status(400).json({ error: "ID de usuario inválido" });
        }

        // Verificar admin que ejecuta acción
        const check = await pool.query(
            `
            SELECT 1
            FROM fantasy_league_teams flt
            JOIN fantasy_teams ft ON ft.id = flt.fantasy_team_id
            WHERE flt.league_id = $1 
              AND flt.is_admin = true 
              AND ft.user_id = $2
            `,
            [leagueId, adminId]
        );

        if (check.rows.length === 0) {
            return res.status(403).json({ error: "No sos admin de esta liga" });
        }

        // Obtener team del usuario objetivo
        const team = await pool.query(
            `SELECT id FROM fantasy_teams WHERE user_id = $1`,
            [targetUserId]
        );

        if (team.rows.length === 0) {
            return res.status(404).json({ error: "El usuario no tiene equipo" });
        }

        const teamId = team.rows[0].id;

        // Obtener datos de liga para notificación
        const league = await pool.query(
            `SELECT name FROM fantasy_leagues WHERE id = $1`,
            [leagueId]
        );

        if (league.rows.length === 0) {
            return res.status(404).json({ error: "Liga no encontrada" });
        }

        const leagueName = league.rows[0].name;

        await pool.query(
            `
            UPDATE fantasy_league_teams
            SET is_admin = true
            WHERE league_id = $1 AND fantasy_team_id = $2
            `,
            [leagueId, teamId]
        );

        await createNotification(
            targetUserId,
            "admin_promoted",
            "Fuiste promovido a administrador",
            `Se te asignó rol de administrador en la liga "${leagueName}"`,
            { leagueId, leagueName }
        );

        return res.json({ message: "Usuario promovido a administrador" });

    } catch (err) {
        console.error("Error promoting admin:", err);
        return res.status(500).json({ error: "Error al promover a administrador" });
    }
};



// ================================================================
//                     QUITAR ADMIN
// ================================================================
export const demoteAdmin = async (req: any, res: any) => {
    try {
        const adminId = req.user.userId;
        const leagueId = toPositiveInt(req.params.leagueId);
        const targetUserId = toPositiveInt(req.params.userId);

        if (!leagueId) {
            return res.status(400).json({ error: "ID de liga inválido" });
        }
        if (!targetUserId) {
            return res.status(400).json({ error: "ID de usuario inválido" });
        }

        // Verificar admin que ejecuta acción
        const check = await pool.query(
            `
            SELECT 1
            FROM fantasy_league_teams flt
            JOIN fantasy_teams ft ON ft.id = flt.fantasy_team_id
            WHERE flt.league_id = $1 
              AND ft.user_id = $2 
              AND flt.is_admin = true
            `,
            [leagueId, adminId]
        );

        if (check.rows.length === 0) {
            return res.status(403).json({ error: "No sos admin de esta liga" });
        }

        // Obtener creador
        const league = await pool.query(
            `SELECT created_by, name FROM fantasy_leagues WHERE id = $1`,
            [leagueId]
        );

        if (league.rows.length === 0) {
            return res.status(404).json({ error: "Liga no encontrada" });
        }

        const creatorId = league.rows[0].created_by;
        const leagueName = league.rows[0].name;

        if (targetUserId === creatorId) {
            return res.status(403).json({ error: "No podés quitar admin al creador de la liga" });
        }

        const team = await pool.query(
            `SELECT id FROM fantasy_teams WHERE user_id = $1`,
            [targetUserId]
        );

        if (team.rows.length === 0) {
            return res.status(404).json({ error: "El usuario no tiene equipo" });
        }

        const teamId = team.rows[0].id;

        await pool.query(
            `
            UPDATE fantasy_league_teams
            SET is_admin = false
            WHERE league_id = $1 AND fantasy_team_id = $2
            `,
            [leagueId, teamId]
        );

        await createNotification(
            targetUserId,
            "admin_demoted",
            "Ya no sos administrador",
            `Has dejado de tener el rol de administrador en la liga "${leagueName}"`,
            { leagueId, leagueName }
        );

        return res.json({ message: "El usuario ya no es administrador" });

    } catch (err) {
        console.error("Error demoting admin:", err);
        return res.status(500).json({ error: "Error al bajar de administrador" });
    }
};



// ================================================================
//        NOTIFICACIONES PARA EL CREADOR DE LA LIGA
// ================================================================
export const getInvitesForMyLeagues = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;

        const invitesRes = await pool.query(
            `
            SELECT 
                i.id AS invite_id,
                i.league_id,
                fl.name AS league_name,
                u.id AS user_id,
                u.username,
                u.email,
                sl.code AS status,
                sl.description AS status_desc,
                i.created_at
            FROM fantasy_league_invites i
            JOIN fantasy_leagues fl ON fl.id = i.league_id
            JOIN users u ON u.id = i.invited_user_id
            JOIN fantasy_league_statuses sl ON sl.id = i.status_id
            WHERE fl.created_by = $1
            ORDER BY i.created_at DESC
            `,
            [userId]
        );

        return res.json(invitesRes.rows);

    } catch (err) {
        console.error("Error getInvitesForMyLeagues:", err);
        return res.status(500).json({ error: "Error al obtener invitaciones" });
    }
};



// ================================================================
//    BORRAR INVITACIÓN (NOTIFICACIÓN) – SOLO CREADOR DE LIGA
// ================================================================
export const deleteInviteNotification = async (req: any, res: any) => {
    try {
        const inviteId = toPositiveInt(req.params.inviteId);
        const userId = req.user.userId;

        if (!inviteId) {
            return res.status(400).json({ error: "ID de invitación inválido" });
        }

        const check = await pool.query(
            `
            SELECT fl.created_by
            FROM fantasy_league_invites i
            JOIN fantasy_leagues fl ON fl.id = i.league_id
            WHERE i.id = $1
            `,
            [inviteId]
        );

        if (check.rows.length === 0) {
            return res.status(404).json({ error: "Invitación no encontrada" });
        }

        if (check.rows[0].created_by !== userId) {
            return res.status(403).json({
                error: "No podés borrar esta notificación"
            });
        }

        await pool.query(
            `DELETE FROM fantasy_league_invites WHERE id = $1`,
            [inviteId]
        );

        return res.json({ message: "Notificación eliminada" });

    } catch (err) {
        console.error("Error deleteInviteNotification:", err);
        return res.status(500).json({ error: "Error al borrar notificación" });
    }
};
