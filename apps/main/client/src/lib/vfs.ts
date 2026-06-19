import { homeContent, Language, SocialLink, QuickLink, ContentLine, ProjectItem, ArchiveItem } from "../data/home";

export type FileType = "file" | "dir";

export interface VfsNode {
  type: FileType;
  name: string;
  content?: string;
  children?: Record<string, VfsNode>;
  parent?: VfsNode;
  mode?: string;
  size?: number;
  mtime?: string;
  description?: string;
  url?: string;
  executable?: boolean;
}

export interface VfsStat {
  path: string;
  name: string;
  type: FileType;
  mode: string;
  size: number;
  mtime: string;
  description?: string;
  url?: string;
  executable?: boolean;
}

export class VirtualFileSystem {
  root: VfsNode;
  cwd: VfsNode;
  lang: Language;

  constructor(lang: Language) {
    this.lang = lang;
    this.root = this.buildFileSystem(lang);
    this.cwd = this.root;
  }

  setLang(lang: Language) {
    if (this.lang !== lang) {
      const previousPath = this.getPwd();
      this.lang = lang;
      this.root = this.buildFileSystem(lang);
      this.cwd = this.root;
      const preserved = this.resolvePath(previousPath);
      if (preserved?.type === "dir") this.cwd = preserved;
    }
  }

  private addNode(parent: VfsNode, name: string, node: Partial<VfsNode>): VfsNode {
    const normalized: VfsNode = {
      mode: node.type === "dir" ? "drwxr-xr-x" : node.executable ? "-rwxr-xr-x" : "-rw-r--r--",
      mtime: "17 Jun 2026",
      size: node.content?.length ?? 0,
      ...node,
      name,
      parent,
    } as VfsNode;
    if (parent.children) parent.children[name] = normalized;
    return normalized;
  }

  private buildFileSystem(lang: Language): VfsNode {
    const content = homeContent[lang];
    const root: VfsNode = { type: "dir", name: "/", children: {}, mode: "drwxr-xr-x", mtime: "17 Jun 2026", size: 0 };

    const aboutSection = content.sections.find((s) => s.type === "about");
    const readmeContent = aboutSection?.data?.lines
      ? aboutSection.data.lines
          .filter((l: ContentLine) => l.type === "content")
          .map((l: ContentLine) => l.line.replace(/^\s*\d+\s*│\s?/, "").trimEnd())
          .join("\n")
      : "About me\n";
    this.addNode(root, "README.md", { type: "file", content: readmeContent, description: "About this homepage" });

    const cvSection = content.sections.find((s) => s.type === "cv");
    let cvContent = cvSection?.data?.items ? cvSection.data.items.join("\n") : "CV\n";
    if (cvSection?.data?.ctaUrl) cvContent += `\n\nLink: ${cvSection.data.ctaUrl}`;
    this.addNode(root, "cv.txt", { type: "file", content: cvContent, description: "Short CV", url: cvSection?.data?.ctaUrl });

    this.addNode(root, "index.txt", { type: "file", content: `${content.hero.title}\n${content.hero.desc}`, description: "Landing page intro" });
    this.addNode(root, "site.json", { type: "file", content: JSON.stringify({ hero: content.hero, sections: content.sections.map((section) => ({ type: section.type, title: section.title, data: section.data })) }, null, 2), description: "Structured homepage data for jq/wasm tools" });

    const contactDir = this.addNode(root, "contact", { type: "dir", children: {}, description: "Best contact routes" });
    const contactNames = new Set(["Mail", "Почта", "LI", "GH", "TG", "vCard"]);
    const addContact = (name: string, title: string, url: string) => {
      this.addNode(contactDir, `${name.toLowerCase().replace(/\s+/g, "_")}.txt`, {
        type: "file",
        content: `${title}\nURL: ${url}`,
        description: title,
        url,
        executable: true,
      });
    };

    const socialsDir = this.addNode(root, "socials", { type: "dir", children: {}, description: "Social profiles" });
    const socialsSection = content.sections.find((s) => s.type === "social");
    if (socialsSection?.data) {
      (socialsSection.data as SocialLink[]).forEach((social) => {
        this.addNode(socialsDir, `${social.name.toLowerCase()}.txt`, {
          type: "file",
          content: `${social.icon} ${social.name}: ${social.url}`,
          description: social.name,
          url: social.url,
        });
        if (contactNames.has(social.name)) addContact(social.name, social.name, social.url);
      });
    }

    const quicklinksDir = this.addNode(root, "quicklinks", { type: "dir", children: {}, description: "Primary site links" });
    const quickLinksSection = content.sections.find((s) => s.type === "quickLinks");
    if (quickLinksSection?.data) {
      (quickLinksSection.data as QuickLink[]).forEach((link) => {
        const filename = link.name.toLowerCase().replace(/\s+/g, "_") + ".txt";
        this.addNode(quicklinksDir, filename, {
          type: "file",
          content: `${link.icon} ${link.title}\nURL: ${link.url}`,
          description: link.title,
          url: link.url,
          executable: true,
        });
        if (contactNames.has(link.name)) addContact(link.name, link.title, link.url);
      });
    }

    const projectsDir = this.addNode(root, "projects", { type: "dir", children: {}, description: "Project links" });
    const projectsSection = content.sections.find((s) => s.type === "projects");
    if (projectsSection?.data?.items) {
      (projectsSection.data.items as ProjectItem[]).forEach((project) => {
        const rawName = project.name.trim().split(/\s+/).pop();
        if (rawName) {
          this.addNode(projectsDir, `${rawName}.txt`, {
            type: "file",
            content: [
              rawName,
              project.year ? `Year: ${project.year}` : undefined,
              project.tech ? `Tech: ${project.tech}` : undefined,
              project.description ? `Why it matters: ${project.description}` : "Why it matters: shows long-running experiments and public artifacts.",
              `URL: ${project.url}`,
              `Try: open ${rawName}.txt`,
            ].filter(Boolean).join("\n"),
            description: rawName,
            url: project.url,
            executable: true,
          });
        }
      });
    }

    const archiveDir = this.addNode(root, "archive", { type: "dir", children: {}, description: "Legacy archive" });
    const archiveSection = content.sections.find((s) => s.type === "archive");
    if (archiveSection?.data?.items) {
      (archiveSection.data.items as ArchiveItem[]).forEach((item) => {
        const name = item.name.split("/").filter(Boolean).pop() || "item";
        this.addNode(archiveDir, `${name}.txt`, {
          type: "file",
          content: `${item.name}\nURL: ${item.url}`,
          description: item.name,
          url: item.url,
          executable: true,
        });
      });
    }

    return root;
  }

