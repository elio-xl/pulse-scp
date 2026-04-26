# Pulse Node SCP Wrapper

## 产品概述

Pulse 是一个基于 Node.js + TypeScript 的现代化 `scp` 命令封装工具。

它不重新实现 SSH / SFTP / SCP 协议，而是调用本机已有的 OpenSSH `scp`，并在外围增强终端交互体验：

- 清晰展示开始时间、结束时间、耗时
- 展示上传 / 下载方向
- 展示文件名、文件大小、本地路径、远程路径
- 展示服务器别名和可识别 IP
- 解析 `scp` 的实时进度行
- 展示速度、ETA、百分比、进度条
- 支持 SSH Config 别名
- 支持 JSON 日志输出
- 友好处理常见错误和 Ctrl+C 中断

## 项目结构

```text
pulse/
  src/
    cli.ts
    index.tsx
    scpRunner.ts
    parser.ts
    sshConfig.ts
    ui.tsx
    types.ts
    utils.ts
  package.json
  tsconfig.json
  README.md
  Pulse_Node_SCP_Wrapper.md
```

## package.json

```json
{
  "name": "pulse-scp",
  "version": "0.1.0",
  "description": "A modern terminal UI wrapper around system scp.",
  "type": "module",
  "bin": {
    "pulse": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/cli.ts",
    "typecheck": "tsc --noEmit",
    "start": "node dist/cli.js"
  },
  "dependencies": {
    "chalk": "^5.3.0",
    "commander": "^12.1.0",
    "execa": "^9.3.1",
    "ink": "^5.0.1",
    "node-pty": "^1.1.0",
    "ora": "^8.1.0",
    "react": "^18.3.1"
  },
  "devDependencies": {
    "@types/node": "^22.5.4",
    "@types/react": "^18.3.5",
    "tsx": "^4.19.1",
    "typescript": "^5.6.2"
  },
  "engines": {
    "node": ">=18.18"
  }
}
```

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

## 安装方式

```bash
npm install
npm run build
npm link
```

安装后可以直接使用：

```bash
pulse ./app.jar root@192.168.0.26:/data/app.jar
```

也可以不全局链接，直接开发运行：

```bash
npm run dev -- ./app.jar prod:/data/app.jar
```

## 使用示例

上传：

```bash
pulse ./app.jar root@192.168.0.26:/data/app.jar
pulse ./app.jar prod:/data/app.jar
```

下载：

```bash
pulse root@192.168.0.26:/data/app.jar ./app.jar
pulse prod:/data/app.jar ./app.jar
```

指定端口和 SSH key：

```bash
pulse -p 2222 -i ~/.ssh/id_rsa ./app.jar prod:/data/app.jar
```

递归传输目录：

```bash
pulse -r ./dist prod:/data/dist
```

只查看传输计划，不执行真实 `scp`：

```bash
pulse ./app.jar prod:/data/app.jar --dry-run
```

输出结构化 JSON：

```bash
pulse ./app.jar prod:/data/app.jar --json
```

## 终端展示

运行时 UI 风格保持克制、暗色终端友好：

```text
Pulse Transfer

Direction   Upload
File        app.jar
Server      prod / 192.168.0.26
Size        128.5 MB
Start Time  2026-04-26 18:30:21
Elapsed     00:13
Speed       8.1 MB/s
ETA         00:05
Local       ./app.jar
Remote      /data/app.jar

████████████████░░░░░░░░   78%
```

完成后：

```text
✔ Transfer completed

Direction   Upload
File        app.jar
Server      prod / 192.168.0.26
Size        128.5 MB
Start Time  2026-04-26 18:30:21
End Time    18:30:42
Elapsed     00:21
```

## 架构说明

Pulse 采用事件驱动结构，方便未来扩展 GUI、历史记录和批量队列。

