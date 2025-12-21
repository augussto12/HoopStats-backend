import { pool } from "../db";
import bcrypt from "bcryptjs";
import { updatePasswordSchema, updateProfileSchema } from "../validators/auth";



// Obtener todos los usuarios
export const getAllUsers = async (req: any, res: any) => {
    try {
        const result = await pool.query(
            `SELECT id, fullname, username
             FROM users
             ORDER BY username ASC`
        );

        return res.json(result.rows);

    } catch (err) {
        console.error("Error al obtener usuarios:", err);
        return res.status(500).json({ error: "Error al obtener usuarios" });
    }
};


// Obtener datos del usuario autenticado
export const getMyProfile = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;

        const result = await pool.query(
            `SELECT id, fullname, username, email, gender, created_at, email_verified
             FROM users 
             WHERE id = $1`,
            [userId]
        );


        const user = result.rows[0];
        if (!user) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        return res.json(user);

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error al obtener perfil" });
    }
};


// Actualizar perfil del usuario
export const updateProfile = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const data = updateProfileSchema.parse(req.body);

        // 1️⃣ Obtener email actual
        const currentRes = await pool.query(
            `SELECT email FROM users WHERE id = $1`,
            [userId]
        );

        if (currentRes.rows.length === 0) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        const currentEmail = currentRes.rows[0].email;
        const newEmail = data.email?.trim().toLowerCase() ?? null;

        // 2️⃣ Detectar cambio de email
        const emailChanged =
            newEmail !== null && newEmail !== currentEmail;

        // 3️⃣ Actualizar perfil
        const update = await pool.query(
            `UPDATE users
             SET fullname = COALESCE($1, fullname),
                 username = COALESCE($2, username),
                 gender   = COALESCE($3, gender),
                 email    = COALESCE($4, email),
                 email_verified = CASE
                     WHEN $6 THEN false
                     ELSE email_verified
                 END
             WHERE id = $5
             RETURNING id, fullname, username, gender, email, email_verified`,
            [
                data.fullname ?? null,
                data.username ?? null,
                data.gender ?? null,
                newEmail,
                userId,
                emailChanged
            ]
        );

        return res.json({
            message: emailChanged
                ? "Perfil actualizado. Debes verificar tu nuevo email."
                : "Perfil actualizado",
            user: update.rows[0],
            emailChanged
        });

    } catch (err: any) {
        if (err.name === "ZodError") {
            return res.status(400).json({ error: err.errors[0].message });
        }

        console.error("updateProfile error:", err);
        return res.status(500).json({ error: "Error al actualizar perfil" });
    }
};



// Cambiar contraseña
// CAMBIAR CONTRASEÑA (Refactorizado para mayor claridad)
export const updatePassword = async (req: any, res: any) => {
    try {
        const { oldPassword, newPassword } = updatePasswordSchema.parse(req.body);
        const userId = req.user.userId;
        const pepper = process.env.PASSWORD_PEPPER || "";

        const result = await pool.query(
            "SELECT password_hash FROM users WHERE id = $1",
            [userId]
        );

        const user = result.rows[0];
        if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

        let valid = bcrypt.compareSync(oldPassword + pepper, user.password_hash);

        // Migración de hash viejo si el pepper no coincide pero la pass sola sí
        if (!valid && bcrypt.compareSync(oldPassword, user.password_hash)) {
            valid = true;
            // Opcional: Podrías actualizar el hash aquí mismo, pero como vamos a poner
            // una contraseña nueva (newPassword), no es estrictamente necesario migrar la vieja.
        }

        if (!valid) return res.status(400).json({ error: "La contraseña actual es incorrecta" });

        const newHash = bcrypt.hashSync(newPassword + pepper, 10);
        await pool.query(
            "UPDATE users SET password_hash = $1 WHERE id = $2",
            [newHash, userId]
        );

        return res.json({ message: "Contraseña actualizada correctamente" });

    } catch (err: any) {
        if (err.name === "ZodError") return res.status(400).json({ error: err.errors[0].message });
        return res.status(500).json({ error: "Error al cambiar contraseña" });
    }
};

// ELIMINAR CUENTA (Con Transacción para evitar datos huérfanos)
export const deleteAccount = async (req: any, res: any) => {
    const client = await pool.connect();
    try {
        const userId = req.user.userId;

        await client.query("BEGIN");

        // Borramos todo lo relacionado en orden
        await client.query(`DELETE FROM favorite_players WHERE user_id = $1`, [userId]);
        await client.query(`DELETE FROM favorite_teams WHERE user_id = $1`, [userId]);
        await client.query(`DELETE FROM predicciones WHERE user_id = $1`, [userId]);

        // Si tienes equipo de Fantasy, también deberías borrarlo o se romperá la FK
        // await client.query(`DELETE FROM fantasy_teams WHERE user_id = $1`, [userId]);

        await client.query(`DELETE FROM users WHERE id = $1`, [userId]);

        await client.query("COMMIT");
        return res.json({ message: "Cuenta eliminada correctamente" });

    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Error al eliminar cuenta:", err);
        return res.status(500).json({ error: "No se pudo eliminar la cuenta por un error de integridad." });
    } finally {
        client.release();
    }
};