  resolvePath(path: string): VfsNode | null {
    if (!path || path === ".") return this.cwd;
    if (path === "..") return this.cwd.parent || this.root;
    if (path === "/") return this.root;

    let current = path.startsWith("/") ? this.root : this.cwd;
    const parts = path.split("/").filter(Boolean);
    for (const part of parts) {
      if (part === ".") continue;
      if (part === "..") {
        current = current.parent || this.root;
        continue;
      }
      if (current.type !== "dir" || !current.children?.[part]) return null;
      current = current.children[part];
    }
    return current;
  }

  pathFor(node: VfsNode): string {
    if (node === this.root) return "/";
    const parts: string[] = [];
    let current: VfsNode | undefined = node;
    while (current && current !== this.root) {
      parts.unshift(current.name);
      current = current.parent;
    }
    return `/${parts.join("/")}`;
  }

  getPwd(): string {
    return this.pathFor(this.cwd);
  }

  changeDirectory(path: string): string {
    const node = this.resolvePath(path || "/");
    if (!node) return `cd: ${path}: No such file or directory`;
    if (node.type !== "dir") return `cd: ${path}: Not a directory`;
    this.cwd = node;
    return "";
  }

  stat(path: string): VfsStat | null {
    const node = this.resolvePath(path);
    if (!node) return null;
    const size = node.type === "dir" ? Object.keys(node.children ?? {}).length : node.content?.length ?? node.size ?? 0;
    return {
      path: this.pathFor(node),
      name: node.name,
      type: node.type,
      mode: node.mode ?? (node.type === "dir" ? "drwxr-xr-x" : "-rw-r--r--"),
      size,
      mtime: node.mtime ?? "17 Jun 2026",
      description: node.description,
      url: node.url,
      executable: node.executable,
    };
  }

  listStats(path: string = "."): VfsStat[] | string {
    const node = this.resolvePath(path);
    if (!node) return `ls: cannot access '${path}': No such file or directory`;
    if (node.type !== "dir" || !node.children) return [this.stat(path)!];
    return Object.values(node.children).map((child) => this.stat(this.pathFor(child))!).sort((a, b) => a.name.localeCompare(b.name));
  }