```text
Commander CLI
    ↓
runPulse()
    ↓
ScpRunner
    ├─ 创建 TransferPlan
    ├─ 调用系统 scp
    ├─ 监听 stdout / stderr
    ├─ 解析 \r 进度行
    ├─ 发出 TransferState
    └─ 分类错误
    ↓
Ink UI / JSON Logger
```

模块职责：

- `src/cli.ts`: CLI 参数声明，兼容 `scp SOURCE TARGET` 习惯。
- `src/index.tsx`: 组装 Runner、Ink UI、JSON 输出和退出码。
- `src/scpRunner.ts`: 在伪终端中执行系统 `scp`，监听实时输出，处理 Ctrl+C。
- `src/parser.ts`: 解析 `scp` 进度，例如 `app.jar 65% 83MB 7.1MB/s 00:06 ETA`。
- `src/sshConfig.ts`: 读取 `~/.ssh/config`，解析 `Host`、`HostName`、`User`、`Port`。
- `src/ui.tsx`: 使用 Ink 渲染实时终端 UI。
- `src/types.ts`: 传输状态、错误、计划等类型。
- `src/utils.ts`: 路径判断、格式化、错误分类。

## SCP 调用策略

Pulse 保留用户输入的 source / target 原样传给系统 `scp`。

实现上优先通过 `node-pty` 在伪终端中运行 `scp`，如果当前环境限制原生 PTY spawn，则自动 fallback 到系统 `script` 命令创建伪终端。OpenSSH 的实时进度行通常只会在 TTY 环境下输出，这样可以持续捕获 `\r` 覆盖式进度，而不是只在传输完成时看到 `100%`。

```text
pulse ./app.jar prod:/data/app.jar
```

实际执行：

```text
scp ./app.jar prod:/data/app.jar
```

SSH Config 只用于展示增强：

```sshconfig
Host prod
    HostName 192.168.0.26
    User root
    Port 22
```

Pulse UI 展示：

```text
Server      prod / 192.168.0.26
```

## 参数设计

```text
pulse SOURCE TARGET

-p, --port <port>       SSH port, passed to scp as -P
-i, --identity <file>   SSH identity file
-r, --recursive         recursive directory copy
-v, --verbose           show recent raw scp output
--dry-run               show plan without running scp
--json                  newline-delimited JSON state output
--no-color              disable color
```

## 异常处理

Pulse 不直接向用户抛 Node.js 堆栈，而是输出专业错误信息：

- `SCP_NOT_FOUND`: 系统 `scp` 不存在
- `LOCAL_PATH_MISSING`: 上传时本地文件不存在
- `SSH_CONNECTION_FAILED`: DNS、网络、端口、连接失败
- `PERMISSION_DENIED`: SSH 或目标目录权限失败
- `REMOTE_PATH_ERROR`: 远程路径错误或源文件不存在
- `INTERRUPTED`: Ctrl+C 中断
- `SCP_FAILED`: 其他 `scp` 失败

## 开发说明

安装依赖：

```bash
npm install
```

类型检查：

```bash
npm run typecheck
```

构建：

```bash
npm run build
```

开发运行：

```bash
npm run dev -- ./app.jar prod:/data/app.jar --dry-run
```

本次实现已通过：

```bash
npm run typecheck
npm run build
node dist/cli.js --help
node dist/cli.js /tmp/pulse-test-app.jar prod:/data/app.jar --dry-run --json
```

## 未来扩展预留

当前 `TransferPlan`、`TransferState` 和 `ScpRunner` 事件模型已经为以下能力预留结构：

- 多文件上传
- 批量队列
- Finder 拖拽
- 菜单栏工具
- GUI 桌面版
- 历史记录
- 收藏服务器

## 完整项目代码

完整代码已经写入当前项目目录，可直接查看这些文件：

```text
package.json
tsconfig.json
README.md
src/cli.ts
src/index.tsx
src/scpRunner.ts
src/parser.ts
src/sshConfig.ts
src/ui.tsx
src/types.ts
src/utils.ts
```

