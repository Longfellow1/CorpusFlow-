# CorpusFlow·指令微调数据工程平台

> **把大模型微调数据，从「手工作坊」升级为「工业化生产线」 —— 先锚定语义骨架，再扩展实体。**

CorpusFlow 是一个开源的 LLM 微调数据工程平台。专门解决批量数据构造里最难的一对矛盾 —— **幻觉让质量失控，人工又扛不住规模** —— 用**"结构化约束"生成范式** + **上游闭环**把"线上问题 → 训练资产"的周期从天级拉到小时级。

*[English → README.en.md](README.en.md)*

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

---

## 为什么存在

大模型迭代卡在一个地方 —— **数据质量**。大多数团队撞上的都是同一堵墙：

- **人工构造** 依赖经验、不 scale，把高级工程师的时间耗在杂活上
- **批量生成** 语义漂移、关键实体丢失、幻觉混进训练集
- **线上 badcase** 堆在日志里好几天，才被人工变成训练样本

三选二？你其实三个都要：规模、可控、接到线上。

**CorpusFlow 就是让你三个都拿到的那条生产线。**

---

## 范式：结构化约束

无约束的批量扩展会幻觉，纯人工整理又不 scale。答案是**把生成拆成两个阶段，分配给不同的操作者**：

```
   种子数据
      │
      ▼
  ┌────────────────────────────┐
  │  1. 语义骨架构建             │   ← Human-in-the-loop
  │     （句法抽象）             │     人审人调，锁定结构
  └──────────────┬──────────────┘
                 │  锁定的语义骨架
                 ▼
  ┌────────────────────────────┐
  │  2. 实体填充扩展             │   ← LLM 做量
  │     （骨架边界内，           │     在人给定的边界里
  │      变化实体）              │
  └──────────────┬──────────────┘
                 │
                 ▼
  ┌────────────────────────────┐
  │  3. 质量门控                 │   ← 实体一致性 +
  │     （多维校验）             │     语义相似度双重校验
  └────────────────────────────┘
```

**人管结构（质量所在）**，**LLM 管规模（量所在）**。语义骨架用 NLP 风格的句法抽象生成 —— 类似"语义上的语法模板"。骨架一旦锁定，后续批量裂变不会语义漂移、不会丢关键实体。

这就是核心创新：**规模与可控，不再是取舍。**

---

## 任务驱动，不是 Prompt 驱动

与其把 Prompt 工程暴露给每个用户，不如抽象三个任务模板，覆盖绝大多数真实生产需求：

| 任务模板 | 输入 | 输出 |
|---|---|---|
| **微调数据扩充** | 种子样本 | 同格式、多样化的训练数据 |
| **评测集构造** | 话题 / 能力清单 | 多样性覆盖的评测 query |
| **Badcase 定向增强** | 一条线上 badcase | 围绕该失败模式的强化样本 |

算法和测试同学配置的是**业务约束**，不是 Prompt。底层 Workflow 被封装成像表单一样的任务卡。

---

## 上游闭环：badcase → 训练资产，周期从天到小时

CorpusFlow 与上游对话分析平台打通，把闭环跑起来：

```
 线上对话
      │
      ▼  风险 / 价值打分
 高信号 Q&A
      │
      ▼  结构化为「语义资产」
 一键推送 ─────────► CorpusFlow
                            │
                            ▼  定向裂变
                     50 条强化样本
                            │
                            ▼
                     训练语料库
```

这个闭环把 badcase-to-training 的周期从**天级压到小时级** —— 一个以产线速度迭代的 Data-Centric AI 回路。

---

## 它是什么，它拒绝成为什么

| 它**是** | 它**拒绝成为** |
|---|---|
| 一条有范式的生产线 | Prompt 游乐场 |
| 只在关键处用人工（结构） | 把人工塞进每一环（人肉流水线） |
| 与线上数据联通的闭环 | 孤立的数据工厂 |
| 白盒、可追溯、每一步可审计 | "AI 魔法"黑盒 |

---

## 关键成果（内部上线）

- **生成效率 3×+** vs. 手工 Prompt
- **人工采纳率 90%+**（首轮裂变数据直接可用的比例）
- 定义了团队的**数据工程标准** —— 从"经验驱动"升级为"策略驱动"
- 作为默认数据管道，支撑了多个线上微调项目
- Badcase → 训练：**天级 → 小时级**

