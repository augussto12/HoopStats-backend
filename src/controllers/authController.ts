import { pool } from "../db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const register = async (req: any, res: any) => {
    try {
        const { email, password } = req.body;

        // Validaciones simples
        if (!email || !password)
            return res.status(400).json({ error: "Email y password requeridos" });

        // Verificar si el usuario ya existe
        const checkUser = await pool.query(
            "SELECT * FROM hoopstats.users WHERE email = $1",
            [email]
        );

        if (checkUser.rows.length > 0)
            return res.status(400).json({ error: "El usuario ya existe" });

        // Hashear contraseña
        const salt = bcrypt.genSaltSync(10);
        const passwordHash = bcrypt.hashSync(password, salt);

        // Insertar usuario
        const result = await pool.query(
            `INSERT INTO hoopstats.users (email, password_hash)
       VALUES ($1, $2) RETURNING id, email`,
            [email, passwordHash]
        );

        const user = result.rows[0];

        // Crear token
        const token = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET as string,
            { expiresIn: "7d" }
        );

        return res.json({
            message: "Usuario registrado correctamente",
            user,
            token,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error en el servidor" });
    }
};

export const login = async (req: any, res: any) => {
    try {
        const { email, password } = req.body;

        if (!email || !password)
            return res.status(400).json({ error: "Email y password requeridos" });

        const result = await pool.query(
            "SELECT * FROM hoopstats.users WHERE email = $1",
            [email]
        );

        if (result.rows.length === 0)
            return res.status(400).json({ error: "Credenciales inválidas" });

        const user = result.rows[0];

        // Validar contraseña
        const validPass = bcrypt.compareSync(password, user.password_hash);

        if (!validPass)
            return res.status(400).json({ error: "Credenciales inválidas" });

        // Crear token
        const token = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET as string,
            { expiresIn: "7d" }
        );

        return res.json({
            message: "Login exitoso",
            user: { id: user.id, email: user.email },
            token,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error en el servidor" });
    }
};
