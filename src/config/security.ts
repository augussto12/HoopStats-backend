import helmet from "helmet";
import rateLimit from "express-rate-limit";
import slowDown from "express-slow-down";
import sanitizeHtml from "sanitize-html";
import express from "express";

export const configureSecurity = (app: any) => {

    // Seguridad HTTP
    app.use(helmet());

    // Limitar tamaño del body
    app.use(express.json({ limit: "1mb" }));
    app.use(express.urlencoded({ extended: true, limit: "1mb" }));

    // Sanitización XSS
    app.use((req: any, res: any, next: any) => {
        const sanitizeValue = (value: any) => {
            if (typeof value === "string") {
                return sanitizeHtml(value, {
                    allowedTags: [],
                    allowedAttributes: {}
                });
            }
            return value;
        };

        if (req.body) {
            for (const key in req.body) {
                req.body[key] = sanitizeValue(req.body[key]);
            }
        }

        next();
    });

    // Rate limit GLOBAL
    app.use(rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 200,
        message: { error: "Demasiadas solicitudes, intente más tarde." }
    }));

    // Rate limit específico para auth
    app.use("/api/auth", rateLimit({
        windowMs: 10 * 60 * 1000,
        max: 10,
        message: { error: "Demasiados intentos, esperá un rato." }
    }));

    // Slowdown anti fuerza bruta
    app.use("/api/auth/login", slowDown({
        windowMs: 10 * 60 * 1000,
        delayAfter: 5,
        delayMs: 1000
    }));

    // Manejo de JSON inválido
    app.use((err: any, req: any, res: any, next: any) => {
        if (err instanceof SyntaxError && "body" in err) {
            return res.status(400).json({ error: "JSON inválido" });
        }
        next();
    });

};
