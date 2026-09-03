import type { AgentDefinition, AgentId } from '../../../application/ports/index.ts';

export const DOMAIN_KNOWLEDGE_AGENT_DEFINITIONS = [
  {
    agentId: 'orchestrator', nodeId: 'orchestrator', displayName: '编排智能体',
    responsibility: '读取固化策略和执行摘要，形成当前轮的确定性任务计划。',
    basePrompt: '规划当前一轮知识飞轮。保持固定拓扑，只分派当前节点职责范围内的任务。',
    inputContract: ['运行策略', '当前轮次', '上次路由摘要'],
    outputContract: ['计划摘要'], tools: [], customizableFields: ['promptAddon'],
  },
  {
    agentId: 'doc-gen', nodeId: 'doc_gen', displayName: '文档生成智能体',
    responsibility: '生成知识正文，或根据纠正意见增量修订，是知识正文的唯一自动执笔者。',
    basePrompt: '根据允许使用的源码证据生成或修订知识文档。所有结论都要具体、可追溯。',
    inputContract: ['源码快照', '分块知识片段', '上一版知识与纠正意见'],
    outputContract: ['符合结构约束的知识文档'], tools: ['读取', '写入', '文件匹配', '文本检索'], customizableFields: ['promptAddon'],
  },
  {
    agentId: 'doc-worker', nodeId: 'doc_worker', displayName: '文档分块智能体',
    responsibility: '按固定分块任务并行提取知识片段，不能发布或决定门禁。',
    basePrompt: '从可见的源码证据中提取指定知识片段，并保留来源记录。',
    inputContract: ['源码分块', '公开接口'],
    outputContract: ['知识片段'], tools: ['读取', '写入', '文件匹配', '文本检索'], customizableFields: ['promptAddon'],
  },
  {
    agentId: 'test-gen', nodeId: 'test_gen', displayName: '测试生成智能体',
    responsibility: '从源码和公开接口提出候选行为测试，不读取候选知识。',
    basePrompt: '只根据源码和公开接口生成候选行为测试，不得读取生成后的知识。',
    inputContract: ['源码快照', '公开接口'],
    outputContract: ['候选测试方案'], tools: ['读取', '写入', '文件匹配', '文本检索'], customizableFields: ['promptAddon'],
  },
  {
    agentId: 'code', nodeId: 'code', displayName: '代码生成智能体',
    responsibility: '由当前智能体提供方启动独立会话，只根据候选知识和公开接口重新生成实现。这里是工作流节点角色，不代表接入了另一套代码生成命令行。',
    basePrompt: '只使用候选知识和公开接口生成一份全新实现。不得查看参考源码或门禁答案。受信上下文中的允许路径是完整输出白名单；只能在这些路径返回实现文件，不得添加测试、文档、夹具或配置文件。',
    inputContract: ['候选知识', '公开接口'],
    outputContract: ['生成的项目文件'], tools: ['读取', '写入', '编辑', '命令行', '文件匹配', '文本检索'], customizableFields: ['promptAddon'],
  },
  {
    agentId: 'check', nodeId: 'check', displayName: '检查智能体',
    responsibility: '以只读方式检查生成实现、差异和确定性判据，不能修改代码。',
    basePrompt: '以只读方式检查提示上下文中内联的生成代码工件与确定性判据，不得修改实现。生成代码不会写入你的公开接口工作区，不能把当前目录缺少生成文件当作缺陷。只报告由内联代码或证据直接支持的阻塞项。',
    inputContract: ['生成文件', '代码差异', '判定标准'],
    outputContract: ['结构化检查报告'], tools: ['读取', '文件匹配', '文本检索'], customizableFields: ['promptAddon'],
  },
  {
    agentId: 'review', nodeId: 'review', displayName: '复核智能体',
    responsibility: '依据评测和检查证据定位知识问题，并提出可验证的纠正意见。',
    basePrompt: '依据内联的候选知识、结构化评测证据和检查报告做复核。生成代码位于调用方的不可变工件库，由评测器在独立副本中写入文件，不会出现在你的只读公开接口工作区；不得因为当前目录缺少文件而判定失败。结构化评测证据是测试执行的事实依据：当评测通过且检查没有阻塞项时，除非内联证据存在可以明确指出的矛盾，否则应建议通过；需要迭代时必须给出可以复验的知识纠正意见。',
    inputContract: ['候选知识', '评测报告', '检查报告'],
    outputContract: ['结构化复核与纠正意见'], tools: ['读取', '文件匹配', '文本检索'], customizableFields: ['promptAddon'],
  },
] as const satisfies readonly AgentDefinition[];

const definitionMap = new Map<AgentId, AgentDefinition>(
  DOMAIN_KNOWLEDGE_AGENT_DEFINITIONS.map((definition) => [definition.agentId, definition]),
);

export function agentDefinition(agentId: AgentId): AgentDefinition {
  const definition = definitionMap.get(agentId);
  if (!definition) throw new Error(`Unknown fixed Agent: ${agentId}`);
  return definition;
}
