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
