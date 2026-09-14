<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：TestGenAgent 的职责、输入输出与确认状态。
-->
# TestGenAgent

运行时输出 Schema 必须将 files[].path 限定为本次 allowedTestPaths，将 cases[].testPath 限定为其中可执行的 C/C++ 源文件，将 sourceEvidence 限定为本次源码和公开接口的精确文件路径。函数/行号说明放在描述字段，不能拼入 sourceEvidence。此约束与已有输出校验一致，使适配器的有限 Schema 修复能处理越界路径或错误证据格式；不得通过自动裁剪模型答案、允许额外 manifest 文件或放宽白名单来通过验收。

## 1. 职责与边界

TestGen 从原始源码和公开接口生成 C/C++ 测试，用来评测 Code 重建的实现。它不读取候选知识或重建代码，避免文档与测试使用同一个错误答案。

TestGen 交付可执行源码和逐项用例清单。它只能写允许的测试路径，不能覆盖原实现或接口；编译、运行及执行证据由执行器负责，模型不输出构建命令。

## 2. 输入与输出

| 输入 | 用途 |
| --- | --- |
| 模块、源码和公开接口 | 确定测试对象与预期行为的依据 |
| 语言及测试策略 | 约束测试实现方式 |
| 允许的测试路径 | 限定生成文件范围 |
| 上一候选和校验失败报告 | 仅修复时提供，必须同时出现且包含完整测试文件和用例正文 |

输出为测试文件集合 files 和用例清单 cases。每个用例说明测试目标、输入、预期、源码依据及可单独执行的入口；每个测试源文件必须有关联用例。辅助头文件可以没有用例，但不能充当入口。

框架分别保存文件集合与清单，返回 candidateSetRef 和 caseManifestRef。完整字段与入口约定见第 4 节和文末 Contract。

## 3. 工作流程

### 分批生成与持久进度

2026-09-14 用户确认取消“一次回答交付全部测试源码”的执行方式。TestGen 首先生成完整用例计划 cases 和公共前置代码 sharedFiles，不在计划中实现测试入口。计划最多 128 个用例，每项描述有长度上限；公共代码每文件最多 4096 字符。框架按计划顺序每批最多 4 个用例串行生成测试源码，每批每文件最多 16000 字符，避免再次形成无界回答。超过计划上限明确失败，不能截断或删掉覆盖项。

批次只返回当前用例涉及路径的源码片段，caseId、entryPoint、预期和依据由已保存计划绑定，不让模型重复填写。框架将共享代码与各批片段按固定顺序组装；共用同一个测试文件也支持分批追加，模型不得重复共享定义，批次辅助符号使用批次前缀。额外路径、缺少本批路径、重复文件、非法依据、重复caseId/entryPoint均拒绝。修复同样分批，保留原候选的caseId/entryPoint/testPath，不通过删除失败项使参考通过；可根据诊断修正断言与预期。

非法回答和诊断保存为受限 CAS 证据；SDK 超时的中断输出由会话记录保留。每个计划/批次经Schema及业务校验后立即通过Application保存CAS和独立checkpoint。提交绑定原角色命令、冻结输入、有效Prompt、阶段和冻结计划（本批用例与公共定义），超时/取消时已提交部分仍为生成进度；它们不是已验证测试，也不能进入重建评测或Gate。恢复相同Run/命令时只执行未完成部分，不能在输入变化后拼接旧片段。单角色总预算仍为10分钟，各批不重新获得10分钟预算，外层Run预算也不增加。

完整测试集经最终结构和关联检查后才提交testCandidates，随后沿用原实现统一编译、逐项行为评测、一次有限修复和通过后的整体冻结。不提前逐批冻结，也不改变原始源码或固定验收答案。模型只用read_material；不因保存批次而开放任意文件写入。独立角色入口和自动工作流通过同一RoleExecution接入持久进度。


### 首次生成并校验

框架确认没有适用于当前源码的固定测试后，调用 TestGen。Prompt 要求只据源码和接口编写测试、提供真实依据，并遵守路径与入口限制。

例如，源码中的 calculate() 返回 4，测试应检查返回值为 4。若生成测试误写成 3，执行器先在原始源码副本上编译运行，就能发现这一错误。通过参考校验后才固定测试集，用它评测重建实现。

这一步暂时假设参考实现正确，用来发现测试编译、运行或预期错误。参考校验失败不能直接算作文档或重建代码错误；这也不能证明原始业务逻辑正确。

