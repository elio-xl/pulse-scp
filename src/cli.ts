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