---

## 架构

三层分离。UI 是工作台，Node 层负责业务逻辑和文件安全，Python 层负责 LLM 编排和两阶段生成范式。

```
┌─────────────────────────────────────────────┐
│  React 前端 + TypeScript                     │  工作台
│  (Vite + Tailwind)                           │  • 种子导入 & 预览
└──────────────┬──────────────────────────────┘  • 任务卡 & 进度
               │                                  • 实时导出
               │ REST (Express)
               ▼
┌─────────────────────────────────────────────┐
│  Express 业务层 + TypeScript                 │  业务逻辑 & 文件 I/O
│  (JWT、CSV 防护、进度队列)                   │  • 任务所有权
└──────────────┬──────────────────────────────┘  • 并发写锁
               │                                  • 格式校验
               │ HTTP
               ▼
┌─────────────────────────────────────────────┐
│  FastAPI Python 服务                          │  LLM 编排
│  (豆包、骨架抽取、质量门控)                  │  • 两阶段生成
│  (Prompt 注入 & 内容安全双向过滤)           │  • 语义标签
└─────────────────────────────────────────────┘  • 重试 & 兜底
```

### 安全与健壮性

- **JWT 认证** — HMAC-SHA256，7 天会话，密码零明文落盘
- **所有权隔离** — 所有改动走 `assertTaskOwner()` 网关，杜绝跨用户越权
- **并发写入安全** — Promise 链互斥锁保护共享文件 I/O
- **CSV 注入防护** — RFC 4180 + 公式前缀转义（`=+-@` → `'=+-@`）
- **内容安全双向过滤** — 分类器同时作用在输入端和 LLM 输出端
- **Prompt 注入检测** — XML 边界标签 + 输入截断

### 实时进度，不是"发出去就完了"

每个生成任务返回 `job_id`，随时轮询：

```
GET /api/algorithm/progress/:jobId
→ { generated: 42, total: 100, eta_seconds: 18, status: "running" }
```

---

## 快速开始

```bash
git clone https://github.com/your-org/corpusflow.git
cd corpusflow
bash setup.sh         # 检查 Node 20+ / Python 3.11+ / uv，引导填 API key
npm run dev:all       # 起前端 + 后端 + Python 服务

# 浏览器打开 http://localhost:3000
```

Docker（可选）：

```bash
docker compose up --build
```

---

## 环境变量

复制 `.env.example` → `.env.local`，编辑：

```bash
PORT=3000
ALGORITHM_BASE_URL=http://127.0.0.1:8001

# 豆包（字节跳动） — https://console.volcengine.com/iam/keymanage
ARK_API_KEY=你的_key
ARK_MODEL=doubao-seed-1-6-250615
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_TIMEOUT_SECONDS=120

VITE_API_BASE_URL=
```

---

## 支持的输出格式

| 类型 | 字段 | 微调风格 |
|---|---|---|
| **QA** | `q`, `a` | 基础问答 |
| **Instruct** | `instruction`, `input`, `output` | Alpaca |
| **Multi-turn** | `conversations: [{from, value}]` | ShareGPT |
| **Code** | `instruction`, `code` | 代码模型 SFT |

所有格式可导出为 **JSON / CSV / JSONL**，自动剥离元数据并启用注入防护。

---

## 路线图

- [x] 骨架优先的两阶段生成（4 种格式）
- [x] 三类高频任务的任务卡抽象
- [x] 上游对话平台集成（badcase 闭环）
- [x] 多维质量门控（实体一致性 + 语义相似度）
- [x] JWT 认证 · 内容安全 · Prompt 注入检测 · CSV 注入防护
- [ ] 语义去重
- [ ] 数据集 diff 与对比
- [ ] 导出到 Hugging Face Datasets Hub
- [ ] 骨架库 —— 跨任务可复用的语义模板

---

## 开源协议

Apache License 2.0 —— 见 [LICENSE](LICENSE)。

Copyright 2026 Harland.

## 作者

**Harland** —— AI Native 产品经理。

- 邮箱: Harland5588@gmail.com
- GitHub: [@Longfellow1](https://github.com/Longfellow1)

---

> *大模型迭代的真正杠杆，不是模型本身，而是喂给它的数据工程。*