建议以仓库文件为准维护代码，避免 Markdown 中复制出的代码与真实源码发生漂移。

## 源码附录

以下为当前项目的完整源码快照。

### package.json

```json
{
  "name": "pulse-scp",
  "version": "0.1.0",
  "description": "A modern terminal UI wrapper around system scp.",
  "type": "module",
  "bin": {
    "pulse": "./dist/cli.js"
  },
  "files": [
    "dist",
    "README.md",
    "Pulse_Node_SCP_Wrapper.md"
  ],
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/cli.ts",
    "typecheck": "tsc --noEmit",
    "start": "node dist/cli.js"
  },
  "keywords": [
    "scp",
    "ssh",
    "cli",
    "terminal",
    "transfer"
  ],
  "author": "",
  "license": "MIT",
  "dependencies": {
    "chalk": "^5.3.0",
    "commander": "^12.1.0",
    "execa": "^9.3.1",
    "ink": "^5.0.1",
    "node-pty": "^1.1.0",
    "ora": "^8.1.0",
    "picocolors": "^1.1.1",
    "react": "^18.3.1"
  },
  "devDependencies": {
    "@types/node": "^22.5.4",
    "@types/react": "^18.3.5",
    "tsx": "^4.19.1",
    "typescript": "^5.6.2"
  },
  "engines": {
    "node": ">=18.18"
  }
}

```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}

```

### src/cli.ts

```ts
#!/usr/bin/env node
import { Command } from "commander";

import { runPulse } from "./index.js";

const program = new Command();

program
  .name("pulse")
  .description("A modern terminal UI wrapper around system scp.")
  .argument("<source>", "source path, compatible with scp")
  .argument("<target>", "target path, compatible with scp")
  .option("-p, --port <port>", "SSH port passed to scp as -P")
  .option("-i, --identity <file>", "SSH identity file passed to scp as -i")
  .option("-r, --recursive", "copy directories recursively")
  .option("-v, --verbose", "show recent raw scp output")
  .option("--dry-run", "show the transfer plan without running scp")
  .option("--json", "output newline-delimited JSON transfer states")
  .option("--no-color", "disable colored output")
  .action(async (source: string, target: string, options) => {
    const exitCode = await runPulse(source, target, {
      port: options.port,
      identity: options.identity,
      recursive: options.recursive,
      verbose: options.verbose,
      dryRun: options.dryRun,
      json: options.json,
      color: options.color
    });

    process.exitCode = exitCode;
  });

program.showHelpAfterError();
program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown CLI error";
  process.stderr.write(`Pulse failed\n${message}\n`);
  process.exitCode = 1;
});

```

### src/index.tsx

```tsx
import { ScpRunner } from "./scpRunner.js";
import { TerminalRenderer } from "./ui.js";
import type { CliOptions, PulseError, TransferState } from "./types.js";
import { createPulseError } from "./utils.js";

export async function runPulse(source: string, target: string, options: CliOptions): Promise<number> {
  if (options.color === false) {
    process.env.NO_COLOR = "1";
  }

  try {
    const plan = await ScpRunner.createPlan(source, target, options);
    const runner = new ScpRunner(plan, options);
    const initialState: TransferState = {
      phase: "idle",
      plan,
      startTime: new Date(),
      elapsedSeconds: 0,
      rawLines: []
    };

    if (options.json) {
      runner.on("state", (state) => {
        process.stdout.write(`${JSON.stringify(toJsonState(state))}\n`);
      });
    }

    const terminalRenderer = options.json ? undefined : new TerminalRenderer({ verbose: options.verbose });
    if (terminalRenderer) {
      terminalRenderer.render(initialState);
      runner.on("state", (state) => terminalRenderer.render(state));
    }

    const onSigint = () => {
      runner.interrupt();
    };
    process.once("SIGINT", onSigint);

    const finalState = await runner.start();
    process.removeListener("SIGINT", onSigint);
    terminalRenderer?.stop();

    return finalState.phase === "completed" ? 0 : finalState.error?.exitCode ?? 1;
  } catch (error) {
    const pulseError = normalizeError(error);
    if (options.json) {
      process.stdout.write(`${JSON.stringify({ phase: "failed", error: pulseError })}\n`);
    } else {
      process.stderr.write(`\nPulse failed\n${pulseError.message}\n`);
      if (pulseError.hint) {
        process.stderr.write(`${pulseError.hint}\n`);
      }
    }

    return pulseError.exitCode ?? 1;
  }
}

