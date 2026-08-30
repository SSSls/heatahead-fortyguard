# FortyGuard Hackathon 提交检查表

## 必填链接

- [ ] Code repository：GitHub 或 GitLab URL
- [ ] Private repository only：已邀请 `hackathon@fortyguard.com`
- [ ] Live demo：https://heatahead-fortyguard.chunxusun2.chatgpt.site/
- [ ] Demo video：YouTube 或 Loom，最长 3 分钟

## 仓库

- [x] 应用目录为独立 Git 仓库
- [x] `.env*`、本地数据库、依赖、缓存和构建结果已排除
- [x] README 包含架构、运行方式、数据来源、模型边界和免责声明
- [x] FortyGuard key 仅在服务端运行时读取
- [ ] 已创建 GitHub / GitLab 远程仓库并推送冻结版本
- [ ] 若仓库为 private，已邀请评审邮箱

## Live Demo

- [x] Sites access mode 为 public
- [x] 无 Cookie、无登录请求返回 HTTP 200
- [x] 全新匿名作用域的 History 初始为空
- [x] 能提交一次真实 FortyGuard 分析
- [x] 异步运行从 `processing_spatial` 到 `processing_environment` 再到 `completed`
- [x] 结果、错误处理和免责声明可见
- [x] 页面、客户端脚本和分析响应不包含 API key
- [x] 关闭保存的 QA 运行完成后未留在匿名 History

## 视频

- [x] 已有三分钟中文脚本
- [ ] 已完成真实操作录屏
- [ ] 总时长不超过 3:00
- [ ] YouTube / Loom 链接允许任何持链接者访问
- [ ] 已在无痕窗口复核视频链接

## 最终提交

- [ ] 三个链接均使用最终生产版本
- [ ] 冻结后不再修改模型结论或 claim boundary
- [ ] 表单提交前逐项点击验证
