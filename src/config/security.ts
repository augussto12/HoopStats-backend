import helmet from "helmet";
import rateLimit from "express-rate-limit";
import slowDown from "express-slow-down";
import sanitizeHtml from "sanitize-html";

export const configureSecurity = (app: any) => {

    // Helmet
    app.use(helmet());

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
        standardHeaders: true,
        legacyHeaders: false
    }));

    // Rate limit AUTH
    app.use("/api/auth", rateLimit({
        windowMs: 10 * 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false
    }));

    // Slowdown LOGIN
    app.use("/api/auth/login", slowDown({
        windowMs: 10 * 60 * 1000,
        delayAfter: 5,
        delayMs: () => 1000,
        validate: { delayMs: false }
    }));
};