function normalizeError(error: unknown): PulseError {
  if (isPulseError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return createPulseError("UNKNOWN", error.message);
  }

  return createPulseError("UNKNOWN", "An unknown error occurred.");
}

function isPulseError(value: unknown): value is PulseError {
  return typeof value === "object" && value !== null && "code" in value && "message" in value;
}

function toJsonState(state: TransferState): object {
  return {
    phase: state.phase,
    direction: state.plan.direction,
    file: state.progress?.fileName ?? state.plan.fileName,
    server: state.plan.server,
    sizeBytes: state.plan.sizeBytes,
    localPath: state.plan.localPath,
    remotePath: state.plan.remotePath,
    startTime: state.startTime.toISOString(),
    endTime: state.endTime?.toISOString(),
    elapsedSeconds: state.elapsedSeconds,
    progress: state.progress,
    error: state.error
  };
}

```

### src/scpRunner.ts

```ts
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

```

### src/parser.ts

```ts
import type { ParsedProgress } from "./types.js";

const SIZE_UNITS: Record<string, number> = {
  B: 1,
  KB: 1024,
  KIB: 1024,
  MB: 1024 ** 2,
  MIB: 1024 ** 2,
  GB: 1024 ** 3,
  GIB: 1024 ** 3,
  TB: 1024 ** 4,
  TIB: 1024 ** 4
};

export function splitScpChunks(chunk: string): string[] {
  return stripAnsi(chunk)
    .split(/\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function parseScpProgress(line: string): ParsedProgress | undefined {
  const normalized = stripAnsi(line).replace(/\s+/g, " ").trim();
  const match = /^(?<file>.+?)\s+(?<percent>\d{1,3})%\s+(?<size>[\d.]+)\s*(?<sizeUnit>[KMGT]?i?B?)\s+(?<speed>[\d.]+)\s*(?<speedUnit>[KMGT]?i?B?)\/s\s+(?<eta>(?:(?:\d+:)?\d{2}:\d{2})|--:--)(?:\s+ETA)?$/i.exec(
    normalized
  );

  if (!match?.groups) {
    return undefined;
  }

  const percent = clamp(Number.parseInt(match.groups.percent, 10), 0, 100);
  const transferredBytes = parseSize(match.groups.size, match.groups.sizeUnit);
  const speedBytesPerSecond = parseSize(match.groups.speed, match.groups.speedUnit);
  const etaSeconds = parseEta(match.groups.eta);

  return {
    fileName: match.groups.file.trim(),
    percent,
    transferredBytes,
    speedBytesPerSecond,
    etaSeconds,
    raw: line
  };
}

export function estimateTotalSize(progress?: ParsedProgress): number | undefined {
  if (!progress?.transferredBytes || !progress.percent) {
    return undefined;
  }

  return Math.round(progress.transferredBytes / (progress.percent / 100));
}

function parseSize(value: string, rawUnit: string): number | undefined {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }

  const normalizedUnit = normalizeUnit(rawUnit);
  const multiplier = SIZE_UNITS[normalizedUnit] ?? 1;
  return Math.round(numeric * multiplier);
}

function normalizeUnit(unit: string): string {
  const cleaned = unit.toUpperCase();
  if (cleaned === "" || cleaned === "B") {
    return "B";
  }

  if (/^[KMGT]$/.test(cleaned)) {
    return `${cleaned}B`;
  }

  return cleaned;
}

function parseEta(value: string): number | undefined {
  if (value === "--:--") {
    return undefined;
  }

  const parts = value.split(":").map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => Number.isNaN(part))) {
    return undefined;
  }

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  return parts[0] * 60 + parts[1];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function stripAnsi(value: string): string {
  return value
    .replace(/\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

```

### src/sshConfig.ts

```ts
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { ServerInfo } from "./types.js";

interface HostBlock {
  patterns: string[];
  values: Record<string, string>;
}

export async function resolveServerInfo(hostAlias: string): Promise<ServerInfo> {
  const blocks = await readSshConfig();
  const matched = blocks.find((block) => matchesHost(block.patterns, hostAlias));
  const values = matched?.values ?? {};

  return {
    alias: hostAlias,
    hostname: values.hostname,
    user: values.user,
    port: values.port
  };
}

async function readSshConfig(): Promise<HostBlock[]> {
  const configPath = path.join(os.homedir(), ".ssh", "config");

  try {
    const content = await readFile(configPath, "utf8");
    return parseSshConfig(content);
  } catch {
    return [];
  }
}

export function parseSshConfig(content: string): HostBlock[] {
  const blocks: HostBlock[] = [];
  let current: HostBlock | undefined;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) {
      continue;
    }

    const [key, ...rest] = line.split(/\s+/);
    const value = rest.join(" ");
    const normalizedKey = key.toLowerCase();

    if (normalizedKey === "host") {
      current = {
        patterns: rest,
        values: {}
      };
      blocks.push(current);
      continue;
    }

    if (current) {
      current.values[normalizedKey] = value;
    }
  }

  return blocks;
}

