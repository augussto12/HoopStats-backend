import { z } from "zod";

export const registerSchema = z.object({
    fullname: z.string().min(3).max(60),
    email: z.string().email(),
    gender: z.string(),
    password: z.string().min(6),
    username: z
        .string()
        .min(3)
        .max(30)
        .regex(/^[a-zA-Z0-9._-]+$/, "El usuario no puede tener espacios ni caracteres raros")
});

export const loginSchema = z.object({
    identifier: z.string().min(3),
    password: z.string().min(6)
});
