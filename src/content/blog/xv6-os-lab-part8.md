---
title: 更适合北大宝宝体质的 xv6 OS Lab 踩坑记 - Part8
description: '北京大学 2025 年秋季学期操作系统/OS Lab Part 8'
publishDate: 2026-01-11 23:00:01
tags:
  - 操作系统
  - xv6
  - PKU
language: '中文'
---

Part8 的核心是实现信号量（Semaphore）机制。

助教给了两个对应的测例：

-   `test_ipc_producer_consumer`：多生产者多消费者问题（MPMC）
-   `test_ipc_philosopher`：哲学家就餐问题

我们要做的，是在内核中实现一套信号量 API，支持创建、销毁、P（等待）和 V（释放）操作，从而让用户态程序能够解决各种经典的并发同步问题。

信号量包含一个计数值（表示可用资源的数量）和一个隐式的等待队列（当计数值为 0 时，试图获取资源的进程会被阻塞）。信号量支持两种原子操作：

-   P 操作：在计数值大于 0 时将其减 1 并继续执行，否则阻塞当前进程；
-   V 操作：将计数值加 1 并唤醒等待队列中的进程。

实现信号量的核心在于数据结构设计和 P/V 操作的正确性。每个信号量包含一个自旋锁 `lock`（保护 `value` 的原子修改和 `sleep/wakeup` 操作）、一个使用标志 `used`（标记该槽位是否已被分配）和当前计数值 `value`。这里类似之前的物理页分配机制，并不动态分配，而是直接使用静态数组。

这套实现与真实操作系统依旧是存在简化的：

1. 信号量是系统级的，任何进程都可以通过 ID 访问任何信号量，而真实系统通常支持进程级的信号量（随进程销毁而自动清理）
2. 唤醒时使用 `wakeup` 唤醒所有等待者，由调度器决定谁先运行，没有优先级继承机制来避免优先级反转

## 评测框架

延续既往套路，`Makefile` 中新增了一组宏：

```makefile
# Part 8: IPC 信号量
CASE =

ifneq ($(CASE),)
  CFLAGS += -DCASE
  USER_CFLAGS += -DCASE
endif
ifeq ($(CASE), MPMC)
  TEST_PROGRAM = test_ipc_producer_consumer
  CFLAGS += -DTYPE_PRODUCER
  USER_CFLAGS += -DTYPE_PRODUCER
else ifeq ($(CASE), PHILOSOPHER)
  TEST_PROGRAM = test_ipc_philosopher
  CFLAGS += -DTYPE_PHILOSOPHER
  USER_CFLAGS += -DTYPE_PHILOSOPHER
endif
```

含义：

-   `CASE=MPMC` 时：
    -   编译器会看到 `CASE` 和 `TYPE_PRODUCER` 两个宏
    -   `TEST_PROGRAM` 被设置为 `test_ipc_producer_consumer`
-   `CASE=PHILOSOPHER` 时：
    -   编译器会看到 `CASE` 和 `TYPE_PHILOSOPHER` 两个宏
    -   `TEST_PROGRAM` 被设置为 `test_ipc_philosopher`

配合 Part4 中使用的 `run_test` 命令启动时注入的 `ENABLE_JUDGER` 宏，就可以类似这样跑评测：

```bash
make run_test CASE=MPMC
make run_test CASE=PHILOSOPHER
```

`init.c` 和 `judger.c` 的逻辑与之前类似，只是判断条件换成了：

```c
#elif defined(ENABLE_JUDGER) && defined(CASE)
```

Judger 判断测例通过的标准是输出里有：

```text
MPMC test completed successfully!
Dining Philosophers test completed!
```

同时确保没有 `ERROR` 字样。

## 新增系统调用

为了让用户态程序能够使用信号量，我们需要新增四个系统调用：

```c
// kernel/include/sysnum.h
#define SYS_sem_p           800 // 信号量P操作
#define SYS_sem_v           801 // 信号量V操作
#define SYS_sem_create      802 // 创建信号量
#define SYS_sem_destroy     803 // 销毁信号量
```

### sem_create

创建一个信号量，设置初始计数值。

```c
int sem_create(int init_value);
```

参数：

-   `init_value`：信号量的初始计数值

返回值：

-   成功：返回信号量 ID（非负整数）
-   失败：返回 -1

### sem_destroy

销毁一个信号量，释放其占用的内核资源。

```c
int sem_destroy(int semid);
```

参数：

-   `semid`：由 `sem_create` 返回的信号量 ID

返回值：

-   成功：返回 0
-   失败：返回 -1

### sem_p

P 操作（等待）。如果计数值为 0，则阻塞当前进程。

```c
int sem_p(int semid);
```

参数：

-   `semid`：信号量 ID

返回值：