function matchesHost(patterns: string[], host: string): boolean {
  for (const pattern of patterns) {
    if (pattern.startsWith("!")) {
      const negated = pattern.slice(1);
      if (wildcardMatch(negated, host)) {
        return false;
      }
      continue;
    }

    if (wildcardMatch(pattern, host)) {
      return true;
    }
  }

  return false;
}

function wildcardMatch(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i").test(value);
}

```

### src/ui.tsx

```tsx
import chalk from "chalk";

import type { Direction, TransferState } from "./types.js";
import { formatBytes, formatDateTime, formatSpeed } from "./utils.js";

interface TerminalRendererOptions {
  verbose?: boolean;
}

export class TerminalRenderer {
  private renderedLines = 0;
  private active = false;

  constructor(private readonly options: TerminalRendererOptions = {}) {}

  render(state: TransferState): void {
    const lines = buildFrame(state, this.options);

    if (!this.active) {
      process.stdout.write("\x1b[?25l");
      this.active = true;
    }

    if (this.renderedLines > 0) {
      process.stdout.write(`\x1b[${this.renderedLines}A`);
    }

    for (let index = 0; index < Math.max(this.renderedLines, lines.length); index += 1) {
      const line = lines[index] ?? "";
      process.stdout.write(`\x1b[2K\r${truncateAnsiAware(line)}\n`);
    }

    this.renderedLines = lines.length;

    if (["completed", "failed", "interrupted"].includes(state.phase)) {
      this.stop();
    }
  }

  stop(): void {
    if (!this.active) {
      return;
    }

    process.stdout.write("\x1b[?25h");
    this.active = false;
  }
}

