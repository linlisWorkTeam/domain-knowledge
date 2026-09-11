<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：TestGenAgent 的职责、输入输出与确认状态。
-->
# TestGenAgent：根据源码写测试，交给执行器验证

TestGen 阅读原始源码和公开接口，生成 C/C++ 测试及逐项清单。它不读取候选知识文档或 Code 的重建实现，避免文档写错后，测试也跟着使用同一个错误答案。

## 生成的测试要说明什么

每个用例都要说清测试目标、输入、预期结果，以及预期来自哪份源码。还要提供真正能编译的测试文件和可单独执行的入口，不能只交一段“测试方案”。

例如，源码中的 calculate() 返回 4。TestGen 可以生成检查该结果的用例，并指出源码依据。如果它误写成“应该返回 3”，后面的参考校验会失败。

TestGen 只写允许路径内的测试文件，不能覆盖原实现或接口，也不决定编译命令。项目配置中的命令由执行器负责运行。

## 为什么先在原始代码上跑一遍

当前流程先把生成测试放进原始源码副本，实际编译和运行。通过后才固定测试集，用它评测 Code 重建的实现。

这一步用来发现测试写错、无法编译或预期与参考实现不符。它暂时以原始源码为参考，不能证明原始业务逻辑本身正确；参考测试失败也不能直接算作文档或重建代码错误。

IO-12 是用户在 2026-09-10 暂时同意保留的规则，已经实现，但还不是最终产品定案。

## 失败后怎么处理

| 发生了什么 | 系统怎么做 |
| --- | --- |
| 首次候选编译失败、普通运行失败或断言错误 | 将完整候选和失败证据交回 TestGen，在限制次数内修复，再实际校验 |
| 准备环境失败、超时、工具不可用或无法绑定构建命令 | 停止并交人工处理，不让模型反复改测试来补救环境 |
| 修复次数用完仍失败 | 停止，保留候选、失败原因和下一步建议 |
| 已固定的测试在新环境中失败 | 停止处理，不能自动改答案换取通过 |

修复默认允许 1 次，可设置为 0～3 次。正常通过不进入修复；测试修复是同一业务轮次内的尝试，不额外算一轮文档修订。

## 什么情况下复用，什么情况下重新生成

源码没有变化，就继续用已经校验通过的那套测试。改文档、换模型提示词、换编写配置或出现无关 Git 提交，都不能成为重新生成测试的理由。

当前按选定模块的标识、源码/接口路径及内容摘要识别变化。源码变了，为新源码建立测试集；源码没变，即使新建 Run，也读取原来固定的集合，在当前环境重新编译运行。

并发任务同时产生测试时，只保存首个通过的集合，其他任务要重新校验实际保存的那套。旧测试协议不作为当前通过证据，也不通过悄悄重新生成来绕过迁移，需交人工处理。

## 怎样确认用例真的执行过

不能相信测试程序自己打印的“全部通过”。框架为每个用例生成执行入口，由外部监督进程观察它是否真正进入、是否正常返回及返回值是多少。每个用例独立启动，不依赖上一个用例留下的全局状态。

一个用例普通失败后，仍调度后面的用例；整个运行命令的超时和输出上限继续生效。提前退出、漏执行、重复或未知结果、只打印成功数都不能算通过。监督工具本身不可用也必须失败，不能退回看打印内容。

这能证明入口被执行并记录结果，不能证明用例写得足够严格。例如测试函数直接返回成功却不检查业务，仍属于测试质量问题，需要真实业务验收。

## 开发规则与验收

### IO-02 / IO-11 / AC-AGENT-101：从源码交付可执行测试

| 项目 | 约定 |
| --- | --- |
| 前提 | 已加载授权源码、接口、语言和测试策略，以及允许写入的测试路径。 |
| 行为 | TestGen 只据源码生成测试文件和用例清单，不读取候选知识或重建代码。每个测试源文件关联用例，每个用例有唯一入口和源码依据；辅助头文件可无用例，但不能作入口。 |
| 结果 | 文件集合与逐项清单分别保存；覆盖原实现、越权路径、虚构依据、缺入口或源文件无关联用例均拒绝，不能仅交测试方案。 |
| 验收 | 一份测试源文件加辅助头文件应能编译执行；让头文件充当入口、增加未关联用例的源文件须拒绝。加入无关候选知识时不得进入模型材料。见 [角色测试](../../../../../src/domain/agents/testGenAgent/TestGenAgent.test.ts) 和 [TestEntryContract.test.ts](../../../../../tests/integration/TestEntryContract.test.ts)。 |
| 状态 | 已实现，有角色及真实编译回归；用例的业务覆盖率和断言质量尚未验收。 |

