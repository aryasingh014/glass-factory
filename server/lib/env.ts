import { z } from "zod";
import { logger } from "./logger";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .or(z.number())
    .default(8080),
  JWT_SECRET: z
    .string()
    .min(8, "JWT_SECRET must be at least 8 characters long")
    .default("sejal-glass-manufacturing-secret-key-2026"),
  DATA_DIR: z.string().optional(),
  SMTP_HOST: z.string().default("smtp.gmail.com"),
  SMTP_PORT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .or(z.number())
    .default(465),
  SMTP_SECURE: z
    .string()
    .transform((val) => val === "true" || val === "1")
    .or(z.boolean())
    .default(true),
  SMTP_USER: z.string().default("novaaias014@gmail.com"),
  SMTP_PASS: z.string().default("avhdszmxuxmacmix"),
  SMTP_FROM: z.string().default('"Sejal Glass ERP" <novaaias014@gmail.com>'),
  APP_URL: z.string().default("http://localhost:8080"),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    logger.error("Invalid environment variables configuration", { errors: result.error.format() });
    throw new Error("Invalid environment variables configuration. Server start aborted.");
  }
  return result.data;
}

export const env = validateEnv();
