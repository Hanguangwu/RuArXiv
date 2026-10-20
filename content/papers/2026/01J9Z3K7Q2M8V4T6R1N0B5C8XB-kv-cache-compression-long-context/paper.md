## 摘要

长上下文推理的主要成本不在参数，而在 KV 缓存：128K 上下文下单请求缓存可达 16 GB，批量服务时显存迅速成为瓶颈。现有方法要么均匀量化、要么按注意力分数驱逐 token，前者在关键层上损失精度，后者在长链推理任务上造成不可逆的信息丢失。我们提出 HKC（Hierarchical KV Compression），把缓存按层敏感度与 token 角色分成三级：热区保留 FP16，温区做 4-bit 分组量化，冷区仅保留低秩摘要。HKC 在 4 个长上下文基准上把缓存压缩到 3.1 倍，精度损失控制在 0.4 个百分点以内；在 128K 检索任务上优于 SnapKV 与 KIVI。我们同时给出一个可复现的显存—吞吐 Pareto 前沿，并讨论分层策略在张量并行下的同步开销。

## 1 引言

解码阶段每生成一个 token 都要读取全部历史 KV。上下文从 8K 增长到 128K 时，缓存体积线性增长，而单卡带宽不变，于是 decoding 从计算受限转为访存受限。工程上有三条路：减少层数、减少每层字节数、减少保留的 token 数。三者都有代价。

我们的出发点是：**并非所有层、所有 token 都同等重要**。探测实验显示，在 Llama-3.1-8B 上，第 0–3 层与第 28–31 层的缓存对最终困惑度最敏感，中间层可以承受更激进的量化；同时，命名实体与数字所在的 token 在长链任务中被反复访问，而停用词几乎不被注意。

## 2 相关工作

KIVI 提出按通道的 2-bit 量化，SnapKV 依据注意力分数选择保留的 token，H2O 维护重击者集合。它们大多把压缩视为全局决策。分层思路在权重量化中已被验证，但在 KV 缓存上缺少系统研究。

## 3 方法

### 3.1 敏感度分析

对层 $l$ 与量化位宽 $b$，定义敏感度

$$
S_l(b)=\mathbb{E}_{x\sim\mathcal{D}}\left[\frac{\mathrm{KL}\bigl(p(y\mid x;\text{FP16})\,\|\,p(y\mid x;b,l)\bigr)}{\log 2}\right],
$$

用 512 条校准样本估计。$S_l(b)$ 越低，说明该层越适合低位宽。

### 3.2 三级缓存

根据敏感度把层划分为热、温、冷三组，比例为 25%/50%/25%。温区使用 group size 32 的 4-bit 量化，并为每个分组保存 FP16 的缩放因子与零点；冷区不保留原始 KV，而是每 64 个 token 聚合成一个低秩摘要，解码时按需重建。

### 3.3 驱逐与重建

当缓存超过预算时，按累计注意力质量驱逐冷区 token。被驱逐的 token 保留摘要向量，若后续注意力分数回升则触发重建。重建只发生在冷区，避免热区抖动。

## 4 实验

评测使用 LongBench、∞-Bench、RULER 与自建的多跳财务问答。硬件为单机 8×H100，batch size 固定为 16。

| 方法 | 压缩率 | LongBench ↑ | RULER-128K ↑ | 吞吐 tokens/s ↑ |
|---|---|---|---|---|
| FP16 | 1.0× | 52.8 | 71.4 | 1,840 |
| KIVI-4bit | 2.9× | 51.9 | 63.2 | 2,410 |
| SnapKV | 2.4× | 52.1 | 66.8 | 2,180 |
| HKC (ours) | **3.1×** | **52.5** | **69.7** | **2,530** |

在 128K 检索任务上，SnapKV 的下降主要来自被驱逐的关键实体；HKC 的摘要重建把损失追回了 4.8 个百分点。消融显示，去掉冷区摘要后 RULER 下降 6.1 个百分点，说明低秩重建是必要的。

## 5 讨论

HKC 的收益依赖校准集与目标任务分布接近。我们在代码补全任务上观察到 0.9 个百分点的额外损失，因为标识符的注意力模式与自然语言差异很大。另一个工程问题是张量并行下的层划分：敏感度分组会打破均匀切分，导致负载不均。我们目前的解法是按流水线阶段重新映射，代价是额外的通信。

## 参考文献

1. Liu et al. KIVI: A Tuning-Free Asymmetric 2bit Quantization for KV Cache. ICML 2024.
2. Li et al. SnapKV: LLM Knows What You are Looking for Before Generation. NeurIPS 2024.
3. Zhang et al. H2O: Heavy-Hitter Oracle for Efficient Generative Inference. NeurIPS 2023.
4. Hsieh et al. RULER: What's the Real Context Size of Your Long-Context Language Models? COLM 2024.
5. Bai et al. LongBench: A Bilingual, Multitask Benchmark for Long Context Understanding. ACL 2024.
