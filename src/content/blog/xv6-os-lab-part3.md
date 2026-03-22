---
title: 更适合北大宝宝体质的 xv6 OS Lab 踩坑记 - Part3
description: '北京大学 2025 年秋季学期操作系统/OS Lab Part 3'
publishDate: 2025-10-05 02:41:24
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

由于尝试了许久在完成 Part 0、1 后直接写 Part 2 都失败了，所以按照 PPT 的顺序先写 Part 3 了。

本部分包含 10 个测试样例：

-   `wait`
-   `waitpid`
-   `clone`
-   `fork`
-   `execve`
-   `getppid`
-   `exit`
-   `yield`
-   `gettimeofday`
-   `sleep`

其中，`fork`、`execve`、`exit` 等系统调用在原始 xv6 中已有实现，我们只需确保系统调用号对齐即可，无需额外编码。我们的工作重点将放在 `waitpid`、`clone` 等新的进程管理调用以及 `gettimeofday`、`sleep` 等时间相关的系统调用上。

注意，本部分实验需要实现的系统调用存在一些依赖关系，比如 `wait` / `waitpid` 依赖于 `clone` 的实现，你可能需要注意你的实现顺序从而能够及时调试。

## 准备工作

为了 Debug，我还引进了一个新的 `recompile_test.sh`，这个代码可以在修改测试用例（比如添加打印）的源代码后，直接重新打包 `riscv64` 目录到当前文件夹，不过如果你要使用，可能需要微调下相关路径：

```shell
#! /bin/bash

cd ~/OS/testsuits-for-oskernel/
sudo rm -rf ./riscv-syscalls-testing/user/build/
sudo rm -rf ./riscv-syscalls-testing/user/riscv64
docker run -ti --rm -v ./riscv-syscalls-testing:/testing -w /testing/user --privileged=true docker.educg.net/cg/os-contest:2024p6 /bin/bash -c "sh build-oscomp.sh"
cd ~/OS/xv6-os/
cp -r ~/OS/testsuits-for-oskernel/riscv-syscalls-testing/user/build/riscv64 .
```

## 时钟频率与 Ticks

在实现时间相关的系统调用前，我们首先需要理解这一套系统的时间到底是如何运作的。

原始 xv6-k210 的配置是针对 K210 硬件的，其时钟频率为 7.8 MHz，这点可以在 `bootloader/SBI/rustsbi-k210/kendryte-k210.dtsi` 中所描述的设备树中，根据如下这行确认：

```
timebase-frequency = <7800000>;
```

然而，我们现在是在 QEMU 虚拟机上运行，其模拟的硬件时钟频率是 **10 MHz**，也即 $10^{7}$ Hz。