-   成功：返回 0
-   失败：返回 -1（信号量 ID 非法或已被销毁）

### sem_v

V 操作（释放）。计数值加 1，并唤醒等待的进程。

```c
int sem_v(int semid);
```

参数：

-   `semid`：信号量 ID

返回值：

-   成功：返回 0
-   失败：返回 -1

## xv6 的同步机制

实现信号量其实主要依赖 xv6 自带的自旋锁 `spinlock` 和 `sleep/wakeup` 机制即可，我们无需关心更底层的实现。这里先简单回顾一下这两个机制。

### 自旋锁 spinlock

xv6 的自旋锁定义在 `kernel/spinlock.c` 中，核心就是一个 `locked` 字段：

```c
struct spinlock {
  uint locked;       // Is the lock held?
  char *name;        // Name of lock (for debugging)
  struct cpu *cpu;   // The cpu holding the lock
};
```

使用时通过 `acquire(&lk)` 获取锁、`release(&lk)` 释放锁。`acquire` 内部会不断自旋（循环检查）直到成功获取锁，这也是"自旋锁"名字的由来。自旋锁适合保护短时间的临界区，因为等待时 CPU 不会让出，一直在空转。

### sleep/wakeup 机制

自旋锁解决了互斥问题，但如果一个进程需要等待某个条件成立（比如信号量计数大于 0），让它一直自旋就太浪费 CPU 了。xv6 提供了 `sleep` 和 `wakeup` 来实现阻塞等待：

```c
void sleep(void *chan, struct spinlock *lk);
void wakeup(void *chan);
```

`sleep(chan, lk)` 会让当前进程在"通道" `chan` 上睡眠，同时**原子性地释放锁 `lk`**。这个原子性释放很关键：如果先释放锁再睡眠，中间可能会被其他进程插入执行 `wakeup`，导致唤醒信号丢失（lost wakeup）。`wakeup(chan)` 则会唤醒所有在 `chan` 上睡眠的进程。

有了这两个原语，信号量的 P/V 操作就呼之欲出了：

-   P 操作：获取锁 → 检查计数 → 若为 0 则 `sleep` → 被唤醒后重新检查 → 计数减 1 → 释放锁
-   V 操作：获取锁 → 计数加 1 → `wakeup` → 释放锁

值得注意的是，xv6 的 `wakeup` 采用的是 Mesa 语义：它只是把等待者放入就绪队列，而不是像 Hoare 语义那样让被唤醒者立即运行。这意味着被唤醒的进程需要重新竞争锁，在获得锁之前条件可能已经被其他进程改变。因此 P 操作中必须用 `while` 循环重新检查条件，而不能用 `if`。

## 数据结构设计

理解了底层原语，数据结构的设计就很自然了。每个信号量需要：一个自旋锁保护状态、一个计数值、以及一个标志表示是否被使用。和 Part5 中物理页分配器类似，我们不动态分配信号量结构，而是使用一个固定大小的全局性静态数组：

```c
// kernel/include/semaphore.h
#define NSEM 128

struct semaphore {
  struct spinlock lock; // 保护信号量内部状态
  int used;             // 是否已被分配
  int value;            // 当前计数值
};
```

然后用一个全局的 `semtable` 来管理所有信号量：

```c
// kernel/semaphore.c
static struct {
  struct spinlock lock;         // 保护信号量槽的分配
  struct semaphore sems[NSEM];  // 固定的信号量表
} semtable;
```

这里有两层锁的设计：`semtable.lock` 用于保护槽位的分配和释放（创建/销毁时使用），而每个 `semtable.sems[i].lock` 则保护单个信号量的状态（P/V 操作时使用）。两层锁分离可以避免不必要的竞争：多个进程同时对不同信号量做 P/V 操作时，它们各自持有不同的锁，互不干扰。

## 核心实现

### 初始化

内核启动时需要初始化信号量表，把所有槽位标记为未使用，并初始化每个锁：

```c
/**
 * @brief 内核启动时初始化信号量表。
 */
void
seminit(void) {
  initlock(&semtable.lock, "semtable");
  for (int i = 0; i < NSEM; i++) {
    semtable.sems[i].used = 0;
    semtable.sems[i].value = 0;
    initlock(&semtable.sems[i].lock, "sem");
  }
}
```

然后在 `main.c` 的初始化序列中调用它，放在 `fileinit()` 之后、`userinit()` 之前即可。

### 创建和销毁

创建信号量的逻辑很直接：获取 `semtable.lock`，遍历找到第一个未使用的槽位，标记为已使用并设置初始值，返回槽位下标作为 ID。

