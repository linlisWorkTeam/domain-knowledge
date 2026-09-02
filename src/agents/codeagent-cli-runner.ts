import { createHash } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type {
  AgentKind,
  AgentOutputFile,
  AgentResumeInput,
  AgentRunInput,
  AgentRunResult,
} from "../domain/types.js";
import {
  AgentExecutionError,
  type AgentRunner,
  type CodeAgentAuthProvider,
} from "./contracts.js";

export type CodeAgentErrorKind =
  | "auth_failed"
  | "permission_denied"
  | "timeout"
  | "cancelled"
  | "model_unavailable"
  | "invalid_session"
  | "cli_unavailable"
  | "cli_error"
  | "parse_error";

export class CodeAgentCliError extends AgentExecutionError {
  public constructor(
    public readonly kind: CodeAgentErrorKind,
    message: string,
    category: "business" | "infrastructure" | "permission" = "infrastructure",
  ) {
    super(message, category);
    this.name = "CodeAgentCliError";
  }
}

export interface CompanyCodeAgentCliRunnerOptions {
  cliPath?: string;
  cliArgsPrefix?: string[];
  timeoutMs?: number;
  terminateGraceMs?: number;
  bare?: boolean;
  dangerouslySkipPermissions?: boolean;
  maxCapturedOutputBytes?: number;
}

export const DEFAULT_CODE_AGENT_TIMEOUT_MS = 300_000;

interface StreamResult {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  session_id?: string;
  duration_ms?: number;
  duration_api_ms?: number;
  num_turns?: number;
  total_cost_usd?: number;
  usage?: Record<string, unknown>;
  permission_denials?: unknown[];
  structured_output?: unknown;
  tool_use_result?: {
    type?: string;
    filePath?: string;
  };
}

interface ProcessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  termination?: "timeout" | "cancelled";
}

interface FileSnapshot {
  absolutePath: string;
  relativePath: string;
  sha256: string;
  content: Buffer;
}

const TOOLS_BY_KIND: Record<Exclude<AgentKind, "orchestrator">, string[]> = {
  "doc-gen": ["Read", "Write", "Glob", "Grep"],
  "doc-worker": ["Read", "Write", "Glob", "Grep"],
  "test-gen": ["Read", "Write", "Glob", "Grep"],
  code: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
  check: ["Read", "Glob", "Grep"],
  review: ["Read", "Glob", "Grep"],
};

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function mediaTypeFor(filename: string): string {
  switch (path.extname(filename).toLowerCase()) {
    case ".md": return "text/markdown";
    case ".json": return "application/json";
    case ".ts": case ".tsx": return "text/typescript";
    case ".js": case ".mjs": case ".cjs": return "text/javascript";
    case ".yaml": case ".yml": return "application/yaml";
    default: return "text/plain";
  }
}

async function walkFiles(root: string, workspaceRoot: string): Promise<FileSnapshot[]> {
  const output: FileSnapshot[] = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return output;
    throw error;
  }
  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      output.push(...await walkFiles(absolutePath, workspaceRoot));
      continue;
    }
    if (!entry.isFile()) continue;
    const stat = await lstat(absolutePath);
    if (stat.isSymbolicLink()) continue;
    const content = await readFile(absolutePath);
    output.push({
      absolutePath,
      relativePath: path.relative(workspaceRoot, absolutePath).split(path.sep).join("/"),
      sha256: createHash("sha256").update(content).digest("hex"),
      content,
    });
  }
  return output;
}

async function snapshotWritableFiles(input: AgentRunInput): Promise<Map<string, FileSnapshot>> {
  const workspaceRoot = path.resolve(input.workspace.root);
  const roots = input.workspace.writableRoots.map((root) => path.resolve(root));
  for (const root of [...input.workspace.readableRoots, ...roots]) {
    if (!isInside(workspaceRoot, path.resolve(root))) {
      throw new CodeAgentCliError(
        "permission_denied",
        `CodeAgent workspace root escapes isolated workspace: ${root}`,
        "permission",
      );
    }
  }
  const snapshots = (await Promise.all(roots.map((root) => walkFiles(root, workspaceRoot)))).flat();
  return new Map(snapshots.map((item) => [item.relativePath, item]));
}

