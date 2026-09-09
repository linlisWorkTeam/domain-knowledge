<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：说明 Linux 离线安装包的构建、运行、发布和升级操作。
-->
# Linux 安装与本地发布

本版安装目标为 OpenCloudOS 9.4 x86_64。浏览器访问服务，安装包包含 Node.js、Git、Bubblewrap、Bash、prlimit、OpenSSH、DSH、应用依赖和 TypeScript 工具；安装及代表模块构建不运行 npm install。真实模型和手动 Git 同步仍需要网络。Windows 和整个桌面项目构建不在本版范围。

设计参见 [应用层](specs/application/Application.md)、[HTTP API](specs/interfaces/HttpApi.md)、[SQLite 与工件](specs/infrastructure/sqlite/Sqlite.md)。发布验收状态以同版 Release 的证据为准；有构建产物不代表真实模型验收已通过。

## 构建安装包

在完成 worktree bootstrap 的干净提交中，使用 Node 24 执行：

```sh
node scripts/release/BuildLinuxBundle.mjs 0.2.0 /tmp/knowledge-release
```

构建脚本不下载依赖，并要求工作树无修改。它从 Git 跟踪文件清单提取应用，复制当前已锁定的依赖，串行计算每个文件摘要，以 gzip 低压缩等级限制 ECS 资源占用，并去掉 gzip 时间戳以保持构建可复现。构建还验证 TypeScript 的 Linux x64 原生编译器存在，修复 Git helper 在安装布局中的相对链接，记录全部包内符号链接并拒绝越界。工具清单记录版本、SHA-256、源码提交和 lockfile 摘要。`Manifest.json`、`ThirdParty.json` 和 Node/Git/Bubblewrap 许可证随包提供，依赖自带许可证保留在 node_modules 中。

宿主必须提供 tar、gzip、cp、ldd 和安装工具的许可证路径。当前实现使用匹配系统的动态库；打包机和验收机必须都为 OpenCloudOS 9.4 x86_64。实际打包、干净安装和真实模型验收应顺序执行，不与完整回归或浏览器进程并发。

## 安装与启动

下载 `.run` 和同名 `.sha256` 后，在下载目录执行：

```sh
sha256sum -c domain-knowledge-0.2.0-linux-x86_64.run.sha256
sh domain-knowledge-0.2.0-linux-x86_64.run --prefix /opt/domain-knowledge
/opt/domain-knowledge/knowledge check
/opt/domain-knowledge/knowledge start
```

无权限写 `/opt` 时选择当前账户可写的绝对目录；默认路径为 `$HOME/.local/share/domain-knowledge`。不需要预装 Node、Git、DSH、TypeScript 或 npm。系统基础 shell、tar、gzip、sha256sum 和支持用户/进程/网络命名空间的内核仍是操作系统要求。

默认地址为 `http://127.0.0.1:4310`。首次启动生成 `data/Configuration.env`，权限为 600，包含随机访问令牌。将令牌值输入浏览器的治理模式认证框。模型 API 地址、`deepseek-v4-flash` 与 API Key 在「Agent 设置」页面配置并验证。密钥不应写入源码、截图或发布证据。

浏览器「批次」页选择的是服务器上的项目仓库目录。目录必须属于服务器允许范围。点击「启动知识飞轮」运行固定 markdownLite 场景，最多 3 轮、30 分钟，角色串行，复用批次进度、取消与评测证据。机器不支持隔离时，启动明确失败并记录 `data/isolation-check.log`。

配置 `WP_KNOWLEDGE_HOST`、`WP_KNOWLEDGE_PORT` 可改变监听地址；远程 API 访问必须提供访问令牌。通过 SSH 端口转发或已有 HTTPS 反向代理访问，可保护传输中的令牌和模型凭据。目录浏览和本地发布设置读取在本机也需要认证。

## Markdown 发布与 Git

在「Agent 设置 → 本地发布与 Git 同步」读取设置，选择独立的空知识目录。默认目录位于运行数据目录中。工作流取得领域发布凭据后，自动生成每版本 `Knowledge.md` 和 `Provenance.json`，来源提交、摘要、运行、版本和门禁证据可追踪。候选和拒绝知识不会进入此目录。

文件写入失败会保留 SQLite 中的 PENDING 发布日志；恢复操作完成原发布，保持相同路径、内容与时间。正文或来源文件遭修改会阻止恢复和同步；处理问题后重试，不得用修改预期测试的方式使候选通过。

