# CorpusFlow Technical Architecture

## 文档目的

本文档在 [CorpusFlow Takeover Design](/Users/Harland/Go/CorpusFlow/docs/superpowers/specs/2026-04-11-corpusflow-takeover-design.md:1) 和 [CorpusFlow PRD Spec](/Users/Harland/Go/CorpusFlow/docs/superpowers/specs/2026-04-11-corpusflow-prd-spec.md:1) 基础上，正式定义首期技术架构。

本版架构不再采用“前端 + 单体 Node 后端内含算法”的形态，而改为一次拆干净的三层结构：

- 前端：React / TypeScript
- 业务后端：Node / TypeScript
- 算法核心服务：Python

目标是：

- 首期不留算法服务拆分的技术债
- 前端交互层和产品后端保持 TypeScript 一致性
- 让后续二期的诊断、聚类、增强配方、复杂评估自然落到 Python 服务中

---

## 1. 架构目标

首期技术架构目标如下：

- 保留现有前端 UI 与主要交互
- 用正式业务后端替代当前前端本地状态主导的原型模式
- 将算法链路从业务后端中独立出来，沉淀成 Python 核心服务
- 以“语义骨架驱动的宽松生成流水线”作为算法内核
- 支持 `评测 / 微调` 两类业务任务
- 支持 `快速任务 / 高级编辑` 两类操作模式
- 保证后续二期多轮对话、Bad Case 诊断增强可以直接延伸到 Python 服务

一句话定义：

> **前端负责交互，Node 负责产品业务编排，Python 负责算法核心执行。**

---

## 2. 设计原则

### 2.1 前端不重做

本项目是接管，不是重建。

因此首期必须遵守：

- 前端 UI 不推翻
- 用户旅程基本不变
- 高级编辑和快速任务并列存在

### 2.2 算法与业务一次解耦

既然后续二期 Python 基本绕不过去，就不应在首期把算法实现继续沉到 Node 里，再在二期痛苦抽离。

因此首期直接分离：

- Node 只负责业务系统
- Python 只负责算法系统

### 2.3 前置稳定优于后置重审

首期质量控制依赖：

- P0 query 拆解准确
- L1 seed 骨架稳定
- PromptBuilder 把用户输入条件拼全
- L2 宽松生成
- L3 轻量筛减

而不是依赖重型门控或多轮复判。

### 2.4 经济账内生，但鼓励多生成

系统必须对 token、耗时、吞吐有感知，但整体原则不是保守收缩，而是：

- 在心里有经济账的前提下，鼓励模型多生成
- 用轻量筛减和用户可调的过滤强度收结果
- 把大部分成本花在主生成而不是后置复判

### 2.5 开源友好

首期架构必须满足：

- 本地运行路径清楚
- Docker 可选且推荐
- Python 服务使用 `uv`
- Node 服务使用 `npm` 或 `pnpm`
- 模块边界清楚
- 模型 provider 可替换

---

## 3. 三层架构总览

## 3.1 Frontend Layer

技术栈：

- React
- TypeScript
- 现有 UI 与交互为基础

职责：

- 登录入口与用户态展示
- 任务创建与任务切换
- seed 输入与编辑
- 高级编辑模式中的解析预览、仿写预览、人工修订
- 快速任务模式中的批量参数配置、结果查看
- 导出触发
- 任务状态和运行指标展示

前端不再承担：

- 直接调用模型
- 本地持久化主逻辑
- 真实任务调度
- 核心 prompt 拼装
- 核心算法执行

## 3.2 Node Business Backend

技术栈：

- Node.js
- TypeScript
- Express 或 Fastify

职责：

- 账户管理与会话识别
- 任务创建、任务查询、任务状态更新
- seed 管理与结果持久化
- TaskRun 管理
- 导出文件生成与记录
- 前端 API 输出
- 调用 Python 算法核心服务
- 业务编排、错误处理、重试、日志

不负责：

