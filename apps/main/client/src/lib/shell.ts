import { Terminal } from "@xterm/xterm";
import { VirtualFileSystem } from "./vfs";

export class Shell {
  private term: Terminal;
  private vfs: VirtualFileSystem;
  private currentInput: string = "";
  private history: string[] = [];
  private historyIndex: number = -1;
  private isProcessing: boolean = false;

  constructor(term: Terminal, vfs: VirtualFileSystem) {
    this.term = term;
    this.vfs = vfs;

    // Welcome message
    this.term.writeln("\x1b[1;32mWelcome to the interactive terminal hub.\x1b[0m");
    this.term.writeln("\x1b[38;5;246mType 'help' to see available commands.\x1b[0m\n");

    this.prompt();
    this.setupEventHandlers();
  }

  public updateVfs(vfs: VirtualFileSystem) {
     this.vfs = vfs;
     // Redraw prompt if language changed and we are idle
     if (!this.isProcessing) {
         this.term.write("\r\x1b[K"); // Clear current line
         this.prompt();
         this.term.write(this.currentInput); // Rewrite input
     }
  }

  private prompt() {
    const pwd = this.vfs.getPwd();
    const lang = this.vfs.lang;

    // Custom prompt styling mimicking the original one
    const userHost = `\x1b[1;36muser@main\x1b[0m`;
    const path = `\x1b[1;34m${pwd}\x1b[0m`;
    const git = `\x1b[1;32mmain\x1b[0m`;
    const symbol = `\x1b[1;32m❯\x1b[0m`;

    this.term.write(`${userHost}:${path} git:(${git}) ${symbol} `);
  }

  private setupEventHandlers() {
    this.term.onKey(({ key, domEvent }) => {
      if (this.isProcessing) return;

      // Handle Ctrl+C
      if (domEvent.ctrlKey && domEvent.key.toLowerCase() === "c") {
        this.term.write("^C\r\n");
        this.currentInput = "";
        this.prompt();
        return;
      }

      const printable = !domEvent.altKey && !domEvent.ctrlKey && !domEvent.metaKey && domEvent.key.length === 1;

      // Handle Enter
      if (domEvent.key === "Enter") {
        this.term.write("\r\n");
        this.handleCommand(this.currentInput.trim());

        if (this.currentInput.trim()) {
           this.history.push(this.currentInput.trim());
        }
        this.historyIndex = this.history.length;
        this.currentInput = "";

      }
      // Handle Backspace
      else if (domEvent.key === "Backspace") {
        if (this.currentInput.length > 0) {
          this.currentInput = this.currentInput.slice(0, -1);
          this.term.write("\b \b");
        }
      }
      // Handle Up Arrow (History)
      else if (domEvent.key === "ArrowUp") {
        if (this.historyIndex > 0) {
           // Clear current input from screen
           while (this.currentInput.length > 0) {
               this.term.write("\b \b");
               this.currentInput = this.currentInput.slice(0, -1);
           }

           this.historyIndex--;
           this.currentInput = this.history[this.historyIndex];
           this.term.write(this.currentInput);
        }
      }
      // Handle Down Arrow (History)
      else if (domEvent.key === "ArrowDown") {
        if (this.historyIndex < this.history.length - 1) {
            // Clear current input from screen
           while (this.currentInput.length > 0) {
               this.term.write("\b \b");
               this.currentInput = this.currentInput.slice(0, -1);
           }

           this.historyIndex++;
           this.currentInput = this.history[this.historyIndex];
           this.term.write(this.currentInput);
        } else if (this.historyIndex === this.history.length - 1) {
           // Clear current input from screen
           while (this.currentInput.length > 0) {
               this.term.write("\b \b");
               this.currentInput = this.currentInput.slice(0, -1);
           }
           this.historyIndex = this.history.length;
           this.currentInput = "";
        }
      }
      // Handle Printable characters
      else if (printable) {
        this.currentInput += key;
        this.term.write(key);
      }
    });
  }

  private handleCommand(cmdString: string) {
    if (!cmdString) {
      this.prompt();
      return;
    }

    this.isProcessing = true;

    // Split by spaces, handling quotes could be added here later
    const args = cmdString.split(/\s+/);
    const cmd = args[0].toLowerCase();

    try {
      switch (cmd) {
        case "help":
          this.term.writeln("\x1b[1;33mAvailable commands:\x1b[0m");
          this.term.writeln("  \x1b[1;32mls [dir]\x1b[0m      - List directory contents");
          this.term.writeln("  \x1b[1;32mcd [dir]\x1b[0m      - Change directory");
          this.term.writeln("  \x1b[1;32mpwd\x1b[0m           - Print working directory");
          this.term.writeln("  \x1b[1;32mcat [file]\x1b[0m    - View file contents");
          this.term.writeln("  \x1b[1;32mclear\x1b[0m         - Clear terminal screen");
          this.term.writeln("  \x1b[1;32mecho [text]\x1b[0m   - Print text");
          this.term.writeln("  \x1b[1;32msudo\x1b[0m          - Execute command as superuser");
          break;

        case "clear":
          this.term.clear();
          break;

        case "pwd":
          this.term.writeln(this.vfs.getPwd());
          break;

        case "ls":
        case "eza":
        case "ll":
          const targetDir = args[1] || ".";
          const listResult = this.vfs.listDirectory(targetDir);

          if (Array.isArray(listResult)) {
            if (listResult.length === 0) break;

            // Format output: Directories in blue, files in default color
            const formatted = listResult.map(item => {
                if (item.endsWith("/")) {
                    return `\x1b[1;34m${item}\x1b[0m`; // Blue bold for directories
                } else if (item.endsWith(".md") || item.endsWith(".txt")) {
                     return `\x1b[0;32m${item}\x1b[0m`; // Green for text/md
                }
                return item;
            }).join("  ");

            this.term.writeln(formatted);
          } else {
            this.term.writeln(`\x1b[31m${listResult}\x1b[0m`); // Error message
          }
          break;

        case "cd":
          const cdTarget = args[1] || "/";
          const cdError = this.vfs.changeDirectory(cdTarget);
          if (cdError) {
             this.term.writeln(`\x1b[31m${cdError}\x1b[0m`);
          }
          break;

        case "cat":
        case "bat":
          const catTarget = args[1];
          if (!catTarget) {
            this.term.writeln("\x1b[31mcat: missing file operand\x1b[0m");
          } else {
             const content = this.vfs.readFile(catTarget);
             if (content.startsWith("cat:")) {
                this.term.writeln("\x1b[31m" + content + "\x1b[0m");
             } else {
                this.term.writeln(content.replace(/\n/g, "\r\n"));
             }
          }
          break;

        case "echo":
          this.term.writeln(args.slice(1).join(" "));
          break;

        case "sudo":
           this.term.writeln("\x1b[31muser is not in the sudoers file. This incident will be reported.\x1b[0m");
           break;

        default:
          this.term.writeln(`\x1b[31m${cmd}: command not found\x1b[0m`);
      }
    } catch (e) {
       this.term.writeln(`\x1b[31mError executing command\x1b[0m`);
       console.error(e);
    } finally {
       this.isProcessing = false;
       if (cmd !== "clear") {
          this.prompt();
       } else {
          // If clear, we just need the prompt
          this.prompt();
       }
    }
  }
}