function buildPrompt(input: AgentRunInput): string {
  const readable = input.workspace.readableRoots.map((root) => path.resolve(root));
  const writable = input.workspace.writableRoots.map((root) => path.resolve(root));
  return [
    `You are executing the ${input.kind} node inside a LangGraph workflow.`,
    "Do not modify the LangGraph topology, routing, checkpoint, or orchestration code.",
    `Readable roots: ${readable.join(", ") || "none"}.`,
    `Writable roots: ${writable.join(", ") || "none"}.`,
    "Only write inside the listed writable roots. Treat all other paths as read-only.",
    "Return a concise final response describing the result.",
    "",
    input.prompt,
  ].join("\n");
}

function classifyFailure(stderr: string): CodeAgentCliError {
  const normalized = stderr.toLowerCase();
  if (/no conversation found/.test(normalized)) {
    return new CodeAgentCliError("invalid_session", `CodeAgent session is unavailable: ${stderr}`, "business");
  }
  if (/authentication|unauthorized|not logged|login|idaas/.test(normalized)) {
    return new CodeAgentCliError("auth_failed", `CodeAgent authentication failed: ${stderr}`, "permission");
  }
  if (/permission|denied|forbidden/.test(normalized)) {
    return new CodeAgentCliError("permission_denied", `CodeAgent permission denied: ${stderr}`, "permission");
  }
  if (/overloaded|rate.?limit|\b429\b|model unavailable/.test(normalized)) {
    return new CodeAgentCliError("model_unavailable", `CodeAgent model is unavailable: ${stderr}`);
  }
  return new CodeAgentCliError("cli_error", `CodeAgent CLI failed: ${stderr || "unknown error"}`);
}

function terminateProcessTree(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals): void {
  if (child.pid && process.platform !== "win32") {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // The process may already have exited or may not own a process group.
    }
  }
  child.kill(signal);
}

export class CompanyCodeAgentCliRunner implements AgentRunner {
  private readonly options: Required<Omit<CompanyCodeAgentCliRunnerOptions, "cliArgsPrefix">> & {
    cliArgsPrefix: string[];
  };

  public constructor(
    private readonly auth: CodeAgentAuthProvider,
    options: CompanyCodeAgentCliRunnerOptions = {},
  ) {
    this.options = {
      cliPath: options.cliPath ?? "codeagent",
      cliArgsPrefix: options.cliArgsPrefix ?? [],
      timeoutMs: options.timeoutMs ?? DEFAULT_CODE_AGENT_TIMEOUT_MS,
      terminateGraceMs: options.terminateGraceMs ?? 5_000,
      bare: options.bare ?? false,
      dangerouslySkipPermissions: options.dangerouslySkipPermissions ?? false,
      maxCapturedOutputBytes: options.maxCapturedOutputBytes ?? 10 * 1024 * 1024,
    };
  }

  public async run(input: AgentRunInput): Promise<AgentRunResult> {
    return this.execute(input);
  }

  public async resume(input: AgentResumeInput): Promise<AgentRunResult> {
    return this.execute(input);
  }

