# 开发记录与交接说明 (Development Records)

本目录包含了 CorpusFlow 项目从 AI Studio 迁移至本地开发（Claude Code / Local IDE）所需的关键信息。

## 目录内容
- **HANDOVER.md**: 项目整体交接记录，包含架构回顾、核心逻辑说明及下一阶段待办事项。
- **api_design.md**: 详细的后端 API 接口设计规范，定义了数据模型与端点。

## 迁移指南
1. **下载源码**: 通过 AI Studio 的设置菜单导出项目 ZIP 或推送至 GitHub。
2. **环境配置**: 
   - 复制 `.env.example` 为 `.env`。
   - 配置 `GEMINI_API_KEY` 和 `VITE_API_BASE_URL`。
3. **安装依赖**: 运行 `npm install`。
4. **启动开发**: 运行 `npm run dev`。

## 后端开发建议
- 推荐使用 Node.js (Express/Fastify) 或 Python (FastAPI) 构建后端。
- 优先实现 `src/services/apiService.ts` 中预留的接口。
- 逐步将 `localStorage` 的读写逻辑替换为 API 调用。