function buildFrame(state: TransferState, options: TerminalRendererOptions): string[] {
  const percent = state.progress?.percent ?? (state.phase === "completed" ? 100 : 0);
  const progress = Math.max(0, Math.min(1, percent / 100));
  const progressFile = state.progress?.fileName ?? state.plan.fileName;
  const size = formatTransferSize(state);
  const speed = formatSpeed(state.progress?.speedBytesPerSecond);
  const elapsed = formatElapsedCompact(state.elapsedSeconds);
  const action = formatAction(state.plan.direction);
  const endpoint = formatEndpoint(state);
  const icon = formatIcon(state.phase);

  const lines = [
    "",
    `  ${icon} ${chalk.bold(action)} ${chalk.cyan(progressFile)} ${chalk.gray("❯")} ${chalk.yellow(endpoint)}`,
    `    ${chalk.gray(`Start Time: ${formatDateTime(state.startTime)}`)}`,
    "",
    ` ${padMetric(size, 8)}  ${chalk.gray("│")}  ${padMetric(speed, 10, "magenta")}  ${chalk.gray("│")}  ${padMetric(elapsed, 4, "cyan")}  ${chalk.gray("│")}  ${renderProgressBar(progress)}  ${chalk.bold(`${Math.round(progress * 100)}%`)}`,
    ""
  ];

  if (state.error) {
    lines.push(`  ${chalk.red(state.error.message)}`);
    if (state.error.hint) {
      lines.push(`  ${chalk.gray(state.error.hint)}`);
    }
  }

  if (options.verbose && state.rawLines.length > 0) {
    lines.push(`  ${chalk.gray("scp output")}`);
    for (const line of state.rawLines.slice(-5)) {
      lines.push(`  ${chalk.gray(line)}`);
    }
  }

  return lines;
}

function formatAction(direction: Direction): string {
  if (direction === "upload") {
    return "Uploading";
  }

  if (direction === "download") {
    return "Downloading";
  }

  return "Transferring";
}

function formatEndpoint(state: TransferState): string {
  const remote = state.plan.direction === "download" ? state.plan.source : state.plan.target;
  const { hostname } = state.plan.server;
  if (hostname) {
    return `${remote} (${hostname})`;
  }

  return remote;
}

function formatTransferSize(state: TransferState): string {
  const transferred = state.progress?.transferredBytes;
  const total = state.plan.sizeBytes;

  if (transferred !== undefined && total !== undefined) {
    return `${formatBytes(transferred)} / ${formatBytes(total)}`;
  }

  if (transferred !== undefined) {
    return `${formatBytes(transferred)} / Unknown`;
  }

  if (total !== undefined) {
    return `0 B / ${formatBytes(total)}`;
  }

  return "Unknown";
}

function formatIcon(phase: TransferState["phase"]): string {
  if (phase === "completed") {
    return chalk.green("✔");
  }

  if (phase === "failed") {
    return chalk.red("✖");
  }

  if (phase === "interrupted") {
    return chalk.yellow("!");
  }

  return chalk.blue("●");
}

function renderProgressBar(progress: number): string {
  const width = 25;
  const filled = Math.round(width * progress);
  const empty = width - filled;
  return `${chalk.blue("━".repeat(filled))}${chalk.gray("─".repeat(empty))}`;
}

function formatElapsedCompact(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return `${minutes}m${remainingSeconds.toString().padStart(2, "0")}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h${remainingMinutes.toString().padStart(2, "0")}m`;
}

function padMetric(value: string, width: number, color?: "magenta" | "cyan"): string {
  const padded = value.padStart(width);

  if (color === "magenta") {
    return chalk.magenta(padded);
  }

  if (color === "cyan") {
    return chalk.cyan(padded);
  }

  return chalk.white(padded);
}

function truncateAnsiAware(line: string): string {
  const columns = process.stdout.columns;
  if (!columns || columns < 20) {
    return line;
  }

  const max = columns - 1;
  let visible = 0;
  let output = "";

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\x1b") {
      const match = /\x1b\[[0-?]*[ -/]*[@-~]/.exec(line.slice(index));
      if (match) {
        output += match[0];
        index += match[0].length - 1;
        continue;
      }
    }

    if (visible >= max) {
      return `${output}${chalk.gray("…")}`;
    }

    output += char;
    visible += 1;
  }

  return output;
}

