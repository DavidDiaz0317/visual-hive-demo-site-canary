import { defineConfig } from "vite";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/").at(-1) ?? "visual-hive-demo-site";

export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? `/${repositoryName}/` : "/",
  preview: {
    host: "127.0.0.1"
  },
  server: {
    host: "127.0.0.1"
  }
});