```c
/**
 * @brief 分配一个信号量并设置初始值。
 * @param init_value 初始计数
 * @return 成功返回信号量 id（下标），失败返回 -1
 */
int
sem_create(int init_value) {
  int id = -1;

  acquire(&semtable.lock);
  for (int i = 0; i < NSEM; i++) {
    if (!semtable.sems[i].used) {
      semtable.sems[i].used = 1;
      semtable.sems[i].value = init_value;
      id = i;
      break;
    }
  }
  release(&semtable.lock);

  return id;
}
```

销毁信号量稍微复杂一点。除了把 `used` 置 0，还需要考虑一个问题：如果有进程正阻塞在这个信号量上怎么办？如果不管它们，这些进程就会永久休眠。所以销毁时需要调用 `wakeup` 把它们唤醒：

```c
/**
 * @brief 按 id 销毁信号量。
 * @param semid 由 sem_create 返回的信号量 id
 * @return 成功返回 0，失败返回 -1
 */
int
sem_destroy(int semid) {
  if (semid < 0 || semid >= NSEM) {
    return -1;
  }

  acquire(&semtable.lock);
  if (!semtable.sems[semid].used) {
    release(&semtable.lock);
    return -1;
  }
  semtable.sems[semid].used = 0;
  semtable.sems[semid].value = 0;
  release(&semtable.lock);

  // 若仍有阻塞在该信号量上的进程，唤醒它们避免永久休眠
  acquire(&semtable.sems[semid].lock);
  wakeup(&semtable.sems[semid]);
  release(&semtable.sems[semid].lock);
  return 0;
}
```

被唤醒的进程会在 `sem_p` 的 `while` 循环中重新检查 `used` 标志，发现信号量已被销毁后返回错误。

### P 操作

P 操作是信号量的核心。按照前面的分析，它需要：获取锁 → 循环检查计数 → 为 0 则睡眠 → 被唤醒后继续检查 → 计数减 1 → 释放锁。

```c
int
sem_p(int semid) {
  if (semid < 0 || semid >= NSEM)
    return -1;

  struct semaphore* s = &semtable.sems[semid];

  acquire(&s->lock);
  if (!s->used) {
    release(&s->lock);
    return -1;
  }
  while (s->value == 0) {
    // 等待期间信号量可能被销毁，需要检查
    if (!s->used) {
      release(&s->lock);
      return -1;
    }
    sleep(s, &s->lock);
  }
  s->value--;
  release(&s->lock);
  return 0;
}
```

这里 `sleep(s, &s->lock)` 的第一个参数是睡眠通道，我们直接用信号量结构体的地址；第二个参数是要释放的锁。`sleep` 会原子地释放锁并让进程睡眠，被唤醒后会自动重新获取锁，所以循环能继续执行。

`while` 循环是 Mesa 语义的标准写法。即使 `wakeup` 被调用，被唤醒的进程也不能假设条件一定成立：可能有多个进程同时被唤醒，但只有一个能抢到资源；也可能是信号量被销毁触发的唤醒。

### V 操作

相比之下，V 操作就简单多了：

```c
int
sem_v(int semid) {
  if (semid < 0 || semid >= NSEM)
    return -1;

  struct semaphore* s = &semtable.sems[semid];

  acquire(&s->lock);
  if (!s->used) {
    release(&s->lock);
    return -1;
  }
  s->value++;
  wakeup(s);
  release(&s->lock);
  return 0;
}
```

计数加 1，然后 `wakeup` 唤醒所有等待者。由于 Mesa 语义，我们不关心谁被唤醒、谁能抢到资源，这些都交给调度器决定。

## 系统调用包装

在 `sysproc.c` 中添加系统调用的包装函数：

```c
// kernel/sysproc.c
#include "include/semaphore.h"

/**
 * @brief 创建信号量，设置初始计数。
 * @param init_value (a0) 初始计数
 * @return 成功返回信号量 id，失败返回 -1
 */
uint64
sys_sem_create(void)
{
  int init;
  if (argint(0, &init) < 0) {
    return -1;
  }
  return sem_create(init);
}

/**
 * @brief 按 id 销毁信号量。
 * @param semid (a0) 信号量 id
 * @return 成功返回 0，失败返回 -1
 */
uint64
sys_sem_destroy(void)
{
  int id;
  if (argint(0, &id) < 0) {
    return -1;
  }
  return sem_destroy(id);
}

/**
 * @brief P（等待）操作，计数为 0 时阻塞。
 * @param semid (a0) 信号量 id
 * @return 成功返回 0，失败返回 -1
 */
uint64
sys_sem_p(void)
{
  int id;
  if (argint(0, &id) < 0) {
    return -1;
  }
  return sem_p(id);
}

/**
 * @brief V（释放）操作，计数加一并唤醒等待者。
 * @param semid (a0) 信号量 id
 * @return 成功返回 0，失败返回 -1
 */
uint64
sys_sem_v(void)
{
  int id;
  if (argint(0, &id) < 0) {
    return -1;
  }
  return sem_v(id);
}
```

