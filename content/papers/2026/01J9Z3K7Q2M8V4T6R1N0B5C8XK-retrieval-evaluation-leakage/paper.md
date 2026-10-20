## 摘要

检索模型的评测通常从固定语料中抽取查询—文档对，但训练数据、预训练语料与评测集合之间往往存在重叠。我们提出一种基于近似重复检测与时间切分的泄漏审计流程，在 5 个常用检索基准上发现 4.1%–17.8% 的相关文档与训练语料高度重叠。移除这些文档后，3 个模型的 Recall@10 平均下降 6.2 个百分点，且排名发生变化：一个依赖记忆的模型从第 2 名降到第 4 名。我们进一步表明，仅按时间切分并不足够，因为长文档的更新时间晚于其首次发布。最后我们给出一个可复用的泄漏审计脚本与报告模板。

## 1 引言

检索评测的可信度取决于一个朴素假设：评测语料没有被模型见过。在开放预训练时代，这个假设很难成立。一个模型可能在预训练中读过维基百科，而评测集恰好使用同一批页面作为候选文档。

泄漏的影响不是均匀的：热门实体、经典论文与新闻头条更容易被记住，因此泄漏会系统性地抬高这些查询的分数。

## 2 泄漏审计流程

流程分三步：

1. **近重复检测**：对候选文档与训练语料分块，使用 MinHash 估计 Jaccard 相似度，阈值 0.8；
2. **时间切分**：按文档首次发布时间过滤，保留训练截止日期之后的文档；
3. **对抗查询**：构造实体替换查询，若模型在替换实体后召回骤降，提示记忆而非语义匹配。

## 3 实验

| 基准 | 泄漏率 | 原 Recall@10 | 清理后 | 变化 |
|---|---|---|---|---|
| B1 | 4.1% | 78.4 | 76.9 | -1.5 |
| B2 | 9.7% | 71.2 | 66.8 | -4.4 |
| B3 | 17.8% | 69.5 | 60.1 | -9.4 |
| B4 | 6.3% | 64.8 | 61.2 | -3.6 |
| B5 | 12.0% | 59.7 | 50.9 | -8.8 |

在 B3 上，模型排名发生变化：依赖大规模预训练的模型下降最多。对抗查询显示，替换实体后这些模型的召回下降超过 20 个百分点。

## 4 讨论

MinHash 阈值会漏掉改写型泄漏；时间切分对持续更新的文档不适用。我们的审计脚本只覆盖文本，多模态检索需要另外处理图像哈希。更重要的是，清理后的基准规模变小，置信区间变宽，排行榜应同时报告样本量与区间。

## 参考文献

1. Dodge et al. Documenting Large Webtext Corpora: A Case Study on the Colossal Clean Crawled Corpus. EMNLP 2021.
2. Brown et al. Language Models are Few-Shot Learners. NeurIPS 2020.
3. Thakur et al. BEIR: A Heterogeneous Benchmark for Zero-shot Evaluation of Information Retrieval Models. NeurIPS 2021.
4. Lee et al. Deduplicating Training Data Makes Language Models Better. ACL 2022.
5. Zhu et al. Retrieval Benchmark Contamination: Measurement and Mitigation. SIGIR 2025.
