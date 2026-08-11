import type { MetadataRoute } from "next";

const canonicalOrigin = "https://www.pitster.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/workshops", "/workshops/"],
      disallow: [
        "/admin",
        "/api",
        "/auth",
        "/customer",
        "/garage",
        "/register",
        "/service-provider",
        "/service-organisation",
        "/workshop-manager",
        "/workshop-staff",
        "/workshops/*/request",
      ],
    },
    sitemap: `${canonicalOrigin}/sitemap.xml`,
    host: canonicalOrigin,
  };
}
