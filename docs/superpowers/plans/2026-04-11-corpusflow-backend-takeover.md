# CorpusFlow 接管实施计划

> **针对执行型 agent：** 推荐使用 `superpowers:subagent-driven-development` 按里程碑推进并逐轮评审。当前计划采用“三层架构”执行：前端、Node 业务后端、Python 算法核心服务。

**目标：** 在尽量不改现有前端 UI 的前提下，构建一个正式可用、开源友好的三层系统：前端负责交互，Node 负责产品业务，Python 负责算法核心，并最终打通从登录、建任务、seed 输入、预览、生成到导出的完整链路。

**架构：** React 前端 + Node/TypeScript 业务后端 + Python 算法核心服务。前端只调用 Node，Node 统一管理任务和状态，并调用 Python 算法服务执行 P0/L1/Prompt/L2/L3 链路。

**技术栈：**
- 前端：React、TypeScript
- 业务后端：Node.js、TypeScript、Express 或 Fastify
- 算法服务：Python、FastAPI、`uv`
- 可选标准环境：Docker Compose

---

## 里程碑

### M1：搭好三层底座

**目标：** 把前端、Node、Python 三层结构正式立起来，并让 Node 和 Python 能稳定通信。

**包含：**
- Node 后端工程初始化
- Python 算法服务工程初始化
- 基础环境配置
- 本地联调方式
- Docker 可选启动方式
- Node 调 Python 的健康检查

**主要产出：**
- 三层服务能在本地同时启动
- Node 能调用 Python
- 项目不再受限于单体原型结构

### M2：Node 业务系统接住任务和数据

**目标：** 把用户、任务、seed、结果、运行记录、导出记录这些核心产品对象接住。

**包含：**
- 最小登录与用户隔离
- 任务模型
- 任务配置模型
- seed 持久化
- 生成结果持久化
- TaskRun 持久化
- 导出记录持久化

**主要产出：**
- 前端可以开始基于正式后端管理任务，而不是依赖本地状态

### M3：Python 算法主链路跑通

**目标：** 把真正的算法内核放进 Python 服务里，并打通 Node 到 Python 的正式调用。

**包含：**
- P0 语义拆解
- L1 稳定骨架
- PromptBuilder
- L2 双路径生成
- L3 轻量过滤
- Provider 抽象
- 快速任务 / 高级编辑分流

**主要产出：**
- 预览和正式生成都由 Python 服务驱动
- Prompt 拼装不再散落在前端

### M4：前端切换与端到端验证

**目标：** 让现有前端全面走新系统主链路，并完成研发自测。

**包含：**
- 前端服务层切到 Node API
- 预览、正式生成、导出接到正式后端
- 运行指标透出
- 异常处理与重试
- 端到端验证
- README / runbook / Docker 说明更新

**主要产出：**
- `登录 -> 建任务 -> 存 seed -> 预览 -> 生成 -> 导出` 全链路可用

---

## 文件结构建议

### 前端

- 保留：`src/App.tsx`
- 修改：`src/services/apiService.ts`
- 弱化并最终替换：`src/services/geminiService.ts`

### Node 业务后端

```text
backend/
  src/
    server.ts
    app/
      auth/
      tasks/
      seeds/
      generation/
      exports/
    infra/
      db/
      storage/
      logger/
      algorithm-client/
    shared/
      types/
      config/
  tests/
```

### Python 算法服务

```text
algorithm/
  pyproject.toml
  uv.lock
  src/
    app.py
    api/
    pipeline/
      analysis/
      skeleton/
      prompting/
      generation/
      filtering/
    providers/
    shared/
  tests/
```

---

## 分阶段实施任务

## M1：搭好三层底座

### 任务 1：初始化 Node 业务后端

**目标：**
- 建立 `backend/`
- 能启动 HTTP 服务
- 能提供健康检查接口

**验收：**
- `GET /health` 返回正常

### 任务 2：初始化 Python 算法服务