Git 默认关闭。填写 HTTPS/SSH 仓库地址、分支和可选 HTTPS 令牌，保存后点击「立即同步 Git」。该目录由产品建立独立仓库，只提交已发布的正文、来源文件与目录标记。令牌保存在权限受限的运行数据库中，读取 API 不返回令牌；SSH 使用服务器已配置的身份。同步不自动触发，也不强制推送。认证和冲突失败不撤销本地发布；在独立知识仓库处理远端分歧后可以重试。

## 停止、升级和卸载

```sh
/opt/domain-knowledge/knowledge status
/opt/domain-knowledge/knowledge stop
sh domain-knowledge-0.2.1-linux-x86_64.run --prefix /opt/domain-knowledge
/opt/domain-knowledge/knowledge start
/opt/domain-knowledge/knowledge uninstall
```

版本位于 `versions/<version>`，`current` 与启动器分别原子切换，临时链接在失败时清理。安装目录和独立数据目录采用 700 权限，配置文件拒绝符号链接。升级先停止旧服务，并保留 `data/` 中的配置、SQLite、正文工件和运行记录；相同版本重复安装会拒绝覆盖。`WP_FLYWHEEL_HOME` 可指定独立的数据目录。卸载默认只移除应用版本和启动器，保留用户数据与外部知识仓库。恢复旧应用版本不允许跨执行契约版本恢复未完成运行。

## 真实模型验收入口

先在浏览器配置并验证 `deepseek-harness` / `deepseek-v4-flash`，停止网页服务后复用同一数据目录运行验收。入口不接受 API Key 参数，不自动验证模型连接，也不使用环境变量中的未验证凭据作为后备配置。在源码工作树中使用 Node 24：

```sh
GOMAXPROCS=1 NODE_OPTIONS=--max-old-space-size=384 node scripts/release/RunMvpAcceptance.ts \
  --source /srv/ohMyWorkPanel \
  --runtime /srv/domain-knowledge-data \
  --evidence /srv/domain-knowledge-evidence
```

安装版使用 `current/tools/bin/node` 和 `current/app/scripts/release/RunMvpAcceptance.ts`，并设置与启动器一致的工具环境：

```sh
acceptance_app=/opt/domain-knowledge/current
export PATH="$acceptance_app/tools/bin:$acceptance_app/app/node_modules/.bin:$PATH"
export LD_LIBRARY_PATH="$acceptance_app/tools/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export GIT_EXEC_PATH="$acceptance_app/tools/git-core"
export WP_DSH_BWRAP_BIN="$acceptance_app/tools/bin/bwrap"
GOMAXPROCS=1 NODE_OPTIONS=--max-old-space-size=384 node \
  --env-file=/opt/domain-knowledge/data/Configuration.env \
  "$acceptance_app/app/scripts/release/RunMvpAcceptance.ts" \
  --source /srv/ohMyWorkPanel --runtime /opt/domain-knowledge/data \
  --evidence /srv/domain-knowledge-evidence
```

预检核对已有配置验证状态、精确模型名称、固定源码及参考测试摘要、内核隔离、独立发布目录和证据目录可写性。预检不调用模型，失败不消耗启动次数。通过后，在调用生产 `markdownLite.start` 前先持久化 `MvpAcceptanceLedger.json` 占额；此后启动失败、取消、中断都保留已消耗次数，同一运行目录累计最多 3 次。不要删除账本或更换运行目录规避上限。每次仍受最多 3 轮、30 分钟预算约束；不要与打包、浏览器测试或其他飞轮并行运行。

`SIGINT` / `SIGTERM` 会取消飞轮并等待子进程关闭后退出。`SIGKILL` 等非正常终止留下的 STARTING / RUNNING 记录继续计数；下次运行在核对 `/proc` 进程身份后可回收完整的死进程锁。不完整锁或残留清理锁会失败关闭，需要管理员确认进程已退出后只处理锁文件，保留账本。

每次输出 `MvpAcceptance-<次数>.json`，只包含运行编号、固定源码与依赖摘要、门禁计数、工具摘要、证据引用和本地发布路径；不包含模型响应原文、API URL 或密钥。退出码 0 表示七角色完成、确定性门禁通过且本地发布可读取，1 表示预检或验收失败，130 表示取消。失败报告不能作为已验收 MVP 的发布依据。

## 发行验证

Release 必须来自通过验收的同一提交，核对受测 `.run` SHA-256，再上传安装包、摘要、工具清单、许可证清单和说明。干净环境应验证：断网安装与启动、浏览器配置、隔离探测、代表模块构建、运行取消、自动发布、重启恢复、升级保留、卸载保留数据。真实模型验收另行记录运行编号、固定来源与门禁摘要、结果和本地发布路径；不得将 fixture 回归标注为真实模型通过。