### IO-12 / IO-21：参考校验失败时有限修复

| 项目 | 约定 |
| --- | --- |
| 前提 | 首次候选测试已生成；修复预算为 0～3，默认 1，参考实现保持不变。 |
| 行为 | 执行器先在原始源码副本编译运行。普通编译/运行/断言失败时，Application 将完整上一候选及失败证据交 TestGen 修复；环境、工具、超时或绑定失败直接停止。 |
| 结果 | 通过才固定测试集；修复耗尽仍失败则 STOPPED 并保留交接。修复不推进文档轮次，候选测试失败不直接要求 Review 改知识。 |
| 验收 | 首次断言或编译失败后应携带完整测试源码和用例修复一次；再失败停止。预算为 0 不修复，环境失败不调用修复模型。见 [TestGenExecution.test.ts](../../../../../tests/integration/TestGenExecution.test.ts)、[AgentSpecRegression.test.mjs](../../../../../tests/integration/AgentSpecRegression.test.mjs)。 |
| 状态 | 已实现，有有界修复及停止回归。IO-12 仍是暂时保留的产品规则，假设参考实现正确，不证明业务本身正确。 |

### IO-13：同一源码使用已固定测试

| 项目 | 约定 |
| --- | --- |
| 前提 | 按模块、源码/接口路径及内容摘要，找到已校验测试；新 Run 或新轮次可能改变文档、提示词或配置。 |
| 行为 | 框架复用固定集合，在当前环境重新编译运行；只有源码身份改变才允许建立新集合。并发时使用实际保存的首个通过集合，不能沿用输掉保存竞争的候选。 |
| 结果 | 源码不变不重新生成；固定测试失败停止，不能自动改答案。旧协议结果不能冒充当前通过，也不能靠重生成绕过迁移。 |
| 验收 | 只改文档或提示词、新建 Run，模型不得重写固定测试；改源码须得到不同源码身份。旧协议缓存须停止且不调用生成。见 [角色测试](../../../../../src/domain/agents/testGenAgent/TestGenAgent.test.ts)、[复用策略测试](../../../../../src/domain/agents/testGenAgent/TestSuitePolicy.test.ts) 和 [TestGenExecution.test.ts](../../../../../tests/integration/TestGenExecution.test.ts)、[TestCaseExecution.test.ts](../../../../../tests/integration/TestCaseExecution.test.ts)。 |
| 状态 | 已实现，有策略和跨 Run 复用回归；原始源码正确性不在复用校验范围内。 |

### AC-AGENT-102 / AC-AGENT-102-R1：按每条命令的工作目录绑定测试

| 项目 | 约定 |
| --- | --- |
| 前提 | 项目配置提供可解析的 gcc/g++ 编译及 binary 运行命令，显式声明测试源文件与输出。 |
| 行为 | 执行器分别按各命令 cwd 规范化源码、输出和运行路径，确认编译产物对应运行目标；保留宏、头文件目录、链接、运行参数和附加检查。 |
| 结果 | 明确绑定后编译执行；无法绑定或路径逃逸时报告配置错误并转人工，不丢参数、不请求模型改测试来迎合命令。 |
| 验收 | cwd=build 编译 ../tests/generated.cpp -o test-bin，运行从 build 或根目录指向同一产物，都应绑定成功；缺源文件/输出绑定及不透明命令停止。见 [TestBuildBinding.test.ts](../../../../../tests/integration/TestBuildBinding.test.ts)。 |
| 状态 | 已实现，有参数及 cwd 回归；复杂构建脚本仍需适配，不声明支持任意命令。 |

### AC-AGENT-103 / AC-AGENT-103-R1：逐项完成事实由外部监督器记录

| 项目 | 约定 |
| --- | --- |
| 前提 | 测试清单和原生入口已绑定，运行环境支持当前监督协议。 |
| 行为 | 监督器为每项独立启动进程，观察真实入口、正常返回及返回值。普通失败后继续调度后项；所有用例共享命令总超时和输出预算。stdout/stderr 只作日志。 |
| 结果 | 只有清单完整执行且全部通过才可能 PASS。提前退出、伪造打印、缺项/重复/未知结果或监督不可用均不能通过；预算耗尽的剩余项记录未完成，不伪装执行成功。 |
| 验收 | 第一个入口读取 runner、伪造三项 PASS 后退出，后两项实际失败：总体必须失败，后两项仍被启动。另覆盖正常返回、断言、超时、结果通道攻击及内核拒绝 ptrace。见 [TestCaseExecution.test.ts](../../../../../tests/integration/TestCaseExecution.test.ts)、[NativeCaseSupervisor.test.ts](../../../../../tests/integration/NativeCaseSupervisor.test.ts)。 |
| 状态 | 已实现，有真实原生执行和攻击回归；只能证明入口执行事实，不能证明测试包含有效断言。 |