这点可以根据 [官方仓库的 README](https://github.com/rustsbi/rustsbi-qemu) 中得到确认：

```text
 _____         _     _  __                    _
|_   _|__  ___| |_  | |/ /___ _ __ _ __   ___| |
  | |/ _ \/ __| __| | ' // _ \ '__| '_ \ / _ \ |
  | |  __/\__ \ |_  | . \  __/ |  | | | |  __/ |
  |_|\___||___/\__| |_|\_\___|_|  |_| |_|\___|_|
================================================
| boot hart id          |                    6 |
| smp                   |                    8 |
| timebase frequency    |          10000000 Hz |
| dtb physical address  |           0x87e00000 |
------------------------------------------------
```

当然，你也可以在容器内依次执行如下代码获取 QEMU 的设备树文件，从而确认：

```shell
apt-get install device-tree-compiler
qemu-system-riscv64 -machine virt,dumpdtb=virt.dtb
dtc -I dtb -O dts -o virt.dts virt.dtb
```

你会在其中检索得到：

```text
timebase-frequency = <0x989680>;
```

而这个十六进制数转换成十进制就是 10,000,000，即 10 MHz。

这个数字代表什么？它代表在 QEMU 这个模拟出来的 RISC-V 平台上，硬件计时器（Timer）每秒钟跳动 10,000,000 次。而这个值，正是你使用 `r_time()` 获取得到的 tick 数。

**然而，这个 tick 数并不等价于全局变量 `ticks`（定义在 `kernel/include/timer.h`）！！！**

这个全局变量 `ticks`，是 **时钟中断的发生计数**，它依赖于 **时钟中断的触发频率**，也即定义在 `kernel/include/param.h` 中的一个名为 `INTERVAL` 的宏。

在下文中，我们约定，如此区分两种 tick：

1.  **硬件 tick**：通过 `r_time()` 获取，以硬件时钟频率（在 QEMU 下，为 10 MHz）增长。
2.  **操作系统 tick**：全局变量 `ticks`，在每次时钟中断时加一，而每次时钟中断间隔 `INTERVAL` 个硬件 tick

举个例子，对于原始仓库，这个宏原本长这样：

```c
#define INTERVAL     (390000000 / 200) // timer interrupt interval
```

而我们前文又说了，对于 k210 平台，硬件时钟频率为 7.8 MHz，那么在 k210 上：

1. 通过 `r_time()` 获取到的硬件 tick 数，每秒钟增加 $7.8 \times 10^6$。

2. 通过全局变量 `ticks` 获取到的操作系统 tick 数，每秒钟增加 4，也即每秒钟发生 4 个时钟中断，计算方式如下：
    $$
    \begin{aligned}
    \frac{1}{\text{INTERVAL} * \text{second per hardware tick}} &= \frac{1}{(390000000 / 200) * \text{second per hardware tick}} \\
    &= \frac{7.8 \times 10^6}{3.9 \times 10^8 / 200} \\
    &= 4
    \end{aligned}
    $$

以下是一个对比表：

| 对比项       | `r_time()` 返回值 （硬件 Tick） | 全局变量 `ticks` （操作系统 Tick）           |
| ------------ | ----------------------------- | ------------------------------------------ |
| **本质**     | 硬件计数器                    | 软件计数器                                 |
| **更新频率** | 硬件时钟频率                  | 1 / (INTERVAL \* second per hardware tick) |
| **精度**     | 非常高                        | 较低                                       |
| **谁来更新** | CPU 硬件自动更新              | 操作系统中断服务程序                       |

只有理解了这个，我们才能完成 `gettimeofday` 和 `nanosleep` 两个系统调用。

## gettimeofday

根据助教提供的 [官方文档](https://www.man7.org/linux/man-pages/man2/gettimeofday.2.html)，我们得到其在 Linux 下的标准用法：

```c
struct timeval {
    time_t      tv_sec;     /* seconds */
    suseconds_t tv_usec;    /* microseconds */
};

struct timezone {
    int tz_minuteswest;     /* minutes west of Greenwich */
    int tz_dsttime;         /* type of DST correction */
};

int gettimeofday(struct timeval *tv, struct timezone *tz);
```

参数：

-   `tv`：一个指向 `timeval` 结构体的指针，用来存放结果。
-   `tz`：一个指向 `timezone` 结构体的指针，用来存放时区信息。

输出：

-   成功：返回 0，结果存放在参数位置。
-   失败：返回 -1，并设置 `errno` 错误码。

但还是要注意，以上仅供参考，我们实际上还是要结合 [测试仓库](https://github.com/oscomp/testsuits-for-oskernel/) 的代码和文档，得到要求如下：

```c
#define SYS_gettimeofday 169
```

-   功能：获取时间；
-   输入：timespec 结构体指针用于获得时间值；
-   返回值：成功返回 0，失败返回 -1；

```
struct timespec *ts;
int ret = syscall(SYS_gettimeofday, ts, 0);
```

而阅读测试仓库的代码：

```c
// riscv-syscalls-testing/user/include/stddef.h
typedef struct
{
    uint64 sec;  // 自 Unix 纪元起的秒数
    uint64 usec; // 微秒数
} TimeVal;

// riscv-syscalls-testing/user/lib/syscall.c
int64 get_time()
{
    TimeVal time;
    int err = sys_get_time(&time, 0);
    if (err == 0)
    {
        return ((time.sec & 0xffff) * 1000 + time.usec / 1000);
    }
    else
    {
        return -1;
    }
}
```

我们很容易发现这里的输入输出是：

输入：一个指向 `TimeVal` 结构体的指针，作为参数 0 传入

输出：

1. 成功：返回 0，结果存放在参数位置。
2. 失败：返回 -1，并设置 `errno` 错误码。

结合我们刚才讲过的硬件 tick 和操作系统 tick 的差异，我们修改 `kernel/include/param.h` 中的相关宏如下：

```c
/*
注意区分硬件 tick 和操作系统 tick：
- 硬件 tick：通过 r_time() 获取到的 tick 数，按照 CLOCK_FREQ 频率增长
- 操作系统 tick：通过 ticks 全局变量获取到的 tick 数，每 INTERVAL 个硬件 tick 增长 1 次

通过 README 或者在容器内获取设备树可以发现 QEMU 的硬件时钟计数器的更新频率（timebase-frequency，即 r_time() 获取到的硬件 tick 更新频率）为 virt 机器默认的 10000000 Hz（10 MHz）
而读取 bootloader/SBI/rustsbi-k210/kendryte-k210.dtsi 可以发现 K210 的硬件时钟计数器的更新频率为 7800000 Hz（7.8 MHz），所以我们发现这里实际上是原来是每 50 秒 200 个时钟中断，也即每秒 4 个时钟中断，ticks 这个全局变量按照 4ticks/s 增长，非常慢
所以这里改写为 (CLOCK_FREQ / 200)，即每秒触发 200 个时钟中断，也即 200 ticks/s，ticks 这个全局变量按照 200ticks/s 增长
*/
// #define INTERVAL     (390000000 / 200) // timer interrupt interval
#define CLOCK_FREQ   10000000 // 10 MHz
#define TICKS_PER_SECOND    200 // 每秒时钟中断次数
#define INTERVAL     (CLOCK_FREQ / TICKS_PER_SECOND) // timer interrupt interval
```

于是，我们得到代码如下：

```c
/**
 * @brief 实现 gettimeofday 系统调用，获取当前时间。
 * @param addr timespec 结构体存到的目标地址
 * @return 0 成功，-1 失败
 * @note 注意，根据测试样例的要求，需要返回 tv_usec 微秒而不是 Linux 标准中的 tv_nsec 纳秒
 */
uint64 sys_gettimeofday(void) {
  struct timespec ts;
  uint64 htick = r_time(); // 硬件(hardware) tick，注意全局变量 ticks 是操作系统(os) tick，中间差了 200 倍

  ts.tv_sec = htick / CLOCK_FREQ; // 换算成秒
  ts.tv_usec = (htick % CLOCK_FREQ) * 1000000 / CLOCK_FREQ; // 换算成微秒, 1μs = 10^-6 s

  if (get_and_copyout(0, (char *)&ts, sizeof(ts)) < 0) {
    return -1;
  }
  return 0;
}
```

## nanosleep

注意一下，`sleep` 测试用例实际上调用的是 `nanosleep` 系统调用，所以直接使用已有实现是不行的。

根据助教提供的 [官方文档](https://www.man7.org/linux/man-pages/man2/nanosleep.2.html)，我们得到其在 Linux 下的标准用法：

```c
int nanosleep(const struct timespec *duration, struct timespec *rem);
```

参数：

-   `duration`：一个指向 `timespec` 结构体的指针，用来存放要求睡眠时间。
-   `rem`：一个指向 `timespec` 结构体的指针，用来在提前唤醒时，返回剩余睡眠时间。

然后你再去看 [测试仓库](https://github.com/oscomp/testsuits-for-oskernel/) 的文档：

```
#define SYS_nanosleep 101
```

-   功能：执行线程睡眠，`sleep()` 库函数基于此系统调用；
-   输入：睡眠的时间间隔；
-   返回值：成功返回 0，失败返回 -1；

你再看文档中的代码，你会发现这里极其弱智的给了一个这样的定义：

```c
struct timespec {
    time_t tv_sec;        /* 秒 */
    long   tv_nsec;       /* 纳秒, 范围在0~999999999 */
};
const struct timespec *req, struct timespec *rem;
int ret = syscall(SYS_nanosleep, req, rem);
```

看出哪里有问题了吗？这里是彼此冲突的！前面 `gettimeofday` 的计算明明第二个字段是符合 Linux 标准的微秒，而这里却是纳秒（甚至看起来约定了两个不同的结构体 `TimeVal` 和 `timespec`）！

但是，如果你再去搜一下代码，**你就会发现这里纯纯是文档写错了**，全仓库都没有 `timespec` 这玩意的定义，只有 `TimeVal`。

你能感受我的无语吗？官方文档纯瞎写，真的难绷吧。

好吧，让我们忽视这个弱智错误，假定应当是符合 Linux 标准和它自身代码的约定，即结构体里存放秒和微秒，那么我们只需要再注意这里应当利用 **操作系统 tick**，即 `ticks` 全局变量完成换算即可，模仿已有的 `sys_sleep` 调用，我们得到：

```c
/**
 * @brief 实现 nanosleep 系统调用，睡眠指定时间。
 * @param req_addr 输入参数，指定的睡眠时间结构体 timespec 存放的地址，需要使用 copyin2 从用户空间拷贝到内核空间
 * @param rem_addr 输出参数，实际睡眠时间结构体 timespec 存放的地址，若实际睡眠时间小于指定睡眠时间，则返回剩余睡眠时间，反之返回 0，需要使用 copyout2 从内核空间拷贝到用户空间
 * @return 0 成功，-1 失败
 * @note 注意，根据测试样例的要求，需要睡眠时间以纳秒为单位
 */
uint64
sys_nanosleep(void)
{
  uint64 req_addr, rem_addr;
  struct timespec req_tv; // tv: timeval
  if (argaddr(0, &req_addr) < 0 || argaddr(1, &rem_addr) < 0) {
    return -1;
  }
  // 从用户空间拷贝到内核空间
  if (copyin2((char *)&req_tv, req_addr, sizeof(struct timespec)) < 0) {
    return -1;
  }

  uint64 target_ticks = req_tv.tv_sec * TICKS_PER_SECOND + req_tv.tv_usec * TICKS_PER_SECOND / 1000000;

  uint64 ticks0;
  acquire(&tickslock);
  ticks0 = ticks;
  while (ticks - ticks0 < target_ticks) {
    if (myproc()->killed) {
      // 如果输出参数 rem_addr 不为空，则返回剩余睡眠时间
      if (rem_addr != NULL) {
        uint64 elapsed_ticks = ticks - ticks0;
        uint64 rem_ticks = (target_ticks > elapsed_ticks) ? (target_ticks - elapsed_ticks) : 0;
        struct timespec rem_tv;
        rem_tv.tv_sec = rem_ticks / TICKS_PER_SECOND;
        rem_tv.tv_usec = (rem_ticks % TICKS_PER_SECOND) * 1000000 / TICKS_PER_SECOND;
        if (copyout2(rem_addr, (char *)&rem_tv, sizeof(struct timespec)) < 0) {
          release(&tickslock);
          return -1;
        }
      }
      release(&tickslock);
      return -1;
    }
    sleep(&ticks, &tickslock);
  }
  release(&tickslock);
  return 0;

}
```

> 注：写到这里的时候参阅了一些前人代码，发现几乎没有人实现了正确的换算和符合文档行为的 `rem` 参数，只能说这实验真的是草台班子。

## clone

`clone()` 函数的作用是创建一个与当前进程（父进程）几乎一模一样的新进程（子进程）。

要理解 `clone()` 的行为，让我们首先从 Gemini 哪里补一些课。

**进程控制块（Process Control Block，PCB）** 是操作系统内核中用于描述和管理一个进程的核心数据结构。在 xv6 操作系统中，其具体实现为 `struct proc`（参见 `kernel/include/proc.h`）。它包含了内核管理进程所需的所有信息，例如：

-   **进程 ID（PID）**：唯一的进程标识符。
-   **进程状态**：如 `RUNNING`（运行中）、`SLEEPING`（等待中）等。
-   **内存管理信息**：指向该进程页表的指针，定义了其虚拟地址空间。
-   **内核栈**：进程在内核态执行时使用的栈。
-   **上下文信息**：指向陷阱帧（`trapframe`）和内核线程上下文（`context`）的指针，用于进程切换和中断处理。

`allocproc()` 是一个内核函数，其主要作用是 **分配并初始化一个新的 PCB**。具体步骤如下：

1.  在内核的进程表中查找一个未被使用的 `struct proc` 条目。
2.  如果找到，将其状态初始化（例如，设置为 `USED`），并分配一个唯一的 PID。
3.  为该进程分配一个内核栈。
4.  准备好从内核态返回用户态所需的初始上下文，这通常涉及在内核栈顶设置一个陷阱帧和初始的内核线程上下文。

**陷阱帧（Trapframe）** 是一个至关重要的数据结构，用于在进程从 **用户态** 切换到 **内核态** 时，**保存 CPU 的完整状态（即上下文）**。在 xv6 中，其具体实现为 `struct trapframe`（参见 `kernel/include/trap.h`）。当发生系统调用、设备中断或异常时，CPU 必须暂停当前用户程序的执行并转入内核。陷阱帧的作用就是像一张 “快照”，精确记录下暂停瞬间的所有 CPU 寄存器状态，以便内核处理完毕后能完美恢复现场，让用户进程无感知地继续运行。

当发生切换时，硬件或内核代码会将用户态的所有关键寄存器值保存在一个位于内核栈上的 `trapframe` 结构中。这样做是为了在内核处理完相应事件后，能够精确地恢复这些寄存器值，让进程从中断处无缝地继续执行，就好像什么都没发生过一样。

`struct trapframe` 包含的主要信息可分为两类：

-   **用户态上下文**：保存了用户进程执行时的所有关键寄存器值。

    -   `epc`（Exception Program Counter）：**异常程序计数器**。保存了触发陷阱的用户指令的地址。这是最重要的字段，内核处理完毕后将根据此地址返回，继续执行用户代码。
    -   `sp`（Stack Pointer）：**用户栈指针**。记录了用户进程的栈顶位置。
    -   **通用寄存器**：如 `ra`（返回地址）、`gp`（全局指针）、`a0-a7`（函数参数与返回值）、`s0-s11`（被调用者保存的寄存器）、`t0-t6`（临时寄存器）。这些寄存器完整地定义了进程在用户态的计算状态，必须全部保存和恢复。

-   **内核态切换信息**：保存了进入内核态所需的目标信息。这些字段由内核在创建进程时预设好，在陷入（trap）时被加载到 CPU 中。
    -   `kernel_satp`：指向 **内核页表** 的指针。CPU 进入内核态后，需要切换到内核的地址空间，此字段提供了页表基地址。
    -   `kernel_sp`：指向当前进程 **内核栈的栈顶**。内核代码执行需要自己的栈空间，与用户栈隔离。
    -   `kernel_trap`：指向内核中 **陷阱处理函数** （`usertrap`）的地址。保存完用户态上下文后，程序将跳转到这里开始执行内核代码。
    -   `kernel_hartid`：记录当前执行的 CPU 核心（hart）的 ID。

每个进程都有一个自己的陷阱帧，通常由其进程控制块（PCB）中的指针 `p->trapframe` 指向。这个结构是连接用户态和内核态的关键桥梁。

好的，补课结束！

根据助教给的 [官方文档](https://www.man7.org/linux/man-pages/man2/clone.2.html)，我们得到其在 Linux 下的标准用法：

```c
int clone(int (*fn)(void *), void *child_stack, int flags, void *arg);
```

参数：

-   `fn`：一个函数指针，用于在子进程中执行
-   `child_stack`：一个指向子进程堆栈的指针
-   `flags`：一个标志位，用于指定子进程的执行方式
-   `arg`：一个参数，用于传递给子进程

返回值：

-   成功：返回子进程的 PID
-   失败：返回 -1

然后再去看 [测试仓库](https://github.com/oscomp/testsuits-for-oskernel/) 的文档：

```
#define SYS_clone 220
```

输入：

-   `flags`：创建的标志，如 SIGCHLD
-   `stack`：指定新进程的栈，可为 0
-   `ptid`：父线程 ID
-   `tls`：TLS 线程本地存储描述符
-   `ctid`：子线程 ID

返回值：

-   成功：返回子进程的线程 ID
-   失败：返回 -1

```c
pid_t ret = syscall(SYS_clone, flags, stack, ptid, tls, ctid)
```

这个测试点很恶心的一点，在于你光看上面这个没有一点用的文档说明是根本无从得知怎么实现的，注意到 Linux 标准实现要求传入了一个 `fn` 函数指针以及一个 `arg` 参数，而这里完全没有相关说明，你必须再去深入一些，阅读测试点源码：

```c
// riscv-syscalls-testing/user/include/unistd.h
pid_t clone(int (*fn)(void *arg), void *arg, void *stack, size_t stack_size, unsigned long flags);

// riscv-syscalls-testing/user/src/oscomp/clone.c
#include "stdio.h"
#include "stdlib.h"
#include "unistd.h"

size_t stack[1024] = {0};
static int child_pid;

static int child_func(void){
    printf("  Child says successfully!\n");
    return 0;
}

void test_clone(void){
    TEST_START(__func__);
    int wstatus;
    child_pid = clone(child_func, NULL, stack, 1024, SIGCHLD);
    assert(child_pid != -1);
    if (child_pid == 0){
	exit(0);
    }else{
	if(wait(&wstatus) == child_pid)
	    printf("clone process successfully.\npid:%d\n", child_pid);
	else
	    printf("clone process error.\n");
    }

    TEST_END(__func__);
}

int main(void){
    test_clone();
    return 0;
}

```

然后，还是没有思路对不对？好像只是知道了这里新开了一个 8KB 的空间作为这个进程的栈之外，毫无用处？还是不知道 `fn` 和 `arg` 弄到哪里去了？

是的，想要搞清楚，你还得继续深入，在容器内反编译出来编译好的测试程序，也即在容器内执行：

```shell
riscv64-linux-gnu-objdump -d riscv64/clone > clone.asm
```

根据反汇编结果，你才终于能找到一些蛛丝马迹：

```cpp
riscv64/clone:     file format elf64-littleriscv


Disassembly of section .text:

0000000000001000 <_start>:
    1000:	850a                	mv	a0,sp
    1002:	0f40006f          	j	10f6 <__start_main>

0000000000001006 <child_func>:
    1006:	1141                	addi	sp,sp,-16
    1008:	00001517          	auipc	a0,0x1
    100c:	02850513          	addi	a0,a0,40 # 2030 <__clone+0x2a>
    1010:	e406                	sd	ra,8(sp)
    1012:	306000ef          	jal	ra,1318 <printf>
    1016:	60a2                	ld	ra,8(sp)
    1018:	4501                	li	a0,0
    101a:	0141                	addi	sp,sp,16
    101c:	8082                	ret

000000000000101e <test_clone>:
    101e:	1101                	addi	sp,sp,-32
    1020:	00001517          	auipc	a0,0x1
    1024:	03050513          	addi	a0,a0,48 # 2050 <__clone+0x4a>
    1028:	ec06                	sd	ra,24(sp)
    102a:	e822                	sd	s0,16(sp)
    102c:	2ca000ef          	jal	ra,12f6 <puts>
    1030:	00003517          	auipc	a0,0x3
    1034:	0e050513          	addi	a0,a0,224 # 4110 <__func__.1191>
    1038:	2be000ef          	jal	ra,12f6 <puts>
    103c:	00001517          	auipc	a0,0x1
    1040:	02c50513          	addi	a0,a0,44 # 2068 <__clone+0x62>
    1044:	2b2000ef          	jal	ra,12f6 <puts>
    1048:	4745                	li	a4,17
    104a:	40000693          	li	a3,1024
    104e:	00001617          	auipc	a2,0x1
    1052:	0ba60613          	addi	a2,a2,186 # 2108 <stack>
    1056:	4581                	li	a1,0
    1058:	00000517          	auipc	a0,0x0
    105c:	fae50513          	addi	a0,a0,-82 # 1006 <child_func>
    1060:	5ab000ef          	jal	ra,1e0a <clone>

 // 中间无关代码省略之

0000000000001e0a <clone>:
    1e0a:	85b2                	mv	a1,a2
    1e0c:	863a                	mv	a2,a4
    1e0e:	c191                	beqz	a1,1e12 <clone+0x8>
    1e10:	95b6                	add	a1,a1,a3
    1e12:	4781                	li	a5,0
    1e14:	4701                	li	a4,0
    1e16:	4681                	li	a3,0
    1e18:	2601                	sext.w	a2,a2
    1e1a:	1ec0006f          	j	2006 <__clone>

0000000000002006 <__clone>:
    2006:	15c1                	addi	a1,a1,-16
    2008:	e188                	sd	a0,0(a1)
    200a:	e594                	sd	a3,8(a1)
    200c:	8532                	mv	a0,a2
    200e:	863a                	mv	a2,a4
    2010:	86be                	mv	a3,a5
    2012:	8742                	mv	a4,a6
    2014:	0dc00893          	li	a7,220
    2018:	00000073          	ecall
    201c:	c111                	beqz	a0,2020 <__clone+0x1a>
    201e:	8082                	ret
    2020:	6582                	ld	a1,0(sp)
    2022:	6522                	ld	a0,8(sp)
    2024:	9582                	jalr	a1
    2026:	05d00893          	li	a7,93
    202a:	00000073          	ecall

```

你需要像 ICS 的 bomblab 一样阅读代码，才能理清楚，在调用 `sys_clone` 之前，实际上的内存布局是这样的：

```
         高地址  ^
                |
       0x2508   +----------------+ <-- 阶段二计算出的栈顶
                |  arg (NULL/0)  | <-- sd a3, 8(a1) 写入这里 (地址 0x2500)
       0x2500   +----------------+
                |fn (&child_func)| <-- sd a0, 0(a1) 写入这里 (地址 0x24F8)
       0x24F8   +----------------+ <-- 最终传给内核的 a1 指针
                |                |
                |(useable space) |
                |      ...       |
                |                |
       0x2108   +----------------+ <-- stack 数组基地址
                |
         低地址  v
```

也就是说，实际上 `arg` 和 `fn` 两个参数被从栈顶进行了两次压栈，才得到了最终传给内核的 `a1` 指针。

现在，让我们回到 `kernel/proc.c` ，我们终于可以参照 `fork()` 函数，稍作修改，得到 `clone()` 函数：

```c
// kernel/proc.c

int
clone(void)
{
  // ... 与 fork 类似的进程分配、内存拷贝等 ...
  struct proc* p = myproc();
  uint64 stack;

  // ...
  *(np->trapframe) = *(p->trapframe);

  argaddr(1, &stack); // 从第二个参数获取用户指定的栈顶地址
  // 如果用户提供了栈地址
  if (stack != NULL) {
    uint64 fn, arg;
    // 从用户指定的栈中读取 fn 和 arg
    // 注意：这里需要确保 stack 是有效的用户地址
    // 注意 copyin 比 copyin2 更安全，未修改前 copyin2 只做了简单的边界检查 srcva + len > sz
    // 而 sz 与映射页表无关，从而无法处理映射页表
    if (copyin(p->pagetable, (char*)&fn, stack, sizeof(fn)) < 0 ||
      copyin(p->pagetable, (char*)&arg, stack + 8, sizeof(arg)) < 0) {
      freeproc(np);
      release(&np->lock);
      return -1;
    }
  }

  // 让子进程的返回值为 0
  np->trapframe->a0 = 0;
  // ...
}
```

然后，再在 `kernel/sysproc.c` 中类似的添加一行调用即可：

```c
/**
 * @brief 实现 clone 系统调用，创建子进程/线程。
 * @return 0 成功，-1 失败
 */
uint64 sys_clone(void) {
  return clone();
}
```

## wait / waitpid

`wait` 和 `waitpid` 的功能十分相近，都用于等待子进程结束。

依旧是老样子，根据助教给的 [wait 官方文档](https://www.man7.org/linux/man-pages/man2/wait4.2.html) 和 [waitpid 官方文档](https://www.man7.org/linux/man-pages/man3/waitpid.3p.html)，

我们得到其在 Linux 下的标准用法：

```c
pid_t wait(int *wstatus);
pid_t waitpid(pid_t pid, int *wstatus, int options);
```

参数：

-   `pid`：要等待的子进程的 PID
-   `wstatus`：一个指向整数的指针，用来存放子进程的退出状态
-   `options`：一个标志位，用于指定等待方式

返回值：

-   成功：返回子进程的 PID，并且将子进程的退出状态存放在 `wstatus` 指针所指向的内存中
-   失败：返回 -1

然后再去看 [测试仓库](https://github.com/oscomp/testsuits-for-oskernel/) 的文档：

```c
#define SYS_wait4 260
```

功能：等待进程改变状态；

输入：

-   `pid`：指定进程 ID，可为 - 1 等待任何子进程；
-   `status`：接收状态的指针；
-   `options`：选项：WNOHANG，WUNTRACED，WCONTINUED；

返回值：

-   成功：返回进程 ID；如果指定了 `WNOHANG`，且进程还未改变状态，直接返回 0
-   失败：返回 -1

```
pid_t pid, int *status, int options;
pid_t ret = syscall(SYS_wait4, pid, status, options);
```

原始 xv6 只提供了一个简单的 `wait`，而显然我们需要实现的 `waitpid` 是一个功能更强大的版本，可以等待指定的子进程。

不过，这也只需要对 `kernel/proc.c` 中 `wait` 函数做一些简单的微调即可。

首先，我们需要修改 `kernel/proc.c` 中 `wait` 函数的签名，使其能够接受一个 `wpid` 参数，用于指定要等待的子进程 ID。

```c
// kernel/proc.c

// 原签名: int wait(uint64 addr)
// 新签名:
int
wait(int wpid, uint64 addr)
{
  // ...
}
```

`wpid` 的含义如下：

-   `wpid > 0`：等待进程 ID 为 `wpid` 的子进程。
-   `wpid == -1`：等待任意一个子进程（这也就是 `wait` 系统调用的行为）。
-   对于其他情况，我们选择面向测试用例编程，直接报错处理。

接着，在 `wait` 函数的循环中，加入对 `wpid` 的判断逻辑：

```c
// kernel/proc.c wait() 函数内

if (np->parent == p) {
  // 如果指定了 wpid，但当前遍历到的子进程 np 不是目标，则跳过
  if (wpid > 0 && np->pid != wpid) {
    havekids = 1; // 标记仍然有其他子进程存在
    continue;
  }
  // ... 找到目标子进程（或任意子进程）后的处理逻辑
}
```

**另一个关键的修改是关于子进程的退出状态码。**

根据 POSIX 标准，`wait` 系列函数返回的状态码 `status` 是一个位域，它的低 16 位包含了状态信息，可以分为两部分：

1.  **低 8 位**：如果子进程是被信号终止或停止的，这里存储了信号编号。
2.  **高 8 位**：如果子进程是正常退出的，这里存储了退出码（exit code）。

因此，我们需要将 `np->xstate` 左移 8 位。这个修改是为了让测试用例中的 `WEXITSTATUS(status)` 宏（它会右移 8 位来提取退出码）能够正常工作。

```c
// kernel/proc.c wait() 函数内

// ...
status = np->xstate << 8;
if (addr != 0 && copyout2(addr, (char*)&status, sizeof(status)) < 0) {
  // ... 错误处理
}
// ...
```

同理，我们还需要微调一下原有的 `sys_wait()` 实现，使之符合新签名格式：

```c
// kernel/sysproc.c

uint64
sys_wait(void)
{
  uint64 p;
  if(argaddr(0, &p) < 0)
    return -1;
  // 原来是 wait(p);
  return wait(-1, p);
}
```

## sched_yield

`sched_yield` 系统调用让当前进程主动放弃 CPU，让调度器去选择另一个可运行的进程来执行。实现非常简单，直接调用内核的 `yield()` 函数即可。

```c
// kernel/sysproc.c

uint64
sys_sched_yield(void) {
  yield();
  return 0;
}
```

## getppid

`getppid` 用于获取当前进程的父进程 ID（Parent Process ID）。

结合前面介绍过的 PCB 结构信息，我们只需要在 `kernel/sysproc.c` 中添加实现即可。

```c
// kernel/sysproc.c

uint64
sys_getppid(void)
{
  return myproc()->parent->pid;
}
```

`myproc()` 函数返回当前正在执行的进程的 `struct proc` 指针，我们直接访问其 `parent` 成员并返回 `pid` 即可。

## 测试

至此，我们已经完成了 Part3 的全部内容，只需要进行测试即可：

```c
qwe
make clean
make local
```

得到输出：

```
hart 0 init done
// 前略
init: starting sh
========== START test_wait ==========
This is child process
wait child success.
wstatus: 0
========== END test_wait ==========
init: starting sh
========== START test_waitpid ==========
This is child process
waitpid successfully.
wstatus: 3
========== END test_waitpid ==========
init: starting sh
========== START test_clone ==========
  Child says successfully!
clone process successfully.
pid:12
========== END test_clone ==========
init: starting sh
========== START test_fork ==========
  child process.
  parent process. wstatus:0
========== END test_fork ==========
init: starting sh
========== START test_execve ==========
  I am test_echo.
execve success.
========== END main ==========
init: starting sh
========== START test_getppid ==========
  getppid success. ppid : 1
========== END test_getppid ==========
init: starting sh
========== START test_exit ==========
exit OK.
========== END test_exit ==========
init: starting sh
========== START test_yield ==========
  I am child process:   I am child process: 21. iteration 1.
  I am child process: 22. iteration 2.
20. iteration 0.
  I am child process: 21. iteration 1.
  I am child process: 20. iteration 0.
  I am child process: 21. iteration 1.
  I am child process: 22. iteration 2.
  I am child process: 20. iteration 0.
  I am child process: 21. iteration 1.
  I am child process: 22. iteration 2.
  I am child process: 21. iteration 1.
  I am child process: 22. iteration 2.
  I am child process: 20. iteration 0.
  I am child process: 22. iteration 2.
  I am child process: 20. iteration 0.
========== END test_yield ==========
init: starting sh
========== START test_gettimeofday ==========
gettimeofday success.
start:836, end:911
interval: 75
========== END test_gettimeofday ==========
init: starting sh
========== START test_sleep ==========
sleep success.
========== END test_sleep ==========
```

注意这里，测试 `yield` 系统调用的时候，可能出现错行，这可能是因为 xv6-k210 中并不保证 `printf` 的原子性，但这不影响测试通过。

你可以通过调低 `TICKS_PER_SECOND` 这个宏来避免。
