---
title: Visual Tokenizer
publishDate: 2024-09-01 17:47:31
description: '为什么大模型视觉不太彳亍？'
tags:
  - AI
  - CV
  - Paper
language: '中文'
---

本文主要介绍一些对于 ViT 的改进工作。

本文中，令牌 /token 为等价表述。

## Image as Set of Points

[arxiv / 2303.01494](https://arxiv.org/abs/2303.01494)

### 前情提要：CoAtNet

#### 标准 ViT

因为使用了绝对位置 embedding，标准 ViT 缺少平移不变性（指只关注相对距离，不关注绝对位置）

#### CoAtNet

在自注意力之前先做卷积，可以有比原生 ViT 更好的表现。可以兼顾平移等变性（来自卷积）、输入自适应加权、全局感受野（来自自注意力）

### 核心改进：点集聚类

这篇文章提出了上下文聚类，它放弃了流行的卷积或注意力机制，而是新颖地考虑了经典算法 —— 聚类，来进行视觉学习的表示。

#### 从图像到点集

首先将每个像素加上位置二维坐标信息 $\left[\frac{i}{w}-0.5, \frac{j}{h}-0.5\right]$ 后转为五维点，形成点集 $\mathbf{P}\in\mathbb{R}^{5\times n}$，其中 $n=w\times h$。

#### 对点集进行特征提取

使用聚类算法，在空间中均匀选择一些锚点，并将最近的 $k$ 个点通过线性投影后进行连接和融合。

1. **上下文聚类**：将特征点 $\mathbf{P}\in\mathbb{R}^{n\times d}$ 根据相似性分成多个簇，每个点分配给一个簇。使用线性投影 $\mathbf{P}$ 到 $\mathbf{P}_s$ 进行相似性计算，并计算点与中心点之间的余弦相似度矩阵 $\mathbf{S}\in\mathbb{R}^{c\times n}$。

2. **特征聚合**：基于与中心点的相似性动态聚合簇中的点，聚合特征 $g$ 通过公式：

   $$
   g = \frac{1}{\mathcal{C}} \left( v_c + \sum_{i=1}^{m} \mathrm{sig}\left(\alpha s_i+\beta\right) * v_i \right),
   \qquad \mathrm{s.t.},  \ \
   \mathcal{C} = 1+ \sum_{i=1}^{m}\mathrm{sig}\left(\alpha s_i+\beta\right)
   $$

   其中，$\alpha$ 和 $\beta$ 是可学习的，$s_i$ 是这些点与中心点的相似度，$m$ 是这个簇内的点的个数

3. **特征分配**：将聚合的特征 $g$ 自适应地分配给簇中的每个点：

   $$
   p_i' = p_i + \mathrm{FC}\left(\mathrm{sig}\left(\alpha s_i+\beta\right) * g\right)
   $$

## Vision Transformer with Super Token Sampling

[arxiv / 2211.11167](https://arxiv.org/pdf/2211.11167)

### 前情提要：SSN

首先介绍一下什么 [SSN](https://arxiv.org/abs/1807.10174)。

过往的 SLIC 算法基于 $k-means$ 聚类算法，由于其计算用到了最近邻操作，所以不可微分，无法实现端到端训练。

其目标可以形式化表示为：给定图像 $I \in \mathbb{R}^{n \times 5}$，在 $n$ 个像素处具有 $5$ 维的 $XYLab$ 特征，超像素计算的任务是将每个像素分配给 $m$ 个超像素之一，即计算像素 - 超像素关联图 $H \in \{0,1,\cdots,m-1\}^{n \times 1}$，表示每个原始像素只属于一个超像素。

那么 SLIC 的计算过程可以表示为：

1. 将每个像素与五维空间中最近的超像素中心关联，即计算每个像素 $p$ 的新超像素分配：

   $$
   H_p^t = \underset{i \in \{0,...,m-1\}}{\arg \min}D(I_p, S^{t-1}_i)
   $$

   其中， $D$ 表示距离计算 $D(\textbf{a},\textbf{b}) = ||\textbf{a}-\textbf{b}||^2$。

   注意，**此操作正是不可微分的来源**。

2. 在每个超像素聚类内部平均像素特征（$XYLab$）以获得新的超像素聚类中心 $S^t$。对于每个超像素 $S_i$，我们计算该聚类的质心并使之更新 $S_i$：

   $$
   S^t_i = \frac{1}{Z_i^t}\sum_{p | H_p^t = i} I_p
   $$

   其中 $Z_i^t$ 表示超像素簇 $i$ 中的像素数量。

SLIC 在此基础上，将最近邻计算转为了可微分的操作，使用软关联 $Q$（每个像素可以与多个超像素有不同程度的关联，其中 $Q \in \mathbb{R}^{n \times m}$）代替了硬关联 $H$：

$$
Q_{pi}^t = e^{-D(I_p,S_i^{t-1})} = e^{-||I_p - S_i^{t-1}||^2}
$$

其中， $Q_{pi}^t$ 表示迭代 $t$ 时像素 $p$ 与超像素 $i$ 的软关联，$I_p$ 表示像素 $p$ 的特征，$S_i^{t-1}$ 表示迭代 $t-1$ 时超像素 $i$ 的中心。

并且替换了超像素聚类中心的计算，改为计算像素特征的加权和：

$$
S^t_i = \frac{1}{Z_i^t}\sum_{p=1}^n Q_{pi}^t I_p
$$

其中，$S^t_i$ 表示迭代 $t$ 时超像素 $i$ 的新中心，$Z_i^t = \sum_p Q_{pi}^t$ 是归一化常数。

同时，为了减少计算复杂度，对于每个像素，SSN 只对其原始位置划分得到的周围 $3\times3=9$ 个超像素执行计算与更新（注：即便随着迭代轮次增加，超像素中心会偏移，但是依照我的理解，依旧是只对其原始位置附近这 9 个超像素进行更新）

![SSN](https://cdn.arthals.ink/bed/2024/09/SSN-9d39872625bb4ac86589114552b90f8f.jpg)

### 核心思想：将超像素的 SSN 应用到 token 上，实现 token 的聚合

![STViT](https://cdn.arthals.ink/bed/2024/09/STViT-e22063fde4fda635fff99555f5becfbb.jpg)

STT 块整体过程可以表示为：

$$
\begin{align}
  X &= {\rm CPE}(X_{in}) + X_{in} \\
  Y &= {\rm STA}({\rm LN}(X)) + X \\
  Z &= {\rm ConvFFN}({\rm BN}(Y)) + Y
\end{align}
$$

#### CPE (Coordinate Pointwise Encoding, 坐标点注意力)

使用深度卷积的主要目的是减少计算量。

这一步和后面的的 ConvFFN 都是为了补充局部的细节。

#### STA (Super Token Attention, 超像素注意力)

1. STS (Super Token Sampling, 超令牌采样)
2. MHSA (Multi-Head Self-Attention, 多头自注意力)
3. TU (Token Upsampling, 令牌上采样)

#### 超令牌采样

超令牌采样基本上就是把 SSN 的思想应用到超令牌空间，对于先前嵌入得到的基础视觉令牌，我们进行如下操作：

1. 初始化超令牌

   给定视觉令牌 $X \in \mathbb{R}^{N \times C}$，其中 $N = H \times W$ 是令牌数量，每个令牌 $X_i \in \mathbb{R}^{1 \times C}$ 假设属于 $m$ 个超令牌 $S \in \mathbb{R}^{m \times C}$ 之一。我们首先通过在常规网格区域中取平均值来采样初始超令牌 $S^0$。如果网格大小为 $h \times w$，那么超令牌的数量为 $m = \frac{H}{h} \times \frac{W}{w}$。

2. 将令牌与超令牌关联

   在第 $t$ 次迭代中，我们计算令牌 $X$ 和超令牌 $S$ 的关联，我们采用类似注意力机制的方式：

   $$
   Q^t = \text{Softmax} \left(\frac{X {S^{t-1}}^{\text{T}}}{\sqrt{d}}\right)
   $$

   其中：

   - $d$ 是通道数 $C$。

   - $X \in \mathbb{R}^{N \times C}$：$N$ 是令牌数量，$C$ 是通道数。
   - ${S^{t-1}} \in \mathbb{R}^{m \times C}$：$m$ 是超级令牌数量，$C$ 是通道数。

   这个过程不同于 SSN 的原始设计，实际上是计算了令牌和超级令牌之间的点积相似度，而不是 SSN 的计算距离，并且使用了 Softmax 进行归一化，使得关联度具有概率解释。

   （Q：这里其实我说不好那种方式更优，~~SSN 的话要求超令牌的欧几里得范数不是越大越相似，而是大概和令牌本身相似就好，但是超令牌采样这里，由于计算的是点积相似度，似乎是欧几里得范数越大越相似~~，后面归一化了那没事了）

3. 更新超令牌

   超令牌 $S$ 被更新为令牌的加权和：

   $$
   S = ({\hat{Q}}^{t})^{\text{T}} X
   $$

   其中， $\hat{Q}^t$ 是列归一化的 $Q^t$。

4. 同样，为了减少计算量，这里也使用了和 SSN 类似的限制关联计算范围、减少更新次数的方法，来降低计算复杂度，并且仅在第一次迭代时更新超令牌。（Q：诶，那后面迭代了个啥）

通过加权和更新超令牌，我们使其更好地代表对应的视觉令牌。

#### 超令牌自注意力机制

由于超令牌是视觉内容的紧凑表示，对其应用自注意力机制可以更关注全局上下文依赖关系，而不是局部特征。我们对采样得到的超令牌 $S \in \mathbb{R}^{m \times C}$ 应用标准的自注意力机制，其定义为：

$$
\text{Attn} (S) = \text{Softmax}\left(\frac{\mathbf{q}(S)\mathbf{k}^{\text{T}}(S)}{\sqrt{d}}\right) \mathbf{v}(S) = \mathbf{A}(S)\mathbf{v}(S)
$$

其中：

- $\mathbf{A}(S) = \text{Softmax}\left(\frac{\mathbf{q}(S)\mathbf{k}^{\text{T}}(S)}{\sqrt{d}}\right) \in \mathbb{R}^{m \times m}$ 是注意力图
- $\mathbf{q}(S) = SW_q$，$\mathbf{k}(S) = SW_k$ 和 $\mathbf{v}(S) = SW_v$ 是带有参数 $W_q$，$W_k$ 和 $W_v$ 的线性函数。

#### 令牌上采样

尽管超令牌能够通过自注意力机制捕获更好的全局表示，但它们在采样过程中丢失了大部分局部细节。

因此，我们并不直接将它们用作后续层的输入，而是将它们映射回视觉标记并添加到原始标记 $X$ 中。

$$
{\rm TU}({\rm Attn}(S)) = Q {\rm Attn}(S)
$$

其中：

- $Q \in \mathbb{R}^{N \times m}$：上步迭代得到的关联图（association map），表示每个超令牌与原始令牌之间的关系。
- ${\rm Attn}(S) \in \mathbb{R}^{m \times C}$：经过自注意力机制处理的超令牌，捕捉到的全局特征。

#### FFN (Feed-Forward Network，前馈神经网络)

没啥说的，感觉也是补偿局部的细节学习能力。

## MSViT: Dynamic Mixed-Scale Tokenization for Vision Transformers

[arxiv / 2307.02321](https://arxiv.org/pdf/2307.02321)

### 核心思想：依靠门控机制创建多尺度令牌

通过引入一个条件门控多层感知器 MLP，从而动态选择每个区域的令牌尺度，实现对于冗余令牌的抑制。

![MSViT](https://cdn.arthals.ink/bed/2024/09/MSViT-92d557040fec5e50790dc9bfae6ac5cc.jpg)

在这张图中，可以看到：

- 上面的图像元素较少，于是背景信息大多使用了较大的令牌尺度（粗令牌）
- 下面的图像元素很多，内容复杂且细节较多，于是大多使用了较小的令牌尺度（细令牌）

### 基础定义

我们首先定义细尺度和粗尺度，它们对应上图中两种 patch 尺度的取法：

- $S_{f}$：细尺度
- $S_{c}$：粗尺度

其中，$S_{f} < S_{c}$

提取方形 patch ：在两个尺度中提取方形 patch，总共有 $N = N_{S_{f}} + N_{S_{c}}$ 个 token。

### 门控机制的实现

门控机制：引入离散的门控机制 $g$，确定应当选择两个尺度中的哪一个作为输出。活动（被激活的） token 会被进一步送入变换器，而非活动的 token 会被丢弃。

门控机制会解析每个粗尺度 token，并输出一个二元决策，即该区域是否应该在粗尺度或细尺度下进行 token 化。我们额外假定细尺度 $S_{f}$ 能够均匀划分粗尺度 $S_{c}$。对于所有 $i$，第 $i$ 个细尺度 token 可以映射到其所属的唯一粗尺度 token，该映射定义为 $C(i) = j$。

利用这个映射，在细 token 级别恢复完整的二元混合尺度掩码 $\overline{m}$，使用粗级门输出：

$$
\begin{align}
    \forall j \in [1, N_{S_{c}}],\ &m_j = \text{GumbelSigmoid}(g(x_j)) \in [0, 1] \\
    &\overline{m}_j = \text{STE}(m_j) \in \{0, 1\} \\
    \forall i \in [N_{S_{c}} + 1, N_{S_{c}} + N_{S_{f}} ],\ &\overline{m}_i = 1 -  \overline{m}_{C(i)}
\end{align}
$$

其中：

- $m_j$：训练过程中用于约束门的软输出，范围在 $[0, 1]$
- $\overline{m}_j$：前向传递过程中使用的离散化输出，取值为 0 或 1
- $\text{GumbelSigmoid}$：Gumbel-Sigmoid 松弛，是 GumbelSoftmax 的二元版本
- $\text{STE}$：直通梯度估计器（Straight-Through Estimator），一种在训练过程中用于处理不可导函数的技巧。

有关 Gumbel-Softmax：这是一个重参数化技巧，可以将从离散的概率分布采样这一不可导的操作，转化为一个可导的操作，从而允许进行反向传播。

重参数技巧可以理解为是把采样的步骤移出计算图，这样整个图就可以计算梯度反向传播更新了。其在 VAE 中广泛使用。

具体的数学证明，可以参见 [Yiwei Zhang / 离散分布重参数化：Gumbel-Softmax Trick 和 Gumbel 分布](https://www.zywvvd.com/notes/study/deep-learning/generation/reparameterized/repara2/repara2/)

有关 STE：可以参见 [刘泽春 / Straight-through estimator (STE) 解读](https://zhuanlan.zhihu.com/p/570322025)

### 跨尺度参数共享

将不同尺度的 token 送入后续 ViT，一般需要引入额外参数或者其他方法，但是作者选择在这里直接将粗尺度的 token 通过线性插值调整到细尺度下的等效值，从而能够避免一些诸如路由不平衡和数据饥饿之类的问题。

Q：损失函数看不太懂，怎么学设计这种复杂损失函数啊？

## Vision Transformers with Mixed-Resolution Tokenization

[arxiv / 2304.00287](https://arxiv.org/pdf/2304.00287)

这篇文章的大致思想和 MSViT 一致，通过划分不同尺度的 patch 来减少输入 Transformer 的 token 数量，改进计算成本。

### 核心思想：划分不同尺度的 patch

1. 动态选择 patch 尺度，通过一个评分函数（评分器） $score$ 来确定选择哪个 “最重要的” patch 来进一步执行四叉树划分，存在 patch 大小的最大值与最小值限制。整个过程的迭代结束条件为分割出的 patch 数量达到预期。

   $$
   \begin{aligned}
   &\text{Input:} \\
   &\quad\text{Image } im \in \mathbb{R}^{h \times w \times 3}, \\
   &\quad\text{desired number of patches } L \in \mathbb{N}, \\
   &\quad\text{patch edge sizes } s_{min}, s_{max} \in \mathbb{N}, \\
   &\quad\text{saliency scorer } score : patch \rightarrow \mathbb{R}^{+} \\
   &\text{Output:} \\
   &\quad\text{The set of chosen patches } P_{chosen} \\
   &\text{Algorithm:} \\
   &\quad P_{chosen} \leftarrow \text{slice } im \text{ into a uniform grid with patch size } s_{max} \\
   &\quad \text{while } |P_{chosen}| < L \text{ do} \\
   &\quad\quad P_{splittable} \leftarrow \{p \mid p \in P_{chosen} \ \& \ size(p) \geq 2s_{min}\} \\
   &\quad\quad p_{split} \leftarrow \arg\max_{p \in P_{splittable}} score(p) \\
   &\quad\quad children(p_{split}) \leftarrow \text{divide } p_{split} \text{ into 4 quadrants} \\
   &\quad\quad P_{chosen} \leftarrow children(p_{split}) \cup P_{chosen} \setminus \{p_{split}\} \\
   &\quad \text{end} \\
   &\text{Return } P_{chosen}
   \end{aligned}
   $$

2. 对于每个非 $s_{min}$ 的 patch，统一缩小到 $s_{min}$ 以便于后续展平后得到相同尺寸，送入全连接层进行嵌入。

3. 位置嵌入：以由最小补丁大小 $s_{min}$ 确定网格，嵌入 patch 中心的 $(x,y)$ 位置。

4. 评分器：作者尝试了多种评分器，最终选择了基于特征的 patch 评分器：

   ![scorer](https://cdn.arthals.ink/bed/2024/09/scorer-b3c1bf3227553b833f3d48d91765eae9.jpg)

## Token Merging: Your ViT But Faster

[arxiv / 2210.09461](https://arxiv.org/pdf/2210.09461)

### 核心思想：令牌合并

本文提出了一种名为 “令牌合并” 的方法来组合令牌，而不是像过往文章中常见的修剪令牌操作。

新的 “令牌合并” 方法可以无需额外引入任何参数即可直接插入到现有的 ViT 中，直接进行对于相似的冗余令牌的合并，无需重新训练即可提高吞吐量。

### 核心方法

#### 双重软匹配

两个令牌是否相似，定义为两个令牌在自注意力机制 QKV 中 Key 的点积相似度。因为 Key 总结了每个令牌中包含的信息，所以这种方法比直接使用令牌特征向量的欧氏距离要更好。

接下来，作者提出了一种名为 “双重软匹配” 的并行化、渐进性的匹配方法（注意这里不是聚类算法，因为聚类算法没有限制可以合并成一组的标记数量，而这对于网络是不好的，当太多的标记被合并为一组时，他们的相关度可能会下降，从而导致网络的性能随之下降）：

1. 将标记划分为两个大小大致相等的集合 $\mathbb{A}$ 和 $\mathbb{B}$
2. 从 $\mathbb{A}$ 中的每个标记引出一条边到其在 $\mathbb{B}$ 中最相似的令牌。
3. 保留 $r$ 条最相似的边。
4. 合并仍然连接的标记（合并方法为平均它们的特征）。
5. 将两个集合重新连接起来。

由于此方法创建的是一个二部图，其连通分量十分容易查找。并且对于同一集合内的令牌，不需要进行相似度的计算，从而提高了效率。

#### 标记大小跟踪

由于进行了标记合并，现在每个标记和输入 patch 不再是一一对应，而这会影响 softmax 注意力的结果。

为此，一个很自然的想法是，对于 softmax 注意力机制进行加权，也即，合并次数较多、代表 patch 数量较多的令牌，我们给予其更高的权重。这就是 “比例注意力” 机制：

$$
A = \text{softmax}\left(\frac{QK^\top}{\sqrt{d}} + \log s\right)
$$

其中，$s$ 是一个行向量，包含每个令牌的大小（即每个令牌所代表的 patch 数量）。

> 可以理解为，原先是：
>
> $$
> \text{softmax}(z_i) = \frac{e^{z_i}}{\sum_{j} e^{z_j}}
> $$
>
> 现在，对于其中某个 $z_i$ ，我们假设其进行了 $s$ 次合并，那么其进行 softmax 时，从 $z_i$ 改为了 $z_i + \log s$，再经过 $e$ 的指数运算，就得到了 $s \times e^{z_i}$，相当于其权重被放大了 $s$ 倍。

这种方法确保了合并后的令牌依旧能够正确反映其所代表的多个输入 patch，从而保持了注意力机制的准确性。
