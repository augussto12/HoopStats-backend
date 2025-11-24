import { pool } from "../db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { registerSchema, loginSchema } from "../validators/auth";

export const register = async (req: any, res: any) => {
    try {
        // VALIDAR CON ZOD
        const data = registerSchema.parse(req.body);
        const pepper = process.env.PASSWORD_PEPPER || "";
        const fullname = data.fullname.trim();
        const username = data.username.trim().toLowerCase();
        const email = data.email.toLowerCase().trim();
        const password = data.password;
        const gender = data.gender;

        // Verificar email existente
        const checkEmail = await pool.query(
            "SELECT id FROM hoopstats.users WHERE email = $1",
            [email]
        );
        if (checkEmail.rows.length > 0)
            return res.status(400).json({ error: "El email ya está registrado" });

        // Verificar username existente
        const checkUsername = await pool.query(
            "SELECT id FROM hoopstats.users WHERE username = $1",
            [username]
        );
        if (checkUsername.rows.length > 0)
            return res.status(400).json({ error: "El nombre de usuario ya existe" });

        // Hash de contraseña
        //const salt = bcrypt.genSaltSync(10);
        //const passwordHash = bcrypt.hashSync(password + pepper, salt);

        const salt = bcrypt.genSaltSync(10);
        const passwordHash = bcrypt.hashSync(password, salt);


        // Insertar usuario normalizado
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
            { expiresIn: "1d" }
        );

        return res.json({
            message: "Usuario registrado correctamente",
            user,
            token
        });

    } catch (err: any) {
        console.error(err);

        if (err.code === "23505") {
            if (err.detail.includes("email"))
                return res.status(400).json({ error: "El email ya está registrado" });
            if (err.detail.includes("username"))
                return res.status(400).json({ error: "El nombre de usuario ya existe" });
        }

        if (err.name === "ZodError") {
            return res.status(400).json({ error: "Datos inválidos", details: err.errors });
        }

        return res.status(500).json({ error: "Error en el servidor" });
    }
};


export const login = async (req: any, res: any) => {
    try {
        // VALIDAR CON ZOD
        const data = loginSchema.parse(req.body);
        const pepper = process.env.PASSWORD_PEPPER || "";
        const identifier = data.identifier.trim().toLowerCase();
        const password = data.password;

        // Detectamos si es email o username
        const isEmail = identifier.includes("@");

        let result;
        if (isEmail) {
            result = await pool.query(
                "SELECT * FROM hoopstats.users WHERE email = $1",
                [identifier]
            );
        } else {
            result = await pool.query(
                "SELECT * FROM hoopstats.users WHERE username = $1",
                [identifier]
            );
        }

        if (result.rows.length === 0) {
            return res.status(400).json({ error: "Credenciales inválidas" });
        }

        const user = result.rows[0];

        /*let validPass = false;

        // Intento 1: validar usando PEPPER nuevo
        if (bcrypt.compareSync(password + pepper, user.password_hash)) {
            validPass = true;
        } else {
            // Intento 2: validar SIN PEPPER (usuarios viejos)
            if (bcrypt.compareSync(password, user.password_hash)) {
                validPass = true;

                // Migración automática: re-hash con pepper
                const salt = bcrypt.genSaltSync(10);
                const newHash = bcrypt.hashSync(password + pepper, salt);

                await pool.query(
                    "UPDATE hoopstats.users SET password_hash = $1 WHERE id = $2",
                    [newHash, user.id]
                );
            }
        }
            */

        const validPass = bcrypt.compareSync(password, user.password_hash);
        if (!validPass) return res.status(400).json({ error: "Credenciales inválidas" });

        // Crear token
        const token = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET as string,
            { expiresIn: "1d" }
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

    } catch (err: any) {
        if (err.name === "ZodError") {
            return res.status(400).json({ error: "Datos inválidos" });
        }

        console.error(err);
        return res.status(500).json({ error: "Error en el servidor" });
    }
};

