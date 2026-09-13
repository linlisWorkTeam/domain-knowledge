# 最新网页部署交接

用户明确要求先部署网页。本轮从干净 ec72c43893d8b929e29484e4368e54c9ebded511 创建独立发布目录 /root/projects/domain-knowledge-releases/2026-09-14-workbench-ec72c43/app，复制独立依赖，未改 v0.2.0 发布。类型/Spec 检查通过，来源范围、补证目标、下载、页面、准备及发布证据共 26 项测试通过（TargetedTests.log）。完整当前原生回归仍未完成。

切换前生产库无 RUNNING/PENDING/QUEUED 阶段；停止旧 Console 后完整备份原 runtime 到发布目录 data-backup（0700），保留 PreviousStart.sh。启动入口 /tmp/mvp-frontend-review/start.sh 已更新。Ctrl-C 后旧 tmux session 自动退出，respawn 未找到 pane；随后成功新建同名 mvp-console-review，不影响原隧道 mvp-console-tunnel。当前继续使用 /root/.local/share/domain-knowledge-mvp/data，免登录可写；未删除知识库。

公网 https://contract-strict-warren-theories.trycloudflare.com 经真实 HTTP 验证：首页、health、system/status、system/capabilities、cards 及两份变化 JS 均 200；directEditing/writeEnabled=true，JS 与新发布文件逐字节一致。Deployment.json 保存结果。此次未运行新浏览器截图，避免与真实模型/原生队列竞争资源；旧截图不代表此次验证。临时网址随隧道/主机停止失效。回滚可恢复 PreviousStart.sh 后重启同名 Console，数据备份保留。

完整五环节任务仍未完成。真实 C source54a293 PID3596179 仍 RUNNING，本轮末33调用748442 tokens；源日志 /tmp/SourceAfterTargets.log。应用回归队列 PID3605442 和后续 C++重建队列 PID3615972 均保留，未重启或取消。下一轮继续按0134记录核对来源终态、应用测试、C++新配置重建与37/40门禁绑定，补齐完整真实验收、浏览器与报告。部署完成不等于知识已验证发布。
