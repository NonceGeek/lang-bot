# 基于 RAG 的 ChatBot 实现

## 1 ChatBot 实现原理

本 ChatBot 采用 **RAG（Retrieval-Augmented Generation，检索增强生成）** 架构，结合本地知识库索引与大语言模型（LLM）实现专业领域问答。其整体思路与 **Google NotebookLM** 高度相似——均以用户上传/指定的文档为知识来源，通过向量检索定位相关段落，再由 LLM 合成自然语言回答，而非依赖模型的参数化记忆。

---

### Step 1：知识库构建——两种 DAG 向量化方案

在回答问题之前，须将原始文档切分为语义段落（Chunk），并为每段生成向量表示（Embedding），以支持后续的语义检索。本系统提供两种方案：

#### 方案一：本地文档向量化，存储为 JSONL 文件（本地 TF-IDF 索引）

文档经字符级 N-gram 分析（2–4 gram）、TF-IDF 权重计算后，将稀疏向量与原始文本一起序列化为 `chunks.jsonl`，在服务器启动时（或首次请求时懒加载）读入内存建立倒排索引。

**优点：**
- **零外部依赖**：不需要向量数据库或云服务，本地离线即可运行。
- **冷启动快**：文件读取 + 内存构建，无网络 RTT。
- **成本极低**：无 API 调用费用，无数据库维护成本。
- **可完全私有化部署**：数据不离开本地，适合对数据合规有要求的场景。

**缺点：**
- **语义理解能力有限**：TF-IDF 基于字符频率，无法捕捉同义、近义等语义关联（如"焦虑"与"担忧"不会被关联）。
- **内存占用随语料增长**：全量索引常驻内存，大规模语料下资源消耗显著。
- **多实例无法共享**：每个服务进程需各自加载，横向扩展时重复占用内存。
- **不支持实时更新**：新增文档须重新生成 JSONL 并重启或重载索引。

---

#### 方案二（推荐）：向量化后存储于云端 Supabase（pgvector 语义索引）

文档段落通过 OpenRouter Embedding API（`qwen/qwen3-embedding-4b`，1024 维）生成稠密向量，写入 Supabase PostgreSQL 的 `pgvector` 扩展列，并通过自定义 SQL 函数 `match_lib_psy` 执行近似最近邻（ANN）检索。

**优点：**
- **真正的语义检索**：稠密向量能捕捉词义、上下文关联，跨语言近义查询准确率更高。
- **持久化 & 实时更新**：新文档写入数据库即可生效，无需重启服务。
- **多实例共享**：所有服务节点共用同一向量库，天然支持水平扩展。
- **可与结构化查询结合**：pgvector 在 PostgreSQL 中运行，可将向量相似度与 SQL 过滤（如按作者、书名筛选）联合查询。

**缺点：**
- **依赖外部服务**：需要 Supabase 账号、`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`，以及 Embedding API Key，存在网络延迟与服务可用性风险。
- **构建成本**：每个段落均需调用 Embedding API，大规模语料下费用不可忽视。
- **数据出境**：向量及原文上传至云端，需评估数据合规要求。
- **冷调用延迟**：查询时需先生成查询向量（一次 API 调用），再查数据库，链路比本地多一跳。


### Step 2：混合检索——向量搜索 + PGroonga 全文检索的双路召回

用户发送消息后，系统对输入文本同时执行两路检索，再合并结果送入 LLM：

```
用户输入
   │
   ├──► 向量化（Embedding）──► Supabase pgvector ANN 检索  ──► 语义相关段落 ─┐
   │                                                                         ├──► 结果合并 & 去重 & 排序
   └──► 原始查询文本 ────────► Supabase PGroonga 全文检索  ──► 关键词匹配段落 ─┘
                                                                              │
                                                                              ▼
                                                                         上下文 Context
```

#### 关键词检索方案：PGroonga

