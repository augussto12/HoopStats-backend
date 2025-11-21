import { pool } from "../db";
import bcrypt from "bcryptjs";

// Obtener datos del usuario autenticado
export const getMyProfile = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;

        const result = await pool.query(
            `SELECT id, email, fullname, username, gender 
       FROM hoopstats.users 
       WHERE id = $1`,
            [userId]
        );

        return res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error al obtener perfil" });
    }
};

// Actualizar perfil del usuario
export const updateProfile = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const { fullname, username, gender, email } = req.body;

        const update = await pool.query(
            `UPDATE hoopstats.users
       SET fullname = COALESCE($1, fullname),
           username = COALESCE($2, username),
           gender   = COALESCE($3, gender),
           email    = COALESCE($4, email)
       WHERE id = $5
       RETURNING id, fullname, username, gender, email`,
            [fullname, username, gender, email, userId]
        );

        return res.json({
            message: "Perfil actualizado",
            user: update.rows[0]
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error al actualizar perfil" });
    }
};

// Cambiar contraseña
export const updatePassword = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const { oldPassword, newPassword } = req.body;

        if (!oldPassword || !newPassword)
            return res.status(400).json({ error: "Faltan datos" });

        // Obtener usuario
        const result = await pool.query(
            "SELECT password_hash FROM hoopstats.users WHERE id = $1",
            [userId]
        );
        const user = result.rows[0];

        // Validar oldPassword
        const valid = bcrypt.compareSync(oldPassword, user.password_hash);
        if (!valid)
            return res.status(400).json({ error: "Contraseña actual incorrecta" });

        // Hash nueva contraseña
        const salt = bcrypt.genSaltSync(10);
        const newHash = bcrypt.hashSync(newPassword, salt);

        await pool.query(
            "UPDATE hoopstats.users SET password_hash = $1 WHERE id = $2",
            [newHash, userId]
        );

        return res.json({ message: "Contraseña actualizada correctamente" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error al cambiar contraseña" });
    }
};

// =====================================
// ELIMINAR CUENTA
// =====================================
export const deleteAccount = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;

        // Eliminamos favoritos
        await pool.query(`DELETE FROM hoopstats.favorite_players WHERE user_id = $1`, [userId]);
        await pool.query(`DELETE FROM hoopstats.favorite_teams WHERE user_id = $1`, [userId]);

        // Eliminamos predicciones
        await pool.query(`DELETE FROM hoopstats.predicciones WHERE user_id = $1`, [userId]);

        // Finalmente eliminamos usuario
        await pool.query(`DELETE FROM hoopstats.users WHERE id = $1`, [userId]);

        return res.json({ message: "Cuenta eliminada correctamente" });
    } catch (err) {
        console.error("❌ Error al eliminar cuenta:", err);
        return res.status(500).json({ error: "No se pudo eliminar la cuenta" });
    }
};
