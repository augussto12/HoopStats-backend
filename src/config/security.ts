import helmet from "helmet";
import rateLimit from "express-rate-limit";
import slowDown from "express-slow-down";
import sanitizeHtml from "sanitize-html";
import express, { Request, Response, NextFunction } from "express";

export const configureSecurity = (app: any) => {

    /* =============================
       0) JSON LIMIT (Anti-DoS)
    ============================== */
    app.use(express.json({ limit: "200kb" }));
    app.use(express.urlencoded({ extended: true, limit: "200kb" }));

    /* =============================
       1) HELMET
    ============================== */
    app.use(helmet({ crossOriginResourcePolicy: false }));

    app.use(
        helmet.contentSecurityPolicy({
            directives: {
                defaultSrc: [
                    "'self'",
                    "capacitor://localhost",
                    "file:"
                ],
                scriptSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    "capacitor://localhost"
                ],
                styleSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    "capacitor://localhost"
                ],
                imgSrc: [
                    "'self'",
                    "data:",
                    "blob:",
                    "https:",
                    "capacitor://localhost"
                ],
                connectSrc: [
                    "'self'",
                    "https://localhost",
                    "https://hoopstats.com.ar",
                    "https://www.hoopstats.com.ar",
                    "https://hoopstats-backend-production.up.railway.app"
                ],
                fontSrc: ["'self'", "https:", "data:"],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"]
            },
        })
    );


    app.disable("x-powered-by");

    /* =============================
       2) HEADERS EXTRA
    ============================== */
    app.use((_req: Request, res: Response, next: NextFunction) => {
        res.setHeader("X-Frame-Options", "DENY");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
        res.setHeader(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=(), payment=()"
        );
        next();
    });

    /* =============================
       3) BLOQUEAR UPLOADS
    ============================== */
    app.use((req: Request, res: Response, next: NextFunction) => {
        if (req.headers["content-type"]?.includes("multipart/form-data")) {
            return res.status(400).json({ error: "Uploads no permitidos." });
        }
        next();
    });

    /* =============================
       4) BLOQUEAR MÉTODOS RAROS
    ============================== */
    app.use((req: Request, res: Response, next: NextFunction) => {
        const forbidden = ["TRACE", "TRACK", "CONNECT"];
        if (forbidden.includes(req.method)) {
            return res.status(405).send("Método no permitido");
        }
        next();
    });

    /* =============================
        5) SANITIZACIÓN XSS COMPLETA (Recursiva)
    ============================== */
    const sanitizeValue = (value: any): any => {
        // 1. Si es un string, lo limpiamos con la librería
        if (typeof value === "string") {
            return sanitizeHtml(value, {
                allowedTags: [],
                allowedAttributes: {}
            });
        }

        // 2. Si es un array, limpiamos cada elemento uno por uno
        if (Array.isArray(value)) {
            return value.map(item => sanitizeValue(item));
        }

        // 3. Si es un objeto, limpiamos todas sus propiedades por dentro
        if (typeof value === "object" && value !== null) {
            const cleanObj: any = {};
            for (const key in value) {
                cleanObj[key] = sanitizeValue(value[key]);
            }
            return cleanObj;
        }

        // 4. Si es número, boolean o null, lo dejamos igual
        return value;
    };

    app.use((req: Request, _res: Response, next: NextFunction) => {
        // Ahora aplicamos la función a todo el objeto, no solo al primer nivel
        if (req.body) req.body = sanitizeValue(req.body);
        if (req.query) req.query = sanitizeValue(req.query);
        if (req.params) req.params = sanitizeValue(req.params);

        next();
    });

    /* =============================
       6) RATE LIMITS
    ============================== */

    app.use(rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 200,
        standardHeaders: true,
        legacyHeaders: false
    }));

    app.use("/api/auth", rateLimit({
        windowMs: 10 * 60 * 1000,
        max: 30
    }));

    app.use("/api/auth/login", slowDown({
        windowMs: 10 * 60 * 1000,
        delayAfter: 5,
        delayMs: () => 1000,
        validate: { delayMs: false }
    }));

    /* =============================
       7) SLOWDOWN SUAVE
    ============================== */
    app.use(slowDown({
        windowMs: 10 * 60 * 1000,
        delayAfter: 120,
        delayMs: () => 300,
        validate: { delayMs: false }
    }));

    /* =============================
       8) AUDITORÍA SIMPLE
    ============================== */
    app.use((req: Request, _res: Response, next: NextFunction) => {
        const size = JSON.stringify(req.body || "").length;
        if (size > 100000) {
            console.warn("⚠️ Request sospechoso desde:", req.ip);
        }
        next();
    });
};
