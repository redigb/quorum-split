import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Quorum",
    short_name: "Quorum",
    description: "Nobody pays until everybody pays. Split a bill and charge the whole table at once.",
    start_url: "/new",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbf9ef",
    theme_color: "#fbf9ef",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
