# 在线人数容量计算方法

本方法基于当前系统架构与资源管理设计，包含关键参数与假设，用于估算系统可支持的在线并发人数。

## 参数定义

| 参数名 | 说明 | 单位 |
|--|--|--|
| M_total | 服务器总物理内存 | GB |
| P_task | 单个任务平均内存占用 | MB |
| N_concurrent_max | 最大同时并发执行任务数 | 个 |
| T_task_avg | 单个任务平均执行时长 | 分钟 |
| R_task_per_user | 用户任务生成频率 | 任务/小时 |
| A_activity | 用户活跃率（同时运行任务用户比例） | 0~1 |

## 计算步骤

1. 资源基于比例分配，预留部分系统内存处理其他服务，计算给任务分配的内存M_task：

```
M_task = M_total * 比例 (如0.3~0.45)
```

2. 最大并发任务数估算：

```
N_concurrent_max = floor((M_task * 1024) / P_task)  
// 1024用于MB换算
```

3. 计算可支持的活跃在线用户数：

```
N_active = N_concurrent_max * (60 / T_task_avg) / R_task_per_user / A_activity
```

- 其中，(60 / T_task_avg)为单位时间内任务平均能完成的批次数。
- R_task_per_user * A_activity反映单位时间内促发计算任务的用户规模。

## 示例

假设：
- 服务器内存 M_total = 16GB
- 单任务内存 P_task = 100MB
- 内存比例 = 0.4
- 平均任务时长 T_task_avg = 5分钟
- 用户任务频率 R_task_per_user = 3任务/小时
- 活跃率 A_activity = 0.3

计算：

```
M_task = 16 * 0.4 = 6.4GB
N_concurrent_max = floor((6.4 * 1024) / 100) = 65
N_active = 65 * (60 / 5) / 3 / 0.3 = 260
```

结论：
系统大约可以支持260个活跃在线用户。


---

此方法可根据实际业务特点和硬件配置调整参数，进行动态容量规划。