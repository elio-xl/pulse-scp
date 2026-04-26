import { EventEmitter } from "node:events";
import { access } from "node:fs/promises";

import { execa } from "execa";
import * as pty from "node-pty";

import { estimateTotalSize, parseScpProgress, splitScpChunks } from "./parser.js";
import { resolveServerInfo } from "./sshConfig.js";
import type { CliOptions, PulseError, TransferPlan, TransferState } from "./types.js";
import {
  assertLocalPathExists,
  classifyScpFailure,
  createPulseError,
  getDisplayFileName,
  getLocalFileSize,
  inferDirection,
  parseRemoteTarget
} from "./utils.js";

export interface RunnerEvents {
  state: [TransferState];
  raw: [string];
  done: [TransferState];
  failed: [TransferState];
}

export class ScpRunner extends EventEmitter {
  private ptyProcess?: pty.IPty;
  private scriptProcess?: ReturnType<typeof execa>;
  private state?: TransferState;
  private tick?: NodeJS.Timeout;
  private rawOutput = "";
  private stdinForwarder?: (chunk: Buffer) => void;
  private stdinWasRaw = false;

  static async createPlan(source: string, target: string, options: CliOptions): Promise<TransferPlan> {
    const direction = inferDirection(source, target);
    const remote = direction === "download" ? parseRemoteTarget(source) : parseRemoteTarget(target);

    if (!remote || direction === "unknown") {
      throw createPulseError(
        "SCP_FAILED",
        "Pulse expects one local path and one remote scp path.",
        "Use a form like ./app.jar prod:/data/app.jar or prod:/data/app.jar ./app.jar."
      );
    }

    const localPath = direction === "upload" ? source : target;
    const remotePath = remote.path;

    if (direction === "upload") {
      await assertLocalPathExists(localPath);
    }

    const sizeBytes = direction === "upload" ? await getLocalFileSize(localPath) : undefined;
    const server = await resolveServerInfo(remote.host);
    if (!server.hostname && isLikelyIp(remote.host)) {
      server.hostname = remote.host;
    }

    const scpArgs = buildScpArgs(source, target, options);

    return {
      source,
      target,
      direction,
      localPath,
      remotePath,
      fileName: getDisplayFileName(source, target, direction),
      server,
      sizeBytes,
      scpArgs
    };
  }

  constructor(private readonly plan: TransferPlan, private readonly options: CliOptions) {
    super();
  }

  override on<K extends keyof RunnerEvents>(eventName: K, listener: (...args: RunnerEvents[K]) => void): this {
    return super.on(eventName, listener);
  }