## 当前支持范围与保留问题

外部监督限定 Linux x86_64、可用 ptrace、gcc/nm 和保留的入口符号，不等于完整部署沙箱。旧 nonce/stdout 方案已替换，旧测试通过记录不作为当前可信完成证明。源码正确性、测试覆盖率及真实模型质量仍未验收。详见 [执行器设计](../../../infrastructure/evaluation/Evaluation.md) 和 [验收报告](../../../../reports/AgentSpecRepairAndE2E.md)。

<details>
<summary>开发对照：字段、执行协议和提示词</summary>

角色 ID 为 `test-gen`。输入为 moduleId、sourceSnapshotRef、publicInterfaceRefs、languageId、testPolicyRef、allowedTestPaths；修复输入 previousCandidateRef 与 validationFailureRef 必须同时出现，包含上一候选的完整测试文件和用例正文。缺材料或非法输出按 [共同约定](../Agents.md) 失败。

输出 `files: [{ path, content }]` 与 cases。每项 case 有 caseId、testPath、entryPoint、target、input、expected、sourceEvidence。caseId 和 entryPoint 唯一，entryPoint 是合法 C 标识符。每个测试翻译单元必须有关联 case；辅助头文件可以没有，不能作为入口。testPath 指向实际生成文件，依据只引用授权源码路径。文件集合和清单分别保存为 candidateSetRef、caseManifestRef。

测试源码定义 `int entryPoint(void)`，返回 0 表示通过，非 0 表示失败；禁止定义 main。框架追加单入口 runner，外部监督器用 ptrace 观察入口与返回位置，以子进程关闭的独立结果通道回报。stdout/stderr 仅作日志，不接受 TAP 或汇总成功数充当该清单的证据。

referenceCommands/finalCommands 的编译参数必须显式包含测试翻译单元、唯一 -o 输出和匹配 binary 运行命令。各命令分别按 cwd 将输入、输出及 binary 路径规范化到仓库根内，允许根内 `.`/`..`，拒绝越界和符号链接逃逸；例如 `cwd=build` 时可编译 `../tests/generated.cpp -o test-bin`。原始参数保留，不丢弃独立检查命令。

逐项证据绑定源码提交、测试源码摘要、清单摘要和重建文件摘要；附加命令和重复运行不能抵消清单缺项。协议为 `native-cases-v2-supervised`；缺入口、缺符号、未知或重复记录、监督失效都不能 PASS。

监督器在系统调用前检查 ABI/许可范围，仅允许必要的只读文件、内存、时间操作及 stdout/stderr 写入；拒绝写其他描述符、写文件、派生进程、重新 exec、ptrace、其他进程内存修改及未知 syscall。需要 PTRACE_GET_SYSCALL_INFO；允许仅向自身发信号，使 assert/abort 仍为普通失败，向监督器或其他进程发信号拒绝。超时/输出上限由原 binary 命令的所有用例共享，剩余用例记录调度及未完成情况。

`agentConfiguration.maxTestRepairs` 控制修复次数；每次修复使用独立执行键。运行中断可复用已提交候选和校验记录。无法继续时返回 testValidationRequired，经 STOPPED 交人工，不把候选测试失败直接交给 Review 修订知识。

Prompt 要求只根据源码和公开接口生成 files/cases，遵守路径与入口约定，修复时使用失败证据，不读取知识或生成实现，不输出构建命令。

</details>

## 代码与样例

代码位置：[执行入口](../../../../../src/domain/agents/testGenAgent/TestGenAgent.ts)、[输入输出契约](../../../../../src/domain/agents/testGenAgent/TestGenAgentContract.ts)、[提示词与读取范围](../../../../../src/domain/agents/testGenAgent/TestGenAgentPrompt.ts)、[角色测试](../../../../../src/domain/agents/testGenAgent/TestGenAgent.test.ts)、[独立样例](../../../../../src/domain/agents/testGenAgent/examples/TestGenAgentSample.json)。
