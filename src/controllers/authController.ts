import { pool } from "../db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";

import {
    registerSchema,
    loginSchema,
    emailSchema,
    resetPasswordSchema
} from "../validators/auth";

import Mailgun from "mailgun.js";
import formData from "form-data";


// MAILGUN CONFIG
const mg = new Mailgun(formData).client({
    username: "api",
    key: process.env.MAILGUN_API_KEY!,
});

const sendEmail = async (to: string, subject: string, html: string) => {
    return mg.messages.create(process.env.MAILGUN_DOMAIN!, {
        from: process.env.MAILGUN_FROM!,
        to,
        subject,
        html,
    });
};


// GET /auth/me
export const me = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;

        const result = await pool.query(
            `SELECT id, fullname, username, email, gender, email_verified
             FROM users
             WHERE id = $1`,
            [userId]
        );

        if (result.rows.length === 0)
            return res.status(404).json({ error: "Usuario no encontrado" });

        return res.json(result.rows[0]);

    } catch (err) {
        console.error("me error:", err);
        return res.status(500).json({ error: "Error en el servidor" });
    }
};


// REGISTER (con verificación de email)
export const register = async (req: any, res: any) => {
    try {
        const data = registerSchema.parse(req.body);
        const pepper = process.env.PASSWORD_PEPPER || "";

        const fullname = data.fullname.trim();
        const username = data.username.trim().toLowerCase();
        const email = data.email.trim().toLowerCase();
        const password = data.password;
        const gender = data.gender;

        const checkEmail = await pool.query(
            "SELECT id FROM users WHERE email = $1", [email]
        );
        if (checkEmail.rows.length > 0)
            return res.status(400).json({ error: "El email ya está registrado" });

        const checkUsername = await pool.query(
            "SELECT id FROM users WHERE username = $1", [username]
        );
        if (checkUsername.rows.length > 0)
            return res.status(400).json({ error: "El nombre de usuario ya existe" });

        const salt = bcrypt.genSaltSync(10);
        const passwordHash = bcrypt.hashSync(password + pepper, salt);

        const result = await pool.query(
            `INSERT INTO users 
             (fullname, username, email, password_hash, gender)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, fullname, username, email, gender`,
            [fullname, username, email, passwordHash, gender]
        );

        const user = result.rows[0];

        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = bcrypt.hashSync(rawToken, 10);

        await pool.query(
            `UPDATE users 
             SET email_verification_token = $1,
                 email_verification_expires = NOW() + INTERVAL '24 hours'
             WHERE id = $2`,
            [tokenHash, user.id]
        );

        const link = `https://hoopstats.com.ar/verify-email?token=${rawToken}&email=${email}`;
        //const link = `http://localhost:4200/verify-email?token=${rawToken}&email=${email}`;

        await sendEmail(
            email,
            "Verifica tu cuenta - HoopStats",
            `
                <h2>Bienvenido a HoopStats</h2>
                <p>Para activar tu cuenta, verificá tu email haciendo click acá:</p>
                <a href="${link}" target="_blank">${link}</a>
                <p>Este enlace expira en 24 horas.</p>
            `
        );

        const sessionToken = jwt.sign(
            { userId: user.id, email_verified: false },
            process.env.JWT_SECRET!,
            { expiresIn: "1d" }
        );

        return res.json({
            message: "Cuenta creada. Revisa tu email para verificarla.",
            user,
            token: sessionToken,
        });

    } catch (err: any) {
        if (err.name === "ZodError")
            return res.status(400).json({ error: err.errors[0].message });

        console.error("Register error:", err);
        return res.status(500).json({ error: "Error en el servidor" });
    }
};


