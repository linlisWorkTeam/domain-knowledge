<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：Console 与网站交互设计。
-->
# Console 与网站交互设计

代码位置：[web/index.html](../../../web/index.html)、[web/App.js](../../../web/App.js)、[web/Styles.css](../../../web/Styles.css)、[site/index.html](../../../site/index.html)、[src/interfaces/runner/ConsoleReadModel.ts](../../../src/interfaces/runner/ConsoleReadModel.ts)。


## 用户任务与信息结构

生产导航唯一有效版本为“操作中心、飞轮批次、知识、工作流图、评测、来源、Agent 设置”。`web/prototype/` 是历史原型参考，当前运行界面由 web 根文件实现；网站 site 负责介绍项目和指向工程入口。

批次列表回答状态和阻塞原因，详情展示节点、轮次、尝试、证据、Gate 和发布回执。知识页区别 CANDIDATE、LOW_CONFIDENCE、VERIFIED 和 SUPERSEDED；工作流图只读，不能拖拽改连接或逐节点推进。操作中心展示需要处理的事实，普通自动迭代不要求人工确认每一步。

## 交互状态

| 页面行为 | 读取事实 | 用户动作及结果 |
| --- | --- | --- |
| 启动与观察 | Run、节点投影、事件与进度 | 提交场景；取消传播到执行器；恢复须通过兼容检查 |
| 待处理事项 | 类型、原因、revision、allowedActions | ACKNOWLEDGE / RESOLVE 等合法动作，冲突刷新后处理 |
| 知识与评测 | 来源、Diff、规则修订、证据引用 | 只读审查，反馈或重建新批次，不直接发布 |
| Agent 设置 | 固定职责和模型可用性 | 只允许编辑 promptAddon；模型设置由服务端保存并验证 |

信息缺失显示“暂无数据”或不可用，不能显示虚构 0 分、百分比或 ETA。执行阶段与业务状态分开呈现，错误摘要说明原因和下一步。

可恢复执行失败显示“执行失败”，详情保留“业务阶段：生成中”等历史阶段并展示安全错误码、失败节点及恢复条件；不计入运行中，不提供取消。列表支持独立“执行失败”筛选。只有当前活动执行显示运行阶段及取消；恢复需要治理认证，成功或拒绝后刷新执行事实并保留原预算。已取消执行中的历史 RUNNING 节点显示“历史节点状态：运行中”，不代表仍有活动进程。

模型设置在验证按钮旁明确说明会发送一次最多 64 输出 token 的最小生成、可能产生少量费用且不会自动重试。验证中禁用重复点击，分别显示模型列表和最小生成检查结果；旧的仅列表验证要求重新验证，不自动发送请求。API Key 和治理令牌不进入浏览器持久化或截图证据。针对性受控回归见 RunExecutionConsole 和 Console 浏览器用例。

## 视觉与可访问性

Console 与网站分别保存主题偏好，支持浅色/深色及系统初始主题。中文术语保持一致，状态同时使用文字与颜色，键盘可操作、焦点可见，200% 缩放不遮挡关键读取路径；页面资源同源提供。证据细节按需展开，不将内部数据库、SDK 会话或凭据配置细节放进普通业务流程。

接口以 [Preview HTTP API 规范](../interfaces/HttpApi.md)为准；本设计不复制路由实现。

## UI 需求

