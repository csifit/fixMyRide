import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { readSupabaseEnvironment } from "@/lib/env";

const canonicalOrigin = "https://www.pitster.app";

export const revalidate = 3600;

async function loadPublicWorkshopSlugs() {
  const environment = readSupabaseEnvironment();
  if (!environment.configured) return [];

  const supabase = createClient(
    environment.values.NEXT_PUBLIC_SUPABASE_URL,
    environment.values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
  const { data, error } = await supabase.rpc("search_public_workshops_v2", {
    requested_search: null,
  });
  if (error) throw error;

  const rows = (data ?? []) as Array<{ workshop_slug?: unknown }>;
  return rows
    .map((row) => row.workshop_slug)
    .filter((slug): slug is string => typeof slug === "string" && slug.length > 0);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let workshopSlugs: string[] = [];
  try {
    workshopSlugs = [...new Set(await loadPublicWorkshopSlugs())];
  } catch {
    // Keep the core sitemap available if public workshop discovery is briefly unavailable.
  }

  return [
    {
      url: canonicalOrigin,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${canonicalOrigin}/workshops`,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${canonicalOrigin}/faq`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${canonicalOrigin}/contact`,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    ...["terms", "privacy", "cookies"].map((path) => ({
      url: `${canonicalOrigin}/${path}`,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...workshopSlugs.map((slug) => ({
      url: `${canonicalOrigin}/workshops/${encodeURIComponent(slug)}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