  private async execute(input: AgentRunInput): Promise<AgentRunResult> {
    if (input.signal?.aborted) {
      throw new CodeAgentCliError("cancelled", "CodeAgent execution was cancelled");
    }
    await this.auth.assertAvailable();
    const before = await snapshotWritableFiles(input);
    const args = this.buildArgs(input);
    const processResult = await this.spawnCli(args, buildPrompt(input), input);
    if (processResult.termination === "cancelled") {
      throw new CodeAgentCliError("cancelled", "CodeAgent execution was cancelled");
    }
    if (processResult.termination === "timeout") {
      throw new CodeAgentCliError("timeout", `CodeAgent exceeded ${this.options.timeoutMs}ms`);
    }
    if (processResult.exitCode !== 0) {
      throw classifyFailure(processResult.stderr.trim());
    }

    const events: StreamResult[] = [];
    for (const line of processResult.stdout.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line) as StreamResult);
      } catch {
        // Some internal builds write startup notices to stdout. A final result event is still required.
      }
    }
    let result: StreamResult | undefined;
    for (let index = events.length - 1; index >= 0; index -= 1) {
      if (events[index]?.type === "result") {
        result = events[index];
        break;
      }
    }
    if (!result || typeof result.result !== "string") {
      throw new CodeAgentCliError(
        "parse_error",
        `CodeAgent did not return a valid result event. stderr: ${processResult.stderr.trim()}`,
      );
    }
    if (result.is_error) {
      throw classifyFailure(result.result || processResult.stderr.trim());
    }
    if (result.permission_denials && result.permission_denials.length > 0) {
      throw new CodeAgentCliError(
        "permission_denied",
        "CodeAgent reported one or more permission denials",
        "permission",
      );
    }

    const after = await snapshotWritableFiles(input);
    const files: AgentOutputFile[] = [];
    const skippedBinaryFiles: string[] = [];
    for (const [relativePath, file] of after) {
      if (before.get(relativePath)?.sha256 === file.sha256) continue;
      if (file.content.includes(0)) {
        skippedBinaryFiles.push(relativePath);
        continue;
      }
      files.push({
        relativePath,
        content: file.content.toString("utf8"),
        mediaType: mediaTypeFor(relativePath),
      });
    }
    const deletedFiles = [...before.keys()].filter((filename) => !after.has(filename));
    const reportedFileChanges = events
      .map((event) => event.tool_use_result)
      .filter((item): item is NonNullable<StreamResult["tool_use_result"]> => Boolean(item?.filePath))
      .map((item) => ({ type: item.type, filePath: item.filePath }));

    return {
      finalResponse: result.result,
      files,
      ...(result.session_id ? { threadId: result.session_id } : {}),
      metadata: {
        backend: "company-codeagent-cli",
        subtype: result.subtype,
        durationMs: result.duration_ms,
        durationApiMs: result.duration_api_ms,
        numTurns: result.num_turns,
        totalCostUsd: result.total_cost_usd,
        usage: result.usage,
        reportedFileChanges,
        deletedFiles,
        skippedBinaryFiles,
      },
    };
  }

  private buildArgs(input: AgentRunInput): string[] {
    if (input.kind === "orchestrator") {
      throw new CodeAgentCliError("cli_error", "The deterministic orchestrator cannot use CodeAgent");
    }
    const args = [
      ...this.options.cliArgsPrefix,
      "--print",
      "--output-format", "stream-json",
      "--verbose",
    ];
    if (this.options.bare) args.push("--bare");
    if (this.options.dangerouslySkipPermissions) {
      args.push("--dangerously-skip-permissions");
    } else {
      args.push("--permission-mode", "dontAsk");
    }
    args.push("--tools", TOOLS_BY_KIND[input.kind].join(","));
    if (input.existingThreadId) args.push("--sessions", input.existingThreadId);
    return args;
  }

  private async spawnCli(
    args: string[],
    prompt: string,
    input: AgentRunInput,
  ): Promise<ProcessResult> {
    return new Promise<ProcessResult>((resolve, reject) => {
      const child = spawn(this.options.cliPath, args, {
        cwd: input.workspace.root,
        detached: process.platform !== "win32",
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let capturedBytes = 0;
      let settled = false;
      let termination: ProcessResult["termination"];
      let forceKillTimer: NodeJS.Timeout | undefined;

      const append = (current: string, chunk: Buffer): string => {
        capturedBytes += chunk.byteLength;
        if (capturedBytes > this.options.maxCapturedOutputBytes) {
          terminateProcessTree(child, "SIGTERM");
          return current;
        }
        return current + chunk.toString("utf8");
      };
      const terminate = (reason: "timeout" | "cancelled") => {
        if (termination || settled) return;
        termination = reason;
        terminateProcessTree(child, "SIGTERM");
        forceKillTimer = setTimeout(
          () => terminateProcessTree(child, "SIGKILL"),
          this.options.terminateGraceMs,
        );
      };
      const timeout = setTimeout(() => terminate("timeout"), this.options.timeoutMs);
      const onAbort = () => terminate("cancelled");
      input.signal?.addEventListener("abort", onAbort, { once: true });

      child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
      child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
      child.once("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (forceKillTimer) clearTimeout(forceKillTimer);
        input.signal?.removeEventListener("abort", onAbort);
        reject(new CodeAgentCliError("cli_unavailable", `Cannot start CodeAgent CLI: ${error.message}`));
      });
      child.once("close", (exitCode, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (forceKillTimer) clearTimeout(forceKillTimer);
        input.signal?.removeEventListener("abort", onAbort);
        resolve({ exitCode, signal, stdout, stderr, ...(termination ? { termination } : {}) });
      });

      child.stdin.end(prompt, "utf8");
    });
  }
}