```

### src/types.ts

```ts
export type Direction = "upload" | "download" | "unknown";

export type TransferPhase = "idle" | "running" | "completed" | "failed" | "interrupted";

export interface CliOptions {
  port?: string;
  identity?: string;
  recursive?: boolean;
  verbose?: boolean;
  dryRun?: boolean;
  json?: boolean;
  color?: boolean;
}

export interface RemoteTarget {
  raw: string;
  host: string;
  path: string;
  user?: string;
}

export interface ServerInfo {
  alias: string;
  hostname?: string;
  user?: string;
  port?: string;
}

export interface TransferPlan {
  source: string;
  target: string;
  direction: Direction;
  localPath: string;
  remotePath: string;
  fileName: string;
  server: ServerInfo;
  sizeBytes?: number;
  scpArgs: string[];
}

export interface ParsedProgress {
  fileName?: string;
  percent?: number;
  transferredBytes?: number;
  speedBytesPerSecond?: number;
  etaSeconds?: number;
  raw: string;
}

export interface TransferState {
  phase: TransferPhase;
  plan: TransferPlan;
  startTime: Date;
  endTime?: Date;
  elapsedSeconds: number;
  progress?: ParsedProgress;
  error?: PulseError;
  rawLines: string[];
}

export interface PulseError {
  code:
    | "SCP_NOT_FOUND"
    | "LOCAL_PATH_MISSING"
    | "SSH_CONNECTION_FAILED"
    | "PERMISSION_DENIED"
    | "REMOTE_PATH_ERROR"
    | "INTERRUPTED"
    | "SCP_FAILED"
    | "UNKNOWN";
  message: string;
  hint?: string;
  exitCode?: number;
}

```

### src/utils.ts

```ts
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Direction, PulseError, RemoteTarget } from "./types.js";

export function isRemotePath(value: string): boolean {
  return /^[^/\s:]+:/.test(value) || /^[^@\s:]+@[^:\s]+:/.test(value);
}

export function parseRemoteTarget(value: string): RemoteTarget | undefined {
  const match = /^(?:(?<user>[^@\s:]+)@)?(?<host>[^:\s]+):(?<path>.*)$/.exec(value);
  if (!match?.groups) {
    return undefined;
  }

  return {
    raw: value,
    user: match.groups.user,
    host: match.groups.host,
    path: match.groups.path
  };
}

export function inferDirection(source: string, target: string): Direction {
  const sourceRemote = isRemotePath(source);
  const targetRemote = isRemotePath(target);

  if (!sourceRemote && targetRemote) {
    return "upload";
  }

  if (sourceRemote && !targetRemote) {
    return "download";
  }

  return "unknown";
}

export function getDisplayFileName(source: string, target: string, direction: Direction): string {
  const candidate = direction === "download" ? parseRemoteTarget(source)?.path ?? source : source;
  const normalized = candidate.replace(/\/+$/, "");
  return path.basename(normalized) || path.basename(target) || "transfer";
}

export async function getLocalFileSize(localPath: string): Promise<number | undefined> {
  const result = await stat(localPath);
  if (result.isDirectory()) {
    return undefined;
  }

  return result.size;
}

export async function assertLocalPathExists(localPath: string): Promise<void> {
  try {
    await stat(localPath);
  } catch {
    throw createPulseError(
      "LOCAL_PATH_MISSING",
      `Local path does not exist: ${localPath}`,
      "Check the path and run Pulse again."
    );
  }
}

