import express, { type Express } from "express";
import fs from "fs";
import path from "path";

function resolveFirstExistingPath(paths: string[]) {
  return paths.find((candidate) => fs.existsSync(candidate));
}

function legacyFileCandidates(fileName: string) {
  const publicPath = path.resolve(__dirname, "public");
  const legacyDistPath = path.resolve(publicPath, "legacy");
  const legacySourcePath = path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "legacy_rewored",
    "legacy_old",
    "files",
  );

  return [
    path.resolve(legacyDistPath, "files", fileName),
    path.resolve(legacyDistPath, "archive", "files", fileName),
    path.resolve(legacySourcePath, fileName),
  ];
}

function sendLegacyFile(res: express.Response, fileName: string, contentType?: string) {
  const filePath = resolveFirstExistingPath(legacyFileCandidates(fileName));

  if (!filePath) {
    return res.status(404).json({ message: `Missing legacy file: ${fileName}` });
  }

  if (contentType) {
    res.type(contentType);
  }

  return res.sendFile(filePath);
}

export function registerLegacyFileRoutes(app: Express) {
  app.get(["/cv-pdf/en", "/cv-pdf/en/"], (_req, res) => {
    return sendLegacyFile(res, "CV.pdf");
  });

  app.get(["/cv-pdf/ru", "/cv-pdf/ru/"], (_req, res) => {
    return sendLegacyFile(res, "CVRU.pdf");
  });

  app.get(["/vcard", "/vcard/", "/vcard/828869858", "/vcard/828869858/"], (_req, res) => {
    res.setHeader("Content-Disposition", 'inline; filename="odnakov_vcard.vcf"');
    return sendLegacyFile(res, "odnakov_vcard.vcf", "text/vcard");
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  const cvDistPath = path.resolve(distPath, "cv");
  const legacyDistPath = path.resolve(distPath, "legacy");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }
  if (!fs.existsSync(cvDistPath)) {
    throw new Error(
      `Could not find the CV build directory: ${cvDistPath}, make sure to build the CV site first`,
    );
  }
  if (!fs.existsSync(legacyDistPath)) {
    throw new Error(
      `Could not find the legacy build directory: ${legacyDistPath}, make sure to build the legacy site first`,
    );
  }

  const legacyArchiveRedirects = new Map<string, string>([
    ["/legacy/projects", "/legacy/archive/projects/"],
    ["/legacy/projects/", "/legacy/archive/projects/"],
    ["/legacy/events", "/legacy/archive/events/"],
    ["/legacy/events/", "/legacy/archive/events/"],
    ["/legacy/gallery", "/legacy/archive/gallery/"],
    ["/legacy/gallery/", "/legacy/archive/gallery/"],
    ["/legacy/video", "/legacy/archive/video/"],
    ["/legacy/video/", "/legacy/archive/video/"],
  ]);

  app.use("/cv", express.static(cvDistPath));
  app.get("/cv", (_req, res) => {
    res.sendFile(path.resolve(cvDistPath, "index.html"));
  });
  app.get("/cv/{*path}", (_req, res) => {
    res.sendFile(path.resolve(cvDistPath, "index.html"));
  });
  app.get(Array.from(legacyArchiveRedirects.keys()), (req, res) => {
    const target = legacyArchiveRedirects.get(req.path);
    if (!target) {
      return res.status(404).end();
    }
    return res.redirect(302, target);
  });
  app.use("/legacy", express.static(legacyDistPath));

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
