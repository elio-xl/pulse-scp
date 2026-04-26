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
