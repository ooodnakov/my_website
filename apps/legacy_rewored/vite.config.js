import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineConfig } from "vite";

const projectRoot = path.resolve(__dirname);
const archiveDir = path.resolve(projectRoot, "legacy_old");
const outDir = path.resolve(projectRoot, "dist");

async function rewriteFile(relativePath, transform) {
  const filePath = path.join(outDir, relativePath);
  const content = await readFile(filePath, "utf8");
  await writeFile(filePath, transform(content));
}

export default defineConfig({
  root: projectRoot,
  base: "/legacy/",
  publicDir: false,
  build: {
    outDir,
    emptyOutDir: true,
  },
  plugins: [
    {
      name: "legacy-archive-copy",
      apply: "build",
      async closeBundle() {
        await mkdir(outDir, { recursive: true });

        const archiveOutDir = path.join(outDir, "archive");
        await mkdir(archiveOutDir, { recursive: true });

        await cp(path.join(archiveDir, "style.css"), path.join(archiveOutDir, "style.css"));
        await cp(path.join(archiveDir, "pink_style.css"), path.join(archiveOutDir, "pink_style.css"));
        await cp(path.join(archiveDir, "robots.txt"), path.join(archiveOutDir, "robots.txt"));
        await cp(path.join(archiveDir, "sitemap.xml"), path.join(archiveOutDir, "sitemap.xml"));

        const foldersToCopy = [
          "counter",
          "events",
          "files",
          "gallery",
          "imgs",
          "link",
          "projects",
          "video",
        ];

        for (const folder of foldersToCopy) {
          await cp(path.join(archiveDir, folder), path.join(archiveOutDir, folder), {
            recursive: true,
            filter: (src) => {
              const base = path.basename(src);
              return (
                base !== ".htaccess" &&
                !base.endsWith(".php") &&
                !base.endsWith(".code-workspace")
              );
            },
          });
        }

        await rewriteFile(path.join("archive", "events", "index.html"), (content) =>
          content
            .replaceAll("https://dnakov.ooo/style.css", "../style.css")
            .replaceAll("https://dnakov.ooo/pink_style.css", "../pink_style.css")
            .replaceAll(
              'https://events.dnakov.ooo"',
              'https://dnakov.ooo/legacy/archive/events/"',
            )
            .replace(
              /async function serverRequest[\s\S]*?return result;\n        }/m,
              'async function serverRequest() {\n            return "archive";\n        }',
            )
            .replaceAll("fetch('load_events.php')", "fetch('events.json')")
            .replaceAll("Только для Сани", "Архивный режим"),
        );

        await rewriteFile(path.join("archive", "projects", "index.html"), (content) =>
          content
            .replaceAll("https://main.dnakov.ooo/projects/style.css", "./style.css")
            .replaceAll(
              "https://main.dnakov.ooo/projects/files/favicon.png",
              "./files/favicon.png",
            )
            .replaceAll(
              'https://main.dnakov.ooo/projects"',
              'https://dnakov.ooo/legacy/archive/projects/"',
            )
            .replaceAll("https://main.dnakov.ooo/projects/files/", "./files/")
            .replaceAll("https://dnakov.ooo/projects/files/", "./files/"),
        );

        await rewriteFile(path.join("archive", "projects", "style.css"), (content) =>
          content
            .replaceAll("https://main.dnakov.ooo/projects/img/", "./img/")
            .replaceAll("https://dnakov.ooo/projects/img/", "./img/")
            .replaceAll(
              'url("./img/clouds.webp") center bottom / 100% no-repeat, ',
              "",
            ),
        );

        await rewriteFile(path.join("archive", "video", "index.html"), (content) =>
          content.replaceAll(
            "https://dnakov.ooo/projects/files/favicon.png",
            "../projects/files/favicon.png",
          ),
        );
      },
    },
  ],
});
