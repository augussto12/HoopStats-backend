import { z } from "zod";

// REGISTER
export const registerSchema = z.object({
    fullname: z
        .string()
        .trim()
        .min(3, "El nombre debe tener al menos 3 caracteres")
        .max(60, "El nombre es demasiado largo"),

    username: z
        .string()
        .trim()
        .toLowerCase()
        .min(3, "El usuario debe tener mínimo 3 caracteres")
        .max(30, "El usuario no puede superar 30 caracteres")
        .regex(/^[a-zA-Z0-9._-]+$/, "El usuario solo puede contener letras, números, puntos, guiones y guiones bajos"),

    email: z
        .string()
        .trim()
        .toLowerCase()
        .email("Email inválido"),

    password: z
        .string()
        .min(6, "La contraseña debe tener al menos 6 caracteres"),

    gender: z
        .string()
        .min(1, "El género es requerido"),
});

// LOGIN
export const loginSchema = z.object({
    identifier: z
        .string()
        .trim()
        .min(3, "Ingrese email o usuario válido"),

    password: z
        .string()
        .min(6, "La contraseña debe tener al menos 6 caracteres")
});


// SOLO EMAIL (para forgot / resend)
export const emailSchema = z.object({
    email: z
        .string()
        .trim()
        .toLowerCase()
        .email("Email inválido")
});


// RESET PASSWORD
export const resetPasswordSchema = z.object({
    token: z
        .string()
        .min(10, "Token inválido"),

    password: z
        .string()
        .min(6, "La contraseña debe tener al menos 6 caracteres")
});


// UPDATE PROFILE
export const updateProfileSchema = z.object({
    fullname: z
        .string()
        .trim()
        .min(3, "El nombre debe tener al menos 3 caracteres")
        .max(60, "El nombre es demasiado largo")
        .optional(),

    username: z
        .string()
        .trim()
        .toLowerCase()
        .min(3, "El usuario debe tener mínimo 3 caracteres")
        .max(30, "El usuario no puede superar 30 caracteres")
        .regex(/^[a-zA-Z0-9._-]+$/, "El usuario solo puede contener letras, números, puntos, guiones y guiones bajos")
        .optional(),

    gender: z
        .string()
        .min(1, "El género es requerido")
        .optional(),

    email: z
        .string()
        .trim()
        .toLowerCase()
        .email("Email inválido")
        .optional(),
});


// UPDATE PASSWORD
export const updatePasswordSchema = z.object({
    oldPassword: z
        .string()
        .min(6, "La contraseña actual es inválida"),

    newPassword: z
        .string()
        .min(6, "La nueva contraseña debe tener al menos 6 caracteres")
});
