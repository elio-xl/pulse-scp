# Pulse

Pulse is a modern Node.js / TypeScript wrapper around the system `scp` command.

It does not implement SSH, SFTP, or SCP protocols. Pulse delegates transfer work to the local OpenSSH `scp` binary and adds a cleaner terminal experience around it: start time, elapsed time, server identity, speed, ETA, progress, and structured errors.

## Install

```bash
npm install -g pulse-scp
```

After installing globally:

```bash
pulse ./app.jar root@192.168.0.26:/data/app.jar
pulse root@192.168.0.26:/data/app.jar ./app.jar
```

You can also run it without a global install:

```bash
npx pulse-scp ./app.jar root@192.168.0.26:/data/app.jar
```

## Usage

Upload:

```bash
pulse ./app.jar prod:/data/app.jar
```

Download:

```bash
pulse prod:/data/app.jar ./app.jar
```

Options:

```bash
pulse SOURCE TARGET \
  --port 22 \
  --identity ~/.ssh/id_rsa \
  --recursive \
  --verbose \
  --dry-run \
  --json \
  --no-color
```

## Development

```bash
npm install
npm run typecheck
npm run build
npm run dev -- ./app.jar prod:/data/app.jar --dry-run
```

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
