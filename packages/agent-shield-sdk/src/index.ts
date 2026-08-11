export interface BettorMcpSubject { repository: string; commit: string; tool: string }
export function subject(repository: string, commit: string, tool: string): BettorMcpSubject {
  if (!/^https:\/\/github\.com\/[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(repository)) throw new Error("repository must be a portable GitHub identity");
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error("commit must be immutable 40-hex");
  if (!/^loopctl_[a-z0-9_]+$/.test(tool)) throw new Error("tool must be a public loopctl MCP name");
  return { repository, commit, tool };
}
