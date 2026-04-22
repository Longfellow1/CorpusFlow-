# CorpusFlow Takeover Design

## Overview

CorpusFlow 首期接管按全局 `project-sop` 的 `Build` 模式推进。

本次接管目标不是重做产品，而是在保留现有前端 UI 和主要交互的前提下，为项目补上正式后端、稳定算法内核和可持续扩展的开源友好架构。

## Phase Target

首期目标是一个可用的 MVP，不覆盖二期诊断式增强能力。

### In Scope

- 高级编辑模式
- 快速任务模式
- 最小登录与个人任务隔离
- 前后端分离
- 后端负责数据生产、任务调度、账户管理、持久化、导出
- 评测数据与微调数据两类任务
- 可控 query 生成与轻量质检

### Out of Scope

- Bad Case 诊断式增强
- 团队协作与复杂权限
- 多进程分布式任务服务
- 复杂评测平台
- 复杂语义审判和高成本门控系统

## Product Requirement Summary

### Core Modes

首期保留两个并列入口：

- 高级编辑模式
- 快速任务模式

前端 UI 不推倒重来，已有交互尽量延续。

### User Priority

用户优先级如下：

1. 测试同学
2. 算法工程师
3. 产品同学（用于边界 case 补充）

### Task Model

任务模型采用两层定义：

- 业务类型：`评测` / `微调`
- 操作模式：`快速任务` / `高级编辑`

这两层共同决定：

- 生成方式
- 预览行为
- 结果结构
- 导出格式

### Mode Responsibilities

#### 高级编辑模式

定位：

- 质量优先
- 可控优先
- 用于精细生成、预览、微调与人工干预

不可替代价值：

- 控制仿写/泛化幅度
- 避免偏题与过度发散
- 保持 seed 语义骨架稳定

#### 快速任务模式

定位：

- 吞吐优先
- 弱编辑
- 为批量生成服务

特点：

- 一次处理大量 seed
- 鼓励多生成
- 允许一定比例损耗
- 通过轻量过滤换取成本与速度优势

### Export Rules

导出结果由任务业务类型决定：

- 评测任务导出评测 query 数据
- 微调任务导出训练格式数据

首期两类导出同等优先级。

### Account Scope

首期账号体系只承担：

- 用户标识
- 任务归属
- 个人数据隔离

首期不承担：

- 团队共享
- 复杂权限
- 组织级协作

## Success Criteria

### Primary Objective

生成结果应能直接进入后续评测或训练流水线，并且内容本身可用。

### First-Order Quality Strategy

首期质量不是靠复杂评分系统保障，而是通过：

- 前置语义拆解
- 稳定骨架构建
- 宽松批量生成
- 轻量后处理
- 人工抽检

### Practical Metrics

- 内容可用性：自动规则筛选 + 人工抽检
- 去重率：通过轻量相似度去重控制明显重复和近重复
- 数据格式通过率：导出结构与任务类型一致
- 单任务平均产出时长
- 人工修改率

### Rule Priority

自动筛选优先级：

- P0：语气 / 风格符合任务预期
- P1：重复或近重复控制
- P1：格式合规与字段完整

“语义一致率”不作为单一总分指标。首期更强调：

- seed 拆解准确
- 骨架稳定
- 轻量去重
- 人工抽检可接受

## Core Algorithm Strategy

## Guiding Principles

算法首要目标不是重门控，而是：

- query 拆得准
- seed 骨架搭得稳
- 用户控制条件完整进入 prompt
- 让模型多生成，再做轻筛减

具体原则如下：

- 以方案 B 为主：语义骨架驱动的生成流水线
- 不采用模板化笛卡尔乘积主导的工业化生成方式
- 局部参考变量池/实体扩充思路，但不让句子产生明显规则感
- 不做高成本、重型、多信号审判系统
- 心里有经济账，但不让成本焦虑把生成策略收得过死

## Algorithm Pipeline

首期算法主链路为：

1. P0 语义拆解
2. L1 稳定骨架
3. L2 宽松生成
4. L3 轻量后处理

### P0 语义拆解

目标：

- 将 seed 转换成可用于稳定生成的内部语义对象
- 为 prompt 拼装提供基础信息

核心字段：

- `intent`
- `topic`
- `action`
- `target`
- `modifiers`
- `businessType`
- `workMode`
- `seedControls`
- `globalControls`

输入来源除了原始 seed，还包括现有前端中的：

- `overallRequirement`
- `multiTurnContext`
- `styleAdjustment`
- 每条 seed 的解析结果与人工修订结果

### L1 稳定骨架

L1 不是模板引擎，而是语义锚点层。

目标：

