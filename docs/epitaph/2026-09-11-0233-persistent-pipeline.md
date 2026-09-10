<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接持久化五阶段一键流程和真实浏览器验收。
-->
# 持久化五阶段流程

工作树 /tmp/domain-knowledge-workbench，feat/five-stage-workbench，基线3d82c6a。原wxc、线上taste/4310和v0.2.0保留，未清理旧知识。完整目标仍未完成。

Domain WorkbenchPipeline定义knowledge-pipeline-v1和推进门禁；Application复用五个独立阶段的prepare/start用例。SQLite独立协调租约不占Stage执行槽，先持久化子任务再启动，重启保留同任务输入与累计预算。失败/取消停在原阶段，取消等待子任务退出，环境摘要变化暂停旧流程；成功任务复用，行为失败不进入关联。发布始终另行判定。HTTP增加workbench-pipelines列表/详情/启动/取消/同版本恢复，Console增加五阶段状态、产物下载和恢复操作。验收脚本新增--mode pipeline及--resume-pipeline。

真实运行目录 /tmp/workbench-native-acceptance-20260910，固定源码和scope继续见Targets.json、前两份墓志铭。jsmn pipeline-ace3b6276ebbc475c550861ab67a8649ed078ec7310ce690c70e36a56e645cc3完成全部阶段。复用7卡/索引，Code真实请求1次约525秒；继承历史16与15共31可信用例，重新验证参考与生成均31/31，无新增TestGen请求；复用40条库内关系。累计15调用218936tokens包含历史生成，重复启动同pipeline/taskIDs且累计用量不变。当前TinyXML2未重跑，旧37/37仅旧引擎证据。无知识发布。

验证：typecheck、Spec、架构8、domain52、integration200、Console30通过；追加真实页面检查发现关联summary.cards是数字，页面曾误当数组。修复Array.isArray判别后新增浏览器回归1项通过；真实jsmn桌面/390窄屏显示31/31和40关系，无横向溢出且卡片可读。未修改视觉基线或降低阈值。报告/日志/截图 /root/projects/domain-knowledge-releases/2026-09-10-workbench-progress/pipeline/。所有模型/native/browser进程已结束。

后续仍需规范化代码/结构差异和证据定位修订、外部指定材料关联、固定质量发布门禁、TS统一边界/markdownLite、构建配置实际应用、按项目统一导航、最终双目标完整真实运行及网站部署。下方旧独立阶段面板仍按全局最近任务读取，可能与上方项目不同，勿宣称多项目导航完成。pipeline-v1每阶段一个冻结子任务；知识修订循环需显式新执行契约及迭代历史，不能覆盖已有成功输入。工具链引擎文件变更会改变fingerprint；避免无必要重跑真实Code。服务器仅约268MiB磁盘，资源预检不足时暂停，不撤隔离；重任务/模型/浏览器必须串行。用户允许空间不足时删旧生成知识，但优先保留当前验收和审计证据，密钥不得输出。
