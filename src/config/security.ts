import helmet from "helmet";
import rateLimit from "express-rate-limit";
import slowDown from "express-slow-down";
import sanitizeHtml from "sanitize-html";

export const configureSecurity = (app: any) => {

    // 1) HELMET
    app.use(helmet({
        crossOriginResourcePolicy: false,
    }));

    app.use(
        helmet.contentSecurityPolicy({
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", "data:", "blob:", "https:"],
                connectSrc: [
                    "'self'",
                    "https://v2.nba.api-sports.io",  // tu API externa
                    "https://hoopstats.com.ar"
                ],
                fontSrc: ["'self'", "https:", "data:"],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
            },
        })
    );


    app.disable("x-powered-by");

    // 2) HEADERS EXTRA DE SEGURIDAD
    app.use((req: any, res: any, next: any) => {
        res.setHeader("X-Frame-Options", "DENY");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
        res.setHeader(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=(), payment=()"
        );
        next();
    });

    // 3) SANITIZACIÓN XSS
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

    // 4) Rate limit GLOBAL
    app.use(rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 200,
        standardHeaders: true,
        legacyHeaders: false
    }));

    // 5) Rate limit AUTH
    app.use("/api/auth", rateLimit({
        windowMs: 10 * 60 * 1000,
        max: 30
    }));

    // 6) Slowdown LOGIN
    app.use("/api/auth/login", slowDown({
        windowMs: 10 * 60 * 1000,
        delayAfter: 5,
        delayMs: () => 1000,
        validate: { delayMs: false }
    }));
};