  listDirectory(path: string = "."): string[] | string {
    const stats = this.listStats(path);
    if (typeof stats === "string") return stats;
    return stats.map((item) => item.type === "dir" ? `${item.name}/` : item.name);
  }

  readFile(path: string): string {
    const node = this.resolvePath(path);
    if (!node) return `cat: ${path}: No such file or directory`;
    if (node.type === "dir") return `cat: ${path}: Is a directory`;
    return node.content || "";
  }

  writeFile(path: string, content: string): string {
    const existing = this.resolvePath(path);
    if (existing?.type === "dir") return `write: ${path}: Is a directory`;

    const parts = path.split("/").filter(Boolean);
    const name = parts.pop();
    if (!name) return `write: ${path}: invalid path`;
    const parentPath = path.startsWith("/") ? `/${parts.join("/")}` : parts.join("/") || ".";
    const parent = this.resolvePath(parentPath);
    if (!parent) return `write: ${parentPath}: No such file or directory`;
    if (parent.type !== "dir" || !parent.children) return `write: ${parentPath}: Not a directory`;
    this.addNode(parent, name, { type: "file", content });
    return "";
  }

  makeDirectory(path: string, options: { parents?: boolean } = {}): string {
    const parts = path.split("/").filter(Boolean);
    if (!parts.length) return `mkdir: ${path}: invalid path`;

    let current = path.startsWith("/") ? this.root : this.cwd;
    for (let index = 0; index < parts.length; index++) {
      const part = parts[index];
      if (part === ".") continue;
      if (part === "..") {
        current = current.parent || this.root;
        continue;
      }
      if (current.type !== "dir" || !current.children) return `mkdir: cannot create directory ${path}: Not a directory`;
      const existing = current.children[part];
      if (existing) {
        if (existing.type !== "dir") return `mkdir: cannot create directory ${path}: File exists`;
        current = existing;
        continue;
      }
      if (!options.parents && index < parts.length - 1) return `mkdir: cannot create directory ${path}: No such file or directory`;
      current = this.addNode(current, part, { type: "dir", children: {} });
    }
    return "";
  }

  remove(path: string, options: { recursive?: boolean } = {}): string {
    const node = this.resolvePath(path);
    if (!node) return `rm: cannot remove ${path}: No such file or directory`;
    if (!node.parent?.children) return `rm: refusing to remove root`;
    if (node.type === "dir" && Object.keys(node.children ?? {}).length > 0 && !options.recursive) {
      return `rm: cannot remove ${path}: Is a directory`;
    }
    delete node.parent.children[node.name];
    if (this.cwd === node || this.pathFor(this.cwd).startsWith(`${this.pathFor(node)}/`)) this.cwd = this.root;
    return "";
  }

  destinationPath(source: string, dest: string): string {
    const destNode = this.resolvePath(dest);
    if (destNode?.type === "dir") {
      const sourceNode = this.resolvePath(source);
      const name = sourceNode?.name ?? source.split("/").filter(Boolean).pop() ?? source;
      return `${this.pathFor(destNode).replace(/\/$/, "")}/${name}`;
    }
    return dest;
  }

  walk(path: string = "."): VfsStat[] | string {
    const start = this.resolvePath(path);
    if (!start) return `find: '${path}': No such file or directory`;
    const results: VfsStat[] = [];
    const visit = (node: VfsNode) => {
      const stat = this.stat(this.pathFor(node));
      if (stat) results.push(stat);
      if (node.type === "dir" && node.children) Object.values(node.children).forEach(visit);
    };
    visit(start);
    return results;
  }

  completePath(partial: string): string[] {
    const slash = partial.lastIndexOf("/");
    const base = slash >= 0 ? partial.slice(0, slash + 1) : "";
    const prefix = slash >= 0 ? partial.slice(slash + 1) : partial;
    const dirPath = base || ".";
    const dir = this.resolvePath(dirPath);
    if (!dir || dir.type !== "dir" || !dir.children) return [];
    return Object.values(dir.children)
      .filter((child) => child.name.startsWith(prefix))
      .map((child) => `${base}${child.name}${child.type === "dir" ? "/" : ""}`);
  }

  findUrl(target: string): string | null {
    const direct = this.resolvePath(target);
    if (direct?.url) return direct.url;
    const walked = this.walk("/");
    if (typeof walked === "string") return null;
    const match = walked.find((item) => item.name === target || item.path === target || item.description?.toLowerCase() === target.toLowerCase());
    return match?.url ?? null;
  }
}
