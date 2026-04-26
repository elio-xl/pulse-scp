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
