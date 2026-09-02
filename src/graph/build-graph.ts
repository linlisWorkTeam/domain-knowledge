import {
  Command,
  END,
  NodeError,
  Send,
  START,
  StateGraph,
  type BaseCheckpointSaver,
} from "@langchain/langgraph";
import { createGraphNodes, type GraphDependencies } from "./nodes.js";
import { GraphStateAnnotation, type GraphState } from "./state.js";

// Keep the graph-level timeout above the runner timeout so LangGraph does not
// abort a healthy CodeAgent process before the runner can finish or time out.
export const DEFAULT_GRAPH_NODE_TIMEOUT_MS = 600_000;

export function buildKnowledgeGraph(
  dependencies: GraphDependencies,
  checkpointer: BaseCheckpointSaver,
) {
  const nodes = createGraphNodes(dependencies);
  const graph = new StateGraph(GraphStateAnnotation)
    .addNode("orchestrator", nodes.orchestrator)
    .addNode("doc_worker", nodes.docWorker)
    .addNode("doc_gen", nodes.docGen)
    .addNode("test_gen", nodes.testGen)
    .addNode("candidate_knowledge", nodes.candidateKnowledge)
    .addNode("oracle_validation", nodes.oracleValidation)
    .addNode("code", nodes.code)
    .addNode("check", nodes.check)
    .addNode("eval_runner", nodes.evalRunner)
    .addNode("review", nodes.review)
    .addNode("gate", nodes.gate)
    .addNode("rollback", nodes.rollback)
    .addNode("publish", nodes.publish)
    .addNode("failed", nodes.failed)
    .addNode("stopped", nodes.stopped)
    .addEdge(START, "orchestrator")
    .addConditionalEdges(
      "orchestrator",
      (state: GraphState) => {
        const base = { ...state, workerTask: undefined };
        const sends: Send[] = [new Send("test_gen", base)];
        if (state.workerCount > 0) {
          for (let index = 0; index < state.workerCount; index += 1) {
            sends.push(
              new Send("doc_worker", {
                ...state,
                workerTask: {
                  id: `worker-${index + 1}`,
                  index,
                  topic: `knowledge partition ${index + 1}`,
                },
              }),
            );
          }
        } else {
          sends.push(new Send("doc_gen", base));
        }
        return sends;
      },
      ["test_gen", "doc_worker", "doc_gen"],
    )
    .addEdge("doc_worker", "doc_gen")
    .addEdge("doc_gen", "candidate_knowledge")
    .addEdge("candidate_knowledge", "code")
    .addEdge("code", "check")
    .addEdge("test_gen", "oracle_validation")
    .addEdge(["check", "oracle_validation"], "eval_runner")
    .addConditionalEdges(
      "eval_runner",
      (state: GraphState) =>
        state.evaluation?.infrastructureError ? "failed" : "review",
      ["failed", "review"],
    )
    .addEdge("review", "gate")
    .addConditionalEdges(
      "gate",
      (state: GraphState) => {
        switch (state.route) {
          case "pass":
            return "publish";
          case "iterate":
            return "orchestrator";
          case "rollback":
            return "rollback";
          case "failed":
            return "failed";
          default:
            return "stopped";
        }
      },
      ["publish", "orchestrator", "rollback", "failed", "stopped"],
    )
    .addEdge("rollback", "orchestrator")
    .addEdge("publish", END)
    .addEdge("failed", END)
    .addEdge("stopped", END)
    .setNodeDefaults({
      timeout: DEFAULT_GRAPH_NODE_TIMEOUT_MS,
      errorHandler: (rawState: unknown, nodeError: NodeError) => {
        const state = rawState as GraphState;
        const occurredAt = new Date().toISOString();
        return new Command({
          update: {
            status: "failed",
            currentNode: nodeError.node,
            errors: [
              {
                node: nodeError.node,
                category: "infrastructure",
                message: nodeError.error.message,
                iteration: state.iteration,
                attempt: 1,
                occurredAt,
              },
            ],
            events: [
              {
                node: nodeError.node,
                phase: "failed",
                iteration: state.iteration,
                attempt: 1,
                timestamp: occurredAt,
                detail: nodeError.error.message,
              },
            ],
          },
          goto: "failed",
        });
      },
    });

  return graph.compile({ checkpointer, name: "domain-knowledge-agent-graph" });
}
