import { pool } from "../db";

// ================================================================
//                      CREAR NOTIFICACIÓN
// ================================================================
export const createNotification = async (
    userId: number,
    type: string,
    title: string,
    message: string,
    data: any = {}
) => {
    try {
        await pool.query(
            `
            INSERT INTO hoopstats.notifications
            (user_id, type, title, message, data)
            VALUES ($1, $2, $3, $4, $5)
            `,
            [userId, type, title, message, data]
        );
    } catch (err) {
        console.error("Error creating notification:", err);
    }
};

export const getMyNotifications = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;

        const result = await pool.query(
            `
            SELECT *
            FROM hoopstats.notifications
            WHERE user_id = $1
              AND is_read = false
            ORDER BY created_at DESC
            `,
            [userId]
        );

        return res.json(result.rows);

    } catch (err) {
        console.error("Error getMyNotifications:", err);
        return res.status(500).json({ error: "Error al obtener notificaciones" });
    }
};



export const markAsRead = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const notificationId = parseInt(req.params.id);

        const result = await pool.query(
            `
            UPDATE hoopstats.notifications
            SET is_read = true
            WHERE id = $1 AND user_id = $2
            `,
            [notificationId, userId]
        );

        return res.json({ message: "Notificación marcada como leída" });

    } catch (err) {
        console.error("Error markAsRead:", err);
        return res.status(500).json({ error: "Error al actualizar notificación" });
    }
};


export const deleteNotification = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const notificationId = parseInt(req.params.id);

        // Solo marcar como leída, NO borrar
        await pool.query(
            `
            UPDATE hoopstats.notifications
            SET is_read = true
            WHERE id = $1 AND user_id = $2
            `,
            [notificationId, userId]
        );

        return res.json({ message: "Notificación ocultada (soft delete)" });

    } catch (err) {
        console.error("Error deleteNotification:", err);
        return res.status(500).json({ error: "Error al ocultar notificación" });
    }
};


export const deleteAllRead = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;

        await pool.query(
            `
            DELETE FROM hoopstats.notifications
            WHERE user_id = $1 AND is_read = true
            `,
            [userId]
        );

        return res.json({ message: "Notificaciones leídas eliminadas" });

    } catch (err) {
        console.error("Error deleteAllRead:", err);
        return res.status(500).json({ error: "Error al limpiar notificaciones" });
    }
};

