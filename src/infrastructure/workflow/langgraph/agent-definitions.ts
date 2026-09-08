import type { AgentDefinition, AgentId } from '../../../application/ports/index.ts';
import { roleDefinitions } from '../../../domain/agents/index.ts';
export const NODE_BY_AGENT: Record<AgentId, string> = { orchestrator: 'orchestrator', 'doc-worker': 'doc_worker', 'doc-gen': 'doc_gen', 'test-gen': 'test_gen', code: 'code', check: 'check', review: 'review' };
export const DOMAIN_KNOWLEDGE_AGENT_DEFINITIONS: AgentDefinition[] = roleDefinitions.map((definition) => ({ ...definition, tools: [...definition.tools], inputContract: [...definition.inputContract], outputContract: [...definition.outputContract], nodeId: NODE_BY_AGENT[definition.agentId] }));
export function agentDefinition(agentId: AgentId): AgentDefinition {
 const definition = DOMAIN_KNOWLEDGE_AGENT_DEFINITIONS.find((entry) => entry.agentId === agentId);
 if (!definition) throw new Error(`Unknown fixed Agent: ${agentId}`);
 return definition;
}
