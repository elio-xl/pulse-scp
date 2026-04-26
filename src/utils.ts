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