| ID | 优先级 | 需求 | 验收场景 |
| --- | --- | --- | --- |
| KF-UI-001 | P0 | 用户必须能从一个高层入口启动自动 Run，不接触裸状态转换。 | AC-UI-001 |
| KF-UI-002 | P0 | Run 工作台必须从服务端 snapshot 和事件显示状态、节点、迭代和 Gate。 | AC-UI-002 |
| KF-UI-003 | P0 | 正常 `ITERATE/ROLLBACK/PASS` 路径必须自动推进，前台不得要求逐节点点击。 | AC-UI-003 |
| KF-UI-004 | P0 | Quality Gate 与 Behavioral Gate 必须分区展示，并解释 `ACCEPTED` 不等于 `VERIFIED`。 | AC-UI-004 |
| KF-UI-005 | P0 | 用户必须能从 Run 追踪到 Correction、版本、Evidence、GateDecision 和 receipt。 | AC-UI-005 |
| KF-UI-006 | P0 | 只有 `STOPPED/LOW_CONFIDENCE/FAILED` 或策略要求批准时进入治理队列。 | AC-UI-006 |
| KF-UI-007 | P0 | 只读、未授权和写入关闭必须具有不同且可理解的界面状态。 | AC-UI-007 |
| KF-UI-008 | P0 | 高风险操作必须受权限保护、显式确认、幂等并记录事件。 | AC-UI-008 |
| KF-UI-009 | P1 | 用户可以比较知识版本，并确认 Correction 之外的范围未变化。 | AC-UI-009 |
| KF-UI-010 | P1 | Run 必须支持断线重连和按 `event_seq` 恢复，不丢失已持久化状态。 | AC-UI-010 |
| KF-UI-011 | P1 | 知识消费者可以在不获得发布权限的情况下查询和反馈。 | AC-UI-011 |
| KF-UI-012 | P1 | 界面必须满足键盘导航、可见焦点、语义标签和非纯颜色状态表达。 | AC-UI-012 |
| KF-UI-013 | P1 | 项目官网和本地 Console 必须提供深色/浅色主题，首次跟随系统、允许手动切换并独立保存偏好；主题切换不得持久化治理凭据或改变领域状态。 | AC-UI-013 |
| KF-UI-014 | P0 | Agent 设置页面必须显示全部 Agent 的固定职责、输入输出、基础提示词和追加提示词；每个批次中的 Agent 节点状态在批次工作台和工作流图显示。 | AC-UI-014 |
| KF-UI-015 | P0 | 治理模式只能修改 Agent 的追加提示词；服务端必须拒绝任何拓扑、职责、Schema、Provider 实现或权限替换。 | AC-UI-015 |
| KF-UI-016 | P0 | Run 工作台必须显示 LangGraph 节点投影，并明确区分执行状态与 FlywheelRun 业务状态。 | AC-UI-016 |
| KF-UI-017 | P1 | 项目官网和控制台的用户可见文案必须使用自然、统一的中文；品牌、项目名、`Agent`、API/协议缩写、代码字段、枚举原值和技术标识符可以保持原值，其他栏目名、状态名或说明句不得中英文混用。 | AC-UI-017 |
| KF-UI-018 | P0 | 写入关闭时，设置页必须提供 `.env.local` 的创建位置、变量示例和重启方式；配置前所有写操作仍默认拒绝，治理令牌只保存在页面内存中。 | AC-UI-018 |
| KF-UI-019 | P0 | 前台只能展示服务端事实或具有公开计算规则的派生值；缺少领域模型或 API 支持的指标、身份、问题和关系不得以模拟数据呈现。 | AC-UI-019 |
| KF-UI-020 | P2 | 左上角项目空间必须在后续阶段升级为真实选择器；选择项、当前项目空间和切换后的数据范围均由服务端事实驱动，本阶段不得实现无效下拉框。 | AC-UI-023 |
| KF-UI-021 | P1 | 设置页必须支持本地管理员配置模型 API URL 与 API Key；有效配置启用后，新任务默认使用 DSH 工具执行，且不得削弱既有 Agent 权限、隔离、审计和 Gate。 | AC-UI-024 |

## UI 验收