- 具体语义拆解
- 稳定骨架构建
- PromptBuilder 内核
- 双路径生成逻辑
- 轻量过滤具体实现

## 3.3 Python Algorithm Core Service

技术栈建议：

- Python
- FastAPI
- `uv`

职责：

- P0 语义拆解
- L1 稳定骨架
- PromptBuilder
- L2 双路径生成
- L3 轻量过滤
- 轻量相似度去重
- provider 调用与 provider 抽象

二期继续承接：

- 多轮对话正式化
- Bad Case 诊断
- 聚类分析
- 增强配方生成
- 更复杂的质量评估

不负责：

- 用户体系
- 任务列表
- 导出记录
- 产品侧权限与任务归属

---

## 4. 系统边界

## 4.1 请求流转

```text
Frontend
  -> Node Business Backend
  -> Python Algorithm Service
  -> LLM Provider(s)
```

其中：

- 前端只和 Node 通信
- Node 负责产品语义与任务语义
- Python 负责算法执行
- Python 直接或间接调用模型 provider

## 4.2 为什么不用前端直连 Python

不建议前端直接调用算法服务，原因：

- 用户认证和任务归属会变乱
- 运行记录和导出记录不好统一
- 前端需要承担更多异常控制
- 后续开源和部署也会变得混乱

因此首期始终保持：

**前端 -> Node -> Python**

---

## 5. 领域模型归属

## 5.1 归属在 Node 的模型

以下是业务系统对象，应落在 Node：

- `User`
- `Task`
- `TaskConfig`
- `Seed`
- `GeneratedItem`
- `TaskRun`
- `ExportArtifact`

这些对象的意义是：

- `Task` 是产品任务
- `TaskRun` 是一次执行
- `GeneratedItem` 是结果对象

Node 负责这些对象的生命周期和持久化。

## 5.2 归属在 Python 的模型

以下是算法系统对象，应落在 Python：

- `AnalysisResult`
- `SkeletonResult`
- `PromptContext`
- `GenerationRequest`
- `GenerationResult`
- `FilteringResult`

这些对象不直接暴露给前端，但需要通过 Node 转换为前端可理解的结构。

---

## 6. 算法架构

## 6.1 算法主链路

首期算法主链路如下：

```text
Seed Input
  -> P0 Semantic Analysis
  -> L1 Stable Skeleton
  -> Prompt Assembly
  -> L2 Batch Generation
  -> L3 Lightweight Filtering
  -> Return Candidate / Accepted Results
```

### Pipeline Pseudocode

```python
def run_pipeline(task, seed, run_type):
    analysis = analyze_seed(task, seed)
    skeleton = build_stable_skeleton(task, seed, analysis)
    prompt_context = build_prompt_context(task, seed, analysis, skeleton, run_type)
    generated = generate_by_paths(task, prompt_context)
    filtered = lightweight_filter(task, generated)
    return {
        "analysis": analysis,
        "skeleton": skeleton,
        "generated": generated,
        "filtered": filtered,
    }
```

## 6.2 P0 Semantic Analysis

目标：

- 把 seed 解析成后续生成可依赖的语义对象
- 为 PromptBuilder 提供稳定输入

建议输出字段：

- `intent`
- `topic`
- `action`
- `target`
- `modifiers`
- `seedControls`
- `globalControls`

输入来源不只是 seed 原文，还包括：

- `overallRequirement`
- `multiTurnContext`
- `styleAdjustment`
- 每条 seed 的人工修订结果

## 6.3 L1 Stable Skeleton

L1 不是模板引擎，而是语义锚点层。

目标：

- 稳住 seed 的核心语义
- 定义当前表达的自然变形空间
- 不采用模板化笛卡尔乘积主导生成

例如：

原句：

`把空调开到22度`

L1 不应优先落成：

`把空调开到{temperature}度`

而应形成稳定的内部语义表达：

- 意图：空调调节
- 目标：空调温度
- 参数：22度
- 可接受变化：口语化、语气词、自然表达改写
- 泛化边界：允许在同一意图簇内做自然扩展，重点避免生成与原始意图明显相悖的结果