// VERIFY EMAIL
export const verifyEmail = async (req: any, res: any) => {
    try {
        const { token: rawToken, email } = req.query;

        if (!rawToken || !email) {
            return res.status(400).json({ error: "Faltan datos" });
        }

        const normalizedEmail = String(email).trim().toLowerCase();

        const result = await pool.query(
            `SELECT id, email_verification_token, email_verification_expires 
       FROM users 
       WHERE email = $1`,
            [normalizedEmail]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ error: "Token inválido" });
        }

        const user = result.rows[0];

        // si el token ya fue consumido (NULL), devolvé "ok" o error prolijo
        if (!user.email_verification_token || !user.email_verification_expires) {
            // ya estaba verificado o ya se usó el link
            const sessionToken = jwt.sign(
                { userId: user.id, email_verified: true },
                process.env.JWT_SECRET!,
                { expiresIn: "4h" }
            );

            return res.json({ ok: true, message: "Email ya verificado", token: sessionToken });
        }

        if (new Date(user.email_verification_expires) < new Date()) {
            return res.status(400).json({ error: "Token vencido" });
        }

        const match = bcrypt.compareSync(String(rawToken), user.email_verification_token);
        if (!match) {
            return res.status(400).json({ error: "Token inválido" });
        }

        await pool.query(
            `UPDATE users
       SET email_verified = true,
           email_verification_token = NULL,
           email_verification_expires = NULL
       WHERE id = $1`,
            [user.id]
        );

        // token nuevo con claim email_verified
        const sessionToken = jwt.sign(
            { userId: user.id, email_verified: true },
            process.env.JWT_SECRET!,
            { expiresIn: "4h" }
        );

        return res.json({ ok: true, message: "Email verificado correctamente", token: sessionToken });

    } catch (err) {
        console.error("verifyEmail error:", err);
        return res.status(500).json({ error: "Error en el servidor" });
    }
};


// RESEND VERIFICATION EMAIL
export const resendVerification = async (req: any, res: any) => {
    try {
        const { email } = emailSchema.parse(req.body);
        const normalized = email.trim().toLowerCase();

        const result = await pool.query(
            `SELECT id, email_verified 
             FROM users WHERE email = $1`,
            [normalized]
        );

        if (result.rows.length === 0)
            return res.json({ ok: true });

        const user = result.rows[0];

        if (user.email_verified)
            return res.json({ ok: true });

        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = bcrypt.hashSync(rawToken, 10);

        await pool.query(
            `UPDATE users 
             SET email_verification_token = $1,
                 email_verification_expires = NOW() + INTERVAL '24 hours'
             WHERE id = $2`,
            [tokenHash, user.id]
        );

        const link = `https://com.ar/verify-email?token=${rawToken}&email=${normalized}`;
        //const link = `http://localhost:4200/verify-email?token=${rawToken}&email=${normalized}`;

        await sendEmail(
            normalized,
            "Reenviar verificación de cuenta - HoopStats",
            `
                <h2>Verificar email</h2>
                <p>Click acá para verificar:</p>
                <a href="${link}" target="_blank">${link}</a>
            `
        );

        return res.json({ ok: true });

    } catch (err: any) {
        if (err.name === "ZodError")
            return res.status(400).json({ error: err.errors[0].message });

        console.error("resendVerification error:", err);
        return res.status(500).json({ error: "Error en el servidor" });
    }
};



// LOGIN
export const login = async (req: any, res: any) => {
    try {
        const { identifier, password } = loginSchema.parse(req.body);
        const pepper = process.env.PASSWORD_PEPPER || "";

        const normalized = identifier.trim().toLowerCase();
        const isEmail = normalized.includes("@");

        const query = isEmail
            ? "SELECT * FROM users WHERE email = $1"
            : "SELECT * FROM users WHERE username = $1";

        const result = await pool.query(query, [normalized]);

        if (result.rows.length === 0)
            return res.status(400).json({ error: "Credenciales inválidas" });

        const user = result.rows[0];

        // Contraseña con pepper
        let validPass = bcrypt.compareSync(password + pepper, user.password_hash);

        // Migración automática hash viejo
        if (!validPass && bcrypt.compareSync(password, user.password_hash)) {
            validPass = true;
            const newHash = bcrypt.hashSync(password + pepper, 10);
            await pool.query(
                "UPDATE users SET password_hash = $1 WHERE id = $2",
                [newHash, user.id]
            );
        }

        if (!validPass)
            return res.status(400).json({ error: "Credenciales inválidas" });

        const token = jwt.sign(
            { userId: user.id, email_verified: !!user.email_verified },
            process.env.JWT_SECRET!,
            { expiresIn: "4h" }
        );

        return res.json({
            message: "Login exitoso",
            user: {
                id: user.id,
                fullname: user.fullname,
                username: user.username,
                email: user.email,
                gender: user.gender,
                email_verified: user.email_verified
            },
            token,
        });

    } catch (err: any) {
        if (err.name === "ZodError")
            return res.status(400).json({ error: err.errors[0].message });

        console.error("Login error:", err);
        return res.status(500).json({ error: "Error en el servidor" });
    }
};


