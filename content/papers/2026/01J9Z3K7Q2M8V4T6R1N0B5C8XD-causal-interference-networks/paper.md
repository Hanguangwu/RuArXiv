## 摘要

随机实验的经典估计量依赖无干扰假设（SUTVA），但社交网络、市场平台与公共卫生干预中，个体的处理状态会通过邻居影响结果。现有暴露映射方法在小图上表现良好，却需要枚举邻居的处理组合，计算量随度数指数增长。我们提出一种基于图神经网络近似的暴露映射：用低维充分统计量压缩邻居处理配置，再以双重稳健估计量修正偏差。在 3 个半合成网络与 1 个真实平台实验上，我们的方法把偏差从 0.18 降到 0.04，同时将计算复杂度从 $O(2^{d})$ 降到 $O(d\log d)$。我们进一步给出在度分布重尾时的方差界，并说明何时应当放弃个体级效应、转向社区级汇总。

## 1 引言

平台想知道推荐算法对用户参与度的因果影响。若实验按用户随机分组，但用户之间会互相分享内容，那么控制组也会被“间接处理”。此时估计出的效应既不是 TATE 也不是直接效应，而是某种混合。

暴露映射的直觉是：把个体 $i$ 的邻居处理比例 $g_i=\sum_{j\in N(i)}Z_j/|N(i)|$ 作为处理变量，再对 $g_i$ 分层估计。问题在于，当邻居异质或度很大时，单一比例丢失了重要信息。

## 2 方法

### 2.1 暴露表示

令 $\mathbf{Z}_{N(i)}$ 为邻居处理向量。我们用一个置换不变的编码器 $\phi$ 把它映射到 $k$ 维：

$$
\phi(\mathbf{Z}_{N(i)})=\mathrm{MLP}\Bigl(\sum_{j\in N(i)} h(Z_j)\Bigr),
$$

其中 $h$ 为共享的嵌入函数，求和保证对邻居顺序不变。$k$ 在验证集上通过交叉拟合选择。

### 2.2 双重稳健估计

在暴露表示 $\phi$ 上拟合结果模型 $\hat\mu(z,\phi)$ 与倾向模型 $\hat e(\phi)$，使用 AIPW：

$$
\hat\tau=\frac{1}{n}\sum_{i=1}^{n}\left[\frac{Z_i(Y_i-\hat\mu(1,\phi_i))}{\hat e(\phi_i)}-\frac{(1-Z_i)(Y_i-\hat\mu(0,\phi_i))}{1-\hat e(\phi_i)}+\hat\mu(1,\phi_i)-\hat\mu(0,\phi_i)\right].
$$

只要结果模型或倾向模型之一正确，估计量即一致。

### 2.3 计算复杂度

朴素枚举需要 $2^{d}$ 种配置；编码器只需对每条边做一次嵌入，复杂度 $O(d\log d)$（排序用于分位数特征）。推断使用网络层面的聚类 bootstrap，避免把邻居相关性当成独立观测。

## 3 实验

半合成数据基于 Facebook100 的三个子图，结果生成过程包含同质性混淆与非线性溢出。真实实验来自一个内容平台的 42 万用户、14 天推送实验。

| 方法 | 偏差 ↓ | RMSE ↓ | 运行时间 (s) |
|---|---|---|---|
| 朴素 SUTVA | 0.186 | 0.201 | 2 |
| 比例暴露 | 0.091 | 0.112 | 9 |
| 枚举暴露 (d≤8) | 0.052 | 0.078 | 1,840 |
| 本文方法 | **0.041** | **0.069** | 47 |

在真实平台实验中，我们估计邻居曝光比例每提高 10%，用户的次日留存提高 0.7 个百分点（95% CI: 0.2–1.2），而 SUTVA 估计给出 1.9 个百分点，明显高估。

## 4 讨论

编码器是近似，理论上仍可能遗漏高阶交互；我们给出的方差界假设度分布二阶矩有限，重尾网络需要截断。另一个实践问题是暴露映射的选择会影响政策含义：按邻居比例定义，估计的是“平均溢出”；按社区汇总，估计的是“社区级干预”。两者不能互相替代。

## 参考文献

1. Aronow & Samii. Estimating Average Causal Effects Under General Interference. Annals of Applied Statistics 2017.
2. Athey, Eckles & Imbens. Exact p-values for Network Interference. JASA 2018.
3. Hudgens & Halloran. Toward Causal Inference With Interference. JASA 2008.
4. Ugander et al. Graph Cluster Randomization: Network Exposure to Multiple Universes. KDD 2013.
5. Ogburn & VanderWeele. Causal Diagrams for Interference. Statistical Science 2014.
