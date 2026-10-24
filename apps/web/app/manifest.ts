import type { MetadataRoute } from "next";

/** The web app manifest (Task C8; v1 manifest.webmanifest for shape). Next serves it at /manifest.webmanifest and links it from every page. The icons are product art only. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Appuscholar",
    short_name: "Appuscholar",
    description: "A writing and research helper for psychology students.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fbfaf9",
    theme_color: "#4c1d95",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