### 根据失败证据修复

首次候选发生普通编译、运行或断言失败时，Application 将完整候选和失败证据交回 TestGen，在预算内修复后重新校验。正常通过不进入修复。

修复由 maxTestRepairs 控制，默认 1 次，可设置 0～3 次。它属于同一业务轮次内的尝试，不额外消耗文档修订轮次；每次修复使用独立执行键，中断后可复用已提交候选和校验记录。

### 复用已固定测试

源码身份由选定模块、源码/接口路径及内容摘要确定。源码不变，即使改文档、提示词、编写配置，或发生无关 Git 提交、新建 Run，都继续读取已固定集合，在当前环境重新编译运行。源码改变后才为新源码建立测试集。

并发任务同时产生测试时，仅保存首个通过的集合，其他任务重新校验实际保存的那套。固定测试在新环境失败时停止处理，不能自动改测试来换取通过。

### 记录每个用例的执行事实

框架为每项测试追加单入口 runner。外部监督器为用例独立启动进程，观察是否真正进入、是否正常返回及返回值；不同用例不依赖前一进程的全局状态。

普通失败后仍调度后面的用例，所有用例共享原运行命令的超时和输出预算。预算耗尽时，剩余项记录调度及未完成情况。只有清单完整执行且全部通过，才可能得到 PASS。

## 4. 关键约束与失败处理

### 文件和入口

caseId 与 entryPoint 必须唯一，入口是合法 C 标识符。每项 testPath 指向实际生成的测试源文件，sourceEvidence 只引用授权源码；源文件缺关联用例、头文件冒充入口、越权文件或虚构依据均拒绝。

测试定义 `int entryPoint(void)`，返回 0 为通过，非 0 为失败；禁止定义 main。缺材料或非法输出按 [Agents](../Agents.md) 的共同规则失败。

### 构建命令与路径

referenceCommands/finalCommands 必须提供可解析的 gcc/g++ 编译命令，显式包含测试源文件、唯一 -o 输出及对应的 binary 运行命令。执行器分别依据每条命令的 cwd 规范化源码、输出和运行路径，允许仓库内的 `.`/`..`，拒绝越界及符号链接逃逸。

例如，cwd=build 时可编译 ../tests/generated.cpp -o test-bin；运行命令可以从 build 执行 test-bin，也可以从根目录执行 build/test-bin。原有宏、头文件目录、链接及运行参数必须保留，附加检查命令也不能丢弃。无法绑定时报告配置错误，停止并转人工，不让模型改测试来补救配置。

### 可信执行记录

stdout/stderr 仅作日志。测试打印的 TAP、成功总数或自称完成记录不能当作执行证明。监督器通过子进程已关闭的独立结果通道报告，协议为 native-cases-v2-supervised。

证据绑定源码提交、测试源码摘要、清单摘要和重建文件摘要。缺入口、缺符号、提前退出、缺项、重复或未知记录及监督失效均不得 PASS；附加命令和重复执行不能抵消缺项。旧 nonce/stdout 协议结果不能恢复为当前通过证据，也不能通过重新生成绕过迁移，必须停止交人工。

监督器要求 Linux x86_64、可用 ptrace、gcc/nm、保留的入口符号及 PTRACE_GET_SYSCALL_INFO。它在系统调用前检查 ABI 和许可范围，允许必要的只读文件、内存、时间操作及 stdout/stderr 写入；拒绝其他描述符写入、文件修改、派生进程、再次 exec、ptrace、修改其他进程内存及未知 syscall。允许仅向自身发信号，使 assert/abort 仍可归为普通测试失败；向监督器或其他进程发信号则拒绝。

### 停止与交接

准备环境失败、超时、工具不可用、命令无法绑定时直接停止，不进入模型修复。修复预算耗尽或固定测试失败也停止，保存候选、失败原因及下一步建议。

无法继续时返回 testValidationRequired，经 STOPPED 交给人工处理，不把候选测试失败直接交给 Review 修订知识。

## 5. 验收场景

