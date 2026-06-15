import { homeContent, Language, SocialLink, QuickLink, ContentLine, ProjectItem, CvItem, ArchiveItem } from "../data/home";

export type FileType = "file" | "dir";

export interface VfsNode {
  type: FileType;
  name: string;
  content?: string;
  children?: Record<string, VfsNode>;
  parent?: VfsNode;
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
      this.lang = lang;
      this.root = this.buildFileSystem(lang);
      // Reset cwd to root when changing lang to avoid dangling pointers
      this.cwd = this.root;
    }
  }

  private buildFileSystem(lang: Language): VfsNode {
    const content = homeContent[lang];
    const root: VfsNode = { type: "dir", name: "/", children: {} };

    // Helper to add nodes
    const addNode = (parent: VfsNode, name: string, node: Partial<VfsNode>): VfsNode => {
      const newNode = { ...node, name, parent } as VfsNode;
      if (parent.children) {
        parent.children[name] = newNode;
      }
      return newNode;
    };

    // 1. README.md
    const aboutSection = content.sections.find((s) => s.type === "about");
    let readmeContent = "About me\n";
    if (aboutSection && aboutSection.data && aboutSection.data.lines) {
        readmeContent = aboutSection.data.lines
            .map((l: ContentLine) => l.line)
            .join("\n");
    }
    addNode(root, "README.md", { type: "file", content: readmeContent });

    // 2. cv.txt
    const cvSection = content.sections.find((s) => s.type === "cv");
    let cvContent = "CV\n";
    if (cvSection && cvSection.data && cvSection.data.items) {
        cvContent = cvSection.data.items.join("\n");
        if (cvSection.data.ctaUrl) {
            cvContent += `\n\nLink: ${cvSection.data.ctaUrl}`;
        }
    }
    addNode(root, "cv.txt", { type: "file", content: cvContent });

    // 3. index.txt
    const indexContent = `${content.hero.title}\n${content.hero.desc}`;
    addNode(root, "index.txt", { type: "file", content: indexContent });

    // 4. socials/
    const socialsDir = addNode(root, "socials", { type: "dir", children: {} });
    const socialsSection = content.sections.find((s) => s.type === "social");
    if (socialsSection && socialsSection.data) {
        (socialsSection.data as SocialLink[]).forEach((social) => {
            addNode(socialsDir, `${social.name.toLowerCase()}.txt`, { type: "file", content: `${social.icon} ${social.name}: ${social.url}` });
        });
    }

    // 5. quicklinks/
    const quicklinksDir = addNode(root, "quicklinks", { type: "dir", children: {} });
    const quickLinksSection = content.sections.find((s) => s.type === "quickLinks");
    if (quickLinksSection && quickLinksSection.data) {
        (quickLinksSection.data as QuickLink[]).forEach((link) => {
            const filename = link.name.toLowerCase().replace(/\s+/g, "_") + ".txt";
            addNode(quicklinksDir, filename, { type: "file", content: `${link.icon} ${link.title}\nURL: ${link.url}` });
        });
    }

    // 6. projects/
    const projectsDir = addNode(root, "projects", { type: "dir", children: {} });
    const projectsSection = content.sections.find((s) => s.type === "projects");
    if (projectsSection && projectsSection.data && projectsSection.data.items) {
        (projectsSection.data.items as ProjectItem[]).forEach((project) => {
            // Extract the actual project name from the ls-like string (last word)
            const parts = project.name.trim().split(/\s+/);
            const rawName = parts[parts.length - 1];
            // Only add if it's not the directory header
            if (rawName) {
                addNode(projectsDir, `${rawName}.txt`, { type: "file", content: `URL: ${project.url}`});
            }
        });
    }

    // 7. archive/
    const archiveDir = addNode(root, "archive", { type: "dir", children: {} });
    const archiveSection = content.sections.find((s) => s.type === "archive");
    if (archiveSection && archiveSection.data && archiveSection.data.items) {
         (archiveSection.data.items as ArchiveItem[]).forEach((item) => {
            const name = item.name.split("/").filter(Boolean).pop() || "item";
            addNode(archiveDir, name + ".txt", { type: "file", content: "URL: " + item.url });
         });
    }


    return root;
  }

  // Resolves a path to a node. Returns null if not found.
  resolvePath(path: string): VfsNode | null {
    if (!path || path === ".") return this.cwd;
    if (path === "..") return this.cwd.parent || this.root;
    if (path === "/") return this.root;

    let current = path.startsWith("/") ? this.root : this.cwd;
    const parts = path.split("/").filter((p) => p !== "");

    for (const part of parts) {
      if (part === ".") continue;
      if (part === "..") {
        current = current.parent || this.root;
        continue;
      }

      if (current.type !== "dir" || !current.children || !current.children[part]) {
        return null; // Not found
      }
      current = current.children[part];
    }

    return current;
  }

  getPwd(): string {
    if (this.cwd === this.root) return "/";
    let path = "";
    let current: VfsNode | undefined = this.cwd;
    while (current && current !== this.root) {
      path = "/" + current.name + path;
      current = current.parent;
    }
    return path;
  }

  changeDirectory(path: string): string {
    const node = this.resolvePath(path);
    if (!node) {
      return `cd: ${path}: No such file or directory`;
    }
    if (node.type !== "dir") {
      return `cd: ${path}: Not a directory`;
    }
    this.cwd = node;
    return "";
  }

  listDirectory(path: string = "."): string[] | string {
    const node = this.resolvePath(path);
    if (!node) {
      return `ls: cannot access '${path}': No such file or directory`;
    }
    if (node.type !== "dir" || !node.children) {
        return [node.name]; // If it's a file, ls just prints the file name
    }

    const entries = Object.values(node.children).map(child => {
      // Add a trailing slash for directories to make it look nicer
      return child.type === "dir" ? `${child.name}/` : child.name;
    });

    return entries.sort();
  }

  readFile(path: string): string {
    const node = this.resolvePath(path);
    if (!node) {
      return `cat: ${path}: No such file or directory`;
    }
    if (node.type === "dir") {
      return `cat: ${path}: Is a directory`;
    }
    return node.content || "";
  }
}