[PGroonga](https://pgroonga.github.io/) 是 PostgreSQL 的全文搜索扩展，底层使用 **Groonga** 引擎，原生支持中文、日文等 CJK 语言的分词与倒排索引，可直接在 Supabase（标准 PostgreSQL）上启用。

相比本地 TF-IDF 方案，PGroonga 的优势如下：

| 维度 | 本地 TF-IDF（旧方案） | PGroonga（新方案） |
|------|----------------------|-------------------|
| 运行位置 | 服务进程内存 | Supabase PostgreSQL 数据库 |
| 中文分词 | 字符 N-gram（2–4 gram） | Groonga 内置 CJK 分词器（MeCab / TokenBigram） |
| 语义能力 | 无（纯词频统计） | 无（精确匹配），但支持模糊匹配与前缀检索 |
| 实时更新 | 需重新生成 JSONL 并重载 | 写入数据库即生效，无需重启 |
| 多实例共享 | 每个进程独立内存 | 所有节点共享同一索引 |
| 与向量库结合 | 需两次独立查询后端合并 | 同库 SQL 联合查询，可在一次 RPC 内完成 |
| 部署复杂度 | 零依赖（纯 JS） | 需在 Supabase 执行 `CREATE EXTENSION pgroonga` |

**PGroonga 检索示例（SQL）：**

```sql
-- 在 Supabase 中建立 PGroonga 索引
CREATE INDEX ON agent_lib_psy USING pgroonga (embedding_input);

-- 全文检索（支持中文、模糊匹配）
SELECT id, embedding_input, source_name,
       pgroonga_score(tableoid, ctid) AS score
FROM   agent_lib_psy
WHERE  embedding_input &@~ '焦虑 情绪'
ORDER  BY score DESC
LIMIT  10;
```

后端通过 Supabase `.rpc()` 或 `.from().select()` 调用，与向量检索复用同一 `supabase` 客户端，无需额外服务。

**合并策略（Reciprocal Rank Fusion）：**
1. 向量搜索结果按 `similarity` 降序排列，PGroonga 结果按 `pgroonga_score` 降序排列。
2. 对每条结果计算 RRF 得分：`score = Σ 1 / (k + rank)`（`k=60` 为平滑常数）。
3. 去重（相同 `id` 取最高 RRF 得分）。
4. 取 Top-K（当前默认 `topk=10`）拼接为 `context` 注入 LLM Prompt。


### Step 3：与 LLM 交互——带记忆的多轮对话

检索到的上下文段落与对话历史一同构造 Prompt，提交给 LLM（当前使用 `qwen/qwen3-30b-a3b` via OpenRouter）：

```
System Prompt（角色定义：专业心理咨询师 + 背景资料注入）
   │
   ├── [system] 你是一个专业心理咨询师……
   ├── [system] 【资料】：<检索到的 Top-K 段落>
   ├── [user]   <历史消息 1>
   ├── [assistant] <历史回复 1>
   ├── ...
   └── [user]   <当前问题>
```

**记忆机制：**
- **短期记忆（会话内）**：前端将完整对话历史（`messages` 数组）随每次请求发送至后端，后端原样拼接到 Prompt，LLM 可感知上下文。消息数量越多，Token 消耗越大，建议前端设置滑动窗口（保留最近 N 轮）。
- **长期记忆（跨会话）**：当前版本暂未实现；可扩展为将历史摘要存入 Supabase，下次对话时检索注入。
- **检索记忆**：每轮对话均重新执行双路检索，确保每次回答都基于最新的知识库状态。

---

## 2 为什么不自行训练模型？

这是一个常见的疑问：既然我们有领域专业数据（心理学书籍、藏传佛教资料），为什么不直接微调或训练一个专属模型，而是采用 RAG + 通用 LLM 的方案？

### 2.1 成本与资源壁垒

训练或全量微调一个参数规模与 Qwen3-30B 相当的模型，需要数十至数百块 A100/H100 GPU 运行数周，费用通常在数十万至百万人民币量级。即使是较轻量的 LoRA 微调，也需要专业 MLOps 团队、持续的数据清洗流水线，以及显著高于 API 调用的基础设施成本。RAG 方案将"模型能力"与"领域知识"解耦，前者交给 OpenRouter 按量付费，后者通过向量库随时更新，边际成本接近于零。

### 2.2 知识更新的灵活性

微调后的模型将领域知识"烘焙"进参数，一旦资料库更新（新增书籍、修订内容），必须重新训练并重新部署。RAG 方案只需将新文档写入 Supabase，下一次对话即可检索到最新内容，更新周期从"数天到数周"缩短为"分钟级"。

### 2.3 幻觉与可解释性

微调模型容易将训练数据中的错误或偏见放大，且生成内容难以溯源。RAG 的每一条回答都附带可验证的 `sources`（书名、章节、段落），用户和审核者可以直接核实引用来源，这对心理健康领域的专业可信度至关重要。

### 2.4 通用推理能力的保留

领域微调往往以牺牲通用能力为代价——模型在目标领域表现更好，但逻辑推理、语言表达、多语言能力可能退化（即"灾难性遗忘"）。通过 RAG，我们保留了基础模型完整的推理与表达能力，仅通过 Prompt 引导其在领域知识框架内作答。

### 2.5 适合本项目的定位

本 ChatBot 的核心价值在于**知识的精准检索与共情式表达**，而非创造新的心理学理论。通用大模型（Qwen3、GPT-4o 等）在语言理解、情感共情、逻辑推理层面已足够强大；领域专业性通过向量库中的高质量文本段落注入。这种组合在当前阶段能以最低成本、最快迭代速度覆盖绝大多数用户需求。

> **结论**：自训练模型适合拥有海量专属数据、明确的产品规模预期、以及充足 MLOps 资源的阶段。在产品验证期与早期增长阶段，RAG + 商业 LLM API 是更务实、更可维护的选择。待用户量与数据积累到一定规模，再评估是否值得投入微调，是更合理的技术演进路径。

## 3 Chatbot 和 Google NotebookLM

### 3.1 与 NotebookLM 的相似之处

| 维度 | 本 ChatBot | Google NotebookLM |
|------|-----------|------------------|
| 知识来源 | 指定本地 JSONL / Supabase 向量库 | 用户上传的文档（PDF、Google Doc 等） |
| 检索方式 | 向量语义检索 + TF-IDF 关键词检索 | 语义向量检索（Gemini Embeddings） |
| 生成模型 | Qwen3-30B via OpenRouter | Gemini（Google） |
| 引用溯源 | 返回 `sources` 列表（书名、章节、段落） | 内联引用，可点击定位原文 |
| 多轮对话 | 支持（`messages` 历史） | 支持 |
| 跨文档检索 | 支持（多 lib / 向量库联合） | 支持（Notebook 内所有 Source） |


### 3.2 参考 NotebookLM 可进一步优化的方向

1. **引用内联高亮（Grounding）**
   NotebookLM 的回答中每句话均可溯源到原文具体位置，并支持点击跳转。本 ChatBot 目前仅返回段落级 `sources`，可在 Prompt 中要求 LLM 以 `[引用 N]` 格式标注，前端再将角标与 `sources` 列表联动展示。

2. **自动生成学习材料**
   NotebookLM 可从文档自动生成 FAQ、摘要、思维导图、Podcast 脚本等。可为本 ChatBot 增加 `/api/generate_summary`、`/api/generate_faq` 等端点，复用现有 RAG 流水线，更换 Prompt 模板即可。

3. **多文档来源管理界面**
   NotebookLM 有清晰的 "Source" 管理面板，用户可增删文档并即时看到知识库变化。本系统可在前端增加文档管理页，调用后端 `/api/new_cert`（或新增上传端点）动态管理向量库。

4. **音频概览（Audio Overview）**
   NotebookLM 的标志性功能：将文档内容生成两人对话式播客音频。本 ChatBot 已有 `/api/trans_cantonese` 语音处理基础，可扩展为调用 TTS API，将 LLM 生成的摘要转换为语音输出。

5. **长期记忆 & 个性化**
   NotebookLM 通过 Google 账号持久化 Notebook。本系统可引入用户身份（结合现有 `agent_lib_cert_master` 证书表），将对话摘要和用户偏好存入 Supabase，实现跨会话的长期记忆与个性化回答风格。

6. **混合检索排序优化（RRF / Re-ranking）**
   可引入交叉编码器（Cross-Encoder）对双路召回结果进行二次精排，进一步提升相关性，减少 LLM 需要处理的无关 Token，降低幻觉概率。