import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";

export interface LockData {
  pid: number;
  workspaceFolders: string[];
  ideName: string;
  transport: "ws";
  authToken: string;
}

// §4.1: $CLAUDE_CONFIG_DIR/ide or ~/.claude/ide.
function ideDir(): string {
  const configDir = process.env.CLAUDE_CONFIG_DIR;
  const base = configDir && configDir.length > 0 ? configDir : path.join(os.homedir(), ".claude");
  return path.join(base, "ide");
}

// True if a process with this pid exists (EPERM means it exists but isn't ours).
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

// Discovery lock file (§4). Written atomically (.tmp -> rename) with 0600/0700 perms
// so the token is never world-readable; removed on unload.
export class LockFile {
  private filePath: string | null = null;

  constructor(private readonly port: number) {}

  async write(data: LockData): Promise<void> {
    const dir = ideDir();
    await fs.mkdir(dir, { recursive: true });
    if (process.platform !== "win32") {
      try {
        await fs.chmod(dir, 0o700);
      } catch {
        // permissions are best-effort on exotic filesystems
      }
    }
    const target = path.join(dir, `${this.port}.lock`);
    const tmp = `${target}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data), { mode: 0o600 });
    if (process.platform !== "win32") {
      try {
        await fs.chmod(tmp, 0o600);
      } catch {
        // best-effort
      }
    }
    await fs.rename(tmp, target);
    this.filePath = target;
  }

  async remove(): Promise<void> {
    if (!this.filePath) return;
    try {
      await fs.unlink(this.filePath);
    } catch {
      // absence at removal time is not an error (§4.4)
    }
    this.filePath = null;
  }

  // §10: on start, remove lock files left by dead processes (e.g. after a crash).
  static async sweepStale(): Promise<void> {
    const dir = ideDir();
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return;
    }
    await Promise.all(
      entries
        .filter((f) => f.endsWith(".lock"))
        .map(async (f) => {
          const full = path.join(dir, f);
          try {
            const data = JSON.parse(await fs.readFile(full, "utf8")) as { pid?: number };
            if (typeof data.pid === "number" && !isProcessAlive(data.pid)) {
              await fs.unlink(full).catch(() => undefined);
            }
          } catch {
            // unreadable/partial lock — leave it
          }
        }),
    );
  }
}
