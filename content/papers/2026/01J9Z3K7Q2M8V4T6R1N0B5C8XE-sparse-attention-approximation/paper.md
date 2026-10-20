## 摘要

稀疏注意力把 $O(n^2)$ 的注意力矩阵压缩到 $O(ns)$，但现有分析多给出最坏情况下的误差上界，无法解释为什么某些头在稀疏化后几乎无损、另一些头却迅速退化。我们把稀疏注意力的误差分解为**质量损失**与**方向偏差**两项，并证明在注意力分布满足局部 Lipschitz 条件时，误差可由被丢弃概率质量与键向量的覆盖半径共同控制。基于该分解，我们提出一种按头自适应的稀疏模式选择算法，只需一次前向统计即可决定局部窗口、全局 token 与随机采样的比例。在 7 个长序列任务上，该方法在相同计算预算下比固定模式的困惑度低 0.18–0.42，并在检索任务上把召回损失降低 31%。

## 1 引言

稀疏注意力的工程实践充满经验规则：局部窗口取 256、全局 token 取 16、再加一点随机连接。这些超参在不同模型、不同层之间未必最优。我们想做的是把“选哪些连接”变成一个可分析的近似问题。

设注意力输出为 $o=\sum_j p_j v_j$，其中 $p=\mathrm{softmax}(qK^\top/\sqrt{d})$。稀疏化保留集合 $S$，输出 $\hat o=\sum_{j\in S}\hat p_j v_j$。定义误差

$$
\|o-\hat o\|\le \underbrace{\sum_{j\notin S}p_j\|v_j\|}_{\text{质量损失}}+\underbrace{\sum_{j\in S}|p_j-\hat p_j|\|v_j\|}_{\text{方向偏差}}.
$$

第一项容易理解，第二项来自重归一化：被保留 token 的概率会被放大，若被丢弃的质量集中在与保留 token 方向相反的键上，误差会超过质量损失本身。

## 2 理论结果

**命题 1.** 若键向量在球面 $\epsilon$-覆盖下满足局部 Lipschitz 条件，且被丢弃的总概率质量为 $\delta$，则方向偏差被 $C\epsilon\delta$ 控制，其中 $C$ 只依赖于值向量的范数上界。

这解释了为什么“随机丢一点”通常安全：当被丢弃的质量分散时，$\delta$ 小且方向近似抵消；而当某一类 token 集中承载语义时，即使 $\delta$ 不大，方向偏差也会显著。

## 3 自适应选择

算法分三步：

1. 用一次前向 pass 统计每个头的注意力质量分布与键向量聚类；
2. 在候选模式（局部窗口、全局 token、随机边）上估计命题 1 的界；
3. 在预算约束下做整数规划，选择使界最小的组合。

整个过程不引入额外训练参数，开销约为一次前向的 1.3 倍，且可以离线完成。

## 4 实验

| 模型 | 任务 | 固定模式 PPL | 自适应 PPL | 检索召回损失 ↓ |
|---|---|---|---|---|
| 1.3B | PG-19 | 18.42 | **18.24** | -12% |
| 1.3B | 代码补全 | 4.91 | **4.73** | -19% |
| 7B | LongBench | 15.08 | **14.66** | -31% |

在 7B 模型上，自适应模式把 40% 的预算从“所有头平均分配”转移到 3 个高敏感头，其余头使用更激进的局部窗口。消融显示，去掉方向偏差项后，检索任务上的收益减半。

## 5 讨论

我们的界依赖 Lipschitz 假设，在训练早期可能不成立。整数规划在层数很多时仍需近似求解，目前用贪心。另一个开放问题是：稀疏模式是否应该随输入动态变化？初步实验显示动态选择的收益有限，而调度开销明显。

## 参考文献

1. Beltagy et al. Longformer: The Long-Document Transformer. arXiv 2020.
2. Zaheer et al. BigBird: Transformers for Longer Sequences. NeurIPS 2020.
3. Kitaev et al. Reformer: The Efficient Transformer. ICLR 2020.
4. Child et al. Generating Long Sequences with Sparse Transformers. arXiv 2019.
5. Yun et al. $O(n)$ Connections are Expressive Enough: Universal Approximability of Sparse Transformers. NeurIPS 2020.
