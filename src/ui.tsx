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
