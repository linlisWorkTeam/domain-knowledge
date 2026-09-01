export const GRAPH_NODES = [
  "orchestrator",
  "doc_gen",
  "doc_worker",
  "test_gen",
  "candidate_knowledge",
  "oracle_validation",
  "code",
  "check",
  "eval_runner",
  "review",
  "gate",
  "rollback",
  "publish",
  "failed",
  "stopped",
] as const;

export type GraphNodeName = (typeof GRAPH_NODES)[number];

export const AGENT_GRAPH_NODES = {
  OrchestratorAgent: "orchestrator",
  DocGenAgent: "doc_gen",
  DocWorkerAgent: "doc_worker",
  TestGenAgent: "test_gen",
  CodeAgent: "code",
  CheckAgent: "check",
  ReviewAgent: "review",
} as const satisfies Record<string, GraphNodeName>;

export const DETERMINISTIC_GRAPH_NODES = [
  "candidate_knowledge",
  "oracle_validation",
  "eval_runner",
  "gate",
  "rollback",
  "publish",
] as const satisfies readonly GraphNodeName[];