- **源码驱动的可执行测试。** 一份测试源文件加辅助头文件能真实编译执行；头文件作入口、源文件没有关联用例、虚构依据均拒绝。额外候选知识不得进入 Prompt 或工作区。
- **有界修复。** 首次编译或断言失败后，修复调用收到完整上一候选和证据；默认只修复一次，再失败停止。预算为 0 或环境失败时不调用修复模型。
- **固定测试不被重写。** 只改文档、提示词或新建 Run 时不重新生成；改源码得到不同源码身份。旧协议缓存必须停止，不能调用生成绕过。
- **按工作目录绑定。** 编译从 build 引用 ../tests/generated.cpp，运行从 build 或根目录指向同一产物，都可绑定；缺少源文件/输出对应关系、越界及不透明命令停止。
- **伪造通过不能掩盖漏执行。** 第一个入口读取 runner、打印三项 PASS 后退出，后两项实际返回失败：总体失败，后两个入口仍应启动。
- **监督失效不得降级通过。** 验证正常返回、断言、自身信号、超时、伪造结果通道、修改文件/进程、缺符号及内核拒绝 ptrace；缺少可信完成事实时不能退回 stdout 计数。

生成、修复、复用及原生监督已有角色、集成和真实编译回归。受控端到端使用预设模型回答，既往证据的执行版本见文末报告。

## 6. 未实现与待定事项

先在原始源码校验测试是 2026-09-10 暂时同意保留的规则，已经实现，但仍非最终产品定案。

复杂构建脚本需要进一步适配，当前支持范围不等于任意原生命令或完整部署沙箱。原始源码正确性、测试覆盖率及真实模型生成质量尚未验收。例如，入口直接返回 0 而没有有效断言，监督器可以证明它执行过，却不能证明该测试有效。

## 7. 实现及测试索引

角色 ID：`test-gen`。输入引用包括 sourceSnapshotRef、publicInterfaceRefs、testPolicyRef；修复使用 previousCandidateRef、validationFailureRef。case 字段为 caseId、testPath、entryPoint、target、input、expected、sourceEvidence，其余字段见 Contract。

规则对应：源码依据为 IO-02；可执行测试为 IO-11；参考校验为 IO-12；固定复用为 IO-13；有限修复为 IO-21。文件与入口验收为 AC-AGENT-101；构建绑定及 cwd 为 AC-AGENT-102、AC-AGENT-102-R1；逐项完成及防伪为 AC-AGENT-103、AC-AGENT-103-R1。

- 文件和入口约束：[TestEntryContract.test.ts](../../../../../tests/integration/TestEntryContract.test.ts)。
- 分批保存、超时后重启续跑及完整五项参考编译执行：[TestGenerationProgress.test.ts](../../../../../tests/integration/TestGenerationProgress.test.ts)。
- 修复、停止与跨 Run 复用：[TestGenExecution.test.ts](../../../../../tests/integration/TestGenExecution.test.ts)。
- 源码身份及修复策略：[TestSuitePolicy.test.ts](../../../../../src/domain/agents/testGenAgent/TestSuitePolicy.test.ts)。
- 构建参数及 cwd：[TestBuildBinding.test.ts](../../../../../tests/integration/TestBuildBinding.test.ts)。
- 逐项执行与旧协议拒绝：[TestCaseExecution.test.ts](../../../../../tests/integration/TestCaseExecution.test.ts)。
- 外部监督及攻击回归：[NativeCaseSupervisor.test.ts](../../../../../tests/integration/NativeCaseSupervisor.test.ts)。
- 完整修复材料与失败交接：[AgentSpecRegression.test.mjs](../../../../../tests/integration/AgentSpecRegression.test.mjs)。
- 执行器设计：[Evaluation.md](../../../infrastructure/evaluation/Evaluation.md)。
- 既往执行版本与产物：[AgentSpecRepairAndE2E.md](../../../../reports/AgentSpecRepairAndE2E.md)。

执行版本为 `domain-agents-v12-testgen-batches` / `contract-v12`；旧原子输出 checkpoint 不能改标识后恢复。

代码位置：[分批生成](../../../../../src/domain/agents/testGenAgent/TestGeneration.ts)、[进度保存](../../../../../src/application/services/TestGenerationProgress.ts)、[执行入口](../../../../../src/domain/agents/testGenAgent/TestGenAgent.ts)、[输入输出契约](../../../../../src/domain/agents/testGenAgent/TestGenAgentContract.ts)、[提示词与读取范围](../../../../../src/domain/agents/testGenAgent/TestGenAgentPrompt.ts)、[角色测试](../../../../../src/domain/agents/testGenAgent/TestGenAgent.test.ts)、[独立样例](../../../../../src/domain/agents/testGenAgent/examples/TestGenAgentSample.json)。