## 6.4 PromptBuilder

PromptBuilder 是首期核心模块之一，归属 Python 算法服务。

原因：

- 它本质属于算法控制逻辑，不属于产品业务逻辑
- 二期做多轮、诊断、增强配方时仍然要扩展它

### Prompt 拼装四层

#### Layer 1: System Constraints

- 评测 / 微调
- 快速任务 / 高级编辑
- 预览 / 正式生成
- 常态泛化 / 鲁棒增强

#### Layer 2: Task-Level Controls

- `overallRequirement`
- `styleTarget`
- `multiTurnContext`
- 当前批量策略

#### Layer 3: Seed Semantic Anchor

- seed 原文
- P0 解析结果
- L1 稳定骨架

#### Layer 4: Seed Manual Controls

- style adjustment
- 补充实体
- 用户人工修订字段
- seed 级 agent 输入

### PromptBuilder Pseudocode

```python
def build_prompt_context(task, seed, analysis, skeleton, run_type):
    return {
        "system_context": {
            "business_type": task["businessType"],
            "work_mode": task["workMode"],
            "run_type": run_type,
        },
        "task_controls": {
            "overall_requirement": task["config"]["overallRequirement"],
            "style_target": task["config"]["styleTarget"],
            "multi_turn_context": task["config"]["multiTurnContext"],
            "generation_profile": task["config"]["generationProfile"],
        },
        "seed_anchor": {
            "raw_text": seed["rawText"],
            "analysis": analysis,
            "skeleton": skeleton,
        },
        "seed_controls": seed.get("manualControls", {}),
    }
```

## 6.5 L2 Generation

L2 是主生产层，首期仍采用双路径，但保持宽松策略。

### Path A: 常态泛化

目标：

- 覆盖高频自然表达
- 保持自然、顺滑、口语化

### Path B: 鲁棒增强

目标：

- 覆盖边缘表达
- 支撑测试 query 的边界覆盖

### Ratio Control

双路径比例由前端最右侧批量生成区域的拖动条控制：

- 左侧偏向常态泛化
- 右侧偏向鲁棒增强
- 默认常态泛化占优

### Generation Pseudocode

```python
def generate_by_paths(task, prompt_context):
    ratio = task["config"].get("generationProfile", {}).get("ratio", {"normal": 0.8, "robust": 0.2})
    target_count = task["config"].get("targetExpansion", 10)

    normal_count = ceil(target_count * ratio["normal"])
    robust_count = max(0, target_count - normal_count)

    normal = provider.generate_candidates(prompt_context, path="normal", count=normal_count) if normal_count else []
    robust = provider.generate_candidates(prompt_context, path="robust", count=robust_count) if robust_count else []

    return normal + robust
```

## 6.6 L3 Lightweight Filtering

L3 是轻量后处理层，不是重型门控器。

保留：

- 格式过滤
- 明显异常过滤
- 明显拒答过滤
- 轻量相似度去重

不保留：

- 多层 LLM 复判
- 高成本一致性评分
- 复杂质量总分

### Similarity Strategy

轻量去重使用：

- embedding
- cosine similarity

### Filtering Pseudocode

```python
def lightweight_filter(task, candidates):
    accepted = []
    rejected = []

    for item in candidates:
        text = item["text"].strip()
        if len(text) < 2:
            rejected.append({"item": item, "reason": "invalid_length"})
            continue
        if contains_refusal_pattern(text):
            rejected.append({"item": item, "reason": "refusal_pattern"})
            continue
        accepted.append(item)

    threshold = 0.97 if task["workMode"] == "quick" else 0.95
    deduped = cosine_similarity_dedup(accepted, threshold=threshold)

    return {
        "accepted": deduped,
        "rejected": rejected,
    }
```

---

## 7. 模式分流

## 7.1 高级编辑模式

特点：

