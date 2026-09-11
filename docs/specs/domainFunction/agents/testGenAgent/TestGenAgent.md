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

## 已确认的规则与当前边界

| 编号 | 规则 | 当前状态 |
| --- | --- | --- |
| IO-02 | 从源码获得测试依据，不读知识文档 | 已实现；替代早期从知识生成测试的方向 |
| IO-11 | 输出可执行源码和逐项清单，由执行器运行 | 已实现 |
| IO-12 | 先在原始源码上验证候选测试 | 已实现，规则暂时保留 |
| IO-13 | 源码不变就复用，不因文档或配置变化重写 | 已实现 |
| IO-21 | 首次候选失败时有限修复，仍失败转人工 | 已实现 |

当前支持可明确绑定的 gcc/g++ 编译与 binary 执行；复杂构建脚本需要适配。外部监督限定 Linux x86_64、可用 ptrace、gcc/nm 和保留的入口符号；不等于完整部署沙箱。源码正确性、测试覆盖率和真实模型质量仍未验收，详见 [执行器设计](../../../infrastructure/evaluation/Evaluation.md)。

## 怎样验收

| 验收编号 | 必须观察到的行为 | 对应测试 |
| --- | --- | --- |
| AC-AGENT-101 | 源文件加辅助头文件能执行；头文件不能冒充用例入口，未关联用例的测试源文件被拒绝 | TestEntryContract.test.ts |
| AC-AGENT-102 / AC-AGENT-102-R1 | 保留宏、头文件目录、链接和运行参数；分别按命令工作目录处理路径，无法绑定就停止 | TestBuildBinding.test.ts |
| AC-AGENT-103 / AC-AGENT-103-R1 | 清单完整执行才可能通过；读取 runner 后伪造三个 PASS 并退出不能蒙混过关，后两个入口仍会被启动 | TestCaseExecution.test.ts、NativeCaseSupervisor.test.ts |

这些文件位于 `tests/integration/`。监督测试还覆盖正常返回、断言、信号、超时、伪造结果通道、修改文件/进程、缺符号和内核拒绝 ptrace。TestGenExecution.test.ts 覆盖有限修复及跨 Run 复用；完整流程见 [验收报告](../../../../reports/AgentSpecRepairAndE2E.md)。旧 nonce/stdout 方案已被替换，其旧测试通过记录不作为当前可信完成证明。

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
