/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：维护测试生成角色的基础指令、职责和可读材料范围。
 */
import { materialsFor } from '../AgentExecution.ts';
import { nativeContract, type Input } from './TestGenAgentContract.ts';
import type { ExecutionContext } from '../AgentExecution.ts';

/** 对外提供definition，作为调用方使用的统一约定。 */
export const definition = {
    agentId: 'test-gen', displayName: '测试生成智能体',
    responsibility: '按冻结材料与测试策略提出候选行为测试，参考oracle验证后才能晋升。',
    basePrompt: '只使用冻结测试策略授权的材料提出候选行为用例，不读取生成实现。必须输出策略指定的数据协议，不得提供shell命令、测试源码或自报通过数；oracleRequired必须为true。预期不确定时保留问题，不能猜测为断言。所有候选先由独立参考oracle验证，失败不能晋升为可信门禁。',
    inputContract: ['固定源码身份', '公开接口', '测试策略授权材料'],
    outputContract: ['候选测试方案'], tools: ['read_material'], customizableFields: ['promptAddon'],
  } as const;

/** 组合基础提示词和本角色可见的受信材料。 */
export function buildPrompt(input: Input, context: ExecutionContext): string {
  if (nativeContract(input)) return `${context.effectivePrompt}\n当前策略为native-cases-v1，依据授权知识正文及公开接口提出候选测试，不读取参考实现正文。返回单个完整JSON对象，先写顶层oracleRequired:true，再写nativeSuite；nativeSuite结束后只关闭外层对象，禁止在已关闭的对象外追加oracleRequired属性。每例填写caseId、description、sections、variables、calls、observations、expected。sections使用知识的实际章节。变量只用公开类型和基础数值类型，数组长度1..256。所有变量默认零初始化；结构体和数组省略initial，不用整数初始化结构体。字符串参数直接写{string:文本}，不要声明const char *或其他指针变量；已有数组作为参数用read访问，单值输出参数用address取地址；调用仅限公开函数/静态方法。重载使用显式类型变量选择签名。read/address为变量访问，members为字段链，index为数组下标，不提供表达式。观察必须来自目标调用的返回或受影响变量。integer/unsigned预期为精确十进制字符串，boolean为布尔，number为有限数值（相对/绝对容差1e-7），string为UTF-8文本；expected只存宿主，不写进程序。候选与参考不符时只是候选被拒绝，不能据此判定知识错误。\n受信AgentCommand：${JSON.stringify(context.command)}\n授权工件：${JSON.stringify(materialsFor(input.payload, input.materials))}`;
  return `${context.effectivePrompt}\n当前策略仅依据源码和公开接口，不读取候选知识。独立模块输出suite（module-cases-v1），字段为modulePath、exportName、cases[{caseId,description,args,expected}]。\n逐案沿实际源码推导 expected：先确认输入满足目标分支的全部前置条件（尤其正则字符集、锚点和边界），再跟踪替换顺序、转义、拼接和未匹配时的回退路径。不能因为某个分支内部有转义逻辑，就假定会被前置正则拒绝的字符也能进入该分支。description 说明实际触发的路径；输出前复核每个精确预期，不用通用标准或理想行为替代源码。已有候选不得通过删除失败案例或改写预期来通过参考门禁。\n\n受信 AgentCommand：\n${JSON.stringify(context.command)}\n\n命令引用工件（已校验内容摘要）：\n${JSON.stringify(materialsFor(input.payload, input.materials))}`;
}

/** 确定本角色允许读取的文件路径。 */
export function readablePaths(input: Input): string[] { return [...input.sourcePaths, ...input.publicInterfacePaths]; }
