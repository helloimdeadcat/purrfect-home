import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Purrfect Home",
    short_name: "Purrfect",
    description:
      "A cozy home organiser for couples: money, to-dos, schedule, habits and meals.",
    start_url: "/app/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#fff7f9",
    theme_color: "#e8679a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