**目标：**
- 建立 `algorithm/`
- 用 `uv` 管理依赖
- 能启动 FastAPI
- 能提供健康检查接口

**验收：**
- `GET /health` 返回正常

### 任务 3：打通 Node -> Python 基础调用

**目标：**
- Node 能通过 HTTP 调 Python
- 失败、超时、不可达能被业务后端识别

**验收：**
- Node 提供一个代理测试接口，成功返回 Python 健康状态

### 任务 4：补本地开发和 Docker 运行方式

**目标：**
- 三层服务本地能跑
- Docker Compose 可选

**验收：**
- 文档中有本地启动方式
- 文档中有 Docker 启动方式

---

## M2：Node 业务系统接住任务和数据

### 任务 5：实现最小登录和用户隔离

**目标：**
- 用户可登录
- 任务有归属

### 任务 6：实现任务模型

**必须包含：**
- `businessType`
- `workMode`
- `status`
- `config`

### 任务 7：实现 seed 与结果持久化

**必须包含：**
- seed 原文
- 人工修订后的分析快照
- 骨架快照
- 生成结果

### 任务 8：实现 TaskRun 与 ExportArtifact

**目标：**
- 记录每次预览、生成、导出
- 支持前端查看运行状态和结果摘要

---

## M3：Python 算法主链路跑通

### 任务 9：实现 P0 语义拆解

**目标：**
- Python 接收 seed 与任务控制信息
- 输出稳定分析结构

### 任务 10：实现 L1 稳定骨架

**目标：**
- 不使用模板化笛卡尔乘积主导生成
- 输出稳定骨架结构

### 任务 11：实现 PromptBuilder

**目标：**
- 将任务级和 seed 级控制条件拼入最终 prompt
- 预览和正式生成走统一 PromptBuilder

### 任务 12：实现 L2 双路径生成

**目标：**
- 支持常态泛化与鲁棒增强
- 接收前端拖动条映射过来的比例

### 任务 13：实现 L3 轻量过滤

**目标：**
- 格式过滤
- 明显异常过滤
- 轻量相似度去重

### 任务 14：实现 Provider 抽象

**目标：**
- Python 内统一封装模型调用
- 为后续替换模型 provider 留口

### 任务 15：实现 Node 到 Python 的正式算法接口

**建议接口：**
- `POST /pipeline/preview`
- `POST /pipeline/generate`

---

## M4：前端切换与端到端验证

### 任务 16：前端服务层切到 Node API

**目标：**
- 前端不再走主链路直调模型
- 预览和正式生成统一走 Node

### 任务 17：把运行指标透给前端

**至少透出：**
- 当前状态
- 已生成数量
- 保留数量
- 当前通过率
- 预计剩余时间

### 任务 18：打通导出链路

**目标：**
- 评测导出可用
- 微调导出可用

### 任务 19：研发自测

**主链路：**
- 登录
- 建任务
- 存 seed
- 预览
- 生成
- 导出

### 任务 20：补文档

**包括：**
- README
- `.env.example`
- Node 启动方式
- Python `uv` 启动方式
- Docker Compose 启动方式

---

## 开发顺序建议

推荐严格按以下顺序推进：

1. M1 完整完成
2. M2 完整完成
3. M3 跑通最小算法闭环
4. M4 切前端并做端到端自测

不要先写前端切换，再补 Python 算法服务。  
也不要先在 Node 里临时实现算法，再“以后再迁”。这正是这轮架构调整要避免的技术债。

---

## 验收标准

本计划完成时，应满足：

- 三层服务能本地启动
- 前端主链路可用
- Node 和 Python 分工清晰
- PromptBuilder 在 Python 中正式工作
- 快速任务和高级编辑都能走正式后端链路
- 评测与微调导出可用
- 研发自测通过

---

## 结论

本实施计划不再按“单体后端”推进，而按“三层架构一次拆干净”的方式推进。这样首期虽然略重，但后续不会留下算法服务迁移的尾巴，也更符合你对长期维护成本和开源清晰度的要求。
