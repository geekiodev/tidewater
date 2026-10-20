import "server-only";
import { z } from "zod";

/**
 * All configuration comes from environment variables. Nothing secret is
 * hard-coded anywhere in the repo. Each group is validated lazily, the first
 * time it is needed, so (for example) a missing Stripe key only breaks billing
 * and `next build` works without any secrets present.
 */

function parse<T extends z.ZodType>(schema: T, name: string): z.infer<T> {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join(".")).join(", ");
    // Only variable names are reported, never values.
    throw new Error(`Missing or invalid ${name} environment variables: ${missing}`);
  }
  return result.data;
}

const appSchema = z.object({
  APP_URL: z.url().default("http://localhost:3000"),
});

const supabasePublicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
});

const supabaseServiceSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
});

const stripeSchema = z.object({
  STRIPE_SECRET_KEY: z.string().startsWith("sk_test_", {
    message: "Only Stripe test-mode keys are allowed in this build",
  }),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
  STRIPE_PRICE_STARTER: z.string().startsWith("price_"),
  STRIPE_PRICE_TEAM: z.string().startsWith("price_"),
});

const anthropicSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(10),
  ANTHROPIC_MODEL: z.string().min(1).max(100).default("claude-haiku-5-5"),
  AI_MONTHLY_BRIEF_LIMIT: z.coerce.number().int().min(0).max(100000).default(200),
});

export const appEnv = () => parse(appSchema, "app");
export const supabasePublicEnv = () => parse(supabasePublicSchema, "Supabase");
export const supabaseServiceEnv = () => parse(supabaseServiceSchema, "Supabase service");
export const stripeEnv = () => parse(stripeSchema, "Stripe");
export const anthropicEnv = () => parse(anthropicSchema, "Anthropic");