  async start(): Promise<TransferState> {
    const scpPath = await resolveScpPath();

    const startTime = new Date();
    this.state = {
      phase: "running",
      plan: this.plan,
      startTime,
      elapsedSeconds: 0,
      rawLines: []
    };
    this.emitState();

    if (this.options.dryRun) {
      this.finish("completed");
      return this.state;
    }

    this.tick = setInterval(() => {
      if (!this.state || this.state.phase !== "running") {
        return;
      }

      this.state.elapsedSeconds = elapsedSeconds(this.state.startTime);
      this.emitState();
    }, 250);

    try {
      const exitCode = await this.startTransferProcess(scpPath);
      if (exitCode === 0) {
        this.finish("completed");
      } else if (this.state.phase === "running") {
        this.fail(classifyScpFailure(this.rawOutput, exitCode));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown PTY error";
      this.fail(createPulseError("SCP_FAILED", "Unable to start scp.", message));
    }

    return this.state;
  }

  interrupt(): void {
    if ((!this.ptyProcess && !this.scriptProcess) || this.state?.phase !== "running") {
      return;
    }

    this.ptyProcess?.kill("SIGINT");
    this.scriptProcess?.kill("SIGINT");
    setTimeout(() => {
      if (this.state?.phase === "running") {
        this.ptyProcess?.kill("SIGKILL");
        this.scriptProcess?.kill("SIGKILL");
      }
    }, 2000).unref();
  }

  private async startTransferProcess(scpPath: string): Promise<number> {
    try {
      return await this.startNodePtyProcess(scpPath);
    } catch {
      return this.startScriptProcess(scpPath);
    }
  }

  private startNodePtyProcess(scpPath: string): Promise<number> {
    return new Promise((resolve) => {
      const columns = process.stdout.columns && process.stdout.columns > 40 ? process.stdout.columns : 100;
      const rows = process.stdout.rows && process.stdout.rows > 10 ? process.stdout.rows : 30;

      this.ptyProcess = pty.spawn(scpPath, this.plan.scpArgs, {
        name: "xterm-256color",
        cols: columns,
        rows,
        cwd: process.cwd(),
        env: buildPtyEnv()
      });

      this.ptyProcess.onData((data) => this.handleChunk(data));
      this.ptyProcess.onExit(({ exitCode, signal }) => {
        this.detachStdin();
        if (signal === 2 && this.state?.phase === "running") {
          this.fail(createPulseError("INTERRUPTED", "Transfer interrupted.", "The scp process was stopped."));
        }
        resolve(exitCode);
      });

      this.attachStdin();
    });
  }

  private async startScriptProcess(scpPath: string): Promise<number> {
    const args = buildScriptArgs(scpPath, this.plan.scpArgs);
    this.scriptProcess = execa(args.command, args.args, {
      reject: false,
      stdin: "inherit",
      stdout: "pipe",
      stderr: "pipe",
      env: buildPtyEnv()
    });

    this.scriptProcess.stdout?.on("data", (chunk: Buffer) => this.handleChunk(chunk.toString("utf8")));
    this.scriptProcess.stderr?.on("data", (chunk: Buffer) => this.handleChunk(chunk.toString("utf8")));

    const result = await this.scriptProcess;
    if (result.isCanceled || result.signal === "SIGINT") {
      this.fail(createPulseError("INTERRUPTED", "Transfer interrupted.", "The scp process was stopped."));
    }

    return result.exitCode ?? 1;
  }

  private attachStdin(): void {
    if (!process.stdin.isTTY || !this.ptyProcess) {
      return;
    }

    this.stdinWasRaw = process.stdin.isRaw;
    if (!this.stdinWasRaw) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    this.stdinForwarder = (chunk: Buffer) => {
      if (chunk.length === 1 && chunk[0] === 3) {
        this.interrupt();
        return;
      }
      this.ptyProcess?.write(chunk.toString("utf8"));
    };
    process.stdin.on("data", this.stdinForwarder);
  }

  private detachStdin(): void {
    if (this.stdinForwarder) {
      process.stdin.off("data", this.stdinForwarder);
      this.stdinForwarder = undefined;
    }

    if (process.stdin.isTTY && process.stdin.isRaw && !this.stdinWasRaw) {
      process.stdin.setRawMode(false);
    }
  }

  private handleChunk(text: string): void {
    this.rawOutput += text;
    this.emit("raw", text);

    for (const line of splitScpChunks(text)) {
      const parsed = parseScpProgress(line);
      if (this.state) {
        this.state.rawLines = [...this.state.rawLines.slice(-20), line];
        if (parsed) {
          this.state.progress = parsed;
          if (!this.state.plan.sizeBytes) {
            this.state.plan.sizeBytes = estimateTotalSize(parsed);
          }
        }
        this.emitState();
      }
    }
  }

  private finish(phase: "completed"): void {
    if (!this.state) {
      throw createPulseError("UNKNOWN", "Transfer state was not initialized.");
    }

    this.clearTick();
    this.state.phase = phase;
    this.state.endTime = new Date();
    this.state.elapsedSeconds = elapsedSeconds(this.state.startTime, this.state.endTime);
    if (this.state.progress) {
      this.state.progress.percent = 100;
    }
    this.emitState();
    this.emit("done", this.state);
  }

  private fail(error: PulseError): void {
    if (!this.state) {
      throw error;
    }

    this.clearTick();
    this.state.phase = error.code === "INTERRUPTED" ? "interrupted" : "failed";
    this.state.endTime = new Date();
    this.state.elapsedSeconds = elapsedSeconds(this.state.startTime, this.state.endTime);
    this.state.error = error;
    this.emitState();
    this.emit("failed", this.state);
  }

  private emitState(): void {
    if (this.state) {
      this.emit("state", { ...this.state, rawLines: [...this.state.rawLines] });
    }
  }

  private clearTick(): void {
    if (this.tick) {
      clearInterval(this.tick);
      this.tick = undefined;
    }
  }
}

function buildScpArgs(source: string, target: string, options: CliOptions): string[] {
  const args: string[] = [];

  if (options.port) {
    args.push("-P", options.port);
  }

  if (options.identity) {
    args.push("-i", options.identity);
  }

  if (options.recursive) {
    args.push("-r");
  }

  if (options.verbose) {
    args.push("-v");
  }

  args.push(source, target);
  return args;
}

async function resolveScpPath(): Promise<string> {
  const pathValue = process.env.PATH ?? "";
  const candidates = pathValue.split(":").map((entry) => `${entry}/scp`);

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Keep scanning PATH.
    }
  }

  throw createPulseError(
    "SCP_NOT_FOUND",
    "System scp was not found in PATH.",
    "Install OpenSSH client tools or make sure scp is available in your shell PATH."
  );
}

function elapsedSeconds(start: Date, end = new Date()): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}

function isLikelyIp(value: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value);
}

function buildPtyEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  env.TERM = env.TERM ?? "xterm-256color";
  return env;
}

function buildScriptArgs(scpPath: string, scpArgs: string[]): { command: string; args: string[] } {
  if (process.platform === "darwin" || process.platform === "freebsd") {
    return {
      command: "script",
      args: ["-q", "/dev/null", scpPath, ...scpArgs]
    };
  }

  return {
    command: "script",
    args: ["-q", "-c", [scpPath, ...scpArgs].map(shellQuote).join(" "), "/dev/null"]
  };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
