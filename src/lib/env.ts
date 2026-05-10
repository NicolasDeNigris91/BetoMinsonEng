import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_PASSWORD: z.string().min(1, "APP_PASSWORD is required"),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters"),
  BASE_URL: z.string().url().default("http://localhost:3000"),
  UPLOADS_DIR: z.string().default("./data/uploads"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", z.treeifyError(parsed.error));
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;
