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
