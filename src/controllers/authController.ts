import { pool } from "../db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const register = async (req: any, res: any) => {
    try {
        const { fullname, username, email, password, gender } = req.body;

        // Validación
        if (!fullname || !username || !email || !password)
            return res.status(400).json({ error: "Faltan datos obligatorios" });

        // Verificar si email existe
        const checkEmail = await pool.query(
            "SELECT id FROM hoopstats.users WHERE email = $1",
            [email]
        );
        if (checkEmail.rows.length > 0)
            return res.status(400).json({ error: "El email ya está registrado" });

        // Verificar si username existe
        const checkUsername = await pool.query(
            "SELECT id FROM hoopstats.users WHERE username = $1",
            [username]
        );
        if (checkUsername.rows.length > 0)
            return res.status(400).json({ error: "El nombre de usuario ya existe" });

        // Hash password
        const salt = bcrypt.genSaltSync(10);
        const passwordHash = bcrypt.hashSync(password, salt);

        // Insertar usuario
        const result = await pool.query(
            `INSERT INTO hoopstats.users (fullname, username, email, password_hash, gender)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, fullname, username, email, gender`,
            [fullname, username, email, passwordHash, gender]
        );

        const user = result.rows[0];

        // Token
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
    } catch (err: any) {
        console.error(err);

        // Error por UNIQUE violation (email o username)
        if (err.code === "23505") {
            if (err.detail.includes("email"))
                return res.status(400).json({ error: "El email ya está registrado" });
            if (err.detail.includes("username"))
                return res.status(400).json({ error: "El nombre de usuario ya existe" });
        }

        return res.status(500).json({ error: "Error en el servidor" });
    }
};


export const login = async (req: any, res: any) => {
    try {
        const { username, password } = req.body;

        if (!username || !password)
            return res.status(400).json({ error: "Usuario y password requeridos" });

        const result = await pool.query(
            "SELECT * FROM hoopstats.users WHERE username = $1",
            [username]
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
            user: {
                id: user.id,
                fullname: user.fullname,
                username: user.username,
                email: user.email,
                gender: user.gender
            },
            token
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error en el servidor" });
    }
};
