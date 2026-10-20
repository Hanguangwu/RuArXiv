## 摘要

可观测性数据（指标、日志、追踪）天然包含用户行为与内部拓扑，直接聚合仍可能泄露个体信息。我们在一个真实运维数据集上评估差分隐私聚合的可用性代价：对 12 类指标分别施加 $\epsilon\in\{0.1,0.5,1,4\}$ 的拉普拉斯与高斯机制，测量异常检测的召回、告警延迟与根因定位准确率。结果显示，$\epsilon=1$ 时告警召回下降 8.4 个百分点，而 $\epsilon=0.1$ 时几乎失效（下降 37.2 个百分点）。更关键的是，隐私预算在时间维度上的组合会迅速耗尽：按分钟发布的指标在 24 小时后有效 $\epsilon$ 放大约 12 倍。我们提出按指标敏感度分配预算的分层机制，在同等总预算下把根因定位准确率的损失从 14.1 降到 6.3 个百分点。

## 1 引言

运维团队希望共享遥测数据用于联合故障分析，但数据里可能有租户 ID、内部主机名与请求参数。差分隐私提供了一个可量化的承诺，但“加噪”并不是免费的。

## 2 方法

我们对每个指标 $m$ 定义敏感度 $\Delta_m$，并按分层预算 $\epsilon_m$ 加噪。总预算约束为 $\sum_m \epsilon_m\le\epsilon_{\text{total}}$。敏感度由指标的取值范围与聚合窗口决定。

## 3 实验

使用某云厂商 30 天的脱敏指标数据，注入 214 个已知故障。评估三类任务：异常检测、告警延迟、根因定位。

| ε | 告警召回 | 告警延迟 P95 | 根因 Top-3 | 有效 ε (24h) |
|---|---|---|---|---|
| 无隐私 | 92.1% | 42s | 81.4% | — |
| 4 | 89.7% | 48s | 78.2% | 96 |
| 1 | 83.7% | 71s | 67.3% | 24 |
| 0.5 | 71.2% | 133s | 52.8% | 12 |
| 0.1 | 54.9% | 402s | 31.6% | 2.4 |

分层机制在 $\epsilon_{\text{total}}=1$ 时达到 86.9% 召回与 75.1% 根因准确率，接近均匀分配下 $\epsilon=2$ 的效果。

## 4 讨论

我们的敏感度估计假设指标有界，实际中长尾延迟可能超出界。另一个问题是时间相关性：相邻分钟的噪声若独立采样，攻击者可以通过平均降低噪声，因此需要滑动窗口机制。最后，差分隐私不能替代访问控制，二者应叠加使用。

## 参考文献

1. Dwork & Roth. The Algorithmic Foundations of Differential Privacy. TCS 2014.
2. Kairouz et al. Practical and Private (Deep) Learning without Sampling or Shuffling. ICML 2021.
3. Ding et al. Collecting Telemetry Data Privately. NeurIPS 2017.
4. Near et al. Differentially Private Telemetry for Production Systems. USENIX ATC 2023.
5. Bittau et al. Prochlo: Strong Privacy for Analytics in the Crowd. SOSP 2017.
