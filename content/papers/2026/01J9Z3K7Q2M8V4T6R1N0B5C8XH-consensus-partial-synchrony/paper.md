## 摘要

部分同步模型假设网络最终会进入一个未知的全局稳定期（GST），共识协议在该期之后保证活性。理论分析通常以轮数计量延迟，但工程部署关心的是尾延迟、跨区域带宽与故障恢复时间。我们在 3 个跨区域拓扑上测量 Raft、PBFT 变体与 HotStuff 的提交延迟，发现理论轮数与实际 P99 延迟的相关性只有 0.43：真正的瓶颈是领导者选举与日志落盘，而不是消息轮次。我们提出一个把 GST 假设映射为可配置超时的参数化方法，并给出在 5% 丢包与 30ms 跨洲 RTT 下的推荐值。实验显示，按该方法配置可将故障恢复的 P99 从 4.8s 降到 1.9s，而对正常路径延迟影响小于 3%。

## 1 引言

“最终同步”在论文里是一行假设，在生产中是一组超时、重试与心跳参数。参数过于保守会拖慢恢复，过于激进会引发不必要的领导者切换。我们想把这两端连起来。

## 2 模型与指标

部分同步模型定义 GST 之后消息延迟有上界 $\Delta$。实际系统无法观测 GST，只能用超时 $T$ 近似。我们关心的指标：

- 正常路径提交延迟 $L_{\text{fast}}$；
- 故障后恢复时间 $L_{\text{recover}}$；
- 不必要的视图切换率 $R_{\text{spurious}}$。

## 3 测量与参数化

在 AWS us-east-1、eu-west-1 与 ap-northeast-1 部署 5 节点集群，注入 5% 丢包与周期性 leader kill。我们扫描心跳间隔 $h$ 与选举超时 $T$，拟合恢复时间：

$$
L_{\text{recover}}\approx T + \frac{2\Delta}{1-p} + L_{\text{disk}},
$$

其中 $p$ 为丢包率，$L_{\text{disk}}$ 为 fsync 延迟。该式在 72 组配置上的 $R^2$ 为 0.81。

| 协议 | 正常 P50 | 正常 P99 | 恢复 P99 | 不必要切换/小时 |
|---|---|---|---|---|
| Raft (默认) | 41ms | 96ms | 4.8s | 0.4 |
| Raft (调参) | 42ms | 99ms | **1.9s** | 1.1 |
| HotStuff | 128ms | 241ms | 2.6s | 0.2 |
| PBFT 变体 | 210ms | 402ms | 3.4s | 0.3 |

调参后不必要切换率上升，但仍在可接受范围。跨洲 RTT 是 P99 的主要成分，任何协议都无法消除。

## 4 讨论

我们的模型假设故障独立，实际中机架级故障会同时影响多个节点。另一个未覆盖的因素是时钟漂移对超时的影响。对于混合部署（云 + 边缘），建议按区域分别标定 $\Delta$，而不是使用全局常数。

## 参考文献

1. Dwork, Lynch & Stockmeyer. Consensus in the Presence of Partial Synchrony. JACM 1988.
2. Ongaro & Ousterhout. In Search of an Understandable Consensus Algorithm. USENIX ATC 2014.
3. Yin et al. HotStuff: BFT Consensus with Linearity and Responsiveness. PODC 2019.
4. Castro & Liskov. Practical Byzantine Fault Tolerance. OSDI 1999.
5. Alijjiang et al. Dissecting the Performance of Strongly Consistent Replication. SIGMOD 2023.
