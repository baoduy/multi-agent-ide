import type { PermissionPromptCoordinator } from "../app/PermissionPromptCoordinator";

/**
 * In-process MCP-tool surface for the Claude permission-prompt bridge.
 *
 * Claude can be launched with `--permission-prompt-tool mcp__magenta__approve`
 * which routes any unknown tool invocation through this `approve` tool. We
 * translate that call into an IPC push event (`ai-session:permission-request`)
 * via `PermissionPromptCoordinator.requestApproval` and await the renderer's
 * answer (`ai-session:permission-response`).
 *
 * This class owns the tool surface; full stdio JSON-RPC framing for an
 * out-of-process MCP server is deferred to a follow-up. The coordinator's
 * IPC contract (Task 7) is sufficient on its own — a renderer dialog can
 * subscribe to push events today and reply via the response IPC, even
 * before Claude itself is wired through `mcpConfig`.
 */
export interface ApproveResult {
  behavior: "allow" | "deny";
  updatedInput?: Record<string, unknown>;
  message?: string;
}

export interface ApproveToolCall {
  sessionId: string;
  tool_name: string;
  input: Record<string, unknown>;
}

export class PermissionPromptMcpServer {
  /** Last requestId emitted — exposed for diagnostics & tests. */
  lastRequestId: string | undefined;

  constructor(private readonly coord: PermissionPromptCoordinator) {}

  listTools(): Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }> {
    return [
      {
        name: "approve",
        description:
          "Ask the human in Magenta whether to allow a tool invocation.",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: { type: "string" },
            tool_name: { type: "string" },
            input: { type: "object" },
          },
          required: ["sessionId", "tool_name", "input"],
        },
      },
    ];
  }

  async callTool(name: string, args: ApproveToolCall): Promise<ApproveResult> {
    if (name !== "approve") {
      return { behavior: "deny", message: `unknown tool: ${name}` };
    }
    const decision = await this.coord.requestApproval({
      sessionId: args.sessionId,
      tool: args.tool_name,
      scope: JSON.stringify(args.input).slice(0, 200),
    });
    this.lastRequestId = decision.requestId;
    return decision.allow
      ? { behavior: "allow", updatedInput: args.input }
      : { behavior: "deny", message: "denied by user" };
  }
}