- 保留 seed 的核心任务语义
- 为后续生成提供稳定中心
- 避免过早模板化造成表达机械化

L1 应表达：

- 当前 seed 在做什么
- 关键目标对象是什么
- 哪些信息是关键参数
- 哪些变化是可接受的
- 哪些方向会构成明显漂移

### L2 宽松生成

L2 是主生产层，采用两条宽松生成路径：

#### 路径 A：常态泛化

目标：

- 生成自然、高频、口语化表达
- 保持大致意图与主题

允许：

- 同义改写
- 语气词
- 自然句式变化
- 轻度参数表达变化

#### 路径 B：鲁棒增强

目标：

- 覆盖边缘表达
- 服务测试 query 的鲁棒性需求

允许：

- 倒装
- 省略
- 冗余上下文
- 轻噪声
- 边界表达

首期不通过大量强负向限制控制生成。策略是：

- 前面把 seed 方向控住
- 中间让模型多出候选
- 后面做低成本删减

### L3 轻量后处理

L3 不是重型门控器，只是轻量清洗层。

职责：

- 格式过滤
- 明显异常过滤
- 轻量相似度去重
- 抽检采样支持

首期不做：

- 高成本二次语义审判
- 复杂质量总分系统
- 多层 LLM 复判

### Similarity and Dedup

去重与近重复控制使用轻量语义相似度方案即可，例如 embedding + cosine similarity。

目标：

- 去掉明显重复
- 控制近重复
- 不追求重型语义评估

## Prompt Engineering Strategy

提示词工程是算法方案核心组成部分。

用户在前端输入和调整的每一个会影响语义、风格、边界的条件，都必须在点击“生成预览”或正式生成时进入最终 prompt 拼装。

### Prompt Assembly Layers

#### Layer 1: System Constraints

定义当前任务的固定背景：

- 评测 / 微调
- 快速任务 / 高级编辑
- 当前生成目标

#### Layer 2: Task-Level Controls

来自任务级输入：

- `overallRequirement`
- 任务风格目标
- 业务背景
- 当前批次策略

#### Layer 3: Seed-Level Semantic Anchor

来自 P0 / L1：

- seed 原文
- 拆解结果
- 稳定骨架
- 当前 seed 的变化边界

#### Layer 4: Seed-Level Manual Controls

来自用户在前端每条 seed 上的修订与补充：

- `styleAdjustment`
- 补充实体
- seed 级控制要求
- 修订后的分析字段

### Prompt Engineering Rule

系统不能仅依赖 seed 文本本身进行生成。必须把任务级与 seed 级控制条件拼成最终 prompt。

PromptBuilder 将成为后端正式模块。

## Economic Principle

技术方案中需要牢记经济账，但算法策略不应因此过度保守。

正式原则如下：

在明确成本和耗时约束的前提下，优先鼓励模型多生成，再通过轻量后处理保留可用结果，而不是在生成前后过度收缩。

具体含义：

- token 优先花在主生成，而不是重审判
- 快速任务优先考虑单位成本与吞吐
- 高级编辑优先考虑单条质量与控制感
- 默认不做高成本复判，除非收益明确

## Technical Architecture Direction

后端采用面向开源的模块化单体架构。

### External Shape

- 单体后端服务
- 统一对前端提供 API
- 保留现有前端为展示与交互壳层

### Internal Layers

- API Layer
- Application Service Layer
- Prompt Builder Layer
- Algorithm Pipeline Layer
- Quality Filter Layer
- Provider Layer
- Persistence Layer

### Why This Shape

- 首期接管成本低
- 保留现有前端价值
- 方便后续开源
- 便于二期扩展诊断式增强
- 不会过早进入复杂分布式架构

## Open Source Constraints

由于项目有开源考虑，方案需满足：

- 模型 provider 可替换
- 默认本地可运行
- 依赖尽量克制
- 模块边界清晰
- 配置显式

特别是模型调用层，不能将核心生成能力锁死在单一服务商上。

## Not Chosen

以下方案明确不作为首期主方向：

- 端到端黑盒生成主导
- 以笛卡尔乘积为核心的模板化 query 生成
- 重型语义门控和多级 LLM 复判
- 分布式多服务架构

## CorpusFlow Takeover Conclusion

CorpusFlow 首期接管方案定义为：

在保留现有前端 UI 和用户旅程的前提下，构建一个面向开源的模块化单体后端，以“语义骨架驱动的宽松生成流水线”为算法内核。系统先对 seed 做稳定拆解和骨架构建，再将任务级与 seed 级控制条件统一拼装进生成提示词，驱动模型进行常态泛化和鲁棒增强两类批量生成，最后只做低成本异常过滤和相似度去重，兼顾自然度、可控性、吞吐量与成本。