// REFRESH TOKEN
export const refresh = async (req: any, res: any) => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({ error: "Token inválido" });
        }

        const u = await pool.query(
            `SELECT email_verified FROM users WHERE id = $1`,
            [userId]
        );

        const emailVerified = !!u.rows[0]?.email_verified;

        const newToken = jwt.sign(
            { userId, email_verified: emailVerified },
            process.env.JWT_SECRET!,
            { expiresIn: "4h" }
        );


        return res.json({ token: newToken });

    } catch (err) {
        console.error("refresh error:", err);
        return res.status(500).json({ error: "Error al refrescar sesión" });
    }
};


// FORGOT PASSWORD
export const forgotPassword = async (req: any, res: any) => {
    try {
        const { email } = emailSchema.parse(req.body);
        const normalized = email.trim().toLowerCase();

        const result = await pool.query(
            "SELECT id FROM users WHERE email = $1",
            [normalized]
        );

        if (result.rows.length === 0)
            return res.json({ ok: true });

        const user = result.rows[0];

        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = bcrypt.hashSync(rawToken, 10);

        await pool.query(
            `UPDATE users 
             SET reset_token = $1,
                 reset_expires = NOW() + INTERVAL '15 minutes'
             WHERE id = $2`,
            [tokenHash, user.id]
        );

        const link = `https://com.ar/reset-password?token=${rawToken}`;
        //const link = `http://localhost:4200/reset-password?token=${rawToken}`;

        await sendEmail(
            normalized,
            "Restablecer contraseña - HoopStats",
            `
                <h2>Restablecer contraseña</h2>
                <a href="${link}" target="_blank">${link}</a>
            `
        );

        return res.json({ ok: true });

    } catch (err: any) {
        if (err.name === "ZodError")
            return res.status(400).json({ error: err.errors[0].message });

        console.error("forgotPassword error:", err);
        return res.status(500).json({ error: "Error en el servidor" });
    }
};


// RESET PASSWORD
export const resetPassword = async (req: any, res: any) => {
    try {
        const { token, password } = resetPasswordSchema.parse(req.body);
        const pepper = process.env.PASSWORD_PEPPER || "";

        const result = await pool.query(
            `SELECT id, reset_token 
             FROM users
             WHERE reset_expires > NOW()`
        );

        let userFound = null;

        for (const u of result.rows) {
            if (bcrypt.compareSync(token, u.reset_token)) {
                userFound = u;
                break;
            }
        }

        if (!userFound)
            return res.status(400).json({ error: "Token inválido o vencido" });

        const newHash = bcrypt.hashSync(password + pepper, 10);

        await pool.query(
            `UPDATE users
             SET password_hash = $1,
                 reset_token = NULL,
                 reset_expires = NULL
             WHERE id = $2`,
            [newHash, userFound.id]
        );

        return res.json({ ok: true, message: "Contraseña actualizada" });

    } catch (err: any) {
        if (err.name === "ZodError")
            return res.status(400).json({ error: err.errors[0].message });

        console.error("resetPassword error:", err);
        return res.status(500).json({ error: "Error en el servidor" });
    }
};

