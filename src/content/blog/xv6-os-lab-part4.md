---
title: 更适合北大宝宝体质的 xv6 OS Lab 踩坑记 - Part4
description: '北京大学 2025 年秋季学期操作系统/OS Lab Part 4'
publishDate: 2025-10-27 13:40:52
updatedDate: 2025-10-31 13:25:15
tags:
  - 操作系统
  - xv6
  - PKU
language: '中文'
---

> [!CAUTION]
>
> **致各位同学：本笔记的撰写目的是用作参考，请勿直接抄袭，否则后果自负。**
>
> 另外，请注意，本文撰写基于我修改过的 `initcode.S` 和 `Makefile` 文件，如果你是基于原始仓库所编写的，可能需要手动进行一些初始化修改。

Part4 的核心任务是实现三种不同的进程调度算法：轮转调度（Round-Robin, RR）、优先级调度（Priority Scheduling）和多级反馈队列调度（Multi-level Feedback Queue, MLFQ）。

助教提供了一个模板仓库，其中包含测试程序和 judger 框架，然而我并不想在其上开始完成我的 Lab（因为其是从更基础的原始 xv6-k210 仓库开始完成了一些基础删改得来的），而是在我已经实现了 Part 1、2、3、7 各种系统调用的基础上完成改造。

为了支持这三种调度算法的切换和测试，我们需要对助教的修改进行 cherry pick。同时，为了保证向后兼容，我们需要通过利用各种宏来完成条件编译。

## Makefile 与条件编译

为了方便地在不同的调度算法之间切换，我们对 `Makefile` 进行了深度改造。仿照助教修改的 `Makefile`，我们定义 `SCHEDULER_TYPE` 变量，我们可以在编译时向 C 编译器传递不同的宏定义（`-D`），从而控制哪些代码块参与编译。这里我们同时对 k210 平台的部分进行了删除，以保证简洁。

