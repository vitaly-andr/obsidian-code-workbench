// Fallback declarations for the Node built-ins this plugin imports.
//
// These are NOT used when the project is installed: tsconfig `paths` lists
// node_modules/@types/node first, so a normal checkout always type-checks against the
// real, complete definitions (https://www.npmjs.com/package/@types/node). This file only
// takes over in an environment that lints the sources without installing dependencies,
// where every Node import would otherwise resolve to TypeScript's `error` type and every
// use of it would look like an unchecked `any`.
//
// Scope: only the members `main.ts` and `src/**` actually touch.

declare namespace NodeJS {
  type Platform = "aix" | "android" | "darwin" | "freebsd" | "haiku" | "linux" | "openbsd" | "sunos" | "win32" | "cygwin" | "netbsd";
  type Signals = "SIGABRT" | "SIGHUP" | "SIGINT" | "SIGKILL" | "SIGTERM" | "SIGUSR1" | "SIGUSR2";
  interface ProcessEnv {
    [key: string]: string | undefined;
  }
  interface ErrnoException extends Error {
    code?: string;
    errno?: number;
    path?: string;
    syscall?: string;
  }
  interface WriteStream {
    write(chunk: string | Uint8Array): boolean;
  }
  interface Process {
    env: ProcessEnv;
    platform: Platform;
    pid: number;
    stdout: WriteStream;
    exit(code?: number): never;
    kill(pid: number, signal?: Signals | number): true;
  }
}

declare const process: NodeJS.Process;

interface Buffer extends Uint8Array {
  toString(encoding?: string, start?: number, end?: number): string;
}

declare const Buffer: {
  from(data: string | ArrayBuffer | ArrayLike<number>, encoding?: string): Buffer;
  alloc(size: number): Buffer;
  concat(list: readonly Uint8Array[], totalLength?: number): Buffer;
  isBuffer(obj: unknown): obj is Buffer;
};

declare module "path" {
  interface PlatformPath {
    readonly sep: string;
    join(...parts: string[]): string;
    resolve(...parts: string[]): string;
    dirname(p: string): string;
    basename(p: string, ext?: string): string;
    extname(p: string): string;
    relative(from: string, to: string): string;
    normalize(p: string): string;
    isAbsolute(p: string): boolean;
    readonly posix: PlatformPath;
    readonly win32: PlatformPath;
  }
  const path: PlatformPath;
  export = path;
}

declare module "os" {
  export function homedir(): string;
  export function tmpdir(): string;
  export function platform(): NodeJS.Platform;
}

declare module "fs" {
  export interface Stats {
    isFile(): boolean;
    isDirectory(): boolean;
    size: number;
    mtimeMs: number;
  }
  export interface Dirent {
    name: string;
    isFile(): boolean;
    isDirectory(): boolean;
  }
  export interface FSWatcher {
    close(): void;
    on(event: string, listener: (...args: never[]) => void): this;
  }
  export function existsSync(p: string): boolean;
  export function readFileSync(p: string, encoding: string): string;
  export function watch(
    p: string,
    options?: { recursive?: boolean; persistent?: boolean },
    listener?: (event: string, filename: string | null) => void,
  ): FSWatcher;
  // FileHandle lives inside `promises` in @types/node, and callers reference it as
  // `import("fs").promises.FileHandle`, so it has to be declared here rather than at module level.
  export namespace promises {
    interface FileHandle {
      close(): Promise<void>;
      read(
        buffer: Uint8Array,
        offset: number,
        length: number,
        position: number | null,
      ): Promise<{ bytesRead: number; buffer: Uint8Array }>;
      readFile(options?: { encoding?: string }): Promise<string>;
      write(data: string): Promise<{ bytesWritten: number }>;
    }
    function access(p: string, mode?: number): Promise<void>;
    function appendFile(p: string, data: string, options?: string | { encoding?: string; mode?: number }): Promise<void>;
    function chmod(p: string, mode: number | string): Promise<void>;
    function mkdir(p: string, options?: { recursive?: boolean; mode?: number }): Promise<string | undefined>;
    function open(p: string, flags: string, mode?: number): Promise<FileHandle>;
    function readdir(p: string, options?: { withFileTypes?: false }): Promise<string[]>;
    function readFile(p: string, options?: string | { encoding?: string }): Promise<string>;
    function rename(from: string, to: string): Promise<void>;
    function stat(p: string): Promise<Stats>;
    function unlink(p: string): Promise<void>;
    function writeFile(p: string, data: string, options?: string | { encoding?: string; mode?: number }): Promise<void>;
  }
}

declare module "child_process" {
  export interface SpawnOptions {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    detached?: boolean;
    shell?: boolean | string;
    stdio?: string | readonly string[];
    windowsHide?: boolean;
  }
  export interface Readable {
    on(event: "data", listener: (chunk: Buffer) => void): this;
    on(event: "end" | "close", listener: () => void): this;
    on(event: "error", listener: (err: Error) => void): this;
    setEncoding(encoding: string): this;
  }
  export interface Writable {
    write(chunk: string): boolean;
    end(): void;
  }
  export interface ChildProcess {
    pid?: number;
    stdin: Writable | null;
    stdout: Readable | null;
    stderr: Readable | null;
    killed: boolean;
    kill(signal?: NodeJS.Signals | number): boolean;
    unref(): void;
    on(event: "error", listener: (err: Error) => void): this;
    on(event: "close" | "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
    on(event: "spawn" | "disconnect", listener: () => void): this;
  }
  export function spawn(command: string, args?: readonly string[], options?: SpawnOptions): ChildProcess;
  export function execFile(
    file: string,
    args: readonly string[],
    options: { cwd?: string; env?: NodeJS.ProcessEnv; maxBuffer?: number; encoding?: string },
    callback: (error: NodeJS.ErrnoException | null, stdout: string, stderr: string) => void,
  ): ChildProcess;
}

declare module "crypto" {
  export function randomUUID(): string;
  export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
}

declare module "http" {
  // The upgrade handler needs the raw socket; only the members used are declared.
  export interface Socket {
    write(data: string): boolean;
    destroy(error?: Error): void;
    remoteAddress?: string;
  }
  export interface IncomingMessage {
    url?: string;
    method?: string;
    headers: Record<string, string | string[] | undefined>;
    socket: Socket;
    destroy(error?: Error): void;
    on(event: "data", listener: (chunk: Buffer) => void): this;
    on(event: "aborted" | "end" | "close", listener: () => void): this;
    on(event: "error", listener: (err: Error) => void): this;
    setEncoding(encoding: string): this;
  }
  export interface ServerResponse {
    statusCode: number;
    setHeader(name: string, value: string): void;
    writeHead(status: number, headers?: Record<string, string>): this;
    write(chunk: string): boolean;
    end(chunk?: string): void;
    on(event: "close" | "finish", listener: () => void): this;
  }
  export interface Server {
    listen(port: number, host?: string, callback?: () => void): this;
    close(callback?: (err?: Error) => void): this;
    once(event: "error", listener: (err: Error) => void): this;
    once(event: "listening" | "close", listener: () => void): this;
    on(event: "error", listener: (err: Error) => void): this;
    on(event: "listening" | "close", listener: () => void): this;
    on(event: "upgrade", listener: (req: IncomingMessage, socket: Socket, head: Buffer) => void): this;
    on(event: "request", listener: (req: IncomingMessage, res: ServerResponse) => void): this;
    address(): { port: number; address: string } | string | null;
  }
  export function createServer(
    listener: (req: IncomingMessage, res: ServerResponse) => void,
  ): Server;
}
