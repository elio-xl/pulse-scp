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