在 `syscall.c` 中注册这些系统调用：

```c
// kernel/syscall.c
extern uint64 sys_sem_p(void);
extern uint64 sys_sem_v(void);
extern uint64 sys_sem_create(void);
extern uint64 sys_sem_destroy(void);

static uint64 (*syscalls[])(void) = {
  // ...
  [SYS_sem_p]        sys_sem_p,
  [SYS_sem_v]        sys_sem_v,
  [SYS_sem_create]   sys_sem_create,
  [SYS_sem_destroy]  sys_sem_destroy,
  // ...
};

static char *sysnames[] = {
  // ...
  [SYS_sem_p]        "sem_p",
  [SYS_sem_v]        "sem_v",
  [SYS_sem_create]   "sem_create",
  [SYS_sem_destroy]  "sem_destroy",
  // ...
};
```

## 用户态接口

在 `usys.pl` 中添加用户态的系统调用入口：

```perl
entry("sem_v");
entry("sem_p");
entry("sem_create");
entry("sem_destroy");
```

在 `user.h` 中声明函数原型：

## 测试

### 哲学家就餐问题

```bash
make run_test CASE=PHILOSOPHER
```

得到输出：

```
Starting test program: test_ipc_philosopher
Scheduler type: Philosopher Dining

init: starting test_ipc_philosopher
testing output size:381, contents:
Starting Dining Philosophers test...
Ph 0 finished aPh 3 finished all meals
ll meals
Philosopher 0 ate 2 times
Ph 1 finished all meals
Philosopher 1 ate 2 times
Ph 4 finished all meals
Ph 2 finished all meals
Philosopher 2 ate 2 times
Philosopher 3 ate 2 times
Philosopher 4 ate 2 times
SUCCESS: All philosophers completed exactly 2 meals each!
Dining Philosophers test completed!
init: process pid=2 exited
init: test execution completed, starting judger
Judger: Starting evaluation
Test2 output:
Starting Dining Philosophers test...
Ph 0 finished aPh 3 finished all meals
ll meals
Philosopher 0 ate 2 times
Ph 1 finished all meals
Philosopher 1 ate 2 times
Ph 4 finished all meals
Ph 2 finished all meals
Philosopher 2 ate 2 times
Philosopher 3 ate 2 times
Philosopher 4 ate 2 times
SUCCESS: All philosophers completed exactly 2 meals each!
Dining Philosophers test completed!

TEST 2 PASSED
SCORE: 1
init: judger completed
```

### 多生产者多消费者问题

```bash
make run_test CASE=MPMC
```

得到输出：

```
Starting test program: test_ipc_producer_consumer
Scheduler type: MPMC

init: starting test_ipc_producer_consumer
testing output size:672, contents:
Starting Multi-Producer Multi-Consumer test...
Prod 0 produced 0
Prod 1 produced 100
Consu 0 consumed 0
Consu 1 consumed 100
Prod 0 produced 1
Prod 1 produced 101
Consu 0 consumed 1
Consu 1 consumed 101
Prod 0 produced 2
Prod 1 produced 102
Consu 0 consumed 2
Consu 1 consumed 102
Prod 0 produced 3
Prod 1 Prod 0 finishedproduced 103

Prod 1 finiConsu 0 consumed shed
3
Consu 1 consumed 103
Cons 0 finished
Cons 1 finished

=== Starting Data Verification ===
Produced items (8): 0 100 1 101 2 102 3 103
Consumed items (8): 0 100 1 101 2 102 3 103
SUCCESS: All produced items were correctly consumed!
=== Data Verification Complete ===

MPMC test completed successfully!
init: process pid=2 exited
init: test execution completed, starting judger
Judger: Starting evaluation
Test1 output:
Starting Multi-Producer Multi-Consumer test...
Prod 0 produced 0
Prod 1 produced 100
Consu 0 consumed 0
Consu 1 consumed 100
Prod 0 produced 1
Prod 1 produced 101
Consu 0 consumed 1
Consu 1 consumed 101
Prod 0 produced 2
Prod 1 produced 102
Consu 0 consumed 2
Consu 1 consumed 102
Prod 0 produced 3
Prod 1 Prod 0 finishedproduced 103

Prod 1 finiConsu 0 consumed shed
3
Consu 1 consumed 103
Cons 0 finished
Cons 1 finished

=== Starting Data Verification ===
Produced items (8): 0 100 1 101 2 102 3 103
Consumed items (8): 0 100 1 101 2 102 3 103
SUCCESS: All produced items were correctly consumed!
=== Data Verification Complete ===

MPMC test completed successfully!

TEST 1 PASSED
SCORE: 1
init: judger completed
```