| ID | 场景 |
| --- | --- |
| AC-UI-001 | Given 有效来源和 Policy，When 用户确认创建 Run，Then 系统返回 runId 并自动进入工作流，页面没有手动状态推进控件。 |
| AC-UI-002 | Given 一个活动 Run，When 打开工作台，Then 状态、迭代、节点和事件均来自服务端且刷新后保持一致。 |
| AC-UI-003 | Given 首轮评测失败且预算充足，When Gate=`ITERATE`，Then Review、局部修订、fresh CodeGen 和复评自动发生。 |
| AC-UI-004 | Given Quality=`ACCEPTED` 但无 PASS Gate，When 查看知识，Then 页面仍显示 `CANDIDATE` 并禁止发布表述。 |
| AC-UI-005 | Given 一个 `VERIFIED` 版本，When 从详情逐层导航，Then 能定位原 Run、输入、Correction、评测证据、Gate 和 receipt。 |
| AC-UI-006 | Given Gate=`STOPPED`，When事件到达，Then Run 进入治理队列，页面说明原因、未解决风险和允许动作。 |
| AC-UI-007 | Given未配置 token、错误 token 和有效 token，When进入控制台，Then分别显示只读、未授权和治理模式。 |
| AC-UI-008 | Given用户取消活动 Run，When确认影响，Then请求带幂等键，重复提交只产生一个取消结果和审计事件。 |
| AC-UI-009 | Given Correction 仅指向一个知识章节，When查看 v1/v2 Diff，Then明确显示目标章节变化和范围校验结果。 |
| AC-UI-010 | Given浏览器在第 N 个事件后断线，When恢复，Then先读取 snapshot，再从 N 后续传且事件不重不漏。 |
| AC-UI-011 | Given只读知识消费者，When查询并提交 feedback，Then反馈被记录但知识状态和 GateDecision 不变。 |
| AC-UI-012 | Given仅键盘和屏幕阅读器，When完成查询并打开 Run Gate，Then焦点顺序、名称、状态和错误均可感知。 |
| AC-UI-013 | Given 系统主题为浅色、无已保存偏好，When 首次打开官网或 Console，Then 使用浅色 token；When 用户切换深色并刷新，Then 主题保持且页面没有保存治理 token、发出写请求或改变 Run 状态。 |
| AC-UI-014 | Given 已启动或未启动工作流，When 打开 Agent 设置页面和批次工作台，Then 七类 Agent 均可查阅，固定契约与可编辑提示词分离，节点状态按 runId 展示。 |
| AC-UI-015 | Given 有效写 token，When 保存 promptAddon，Then 后续执行使用该值并产生审计；When 请求包含 role、inputs、outputs、tools 或 edges，Then 服务端拒绝。 |
| AC-UI-016 | Given LangGraph 正在运行，When 打开 Run 工作台，Then 页面从 Knowledge Registry 的节点投影显示 pending/running/completed/failed，不把 graph route 当成知识发布状态。 |
| AC-UI-017 | Given 用户打开项目官网或控制台，When 阅读栏目、状态、说明和错误提示，Then 除品牌、项目名、`Agent`、API/协议缩写、代码字段、枚举原值和原样技术标识符外，页面不出现英文栏目或未经批准的中英文拼接句；`Registry` 写作“注册”，`Run` 的动作与实体语义分别写作“运行”与“批次”。 |
| AC-UI-018 | Given 服务端未配置写入令牌，When 用户点击治理模式或打开设置页，Then 页面引导其从 `.env.example` 创建 `.env.local`、设置 `WP_KNOWLEDGE_WRITE_TOKEN` 并重启服务；令牌不会被写入网址或本地存储。 |
| AC-UI-019 | Given 服务端只提供当前已实现 API，When 用户访问新版控制台全部页面或任一 API 失败，Then 页面保留原型规定的信息结构，但只显示服务端事实、规范允许的派生值或明确的 `—`/Empty/Partial/Disabled 状态，不显示模拟 Knowledge Health、ETA、Graph、Action Item、Activity、Workspace 或用户身份数据。 |
| AC-UI-020 | Given Chromium 视口固定为 `1363 × 936`，When 打开浅色操作中心，Then 顶栏高度为 `103px`、标题顶部位于 `40–45px`、操作区垂直居中、全局字号为 `14px`，并通过已提交基准图的像素回归。 |
| AC-UI-021 | Given 用户在七个一级页面之间导航，When 页面完成渲染，Then Topbar 是唯一的页面级标题来源，内容区不得重复同名标题或增加无功能含义的眉标题、副标题和说明卡。 |
| AC-UI-022 | Given 用户打开中文 Console，When 浏览正文、标题、按钮、标签和工作流图，Then 这些界面文字使用以微软雅黑为首选的中文无衬线字体栈；只有代码、ID、哈希、原始技术值和时间允许使用等宽字体，普通中文文案不得回落到宋体。 |
| AC-UI-023 | Given 服务端提供项目空间列表和当前选择，When 用户从左上角切换项目空间，Then 全部页面按所选项目空间重新查询且不泄露其他空间的数据；URL 或会话可以恢复选择，不可用或无权限的空间给出明确错误并保留原选择。 |
| AC-UI-024 | Given 本地管理员在设置中提交合法 API URL 和 API Key，When 主动执行模型列表与最小生成验证成功并启用配置，Then 新任务默认通过 DSH 工具执行；界面和查询接口只显示脱敏配置状态，完整 Key 不进入 URL、日志、浏览器持久化或运行快照；验证失败时分类提示并失败关闭。 |

文档关系：[设计目录](../README.md)负责代码与设计定位；[开发指南](../../Development.md)说明修改和交付步骤。

## 已验收主题色约定

Site 与 Console 的明暗模式分别保存偏好，登录令牌不写入 localStorage。以下色值与现有页面契约一致，后续视觉变更同时更新设计与截图审阅证据。

|语义|深色|浅色|
|---|---|---|
|背景|#080b10|#f4f7f9|
|表面|#10151d|#ffffff|
|正文|#eef2f7|#17212b|
|次要文字|#9aa8ba|#586b7d|
|成功|#76efbd|#087c58|
|警告|#ffd27d|#92610f|
|失败|#ff7d8e|#b62f48|
|治理|#c7a6ff|#7250a8|
|Site 强调|#71d4ff|#07769f|
|Console 强调|#55e6b5|#0b9d72|
