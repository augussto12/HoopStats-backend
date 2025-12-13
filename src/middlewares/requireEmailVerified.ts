import { Request, Response, NextFunction } from "express";
import { pool } from "../db";

export const requireEmailVerified = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({ error: "No autenticado" });
        }

        const result = await pool.query(
            `SELECT email_verified FROM hoopstats.users WHERE id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: "Usuario no encontrado" });
        }

        if (!result.rows[0].email_verified) {
            return res.status(403).json({ error: "Debes verificar tu email para usar esta función" });
        }

        next();
    } catch (err) {
        console.error("requireEmailVerified error:", err);
        return res.status(500).json({ error: "Error en el servidor" });
    }
};
