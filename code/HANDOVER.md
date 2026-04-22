# CorpusFlow 开发交接文档 (Handover Record)

## 1. 项目概述
CorpusFlow 是一个专为 AI 训练语料设计的生成与管理平台。它支持从种子 Query 出发，通过大模型（Gemini）进行深度语义解析、多维仿写、多轮对话生成以及指令微调数据的构建。

## 2. 当前技术栈
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Framer Motion, Lucide React.
- **AI Engine**: Google Gemini API (Direct client-side integration via `@google/genai`).
- **Persistence**: `localStorage` (按用户 Email 进行 Key 隔离)。
- **Concurrency**: 前端实现了最大 20 并发的 Worker Pool 调度。

## 3. 核心功能模块回顾
- **多模式生成**: 支持“单句仿写”、“多轮问答”、“指令微调”和“极速模式”。
- **批量任务流**: 包含“上传 -> 配置 -> 运行 -> 结果”的完整 PRD 链路。
- **用户系统**: 模拟登录/退出，资产（任务、语料）与用户邮箱绑定。
- **数据导出**: 支持 JSON 和 CSV 格式。

## 4. 下一阶段：后端集成预留建议

### 4.1 接口预留 (API Design)
建议后端实现以下 RESTful 接口，前端已在 `src/services/` 中预留了逻辑位置：

| 功能 | 建议路径 | 方法 | 说明 |
| :--- | :--- | :--- | :--- |
| **认证** | `/api/auth/login` | POST | 返回 JWT Token |
| **任务管理** | `/api/tasks` | GET/POST | 获取/创建任务列表 |
| **语料生成** | `/api/generate/process` | POST | 接收种子，返回 AI 解析结果 |
| **批量上传** | `/api/batch/upload` | POST | 处理 .txt/.csv 文件解析 |
| **数据同步** | `/api/sync` | POST | 将本地修改同步至云端数据库 |

### 4.2 配置项
- **VITE_API_BASE_URL**: 需在 `.env` 中配置后端地址。
- **GEMINI_API_KEY**: 建议从前端移除，由后端通过环境变量管理，前端仅调用后端代理接口。

## 5. 关键逻辑说明 (接棒必读)
1. **并发控制**: 见 `src/App.tsx` 中的 `handleGeneratePreview` 函数。使用了 `queue` + `workers` 模式，最大并发 20。
2. **数据隔离**: 目前通过 `corpusflow_tasks_${userEmail}` 存储。迁移至后端时，需在请求头带上 `Authorization: Bearer <token>`。
3. **语义解析链路**:
   - `analyzeSentence`: 提取 SPO 结构。
   - `generateParaphrases`: 基于解析结果生成变体。
   - 泛化/收敛逻辑：通过 Prompt 中的 `type` 字段控制。

## 6. 待办事项 (Next Steps)
- [ ] 将 `src/services/geminiService.ts` 中的逻辑迁移至后端。
- [ ] 实现真正的数据库持久化（推荐 PostgreSQL 或 MongoDB）。
- [ ] 完善批量模式下的文件解析逻辑（目前前端仅为 Mock）。
- [ ] 增加语料质量评估（Similarity Check）算法。

---
*记录时间: 2026-04-08*
*状态: 前端功能完整，等待后端接管。*
