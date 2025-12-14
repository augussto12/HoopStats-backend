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
                    "capacitor://localhost",
                    "file:",
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
       5) SANITIZACIÓN XSS COMPLETA
    ============================== */
    const sanitizeValue = (value: any) => {
        if (typeof value === "string") {
            return sanitizeHtml(value, {
                allowedTags: [],
                allowedAttributes: {}
            });
        }
        return value;
    };

    app.use((req: Request, _res: Response, next: NextFunction) => {
        if (req.body)
            for (const k in req.body)
                req.body[k] = sanitizeValue(req.body[k]);

        if (req.query)
            for (const k in req.query)
                req.query[k] = sanitizeValue(req.query[k]);

        if (req.params)
            for (const k in req.params)
                req.params[k] = sanitizeValue(req.params[k]);

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
