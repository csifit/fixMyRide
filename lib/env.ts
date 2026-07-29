import { z } from "zod";

const publicSupabaseSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
});

export type SupabaseEnvironment = z.infer<typeof publicSupabaseSchema>;

export function readSupabaseEnvironment():
  | { configured: true; values: SupabaseEnvironment }
  | { configured: false; message: string } {
  const result = publicSupabaseSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  if (result.success) return { configured: true, values: result.data };

  return {
    configured: false,
    message:
      "Supabase is not configured. Copy .env.example to .env.local and provide the project URL and publishable key.",
  };
}

export function requireSupabaseEnvironment(): SupabaseEnvironment {
  const environment = readSupabaseEnvironment();
  if (!environment.configured) throw new Error(environment.message);
  return environment.values;
}
