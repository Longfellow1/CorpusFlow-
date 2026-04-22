# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.0] - 2026-04-22

### 🎉 Open Source Release
- Initial public release of CorpusFlow
- Full three-tier architecture (React/Express/FastAPI) ready for production
- Complete documentation and one-command setup script

## [Unreleased]

### 安全与健壮性
- JWT 认证替换假 dev-token 方案（HMAC-SHA256，7天有效期）
- 文件写入加 Promise-chain 互斥锁，防并发数据损坏
- 所有 seeds/generated 路由加 `assertTaskOwner` 所有权校验，防跨用户越权访问
- CSV 导出加 RFC 4180 规范 + 公式注入防护（`=+-@` 前缀转义）
- Python 服务加 Pydantic 参数校验（`n` 范围 1–50、`temperature` 0–2、`type` 枚举）
- 加 content safety 双向过滤（输入 + LLM 输出均检测）
- 加 prompt injection 防护（XML 边界标签 + 1000 字截断）

### 功能新增
- 快速任务模式支持 4 种微调数据类型：`qa` / `instruct` / `multi` / `code`
- `instruct` 类型生成标准 Alpaca 3 字段（`instruction / input / output`）
- `multi` 类型生成 ShareGPT 多轮对话格式（`conversations` 数组，`from: human/gpt`）
- `code` 类型生成代码相关指令数据
- 导出支持 JSON / CSV / JSONL 三种格式
- JSON/JSONL 导出自动剥离 `id`、`seedIndex` 等内部元数据字段
- `instruct` 模式 `instruction_template` 必填校验（前端禁用 + 后端 422 拦截）
- `qa` / `instruct` 类型每条 seed 生成前自动注入五元组语义分析上下文（意图/主体/动作/客体/修饰词 + AI 实体泛化）
- 新增异步进度追踪：后端生成 `job_id`，前端可通过 `GET /api/algorithm/progress/:jobId` 轮询

### UI 重设计
- `QuickTaskWorkspace` 移除重复的右侧操作面板，信息与操作统一到左侧导航栏
- 左侧导航栏按用户流程重排：导入 → 配置（条件显示）→ 生成 → 导出+统计
- 4 种类型选择器采用 2×2 网格，色彩编码（qa=绿、instruct=靛、multi=紫、code=琥珀）
- 结果卡片按类型分 4 种渲染样式（qa/instruct/code/multi 各异）
- `instruct` 模式 instruction 为空时显示红色边框 + 错误文案，Generate 按钮禁用

### Bug 修复
- `data/algorithm.port` 端口从 `8001` 改为 `8000`，修复 Node 服务启动时连接旧 Python 服务的根本原因（导致所有字段返回空）
- 修复 `quick_generate_for_seed` 调用未定义函数 `call_llm_with_retry`，改用 `call_doubao_raw`
- 修复全局去重在 `instruct` 类型下因缺少 `q` 字段导致 `KeyError`，改为按 type 分支去重
