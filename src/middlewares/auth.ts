import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

interface TokenPayload {
    userId: number;
    iat: number;
    exp: number;
}

// Extensión del Request de Express para incluir req.user
declare module "express-serve-static-core" {
    interface Request {
        user?: TokenPayload;
    }
}

export const auth = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const header = req.headers.authorization;

        if (!header) {
            return res.status(401).json({ error: "Token no proporcionado" });
        }

        // Permitir Bearer
        const token = header.startsWith("Bearer ")
            ? header.slice(7)
            : header;

        if (!token || token.trim() === "") {
            return res.status(401).json({ error: "Token no proporcionado" });
        }

        // Verificar token JWT
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET as string
        ) as TokenPayload;

        // Guardar en req.user
        req.user = { userId: decoded.userId, iat: decoded.iat, exp: decoded.exp };

        next();

    } catch (err: any) {

        if (err.name === "TokenExpiredError") {
            return res.status(401).json({ error: "Token expirado" });
        }

        if (err.name === "JsonWebTokenError") {
            return res.status(401).json({ error: "Token inválido" });
        }

        console.error("Auth error:", err);
        return res.status(401).json({ error: "Error de autenticación" });
    }
};