你可以在 [这里](https://github.com/zhuozhiyongde/XV6-OS-2025Fall-PKU/blob/main/Makefile) 看到我最终修改后的 Makefile。

简而言之，我实现了：

1. 对于 `make local` 命令，完全类似之前。但如果在 `Makefile` 里手动修改 `SCHEDULER_TYPE` 变量，那么可以启用对应的调度算法与单一测例。如果不指定，会是默认的简化版 RR 调度算法。
2. 对于 `make run_test` 命令，编译时注入 `ENABLE_JUDGER=1` 参数以及对应宏，会启用自动化测试框架。此时可以通过如下三个命令对特定调度算法进行测试并获得得分：
    - `make run_test SCHEDULER_TYPE=RR`
    - `make run_test SCHEDULER_TYPE=PRIORITY`
    - `make run_test SCHEDULER_TYPE=MLFQ`

## 扩展 PCB 与新增系统调用

不同的调度算法需要在进程控制块 `struct proc` 中存储不同的信息。

-   **RR 调度**：需要记录每个进程的时间片长度 `timeslice` 和当前剩余的时间片 `slice_remaining`。
-   **优先级调度**：需要记录每个进程的静态优先级 `priority`。
-   **MLFQ 调度**：需要更复杂的字段，包括动态优先级 `priority`、用户设置的基础优先级 `base_priority`（用于同级队列的优先级判定），以及用于动态调整优先级的统计信息，如 `cpu_ticks`（CPU 使用时间）、`sleep_ticks`（睡眠时间）等。

```c
// kernel/include/proc.h
struct proc {
  // ...
  #ifdef SCHEDULER_RR
  int timeslice;
  int slice_remaining;
  #endif

  #ifdef SCHEDULER_PRIORITY
  int priority;
  #endif

  #ifdef SCHEDULER_MLFQ
  int priority;
  int ticks_used;
  int eval_ticks;
  int cpu_ticks;
  int sleep_ticks;
  int base_priority;
  #endif
  // ...
};
```

为了让用户程序能够与调度器交互，我们新增了三个系统调用：

```c
#define SYS_set_timeslice 400 // RR 算法：设置当前进程的时间片
#define SYS_set_priority 401  // PRIORITY / MLFQ 算法：设置当前进程的优先级
#define SYS_get_priority 402  // PRIORITY / MLFQ 算法：获取当前进程的优先级
```

这些系统调用的实现位于 `kernel/sysproc.c` 中，它们会根据传入的参数修改当前进程 `proc` 结构体中对应的字段。

注意，与最初的 `shutdown` 系统调用一样，这里新增的三个系统调用需要在 `user.h` 和 `usys.pl` 中进行声明和注册，否则用户态的测试程序无法直接使用它们。

为了实现各个调度算法，我们主要需要关注如下内容：

1. `proc.h` 中的 PCB 结构体 `struct proc`，其需要根据不同的调度算法进行扩展。
2. `proc.c` 中：
    - `scheduler()` 调度器函数，其负责选择下一个要运行的进程
    - `yield()` 函数，其负责主动切换当前进程的 `state`，从 `RUNNING` 到 `RUNNABLE`，然后调用 `sched()` 函数让出 CPU
    - `sched()` 函数负责切换到调度器
3. `trap.c` 中时钟中断处理函数 `kerneltrap()` 和 `usertrap()`，其负责处理时钟中断（即 `which_dev == 2` 时）并触发调度。
4. `sysproc.c` 中的 `sleep()` 函数，其在使用 MLFQ 调度算法时需要记录睡眠 ticks，从而判断进程是 CPU 密集型还是 I/O 密集型。
5. `sysfile.c` 中对新增 `dup2` 系统调用的实现，这个按照助教的模板抄一下就行，主要是为了评测使用。

## 原框架自带的调度算法

正如助教在文档里所说，xv6 原本就自带了一套非常基础的调度算法。理解它的工作原理是实现新算法的基础。

### 算法原理

原版 xv6 的调度算法可以看作一个最朴素的、基于数组轮询的 **轮转调度（Round-Robin）** 算法。它没有优先级的概念，也没有为每个进程维护独立的时间片。其核心逻辑是：

1.  **顺序扫描**：调度器 `scheduler()` 在一个死循环中，从头到尾依次遍历全局的进程数组 `proc[]`。

2.  **选择第一个就绪进程**：当它找到第一个状态为 `RUNNABLE` 的进程时，就选择该进程投入运行（先设置状态为 `RUNNING`，然后执行 `swtch` 切换到进程）

    如果一轮扫描都没有找到 `RUNNABLE` 进程，调度器会执行 `wfi`（wait-for-interrupt）等待，直到有新的中断唤醒。

3.  **时钟中断驱动抢占**：一个硬件时钟会周期性地产生中断。当中断发生时，如果当前有进程正在运行，中断处理程序会强制调用 `yield()`，使当前进程放弃 CPU。

4.  **让出与重调度**：`yield()` 函数将当前进程的状态从 `RUNNING` 改回 `RUNNABLE`，然后也是通过 `swtch` 切换回调度器。

    注意这里切回调度器后不是说重新开始从头执行 `scheduler()` 函数，而是继续到 `swtch()` 的下一行，这类似一个 `goto` 跳转。

    从而，调度器不会从头开始遍历 `proc[NPROC]` 数组，而是会继续寻找数组中下一个 `RUNNABLE` 的进程。

这个算法保证了没有任何进程会被 “饿死”，因为时钟中断确保了没有进程可以永远独占 CPU。但它的效率不高，因为它对所有进程一视同仁，无法区分任务的紧急性。

你可能还会好奇 `swtch()` 函数在哪里，好像没找到它的定义，实际上它定义在 `kernel/swtch.S` 里，已经被写成了汇编形式，主要干的事情就是保存 / 恢复寄存器：

```assembly
# Context switch
#
#   void swtch(struct context *old, struct context *new);
#
# Save current registers in old. Load from new.


.globl swtch
swtch:
        sd ra, 0(a0)
        sd sp, 8(a0)
        sd s0, 16(a0)
        sd s1, 24(a0)
        sd s2, 32(a0)
        sd s3, 40(a0)
        sd s4, 48(a0)
        sd s5, 56(a0)
        sd s6, 64(a0)
        sd s7, 72(a0)
        sd s8, 80(a0)
        sd s9, 88(a0)
        sd s10, 96(a0)
        sd s11, 104(a0)

        ld ra, 0(a1)
        ld sp, 8(a1)
        ld s0, 16(a1)
        ld s1, 24(a1)
        ld s2, 32(a1)
        ld s3, 40(a1)
        ld s4, 48(a1)
        ld s5, 56(a1)
        ld s6, 64(a1)
        ld s7, 72(a1)
        ld s8, 80(a1)
        ld s9, 88(a1)
        ld s10, 96(a1)
        ld s11, 104(a1)

        ret
```

### 实现细节

该算法的实现分散在两个关键文件中：

1.  `kernel/proc.c` 中的 `scheduler()` 函数：

    这是调度的核心循环。代码非常直白，就是一个 `for` 循环遍历 `proc` 数组。

    ```c
    void
    scheduler(void)
    {
      struct proc *p;
      struct cpu *c = mycpu();
      // ...
      c->proc = 0;
      for(;;){ // 无限循环
        intr_on();
        for(p = proc; p < &proc[NPROC]; p++) { // 从头遍历进程数组
          acquire(&p->lock);
          if(p->state == RUNNABLE) { // 找到第一个可运行的进程
            // ...
            p->state = RUNNING;
            c->proc = p;
            swtch(&c->context, &p->context); // 切换到该进程执行
            // ...
            c->proc = 0;
          }
          release(&p->lock);
        }
      }
    }
    ```

2.  `kernel/trap.c` 中的时钟中断处理：

    这是实现 “抢占” 的关键。当进程在用户态或内核态运行时，时钟中断都会发生。中断处理程序 `usertrap()` 和 `kerneltrap()` 会判断中断类型。

    ```c
    // in usertrap()
    // give up the CPU if this is a timer interrupt.
    if(which_dev == 2)
      yield();

    // in kerneltrap()
    // give up the CPU if this is a timer interrupt.
    if(which_dev == 2 && myproc() != 0 && myproc()->state == RUNNING) {
      yield();
    }
    ```

    `devintr()` 函数会识别出时钟中断并返回 `2`。当中断发生时，代码会调用 `yield()`。

    `yield()` 函数（位于 `proc.c`）则负责将当前进程状态置为 `RUNNABLE` 并调用 `sched()`，将控制权交还给调度器，从而完成一次抢占和重调度。

你可能还会注意到，`usertrap()` 和 `kerneltrap()` 在处理时钟中断时，判断条件有所不同，内核态中断处理程序多了一些条件，这个差异源于它们处理中断时所处的 **上下文（Context）** 完全不同。

**`usertrap()` 对应用户态中断**，当 CPU 正在执行 **用户态** 代码时，发生了一个中断或异常（如系统调用、缺页、时钟中断），就会进入 `usertrap()`。

此时 **必然** 有一个用户进程正在 CPU 上运行。因此，`myproc()` 一定会返回一个有效的进程指针，并且该进程的状态必然是 `RUNNING`。在这种情况下，直接调用 `yield()` 来让出 CPU 是完全安全的，无需额外检查。

**`kerneltrap()` 对应内核态中断**，当 CPU 已经在执行 **内核态** 代码时，又发生了一个中断（通常是外部设备中断，如时钟或磁盘），就会进入 `kerneltrap()`。

内核态执行的代码并不总是代表某个特定进程在运行，所以必须多一些额外判断：

-   `myproc() != 0`：CPU 可能会在没有关联任何进程的情况下执行内核代码。一个典型的例子就是调度器 `scheduler()` 本身。在 `scheduler()` 循环中，选定下一个进程之前（`c->proc = p;` 执行之前），`myproc()` 会返回 `0`。如果此时恰好发生时钟中断，`myproc()` 就是 `NULL`，若不加判断直接调用 `yield()` 就会导致内核崩溃（panic）。
-   `myproc()->state == RUNNING`：即使 `myproc()` 非空，也不能保证其状态是 `RUNNING`。例如，一个进程可能因为等待 I/O 而调用了 `sleep()`，在 `sleep()` 函数内部，它的状态已经被设置为 `SLEEPING`，但它仍然在执行内核代码（直到调用 `sched()` 切换走）。如果此时发生时钟中断，我们不应该对一个 `SLEEPING` 状态的进程执行 `yield()`，因为 `yield()` 的前提是进程主动放弃 CPU 并回到 `RUNNABLE` 状态，这与 `SLEEPING` 的逻辑是冲突的。

这些额外的判断条件确保了只有当一个 **真正处于运行状态的进程** 在执行内核代码时遭遇时钟中断，才会触发抢占式调度。这避免了在调度器、进程切换等内核关键路径中发生中断时，因上下文不确定而导致的系统崩溃。

## 轮转调度（Round-Robin, RR）

### 算法原理

轮转调度（RR）是最简单、最公平的抢占式调度算法之一。它的核心思想是，系统维护一个先进先出（FIFO）的就绪队列，所有就绪进程按到达顺序排队。调度器每次从队列头部取出一个进程，并给予其一个固定的时间片（Time Slice）在 CPU 上运行。

-   如果进程在时间片结束前完成，它会主动释放 CPU。
-   如果时间片耗尽时进程仍在运行，它将被强制剥夺 CPU（抢占），并被移动到就绪队列的末尾，等待下一轮调度。

RR 算法的优点是实现简单、公平，能保证每个进程都能在一定时间内获得响应，因此响应时间表现较好。缺点是上下文切换较为频繁，且无法区分任务的紧急程度。

### 测例说明

观察助教提供的测例 `test_proc_rr.c`，可以发现三个进程所做的事情是一样的，唯一的区别在于测例会调用 `set_timeslice()` 系统调用来为三个进程设立不同的最大运行时间片。

```c
int main() {
    printf("Testing RR Scheduler - Basic\n");

    int pid1, pid2, pid3;
    if((pid1=fork())==0) {
        set_timeslice(1);
        task(1);
        exit(0);
    }
    if((pid2=fork())==0) {
        set_timeslice(2);
        task(2);
        exit(0);
    }
    if((pid3=fork())==0) {
        set_timeslice(3);
        task(3);
        exit(0);
    }
    wait(0);
    wait(0);
    wait(0);

    printf("RR Basic Test Completed\n");
    exit(0);
}
```

那么，在 `scheduler` 的每一轮调度 `for` 循环中，P3 能连续执行 3 个时间单位，P2 能执行 2 个，而 P1 只能执行 1 个。

也就是说，假设我们认为他们在 `proc[NPROC]` 数组中恰好排序是 P1、P2、P3，一切时间中断的发生都很理想，那么理论上就会发生：

1. **`scheduler()` 调度到 P1**，其 `slice_remaining` 被重置为通过 `set_timeslice(1)` 系统调用设置的时间片长度 1，开始一个新的调度周期。
2. 第 1 次时间中断发生，在 `usertrap() / kerneltrap()` 中，将 `P1->slice_remaining` 减 1，此时 `P1->slice_remaining` 为 0，因此会调用 `yield()` 主动让出 CPU，从而触发一次重新调度。
3. **`scheduler()` 继续 for 循环，选择 P2 运行**，其 `slice_remaining` 被重置为 2，开始一个新的调度周期。
4. 第 2 次时间中断发生，在 `usertrap() / kerneltrap()` 中，将 `P2->slice_remaining` 减 1，此时 `P2->slice_remaining` 为 1，因此会直接 `return` 不会调用 `yield()`，从而继续运行 P2。
5. 第 3 次时间中断发生，在 `usertrap() / kerneltrap()` 中，将 `P2->slice_remaining` 减 1，此时 `P2->slice_remaining` 为 0，因此会调用 `yield()` 主动让出 CPU，从而触发一次重新调度。
6. **`scheduler()` 继续 for 循环，选择 P3 运行**，其 `slice_remaining` 被重置为 3，开始一个新的调度周期。
7. 第 4 次时间中断发生，在 `usertrap() / kerneltrap()` 中，将 `P3->slice_remaining` 减 1，此时 `P3->slice_remaining` 为 2，因此会直接 `return` 不会调用 `yield()`，从而继续运行 P3。
8. 第 5 次时间中断发生，在 `usertrap() / kerneltrap()` 中，将 `P3->slice_remaining` 减 1，此时 `P3->slice_remaining` 为 1，因此会直接 `return` 不会调用 `yield()`，从而继续运行 P3。
9. 第 6 次时间中断发生，在 `usertrap() / kerneltrap()` 中，将 `P3->slice_remaining` 减 1，此时 `P3->slice_remaining` 为 0，因此会调用 `yield()` 主动让出 CPU，从而触发一次重新调度。
10. `scheduler()` 重新开始一轮 for 循环，选择 P1 运行...

这意味着在相同的时间（或者理解为 `scheduler` 内层对 `proc[NPROC]` 的一次遍历）内，P3 获得的 CPU 时间最多，其次是 P2，最少的是 P1，而又因为他们的任务是相同的，所以预期结果是：

```
Testing RR Scheduler - Basic
RR Scheduler Process 3 completed
RR Scheduler Process 2 completed
RR Scheduler Process 1 completed
RR Basic Test Completed
```

### 实现细节

首先，我们在 `proc.h` 中对 `struct proc` 进行扩展：

```c
// kernel/include/proc.h
struct proc {
  // ...
  #ifdef SCHEDULER_RR
  int timeslice;                // 进程设定的基础时间片长度
  int slice_remaining;          // 当前调度周期内剩余的时间片
  #endif
  // ...
};
```

接着，在 `sysproc.c` 中新增 `sys_set_timeslice` 系统调用，其可以直接修改上述新增 PCB 字段：

```c
// kernel/sysproc.c
#ifdef SCHEDULER_RR
/**
 * @brief RR 算法所需内核函数，设置当前进程的时间片
 * @param timeslice 新的时间片长度
 * @return 0 表示系统调用成功返回，-1 表示参数解析失败
 */
uint64 sys_set_timeslice(void) {
  int timeslice;
  if (argint(0, &timeslice) < 0) {
    return -1;
  }
  struct proc* p = myproc();
  // 合法性校验
  if (timeslice < 1) {
    return -1;
  }
  acquire(&p->lock);
  p->timeslice = timeslice;
  p->slice_remaining = timeslice;
  release(&p->lock);
  return 0;
}
#endif
```

接下来就是实现 RR 算法。

我们先在 `proc.c` 中对 `scheduler()` 函数进行改造，确保每个 `RUNNABLE` 进程的 `slice_remaining` 都被重置为 `timeslice`，以及时间片至少为 1：

```c
// kernel/proc.c
void scheduler(void) {
  // ...
  c->proc = 0;
  for(;;){
    // Avoid deadlock by ensuring that devices can interrupt.
    intr_on();

    int found = 0;
    for(p = proc; p < &proc[NPROC]; p++) {
      acquire(&p->lock);
      if (p->state == RUNNABLE) {
        #ifdef SCHEDULER_RR
        // RR: 确保时间片至少为 1
        if (p->timeslice < 1) {
          p->timeslice = 1;
        }
        p->slice_remaining = p->timeslice;
        #endif
        // ...
      }
      release(&p->lock);
    }
    // ...
  }
}
```

接下来我们进行时钟中断处理，这是实现抢占的关键。每次发生时钟中断（`trap.c` 内的 `usertrap()` 或 `kerneltrap()`），都会调用 `rr_on_timer_tick()` 函数：

```c
// kernel/proc.c
#ifdef SCHEDULER_RR
/**
 * @brief RR 算法所需内核函数，处理时间片递减与抢占逻辑
 * @return void
 */
void rr_on_timer_tick(void) {
  struct proc* p = myproc();
  // 无进程时无需处理
  if (p == 0) {
    return;
  }
  // 仅在进程实际运行时才计时
  if (p->state != RUNNING) {
    return;
  }
  // 仍有剩余时间片时递减
  if (p->slice_remaining > 0) {
    p->slice_remaining--;
  }
  // 时间片耗尽需让出 CPU
  if (p->slice_remaining <= 0) {
    yield();
    return;
  }
}
#endif
```

这个函数每次在时钟中断发生时，被 `usertrap()` 或 `kerneltrap()` 调用，进行合法性检查后，就会对当前进程的 `slice_remaining` 减 1。一旦减到 0，说明时间片耗尽，就调用 `yield()` 主动让出 CPU，从而触发一次重新调度。

```c
// kernel/trap.c
void
usertrap(void)
{
  // ...
  // give up the CPU if this is a timer interrupt.
  if (which_dev == 2) {
    #ifdef SCHEDULER_RR
    // RR 算法：进入时间中断后，处理时间片递减与抢占逻辑
    rr_on_timer_tick();
    #else
    // 默认：直接让出 CPU
    yield();
    #endif
  }

  usertrapret();
}

void
kerneltrap() {
  // ...
  if (which_dev == 2) {
    #ifdef SCHEDULER_RR
    // RR 算法：进入时间中断后，处理时间片递减与抢占逻辑
    rr_on_timer_tick();
    #else
    // 默认：直接让出 CPU
    if (myproc() != 0 && myproc()->state == RUNNING) {
      yield();
    }
    #endif
  }
  // ...
}
```

最后，我们还需要修改 `proc.h` 和 `proc.c` 中的一些其他函数，从而保证其他系统调用的正确性，具体如下：

-   `allocproc` 和 `freeproc` 需要额外初始化 / 重置 RR 的时间片信息。
-   `fork()` / `clone()` 在复制 PCB 时会继承父进程的 `timeslice` 和 `slice_remaining`。

```c
// kernel/proc.h
#ifdef SCHEDULER_RR
#define DEFAULT_TIMESLICE 1
#endif

// kernel/proc.c
static struct proc*
allocproc(void)
{
    // ...
found:
  p->pid = allocpid();

  #ifdef SCHEDULER_RR
  // RR: 初始化时间片相关字段
  p->timeslice = DEFAULT_TIMESLICE;
  p->slice_remaining = DEFAULT_TIMESLICE;
  #endif
  // ...
}

static void
freeproc(struct proc *p)
{
  // ...
  #ifdef SCHEDULER_RR
  p->timeslice = DEFAULT_TIMESLICE; // 重置时间片为默认值以供下次复用
  p->slice_remaining = 0; // 重置剩余时间片以避免旧值影响
  #endif
}

int
fork(void)
{
  // ...
  // copy tracing mask from parent.
  np->tmask = p->tmask;

  #ifdef SCHEDULER_RR
  // fork 时沿用父进程的时间片配置
  np->timeslice = p->timeslice;
  np->slice_remaining = p->timeslice;
  #endif

  // copy saved user registers.
  *(np->trapframe) = *(p->trapframe);
  // ...
}

int
clone(void)
{
  // ...
  // copy tracing mask from parent.
  np->tmask = p->tmask;

  #ifdef SCHEDULER_RR
  // fork 时沿用父进程的时间片配置
  np->timeslice = p->timeslice;
  np->slice_remaining = p->timeslice;
  #endif

  // copy saved user registers.
  *(np->trapframe) = *(p->trapframe);
  // ...
}
```

## 优先级调度（PRIORITY）

### 算法原理

优先级调度是一种抢占式调度算法，它为每个进程分配一个优先级。调度器总是选择当前所有就绪进程中优先级最高的那个来运行。在我们的实现中，约定 **优先级的数值越小，代表优先级越高**。

当一个更高优先级的进程进入就绪状态时，它可以立即抢占当前正在运行的低优先级进程。这种策略能保证高优先级的关键任务被优先处理。

### 测例说明

`test_proc_priority.c` 创建了三个进程 P1、P2、P3，它们执行完全相同的 CPU 密集型任务。不同之处在于，它们通过 `set_priority()` 系统调用被赋予了不同的优先级：

-   P1：`priority = 10`（最高）
-   P2：`priority = 20`（中等）
-   P3：`priority = 30`（最低）

由于优先级调度总是选择优先级最高的进程运行，因此 P1 会持续获得 CPU 时间，直到它完成任务。然后轮到 P2，最后是 P3。因此，预期的完成顺序是 P1 -> P2 -> P3。

```
Testing Priority Scheduler - Basic
Priority Scheduler Process 1 completed
Priority Scheduler Process 2 completed
Priority Scheduler Process 3 completed
Priority Basic Test Completed
```

### 实现细节

首先，在 `proc.h` 中对 `struct proc` 进行扩展：

```c
// kernel/include/proc.h
struct proc {
  // ...
  #ifdef SCHEDULER_PRIORITY
  // 优先级调度所需的 PCB 字段
  int priority;                 // 数值越小代表优先级越高
  #endif
  // ...
};
```

与 RR 类似，我们依靠系统调用让用户态进程自行设置优先级。

在 `sysproc.c` 中：

-   新增了 `sys_set_priority()` 系统调用，负责解析参数并更新当前进程的 `priority`
-   新增了 `sys_get_priority()` 系统调用，负责获取当前进程的优先级。

```c
// kernel/sysproc.c
#ifdef SCHEDULER_PRIORITY
/**
 * @brief 优先级调度算法所需内核函数，设置当前进程的优先级
 * @param priority 新的优先级
 * @return 0 表示系统调用成功返回，-1 表示参数解析失败
 */
uint64 sys_set_priority(void) {
  int priority;
  if (argint(0, &priority) < 0) {
    return -1;
  }
  struct proc* p = myproc();

  // 优先级调度：拒绝负值优先级
  if (priority < 0) {
    return -1;
  }
  acquire(&p->lock);
  p->priority = priority;
  release(&p->lock);

  return 0;
}

/**
 * @brief 优先级调度算法所需内核函数，实现 get_priority 系统调用，获取当前进程的优先级。
 * @return 当前进程的优先级
 */
uint64 sys_get_priority(void) {
  struct proc* p = myproc();
  acquire(&p->lock);
  int priority = p->priority;
  release(&p->lock);
  return priority;
}
#endif
```

真正的核心仍然落在 `scheduler()` 上。优先级模式下，调度器在每次循环中都会完整扫描 `proc` 表，挑出所有 `RUNNABLE` 进程里 `priority` 最小的那个。如果遇到优先级相同的候选者，它会进一步比较 `pid`，从而保持执行次序的确定性。

这里由于和默认的行为差异较大，所以直接重写了 `shceduler()` 函数。不过其实大体逻辑也没变，主要就是把原先的 for 循环找到第一个可用进程改为了遍历查找找到最优先的进程。

```c
// kernel/proc.c
#ifdef SCHEDULER_PRIORITY
#define DEFAULT_PRIORITY 20
#endif

void
scheduler(void)
{
  struct proc *p;
  struct cpu *c = mycpu();
  extern pagetable_t kernel_pagetable;

  #ifdef SCHEDULER_PRIORITY
  c->proc = 0;
  for(;;){
    // Avoid deadlock by ensuring that devices can interrupt.
    intr_on();

    int found = 0;
    struct proc *selected = NULL;
    // SCHEDULER_PRIORITY：遍历整个进程表比较优先级，找到优先级最高（Priority最小）的进程
    for(p = proc; p < &proc[NPROC]; p++) {
      acquire(&p->lock);
      if (p->state != RUNNABLE) {
        release(&p->lock); // 非 RUNNABLE 直接释放锁
        continue;
      }
      if (selected == NULL
        || p->priority < selected->priority
        || (p->priority == selected->priority && p->pid < selected->pid)) {
        if (selected != NULL) {
          release(&selected->lock);
        }
        selected = p;
        continue;
      }
      // 非候选者立即释放锁
      release(&p->lock);
    }
    p = selected;

    if (p != NULL) {
      if (p->state == RUNNABLE) {
        // Switch to chosen process.  It is the process's job
        // to release its lock and then reacquire it
        // before jumping back to us.
        // printf("[scheduler]found runnable proc with pid: %d\n", p->pid);
        p->state = RUNNING;
        c->proc = p;
        w_satp(MAKE_SATP(p->kpagetable));
        sfence_vma();
        swtch(&c->context, &p->context);
        w_satp(MAKE_SATP(kernel_pagetable));
        sfence_vma();
        // Process is done running for now.
        // It should have changed its p->state before coming back.
        c->proc = 0;

        found = 1;
      }
      release(&p->lock);
    }
    if (found == 0) {
      intr_on();
      asm volatile("wfi");
    }
  }
  #endif
}
```

因为时钟中断仍然会调用 `yield()`，所以一旦更高优先级的进程变为 `RUNNABLE`，它会在下一次调度循环中立即接管 CPU。这种扫描 - 抢占的节奏与 RR 的结构保持一致，只是把先来先服务换成了按 `priority` 重新排队。

由于这里不存在动态变化的 PCB 字段需要我们去维护，所以对于优先级调度算法，我们无需更改 `trap.c` 中的时间中断处理函数。

不过我们还是需要继续修改 `proc.c` 中的一些已有函数，从而保证其他系统调用的正确性，具体如下：

-   `allocproc` 和 `freeproc` 需要额外初始化 / 重置优先级为默认优先级。
-   `fork()` / `clone()` 在复制 PCB 时会继承父进程的 `priority`。

```c
// kernel/proc.c
static struct proc*
allocproc(void)
{
    // ...
found:
  p->pid = allocpid();

  #ifdef SCHEDULER_PRIORITY
  // 优先级调度算法：初始化优先级
  p->priority = DEFAULT_PRIORITY;
  #endif
  // ...
}

static void
freeproc(struct proc *p)
{
  // ...
  #ifdef SCHEDULER_PRIORITY
  p->priority = DEFAULT_PRIORITY; // 恢复默认优先级便于复用
  #endif
}

int
fork(void)
{
  // ...
  // copy tracing mask from parent.
  np->tmask = p->tmask;

  #ifdef SCHEDULER_PRIORITY
  // 子进程继承父进程的优先级
  np->priority = p->priority;
  #endif

  // copy saved user registers.
  *(np->trapframe) = *(p->trapframe);
  // ...
}

int
clone(void)
{
  // ...
  // copy tracing mask from parent.
  np->tmask = p->tmask;

  #ifdef SCHEDULER_PRIORITY
  // 子进程继承父进程的优先级
  np->priority = p->priority;
  #endif

  // copy saved user registers.
  *(np->trapframe) = *(p->trapframe);
  // ...
}
```

## 多级反馈队列（MLFQ）

相比 RR / PRIORITY，MLFQ 不仅要在调度点比较优先级，更要持续观测每个进程的行为，然后用反馈去动态调节调度策略。

### 算法原理

MLFQ 的目标是兼顾交互响应和整体吞吐，核心机制可以拆成三件事：

1.  **多级队列 + 抢占**：优先级越高（数值越小）队列的时间片越短，但排在前面的队列永远先调度。高优先级进程一旦就绪，可以立即抢占低优先级进程。
2.  **行为反馈**：新进程会落在较高优先级；如果持续吃满时间片，被认定为 CPU 密集型并降级；如果频繁 `sleep` 或提前主动让出 CPU，则更像 I/O 密集型，可以提升或保持优先级。
3.  **动态时间片**：不同优先级的进程拥有不同长度的时间片，保证高优先级任务即使频繁被调度，也不会长时间霸占 CPU。

### 测例说明

助教提供的 `test_proc_mlfq.c` 同时发射了 5 类典型 workload：

| 进程 | 行为画像    | 初始优先级 | Judger 关心的现象                |
| ---- | ----------- | ---------- | -------------------------------- |
| P1   | 纯 CPU 密集 | 10         | 完成最晚，优先级数值被不断增大   |
| P2   | 频繁 sleep  | 1          | 总是最早完成，优先级保持在最高档 |
| P3   | CPU 密集    | 2          | 被调整到更低优先级层             |
| P4   | IO 密集     | 5          | 靠更长的 `sleep` 拿到优先级提升  |
| P5   | 混合型      | 3          | 评分脚本观察它是否在中间层徘徊   |

Judger 从进程输出里验证两件事：

1.  完成顺序要体现 “IO 密集优先，CPU 密集垫底”。
2.  每个进程 `set_priority()` 后打印的最终优先级要符合行为反馈（CPU-heavy 数字变大，IO-heavy 数字变小）。

因此，最终的输出可以如下所示（但实现不同具体的数也可能不同，助教文档里要求最高优先级的 I/O 密集型进程（P2）应最先完成，而最低优先级的 CPU 密集型进程（P1）应最后完成）：

```
Testing MLFQ Scheduler - Basic
MLFQ Scheduler Process 2 with initial priority 1 and final priority 1 completed
MLFQ Scheduler Process 5 with initial priority 3 and final priority 1 completed
MLFQ Scheduler Process 4 with initial priority 5 and final priority 1 completed
MLFQ Scheduler Process 3 with initial priority 2 and final priority 20 completed
MLFQ Scheduler Process 1 with initial priority 10 and final priority 20 completed
MLFQ with Priorities Test Completed
```

### 数据结构与常量

同样，我们需要先对 PCB 进行扩展：

```c
// kernel/include/proc.h
#ifdef SCHEDULER_MLFQ
#define DEFAULT_PRIORITY 5 // 默认分配给新进程的优先级
#define MLFQ_MIN_PRIORITY_LEVEL 1 // MLFQ：最高优先级对应的数值
#define MLFQ_MAX_PRIORITY_LEVEL 20 // MLFQ：最低优先级对应的数值
#define MLFQ_EVAL_TICKS 5 // MLFQ：统计窗口长度，单位为 tick
#define MLFQ_CPU_DOM_RATIO 2 // MLFQ：CPU 压制阈值，CPU 使用超过休眠两倍视为 CPU 密集
#define MLFQ_SLEEP_DOM_RATIO 2 // MLFQ：休眠压制阈值，休眠超过 CPU 两倍视为 I/O 密集

#define MIN(a, b) ((a) < (b) ? (a) : (b))
#define MAX(a, b) ((a) > (b) ? (a) : (b))
#endif

struct proc {
  // ...
  #ifdef SCHEDULER_MLFQ
  // MLFQ 算法所需的 PCB 字段
  int priority;                 // 动态优先级，数值越小代表优先级越高
  int ticks_used;               // 记录当前时间片已消耗的 tick 数
  int eval_ticks;               // 当前统计窗口内累计 tick 数
  int cpu_ticks;                // 最近窗口内的 CPU 使用 tick 数
  int sleep_ticks;              // 最近窗口内的休眠 tick 数
  int base_priority;            // 记录用户设置的基础优先级，用于同级队列的 FIFO 判定
  #endif
};
```

其中：

-   `priority`：用于跨队列比较
-   `base_priority`：记录 `set_priority()` 的原始输入，用来在同一级别里保持次序
-   `eval_ticks` / `cpu_ticks` / `sleep_ticks`：组成 “滑动窗口”，至少运行 `MLFQ_EVAL_TICKS` 后才会触发第一次反馈判断调整动态优先级，每次调整优先级后重置窗口内统计数据
-   `ticks_used`：记录当前时间片已消耗的 tick 数，在时间片耗尽时触发抢占

### 系统调用接口

MLFQ 模式可以与 PRIORITY 模式复用一部分 `set_priority()` / `get_priority()`，但在 `sys_set_priority()` 内要额外重置 MLFQ 统计数据：

```c
// kernel/sysproc.c
#if defined(SCHEDULER_PRIORITY) || defined(SCHEDULER_MLFQ)
/**
 * @brief 优先级 / MLFQ 调度算法所需内核函数，设置当前进程的优先级
 * @param priority 新的优先级
 * @return 0 表示系统调用成功返回，-1 表示参数解析失败
 */
uint64 sys_set_priority(void) {
  int priority;
  if (argint(0, &priority) < 0) {
    return -1;
  }
  struct proc* p = myproc();

  #ifdef SCHEDULER_PRIORITY
  // 优先级调度：拒绝负值优先级
  if (priority < 0) {
    return -1;
  }
  acquire(&p->lock);
  p->priority = priority;
  release(&p->lock);
  #endif

  #ifdef SCHEDULER_MLFQ
  acquire(&p->lock);
  // MLFQ：裁剪优先级到合法区间，并更新动态优先级、重置统计数据
  p->priority = mlfq_clamp_priority(priority);
  p->base_priority = p->priority;
  p->ticks_used = 0;
  p->eval_ticks = 0;
  p->cpu_ticks = 0;
  p->sleep_ticks = 0;
  release(&p->lock);
  #endif

  return 0;
}

/**
 * @brief 优先级 / MLFQ 算法所需内核函数，实现 get_priority 系统调用，获取当前进程的优先级。
 * @return 当前进程的优先级（占位实现固定返回0）
 */
uint64 sys_get_priority(void) {
  struct proc* p = myproc();
  acquire(&p->lock);
  int priority = p->priority;
  release(&p->lock);
  return priority;
}
#endif
```

### 运行期统计与优先级反馈

为了方便，我在 `kernel/proc.c` 里创建了一组工具函数负责维护窗口数据：

```c
// kernel/proc.c
#ifdef SCHEDULER_MLFQ
/**
 * @brief MLFQ：裁剪优先级到合法区间
 * @param priority 优先级
 * @return 裁剪后的优先级
 */
inline int mlfq_clamp_priority(int priority) {
  return MIN(MLFQ_MAX_PRIORITY_LEVEL, MAX(MLFQ_MIN_PRIORITY_LEVEL, priority));
}

/**
 * @brief MLFQ：根据优先级确定时间片，优先级越高（level 越小）时间片越短
 * @param priority 优先级
 * @return 时间片长度
 */
static inline int mlfq_timeslice_for_priority(int priority) {
  // 优先级经过裁剪后参与判断
  int level = mlfq_clamp_priority(priority);
  if (level <= 2) {
    return 1;
  }
  if (level <= 5) {
    return 2;
  }
  if (level <= 8) {
    return 3;
  }
  if (level <= 12) {
    return 4;
  }
  return 5;
}

/**
 * @brief MLFQ：清空评估窗口内统计数据
 * @param p 进程指针
 */
static void mlfq_reset_window(struct proc* p) {
  p->eval_ticks = 0;
  p->cpu_ticks = 0;
  p->sleep_ticks = 0;
}

/**
 * @brief MLFQ：根据 CPU 与休眠占比尝试调整优先级
 * @param p 进程指针
 */
static void mlfq_try_adjust_priority(struct proc* p) {
  // 不足一个评估窗口无需调整
  if (p->eval_ticks < MLFQ_EVAL_TICKS) {
    return;
  }
  int cpu_ticks = p->cpu_ticks;
  int sleep_ticks = p->sleep_ticks;
  // CPU 占比高，执行降级
  if (cpu_ticks > 0 && cpu_ticks >= sleep_ticks * MLFQ_CPU_DOM_RATIO) {
    if (p->priority < MLFQ_MAX_PRIORITY_LEVEL) {
      p->priority = mlfq_clamp_priority(p->priority + 1);
    }
  }
  // 休眠占比高，执行升级
  else if (sleep_ticks > 0 && sleep_ticks >= cpu_ticks * MLFQ_SLEEP_DOM_RATIO) {
    if (p->priority > MLFQ_MIN_PRIORITY_LEVEL) {
      p->priority = mlfq_clamp_priority(p->priority - 1);
    }
  }
  mlfq_reset_window(p);
}
```

### 时钟中断路径

接下来就是要完成中断处理。

每个时间中断到来时，`usertrap()` / `kerneltrap()` 会调用 `mlfq_on_timer_tick()`。其记录运行中的进程用了多少 CPU 时间，并在时间片耗尽时触发抢占：

```c
// kernel/proc.c
#ifdef SCHEDULER_MLFQ
/**
 * @brief MLFQ 算法所需内核函数，时间中断时更新调度信息
 * @return void
 */
void mlfq_on_timer_tick(void) {
  struct proc* p = myproc();
  // 无进程时无需处理
  if (p == 0) {
    return;
  }
  // 仅对运行态进程计数
  if (p->state != RUNNING) {
    return;
  }
  int need_yield = 0;
  acquire(&p->lock);
  p->ticks_used++;
  p->eval_ticks++;
  p->cpu_ticks++;
  // 尝试根据更新后的数据调整优先级
  mlfq_try_adjust_priority(p);
  // 根据最新优先级计算时间片
  int slice = mlfq_timeslice_for_priority(p->priority);
  // 时间片耗尽需切换
  if (p->ticks_used >= slice) {
    p->ticks_used = 0;
    need_yield = 1;
  }
  release(&p->lock);
  if (need_yield) {
    yield();
  }
}
#endif
```

`ticks_used` 只记录当前片段的进度，所以一旦 `yield()` 触发就被清零（在 `yield()` 内处理，后面会讲）。

对应的，我们需要在时间中断发生的地方，即 `usertrap()` 或 `kerneltrap()` 处调用它：

```c
// kernel/trap.c
void
usertrap(void)
{
  // ...
  // give up the CPU if this is a timer interrupt.
  if (which_dev == 2) {
    #ifdef SCHEDULER_RR
    // RR 算法：进入时间中断后，处理时间片递减与抢占逻辑
    rr_on_timer_tick();
    #elif defined(SCHEDULER_MLFQ)
    // MLFQ 算法：进入时间中断后，处理时间片递减、动态优先级调整与抢占逻辑
    mlfq_on_timer_tick();
    #else
    // 默认：直接让出 CPU
    yield();
    #endif
  }

  usertrapret();
}

void
kerneltrap() {
  // ...
  if (which_dev == 2) {
    #ifdef SCHEDULER_RR
    // RR 算法：进入时间中断后，处理时间片递减与抢占逻辑
    rr_on_timer_tick();
    #elif defined(SCHEDULER_MLFQ)
    // MLFQ 算法：进入时间中断后，处理时间片递减、动态优先级调整与抢占逻辑
    mlfq_on_timer_tick();
    #else
    // 默认：直接让出 CPU
    if (myproc() != 0 && myproc()->state == RUNNING) {
      yield();
    }
    #endif
  }
  // ...
}
```

### 睡眠路径与 I/O 识别

为了让调度器意识到 I/O 行为，`sys_sleep()` 需要在返回前把实际睡眠的 tick 数上报给 `mlfq_account_sleep()`：

```c
// kernel/proc.c
#ifdef SCHEDULER_MLFQ
/**
 * @brief MLFQ：记录 sys_sleep 调用带来的休眠时间
 * @param p 进程指针
 * @param sleep_ticks 休眠时间
 * @return void
 */
void mlfq_account_sleep(struct proc* p, int sleep_ticks) {
  if (p == 0 || sleep_ticks <= 0) {
    return;
  }
  acquire(&p->lock);
  p->sleep_ticks += sleep_ticks;
  p->eval_ticks += sleep_ticks;
  mlfq_try_adjust_priority(p);
  release(&p->lock);
}
#endif

// kernel/sysproc.c
uint64
sys_sleep(void)
{
  int n;
  uint ticks0;

  #ifdef SCHEDULER_MLFQ
  // MLFQ 算法需要记录每次 sleep 的休眠 tick 数累积，从而判断 I/O 密集还是 CPU 密集
  int slept = 0;
  #endif

  if(argint(0, &n) < 0)
    return -1;
  acquire(&tickslock);
  ticks0 = ticks;
  while(ticks - ticks0 < n){
    if(myproc()->killed){

      #ifdef SCHEDULER_MLFQ
      slept = ticks - ticks0;
      #endif

      release(&tickslock);

      #ifdef SCHEDULER_MLFQ
      if (slept > 0) {
        mlfq_account_sleep(myproc(), slept);
      }
      #endif

      return -1;
    }
    sleep(&ticks, &tickslock);
  }
  release(&tickslock);

  #ifdef SCHEDULER_MLFQ
  slept = ticks - ticks0;
  if (slept > 0) {
    mlfq_account_sleep(myproc(), slept);
  }
  #endif

  return 0;
}
```

### 调度器与上下文切换

`scheduler()` 的遍历逻辑和 PRIORITY 版本类似，只是比较条件改为了：

1. 先比较 `priority`
2. 相同时，比较 `base_priority`
3. 还相同时，比较 `pid`

同时，所有候选者都要在离开时释放锁：

```c
// kernel/proc.c
void
scheduler(void)
{
  struct proc *p;
  struct cpu *c = mycpu();
  extern pagetable_t kernel_pagetable;

	#ifdef SCHEDULER_MLFQ
  c->proc = 0;
  for(;;){
    intr_on();
    int found = 0;
    struct proc *selected = NULL;
    for(p = proc; p < &proc[NPROC]; p++) {
      acquire(&p->lock);
      if (p->state != RUNNABLE) {
        release(&p->lock);
        continue;
      }
      // MLFQ：优先按当前优先级、基础优先级、pid 依次比较，选择需要执行的进程
      if (selected == NULL
          || p->priority < selected->priority
          || (p->priority == selected->priority && p->base_priority < selected->base_priority)
          || (p->priority == selected->priority && p->base_priority == selected->base_priority && p->pid < selected->pid)) {
        if (selected != NULL) {
          release(&selected->lock);
        }
        selected = p;
        continue;
      }
      // 非最佳候选立即释放锁
      release(&p->lock);
    }
    p = selected;

    if (p != NULL) {
      if (p->state == RUNNABLE) {
        // Switch to chosen process.  It is the process's job
        // to release its lock and then reacquire it
        // before jumping back to us.
        // printf("[scheduler]found runnable proc with pid: %d\n", p->pid);
        p->state = RUNNING;
        c->proc = p;
        w_satp(MAKE_SATP(p->kpagetable));
        sfence_vma();
        swtch(&c->context, &p->context);
        w_satp(MAKE_SATP(kernel_pagetable));
        sfence_vma();
        // Process is done running for now.
        // It should have changed its p->state before coming back.
        c->proc = 0;

        found = 1;
      }
      release(&p->lock);
    }
    if (found == 0) {
      intr_on();
      asm volatile("wfi");
    }
  }
  #endif
}
```

切换出去后 `yield()`、`sleep()` 等路径都需要把 `ticks_used` 归零，避免旧的片段长度影响下一次调度：

```c
// kernel/proc.c
void
yield(void)
{
  struct proc *p = myproc();
  acquire(&p->lock);
  p->state = RUNNABLE;
  #ifdef SCHEDULER_MLFQ
  // MLFQ：主动让出 CPU 时清空时间片计数
  p->ticks_used = 0;
  #endif
  sched();
  release(&p->lock);
}

void
sleep(void *chan, struct spinlock *lk)
{
  struct proc *p = myproc();

  // ...
  p->state = SLEEPING;
  #ifdef SCHEDULER_MLFQ
  // MLFQ：休眠时清空当前时间片进度
  p->ticks_used = 0;
  #endif

  sched();
  // ...
}
```

最后，和 RR 一样，由于这些字段都是可能动态变化的，所以我们需要进程的全周期对其进行维护，具体如下：

-   `allocproc` 和 `freeproc` 需要额外初始化 / 重置 MLFQ 统计数据。
-   `fork()` / `clone()` 在复制 PCB 时会继承父进程的 `priority` 和 `base_priority`，但仍然把窗口统计清零，避免子进程直接沿用父进程的历史观测数据。

## 测试评分与其他 Bug

在实现上述算法时，我们仍然可以像之前一样，通过修改 `init.c` 的 `char* tests[]` 来控制运行程序，从而得到输出。

```c
char* tests[] = {
  // ...
  // part 4
  #ifdef SCHEDULER_RR
    "test_proc_rr",
  #endif
  #ifdef SCHEDULER_PRIORITY
    "test_proc_priority",
  #endif
  #ifdef SCHEDULER_MLFQ
    "test_proc_mlfq",
  #endif
  // ...
};
```

然而，这样无法正确启动 Judger，可是如果你直接将 `init.c` 更换为助教提供的模板仓库里的版本，你会发现报错 `panic: init exiting`。

```
panic: init exiting
backtrace:
0x000000008020017e
0x000000008020264e
0x0000000080203802
0x00000000802035e8
0x0000000080202dd4
```

进一步排查发现，只要在 `main()` 函数外声明函数，即使不作操作、不调用，也会导致问题，怀疑是编译过程的问题，然而我将助教的 `Makefile` 进行了 cherry pick 后，仍然发现还是不能正常工作。

我发现助教的 `Makefile` 在 `dump` 这一步生成 `init.asm` 的时候能保证 `main` 函数位于 `.text` 段的 `0x0` 起始位置，但是我的不行，即使后续 `make` 时助教的版本会覆写，但是能保证此时生成 `initcode.h` 时是对的就行，因为 `userinit` 中固定写死了 `p->trapframe->epc = 0x0;`，这是导致新增函数后出现问题的原因。

首先我们知道，我们现在实际上是将整个 `init.c` 编译后打入了 `initcode.h`，这会导致编译后行为与预期行为的差异。仔细观察 `init.asm`，就会发现编译后先声明的 `print_test_program` 出现在了 `.text` 段起始的 `0x0`，而不是 `main`：

```assembly
// xv6-user/init.asm
xv6-user/_init:     file format elf64-littleriscv


Disassembly of section .text:

0000000000000000 <print_test_program>:
# ...
0000000000000062 <main>:
```

所以，我们先将 `print_test_program()` 删去，函数体挪入 `main()`，然后继续运行，此时报错：

```
usertrap(): segfault pid=1 initcode, va=0x0000000000001180
panic: init exiting
backtrace:
0x000000008020017e
0x0000000080202620
0x0000000080203020
```

这里发现变成了段错误，排查后发现是因为 **`init` 进程的用户态地址空间仍然只有最开始的那 1 页**，而我们在 `init.c` 里塞进了更多的复杂逻辑之后，`.text/.rodata/.bss + stack` 的组合体已经明显超过了 4 KB。`usertrap()` 打印出的 `fault address` 为 `0x1180`（即 4480 字节，大于 4096 一页大小了），而 `uvminit()` 只为 init 进程映射了 `[0x0, 0x1000)` 这一个页，所以一旦访问超过 `0x1000` 的地址就会触发缺页异常并 panic。

继续深入，我们可以进一步分析一下 init 进程的内存布局到底长啥样：

`userinit()` 先调用 `uvminit(p->pagetable, p->kpagetable, initcode, sizeof(initcode))`，把 `kernel/include/initcode.h` 里那段 ELF 扔进 **唯一的一页**用户内存里，并把 `p->sz` 设成 `PGSIZE`。紧接着，它把

```c
p->trapframe->epc = 0x0;   // 总是假定入口在 0
p->trapframe->sp  = PGSIZE;// 也就是 0x1000
```

组合在一起就得到了类似下面的布局：

```
0x1000 ├────────────────────┤  ← 自 0x1000 起向低地址生长
       │      stack         │ 
       │        ↓           │
       ├────────────────────┤
       │ .text/.rodata/.bss │  ← init.c 编译出的所有指令与静态数据
       │        ……          │
0x0000 └────────────────────┘
```

原来情况下可能是因为代码量不大，所以不没有把 4 KB 撑爆，但现在助教的 Judger 流程整合进 `init.c` 之后，情况完全变了：

- `char test_outputs[MAX_OUTPUT_SIZE]` 直接占了 1024 字节，外加一堆 `argv[]`、`pipefd[]`、`judger_argv[]` 等局部变量，栈帧会持续向下膨胀；
- 无论 `test_outputs` 放到 `main` 函数里面（局部变量，会放在 `stack` 上创建）还是外面（编译器会把它放进 `.bss`，同样也和 `.text` 共用这一页），都脱离不了这一页的范围；
- 再加上字符串字面量（`"Testing ..."` 这种）落在 `.rodata`，`pipe` / `dup2` 的临时缓冲落在 `stack`，一旦任意一块越界，就会踩到还未映射的 `0x1000` 往上，于是就看到了 `va=0x1180` 的页故障。

所以问题不是 `test_outputs` 放哪，而是只给了 4 KB。函数外时 `.bss` 越界；函数内时栈向下生长越界，本质相同。

既然如此，我们只需要在 `userinit()` 里把栈撑大就可以了：

```c
// kernel/proc.c
void
userinit(void)
{
  // ...
  uvminit(p->pagetable , p->kpagetable, initcode, sizeof(initcode));
  p->sz = PGSIZE;

  // 额外申请多页空间用作运行时栈，避免 initcode 和 init 的栈空间冲突
  const int extra_stack_pages = 4;
  uint64 newsz = PGSIZE * (1 + extra_stack_pages);
  uint64 allocsz = uvmalloc(p->pagetable, p->kpagetable, p->sz, newsz);
  if(allocsz == 0){
    freeproc(p);
    panic("userinit: uvmalloc");
  }
  p->sz = allocsz;

  // prepare for the very first "return" from kernel to user.
  p->trapframe->epc = 0x0;      // user program counter
  // 原先：p->trapframe->sp = PGSIZE;  // user stack pointer
  p->trapframe->sp = p->sz;     // user stack pointer
  // ...
}
```

也就是在把 `initcode` 拷到第一页之后，再追加 4 页（共 20 KB）给用户态，并且让 `sp` 指向整个地址空间的顶部。这样一来布局就变成：

```
0x5000 ├────────────────────┤  ← 新的栈顶 (p->sz)
...    │      stack         │
       │        ↓           │
0x1000 ├────────────────────┤  ← 原先的页边界
       │ .text/.rodata/.bss │  （仍然在第 1 页）
0x0000 └────────────────────┘
```

这下，无论 `test_outputs` 放哪，都可以正常启动评测流程了。

但是这么做还是非常的不优雅，如果未来要在 `init.c` 里声明别的函数，就还是需要将其挪到 `main` 函数里面，我们始终无法自由地声明函数。同时如果这个 `init.c` 继续变大变复杂，那么我们可能又得手动调整初始分配的栈空间大小，非常不方便。

所以，这里我们最好的解法就是还原原本的方法，从框架代码自带的 `initcode.S` 生成 `initcode.h`，从而自动拉起 `/init`。这样初始代码的入口可以保证在 `0x0`，而我们在 `init.c` 里怎么写也没关系了。

重新回顾 `Makefile` 会发现原本的代码就存在一个 `$U/initcode` 的编译目标，只不过其是在 32 位 RISC-V 下得到的，所以我们使用不了它的产物，我们只需要将之改为 64 位 RISC-V 的写法即可：

```assembly
# xv6-user/initcode.S
# Initial process that execs /init.
# This code runs in user space.

#include "include/sysnum.h"

	.text
	.option nopic

# exec(init, argv)
.globl start
start:
        la a0, init
        la a1, argv
        li a7, SYS_exec
        ecall

# for(;;) exit();
exit:
        li a7, SYS_exit
        ecall
        jal exit

# char init[] = "/init\0";
init:
  .asciz "/init"

# char *argv[] = { init, 0 };
.section .rodata
.p2align 2
argv:
  .dword init
  .dword 0

```

**注意，走希冀平台评测时必须将完整的 `init.c` 程序编译后硬编码到 `initcode.h` 中，因为希冀平台评测时所提供的预编译 `sdcard.img` 中没有 `init` 程序，我们无法通过自举代码来拉起 `/init` 进程。**

这里我们重新更改 Makefile 中的 dump 目标：

```makefile
# 如果是提交到希冀平台，因为平台提供的 sdcard.img 挂载里没有 init.c 文件
# 所以需要硬编码完整的 init.c 程序的机器码到 initcode.h 中
HARD_CODE_INIT = 0

ifeq ($(HARD_CODE_INIT), 1)
dump: userprogs
	@echo "HARD_CODE_INIT is 1, compile the entire init.c program into initcode.h directly."
	@$(TOOLPREFIX)objcopy -S -O binary $U/_init tmp_initcode
	@od -v -t x1 -An tmp_initcode | sed -E 's/ (.{2})/0x\1,/g' > kernel/include/initcode.h 
	@rm tmp_initcode
else
dump: $U/initcode
	@echo "HARD_CODE_INIT is 0, compile the bootstrap fragment initcode.S normally."
	@od -v -t x1 -An $U/initcode | sed -E 's/ (.{2})/0x\1,/g' > kernel/include/initcode.h
endif

# ...
# 希冀平台所使用的编译命令
all:
	@$(MAKE) clean
	@$(MAKE) dump HARD_CODE_INIT=1
	@$(MAKE) build
	@cp $(T)/kernel ./kernel-qemu
	@cp ./bootloader/SBI/sbi-qemu ./sbi-qemu

# 本地测试所使用的编译命令
local:
	@$(MAKE) clean
	@$(MAKE) dump
	@$(MAKE) build
	@$(MAKE) fs
	@$(MAKE) run
```

现在，就能一切正常工作了，而且符合逻辑，非常完美。

我们还可以通过修改 `Makefile` 来注入宏，影响 `make run_test` 和 `make local` 的行为，从而实现向后兼容（这里还是建议在 [这里](https://github.com/zhuozhiyongde/XV6-OS-2025Fall-PKU/blob/main/Makefile) 看完整的 `Makefile`）：

```makefile
# 希冀平台所使用的编译命令
all:
	@$(MAKE) clean
	@$(MAKE) dump HARD_CODE_INIT=1
	@$(MAKE) build
	@cp $(T)/kernel ./kernel-qemu
	@cp ./bootloader/SBI/sbi-qemu ./sbi-qemu

# 助教提供的功能性测试平台所使用的编译命令
run_test:
	@$(MAKE) clean
	@$(MAKE) dump ENABLE_JUDGER=1
	@$(MAKE) build ENABLE_JUDGER=1
	@$(MAKE) fs ENABLE_JUDGER=1
	@$(MAKE) run ENABLE_JUDGER=1

# 本地测试所使用的编译命令
local:
	@$(MAKE) clean
	@$(MAKE) dump
	@$(MAKE) build
	@$(MAKE) fs
	@$(MAKE) run
```

然后对应的，在 `init.c` 里根据是否有定义 `ENABLE_JUDGER` 来进行条件编译即可：

```c
// xv6-user/init.c

#ifdef ENABLE_JUDGER

// 助教给的代码

#else

// 我们原本的代码

#endif
```

至此，我们就完成了 Part 4。
