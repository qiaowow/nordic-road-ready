import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "北境自驾课",
    short_name: "北境自驾课",
    description: "挪威与冰岛官方交规离线学习题库",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f2eb",
    theme_color: "#13221d",
    lang: "zh-CN",
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