export function formatBytes(bytes?: number): string {
  if (bytes === undefined || Number.isNaN(bytes)) {
    return "Unknown";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  if (unitIndex === 0) {
    return `${value} ${units[unitIndex]}`;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export function formatSpeed(bytesPerSecond?: number): string {
  if (bytesPerSecond === undefined) {
    return "Unknown";
  }

  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatDuration(seconds?: number): string {
  if (seconds === undefined || !Number.isFinite(seconds)) {
    return "Unknown";
  }

  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(remainingSeconds)}`;
  }

  return `${pad(minutes)}:${pad(remainingSeconds)}`;
}

export function formatDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export function formatTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function createPulseError(
  code: PulseError["code"],
  message: string,
  hint?: string,
  exitCode?: number
): PulseError {
  return { code, message, hint, exitCode };
}

export function classifyScpFailure(output: string, exitCode?: number): PulseError {
  const lower = output.toLowerCase();

  if (lower.includes("permission denied")) {
    return createPulseError(
      "PERMISSION_DENIED",
      "Permission denied while connecting or writing the target path.",
      "Check your SSH key, user, and remote directory permissions.",
      exitCode
    );
  }

  if (
    lower.includes("could not resolve hostname") ||
    lower.includes("connection refused") ||
    lower.includes("connection timed out") ||
    lower.includes("no route to host")
  ) {
    return createPulseError(
      "SSH_CONNECTION_FAILED",
      "Unable to connect to the remote server.",
      "Verify the host alias, hostname, network, port, and SSH config.",
      exitCode
    );
  }

  if (lower.includes("no such file") || lower.includes("not a directory")) {
    return createPulseError(
      "REMOTE_PATH_ERROR",
      "The source or destination path was not found.",
      "Check both local and remote paths.",
      exitCode
    );
  }

  return createPulseError("SCP_FAILED", "scp exited with an error.", trimOutput(output), exitCode);
}

export function packageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function trimOutput(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(-800) : undefined;
}

```

### README.md

```md
# Pulse

Pulse is a modern Node.js / TypeScript wrapper around the system `scp` command.

It does not implement SSH, SFTP, or SCP protocols. Pulse delegates transfer work to the local OpenSSH `scp` binary and adds a cleaner terminal experience around it: start time, elapsed time, server identity, speed, ETA, progress, and structured errors.

## Install

`\`\`bash
npm install
npm run build
npm link
`\`\`

After linking:

`\`\`bash
pulse ./app.jar root@192.168.0.26:/data/app.jar
pulse root@192.168.0.26:/data/app.jar ./app.jar
`\`\`

## Usage

Upload:

`\`\`bash
pulse ./app.jar prod:/data/app.jar
`\`\`

Download:

`\`\`bash
pulse prod:/data/app.jar ./app.jar
`\`\`

Options:

`\`\`bash
pulse SOURCE TARGET \
  --port 22 \
  --identity ~/.ssh/id_rsa \
  --recursive \
  --verbose \
  --dry-run \
  --json \
  --no-color
`\`\`

## Development

`\`\`bash
npm install
npm run typecheck
npm run build
npm run dev -- ./app.jar prod:/data/app.jar --dry-run
`\`\`

## Architecture

- `src/cli.ts`: Commander-based CLI entry.
- `src/index.tsx`: runtime orchestration and JSON/UI mode selection.
- `src/scpRunner.ts`: system `scp` execution inside a pseudo terminal, live output parsing, lifecycle events, Ctrl+C handling.
- `src/parser.ts`: OpenSSH `scp` progress parsing, including carriage-return progress chunks.
- `src/sshConfig.ts`: minimal `~/.ssh/config` host lookup for display metadata.
- `src/ui.tsx`: Ink terminal UI.
- `src/types.ts`: shared domain types.
- `src/utils.ts`: path inference, formatting, error classification.

## Notes

Pulse keeps `scp` compatibility by passing the original source and target to the system binary. It runs `scp` inside a pseudo terminal via `node-pty`, with a system `script` fallback for environments where native PTY spawning is restricted. OpenSSH only emits its live carriage-return progress UI when it believes it is attached to a TTY. SSH aliases such as `prod:/data/app.jar` are resolved only for display; the real transfer still uses the user-provided `scp` arguments.

```