- 允许中间预览
- 允许用户修改解析结果
- 允许用户调整 style/context/seed controls
- 质量优先于吞吐

### Flow

```text
创建任务
  -> 输入 seed
  -> 调 Node 预览接口
  -> Node 调 Python 跑 P0/L1/Prompt/L2/L3
  -> Node 返回预览结果
  -> 前端人工调整
  -> Node 调 Python 跑正式生成
  -> 导出
```

## 7.2 快速任务模式

特点：

- 面向批量
- 中间交互较少
- 鼓励模型多生成
- 通过率受过滤强度影响
- 更强调成本、耗时与总产出

### Flow

```text
创建任务
  -> 批量输入 seed
  -> 设置生成倍数 / 过滤强度 / 双路径比例
  -> Node 调 Python 批量生成
  -> Node 持久化结果并返回统计
  -> 导出
```

---

## 8. 服务契约设计

## 8.1 Node -> Python API

建议首期采用 HTTP / JSON 通信，不急着上消息队列。

建议接口：

- `POST /analyze`
- `POST /skeleton`
- `POST /preview`
- `POST /generate`
- `POST /filter`

或者更实际一点，直接压成两个高层接口：

- `POST /pipeline/preview`
- `POST /pipeline/generate`

由 Python 内部组织 P0/L1/Prompt/L2/L3。

## 8.2 推荐做法

首期推荐高层接口优先：

- Node 不需要了解算法内部所有细节
- Python 可以在内部自由演进
- 后续二期更容易扩展诊断模块

---

## 9. Provider 架构

Provider 抽象落在 Python 服务中。

原因：

- provider 调用和 PromptBuilder、生成策略天然靠近
- 以后算法演进时不需要频繁改 Node

Provider 需支持：

- `analyze_seed`
- `build_skeleton`
- `generate_candidates`

后续扩展：

- `diagnose_bad_cases`
- `cluster_failures`
- `generate_recipe`

---

## 10. 本地开发与开源运行方式

## 10.1 默认本地运行

建议三套命令：

- 前端：`npm install && npm run dev`
- Node 后端：`npm install && npm run dev`
- Python 算法服务：`uv sync && uv run ...`

## 10.2 Docker 作为推荐可选方案

因为现在是三层结构，`docker compose` 应该成为推荐可选启动方式。

建议提供：

- `frontend` 服务
- `backend` 服务
- `algorithm` 服务
- `db` 服务

## 10.3 为什么 Docker 现在值得提供

因为三层服务本地联调门槛已经明显高于单体。  
如果要开源，Docker 能显著降低试用和贡献门槛。

---

## 11. 可观测性与指标透出

首期至少记录：

- 单次生成耗时
- 单任务总耗时
- provider token usage
- 生成候选数
- 过滤后保留数
- 近重复删除数
- 导出记录数

这些信息的透出方式：

### Product UI

前端轻量展示：

- 当前运行状态
- 已生成数量
- 过滤后保留数量
- 当前通过率
- 预计剩余时间
- 导出记录数

### TaskRun and Logs

Node 保存：

- task 级运行记录
- Python 调用耗时
- provider token usage
- 候选与保留统计
- 重试和失败信息

---

## 12. 二期边界

以下能力明确放到二期，但当前架构已经为其留口：

- 多轮对话正式产品化
- 多轮上下文跨轮控制
- Bad Case 诊断
- 聚类分析
- 增强配方生成
- 更复杂的质量评估

它们的主要归宿都是 Python 算法服务，而不是 Node 业务后端。

---

## 13. 结论

CorpusFlow 首期推荐技术架构为：

一个三层结构的产品系统。前端继续承接现有交互；Node/TypeScript 负责账户、任务、持久化、导出和产品级 API；Python 负责 P0 语义拆解、L1 稳定骨架、PromptBuilder、L2 双路径生成和 L3 轻量过滤。这样可以在首期一次完成算法与业务的清晰解耦，并为二期多轮对话和诊断式增强留下自然演进路径。
