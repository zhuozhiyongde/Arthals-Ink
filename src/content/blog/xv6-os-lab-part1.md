---
title: 更适合北大宝宝体质的 xv6 OS Lab 踩坑记 - Part1
description: '北京大学 2025 年秋季学期操作系统/OS Lab Part 1'
publishDate: 2025-10-02 16:20:53
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

在完成 Part0 的准备工作后，你已经了解了 xv6 操作系统的基本运行流程，以及如何使用 Docker 和 Make 工具进行项目构建。在 Part 1 中，我们将深入理解系统启动的关键步骤，理解本地运行与平台评测的差异，并开始实现第一批系统调用。

本部分包含 5 个测试样例：

-   `getcwd`
-   `write`
-   `getpid`
-   `times`
-   `uname`

关于平台提交所需要准备的事项都已经在 Part0 中详细介绍过了，主要就是需要做一个 `make all` 确保 `kernel-qemu` 和 `sbi-qemu` 被正确拷贝到根目录即可，同时为了同步本地和平台的测试，我们需要将 `riscv64/` 目录下的测试样例拷贝到 `fs.img` 的根目录下。

## initcode

在开始之前，我们还是先回顾一下系统的整体启动流程：

1. **QEMU 启动**：QEMU 模拟器为操作系统提供了虚拟的硬件环境，包括 CPU、内存和硬盘。
2. **引导加载（Bootloader）**：`RustSBI` 程序首先运行，它负责初始化虚拟硬件，并将内核文件加载到内存中。
3. **内核运行**：CPU 开始执行内核代码。内核对各项系统服务进行初始化，例如进程管理和内存管理。
4. **内核初始化，挂载 fs.img**：内核初始化后，会挂载 `fs.img` 文件系统。
5. **创建第一个进程，运行 initcode**：内核创建第一个进程，并运行 `initcode` 程序。
6. **initcode 执行 `exec("/init")`**：`initcode` 程序执行 `exec("/init")` 系统调用，加载 `/init` 程序。
7. **`/init` 程序接管，开始执行测试或启动 Shell**：`/init` 程序接管，开始执行测试或启动 Shell。

完成以上步骤后，操作系统启动完毕，并将控制权交给用户程序。

可以看到，`initcode` 在其中发挥一个承上启下的作用，它引导了第一个进程的创建和启动，实现了整个系统的 **自举**。

> 什么是自举？
>
> 自举（Bootstrapping）这个词源于英文谚语 “pull oneself up by one's bootstraps”（拉着自己的鞋带把自己提起来），比喻从一个极小的起点，依靠自身力量发展壮大。
>
> 在内核创建第一个进程时，完整的用户态环境（如动态链接器、标准库 `libc` 等）还不存在。`initcode` 的唯一使命就是调用 `exec` 系统调用，去加载并运行真正的用户态初始化程序（如 `/init`）。如果 `initcode` 本身是需要复杂加载过程的程序（如 ELF 格式），就会陷入 “谁来加载第一个加载器” 的悖论。
>
> 所以，`initcode` 必须是一段纯粹的机器码，而且不能依赖任何外部库。从而内核可以非常简单地将这段代码字节流直接复制到新进程的内存空间中，然后把 CPU 的控制权交给它，无需任何解析或链接操作。

`initcode` 的源代码在 `xv6-user/initcode.S` 文件中，具体的流程细节我们暂时还不需要关心，我们只需要大概知道它的工作方式如下：

1. `initcode` 被编译成二进制机器码。
2. 这些机器码以一个 C 语言数组 (`uchar initcode[]`) 的形式，被直接包含在内核的可执行文件中。

内核创建第一个进程的详细流程如下：

1. 内核调用 `userinit()` 函数，在内存中为第一个进程（PID=1）分配数据结构。
2. 内核不从硬盘加载文件，而是直接将 `initcode[]` 数组中的机器码，复制到这个新进程的内存空间中。
3. 内核调度器开始运行该进程。
4. 该进程执行的指令就是 `initcode` 的内容，即发起 `exec("/init")` 系统调用。
5. 这个系统调用从用户态切换到内核态。此时，内核收到了一个来自有效用户进程的 `exec` 请求。
6. 内核处理这个请求，从 `fs.img` 文件系统中找到 `/init` 程序，将其加载到该进程的内存中，**覆盖掉原来的 `initcode`**，然后返回用户态，开始执行 `/init` 程序的 `main` 函数。

通过这种方式，系统完成了第一个用户进程的加载和启动。

那么，为什么助教在视频中还发生了需要手动修改 `initcode` 的情况呢？如果这些东西看上去都是已经做好的，我们似乎并没有道理要修改其源码啊？

答案是我们所基于的这个 k210 框架是一个非常早的项目，它编译 `initcode` 时使用的 `initcode.S` 是基于 32 位 RISC-V 架构的，而我们现在的 RISC-V 架构是 64 位，所以其不能直接运行。

同时，其还依赖了 `include/sysnum.h`，并且使用了其中类似 `SYS_exec` 的宏，这就导致，如果你修改了 `include/sysnum.h` 中的系统调用号，你就需要重新生成 `initcode`（至于为什么需要修改，我们将在后文加以解释）。

而如果每次都需要复制机器码到 `proc.c` 中的 `initcode` 数组中，那就太麻烦了。所以这里有一个相对简便的方法，就是使用脚本根据 `initcode.S` 生成 `initcode.h`，然后我们再利用 `#include` 语法，直接在 `proc.c` 中引入即可。

这里，助教选择了直接将 `init.c` 编译出机器码，然后通过脚本生成对应的 `initcode.h` 文件，而不是理想的根据短片段 `initcode.S` 生成 `initcode.h` 文件后再拉起 `/init` 进程。这非常的不优雅，因为这么做实际上是将整个 `init` 程序完全打入了 `initcode.h` 文件中，又大又容易变化，而且后续会带来堆栈空间、入口定位错误不足的问题（简单说就是在 `uvminit` 中是按照 `initcode.S` 设计的，默认只分配一页内存并且强制从 `.text` 段的 `0x0` 开始执行，而 `init.c` 编译出的机器码可能远远超过一页，从而导致堆栈空间不足，同时如果在 `init.c` 前面声明别的函数，那么会导致 `main` 函数入口不再是 `0x0`，从而导致入口定位错误，详细分析见 Part 4 笔记）。

**然而，评测时这么做是必须的，因为希冀平台评测时所提供的预编译 `sdcard.img` 中没有 `init` 程序，我们无法通过自举代码来拉起 `/init` 进程。而且，我们在编译阶段也无法访问 `sdcard.img`，将 `init` 程序拷贝到其中。我们更无法修改启动命令换用我们的 `fs.img` 进行评测。**

但是我们知道，更优雅的做法还是将 `initcode.S` 改为适配 64 位 RISC-V 架构的写法，然后按照理想设计，直接根据 `initcode.S` 生成 `initcode.h` 文件后，执行后再拉起 `/init` 进程。

所以，我们这里可以选择一个折中的方案：

- 对于平台所使用的 `make all` 命令编译过程，我们使用助教的办法，硬编码完整的 `init` 程序的机器码到 `initcode.h` 中；
- 而对于本地测试，我们使用理想的做法，根据短的自举片段 `initcode.S` 生成 `initcode.h` 文件后，执行后再拉起 `/init` 进程。

这一点我已经通过在初始化本仓库的时候就完成了，如果你是直接克隆本仓库，将会无感体验。但如果你是根据助教的流程走的，那么建议你如下操作（同 Part 4 笔记）：

观察 `Makefile` 会发现原本的代码就存在一个 `$U/initcode` 的编译目标，只不过其是在 32 位 RISC-V 下得到的，所以我们使用不了它的产物，我们只需要将之改为 64 位 RISC-V 的写法即可：

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

然后重新更改我们的 Makefile 中的 dump 目标和 all 目标：

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

而后我们最终只需要在容器内手动执行 `make dump` 命令，就可以生成 `kernel/include/initcode.h` 文件，然后我们再修改 `kernel/proc.c` 文件，引入 `initcode.h` 即可：

```cpp
// a user program that calls exec("/init")
// od -t xC initcode
uchar initcode[] = {
  // 0x17, 0x05, 0x00, 0x00, 0x13, 0x05, 0x45, 0x02,
  // 0x97, 0x05, 0x00, 0x00, 0x93, 0x85, 0x35, 0x02,
  // 0x93, 0x08, 0x70, 0x00, 0x73, 0x00, 0x00, 0x00,
  // 0x93, 0x08, 0x20, 0x00, 0x73, 0x00, 0x00, 0x00,
  // 0xef, 0xf0, 0x9f, 0xff, 0x2f, 0x69, 0x6e, 0x69,
  // 0x74, 0x00, 0x00, 0x24, 0x00, 0x00, 0x00, 0x00,
  // 0x00, 0x00, 0x00, 0x00
  #include "include/initcode.h"
};
```

这样，我们就可以在 `proc.c` 中直接使用 `initcode.h` 中的机器码，而无需手动复制。

并且，我们并不需要每次修改代码都执行这一段代码，除非我们修改了 `sysnum.h` 中的系统调用号，否则我们可以一直保持这个 `initcode.h` 内容不变，也就不需要重新生成。

## 评测流程

### 测试程序

说了这么多，我们还是要明白自己在做什么。我们最核心的内容是，我们要完成的是一个 xv6 内核，而内核最主要的职责是提供系统调用，从而让用户程序（即测试程序）能够正常运行并产生预期的输出。

从而，我们并不是像 ICS 的 Lab 一样，编写代码完成一个个很复杂的用户程序，而是需要实现一系列系统调用，从而让已经在标准 Linux 下编译好的二进制用户程序能够在我们的内核上正常运行。而这些编译好的用户程序，就是我们在 Part0 中得到的 `riscv64/` 目录下的那些二进制文件，他们的源码在 `testsuits-for-oskernel/riscv-syscalls-testing/user/src/` 目录下，会测试同名的系统调用，并完成输出的比较。

-   每个测试程序（例如 `getcwd`）被 `init` 启动后，会调用特定的系统调用。
-   测试程序会根据系统调用的行为和返回值来判断功能是否正确，然后通过 `printf` 函数打印出标准格式的结果信息。
-   `printf` 的内容会通过 `write` 系统调用，由 QEMU 输出到标准输出流。
-   评测系统在后台执行 QEMU 时，会捕获其所有的标准输出，并保存到一个文本文件中。
-   测试运行结束后，评测脚本会将捕获到的输出内容与预先定义的标准答案文件进行文本比对。
-   如果输出内容与标准答案完全一致，则测试通过。
-   所有测试程序执行完毕后，`init.c` 调用 `shutdown()` 系统调用，通知 QEMU 退出。这可以标志评测结束，并避免因程序挂起而超时。

因此，我们虚拟磁盘中实际上包含两类程序，它们的用途不同。

| 特性                             | **用户程序 (xv6-user/\*.c)** | **测试程序 (riscv64/\*)**            |
| -------------------------------- | ------------------------------- | ------------------------------------ |
| **来源**                         | 项目提供的源代码 (`ls.c` 等)    | 基于测试仓库代码预编译的二进制文件   |
| **编译**                         | 通过 `make build` 在本地编译    | 无需编译，直接拷贝至虚拟磁盘         |
| **用途**                         | 提供 Shell 环境和常用命令行工具 | 自动化测试内核的系统调用实现是否正确 |
| **在虚拟磁盘 `fs.img` 中的位置** | `/bin/ls`, `/bin/cat` 等        | `/getcwd`, `/write` 等               |

想要检查这里，你只需要运行 `qwe` 进入容器后，执行 `mount fs.img /mnt`，然后再 `cd /mnt`，即可进行检查了。

### 修改 `init.c`

为了使得评测流程正常工作，我们还需要修改 `init.c`。回顾一下，`init.c` 编译出来的其实就是系统启动后的 `/init` 程序，而原始的 `init.c` 其实只干了一件事情就是启动一个 `sh`：

```cpp
if(pid == 0){
    exec("sh", argv);
    printf("init: exec sh failed\n");
    exit(1);
}
```

所以，我们需要修改 `init.c`，使其不再启动 `sh`，而是按顺序执行预先编译好的测试程序，并添加一行 `shutdown()` 调用，以确保系统正常关机。

```cpp
// init: The initial user-level program

#include "kernel/include/types.h"
#include "kernel/include/stat.h"
#include "kernel/include/file.h"
#include "kernel/include/fcntl.h"
#include "xv6-user/user.h"

// char *argv[] = { "sh", 0 };
char* argv[] = { 0 };
char* tests[] = {
  "getcwd",
  "write",
  "getpid",
  "times",
  "uname",
};

int counts = sizeof(tests) / sizeof((tests)[0]);


int
main(void)
{
  int pid, wpid;

  // if(open("console", O_RDWR) < 0){
  //   mknod("console", CONSOLE, 0);
  //   open("console", O_RDWR);
  // }
  dev(O_RDWR, CONSOLE, 0);
  dup(0);  // stdout
  dup(0);  // stderr

  for(int i = 0; i < counts; i++){
    printf("init: starting sh\n");
    pid = fork();
    if(pid < 0){
      printf("init: fork failed\n");
      exit(1);
    }
    if(pid == 0){
      exec(tests[i], argv);
      printf("init: exec %s failed\n", tests[i]);
      exit(1);
    }

    for(;;){
      // this call to wait() returns if the shell exits,
      // or if a parentless process exits.
      wpid = wait((int *) 0);
      if(wpid == pid){
        // the shell exited; restart it.
        break;
      } else if(wpid < 0){
        printf("init: wait returned an error\n");
        exit(1);
      } else {
        // it was a parentless process; do nothing.
      }
    }
  }
  shutdown();
  return 0;
}

```

如此一来，以后继续完成 Lab 的剩余部分的时候，我们只需要将测试程序的名称添加到 `tests` 数组中，然后重新编译内核，就可以进行测试了。

简而言之，自动化评测流程的核心就是 **修改 `init.c`** 和 **捕获并比对输出**。

## 系统调用号对齐

在开始实现 Part 1 的系统调用之前，我们需要先解决一个关键问题：**系统调用号的对齐**。

为什么需要系统调用号对齐？答案是 xv6-k210 项目本身已经实现了一些基本的系统调用，例如 `write`、`read`、`fork`、`exec` 等（具体有那些可以参见项目最原始的 `sysnum.h`）。这些系统调用让内核能够启动并运行 shell。

但是，这些系统调用在 xv6-k210 中使用的调用号，与测试用例使用的标准 Linux 系统调用号 **不同**。

例如：

-   xv6-k210 原有的 `SYS_write` 是 `16`
-   而 Linux 标准的 `SYS_write` 是 `64`

而我们的测试程序是基于标准 Linux 系统调用号编译的，它们在调用 `write` 时会使用系统调用号 `64`。如果我们的内核还在使用 `16` 作为 `SYS_write` 的编号，测试程序就无法正确调用到实现好的 `sys_write` 函数，也就会导致 `unknown sys call` 的报错。

同理，如果你修改了系统调用号，你就必须要重新生成 `initcode`，因为其中也会需要进行系统调用，否则就会出现类似如下报错：

```
pid 72 initcode: unknown sys call 16
pid 72 initcode: unknown sys call 2
```

所以这个时候，你只需要重新走一遍编译流程即可：

```shell
make clean
make build platform=qemu
./gen_initcode.sh
make local
```

现在我们已经了解了为什么需要对齐，那么接下来所需要做的就是参考 [官方文档](https://github.com/oscomp/testsuits-for-oskernel/blob/main/oscomp_syscalls.md) 进行一个对齐即可。

在这里，我们需要修改 `kernel/include/sysnum.h` 文件，将系统调用号改为标准的 Linux 调用号。

```cpp
#ifndef __SYSNUM_H
#define __SYSNUM_H

// System call numbers


// Filesystem related (文件系统相关)
#define SYS_open        56   // 打开文件
#define SYS_close       57   // 关闭文件
#define SYS_read        63   // 从文件读取数据
#define SYS_write       64   // 向文件写入数据
#define SYS_fstat       80   // 获取文件状态
#define SYS_pipe        59   // 创建管道
#define SYS_dup         23   // 复制文件描述符
#define SYS_mkdir        7   // 创建目录
#define SYS_mkdirat     34   // 在指定目录下创建目录
#define SYS_chdir       49   // 改变当前工作目录
#define SYS_getcwd      17   // 获取当前工作目录
#define SYS_readdir     27   // 读取目录项
#define SYS_rename      26   // 重命名文件或目录
#define SYS_remove      117  // 删除文件或目录
#define SYS_unlinkat    35   // 在指定目录下删除文件
#define SYS_dev         21   // 设备文件操作


// Process management related (进程管理相关)
#define SYS_fork         1   // 创建子进程
#define SYS_clone      220   // 创建子进程/线程（更灵活的fork）
#define SYS_exec       221   // 执行新程序
#define SYS_exit        93   // 终止当前进程
#define SYS_wait         3   // 等待子进程结束
#define SYS_wait4      260   // 等待子进程结束（更通用的版本）
#define SYS_kill         6   // 向进程发送信号
#define SYS_getpid     172   // 获取当前进程ID
#define SYS_getppid    173   // 获取父进程ID
#define SYS_sleep       13   // 使进程休眠（秒）
#define SYS_nanosleep  101   // 使进程休眠（纳秒）
#define SYS_sched_yield 124  // 主动让出CPU
#define SYS_times      153   // 获取进程的执行时间


// Memory management related (内存管理相关)
#define SYS_sbrk        12   // 调整程序数据段（堆）的大小
#define SYS_brk        214   // 直接设置程序数据段的结束地址


// Others (其他)
#define SYS_gettimeofday 169 // 获取当前时间
#define SYS_uptime      14   // 获取系统自启动以来的运行时间
#define SYS_sysinfo     19   // 获取通用系统信息
#define SYS_uname      160   // 获取操作系统名称和版本等信息
#define SYS_shutdown   210   // 关闭系统
#define SYS_trace       18   // 用于调试，追踪系统调用
#define SYS_test_proc   22   // 自定义的测试调用

#endif
```

## shutdown

根据文档所述，我们需要添加 `shutdown` 这一系统调用，用于避免 `init` 程序 `return` 后出现的 `panic: init exiting` 输出。

然而，经过我的实际测试，如果你已经按照前文操作，在不修改任何其他代码、只修改 `initcode` 机器码的情况下，其实完全不会出现这个问题。

询问助教，得到如下答复：上平台的时候需要 `shutdown` 进行退出，否则可能会产生超时等问题。如果上平台能正常退出有分，那你如何实现都可以。

所以，我们在这里还是先按照文档，进行一个添加。文档提供了各个步骤，但是没有详细解释为什么要这么做，我们这里进行一个补充讲解。

要添加 `shutdown` 系统调用，首先我们需要在 `xv6-user/usys.pl` 文件末尾添加：

```perl
entry("shutdown")
```

这会自动生成用户态的系统调用存根代码。

`usys.pl` 是一个 Perl 脚本，用于 **自动生成汇编代码**，为用户程序提供系统调用接口。它生成的是 `usys.S` 文件，如果你上过 ICS 课程做过 Bomblab 就会感觉非常熟悉：

```assembly
# generated by usys.pl - do not edit
#include "kernel/include/sysnum.h"
.global shutdown
shutdown:
 li a7, SYS_shutdown    # 将系统调用号加载到 a7 寄存器
 ecall                  # 触发系统调用陷入内核
 ret                    # 返回用户态
```

但是，并不是我们添加任何一个系统调用都需要在这里进行注册，比如我们将在 Part 1 中完成的剩余几个系统调用就不需要，这是为什么呢？

答案是，由于我们的测评程序是预编译的外部二进制文件，所以他们已经自带了封装，他们甚至已经将这段汇编代码转为了更底层的二进制机器码，也即他们直接在需要的地方封装生成了诸如

```assembly
 li a7, SYS_fork        # 将系统调用号（Linux 标准）加载到 a7 寄存器
 ecall                  # 触发系统调用陷入内核
 ret                    # 返回用户态
```

这样的代码，那当然不需要再生成这种标号了。

所以，需要在 `usys.pl` 注册的函数其实是你在 xv6 自己的用户程序（`xv6-user/` 下的 `.c` 文件，如 `init.c`）想调用的函数，从而对于现在的 `shutdown`，我们需要进行注册。

你可以在完成 Part 1 后，随便在 `init.c` 中添加一个比如说 `times()` 的调用，然后类似的在 `xv6-user/user.h` 进行一个声明，但不进行 `usys.pl` 的注册，这是你就会发现，运行后报编译错误：

```
riscv64-linux-gnu-ld: xv6-user/init.o: in function `main':
/xv6/xv6-user/init.c:63: undefined reference to `times'
```

在 `usys.pl` 完成注册后，我们还需要在 `sysnum.h` 和 `syscall.c` 添加映射：

在 `kernel/include/sysnum.h` 中添加（前文已完成）：

```c
#define SYS_shutdown   210   // 关闭系统
```

在 `kernel/syscall.c` 中添加函数声明和映射：

```c
// 在文件开头添加声明
extern uint64 sys_shutdown(void);

// 在 syscalls 数组中添加映射
static uint64 (*syscalls[])(void) = {
  // ... 其他系统调用 ...
  [SYS_shutdown]    sys_shutdown,
};

// 在 sysnames 数组中添加名称（用于调试）
static char *sysnames[] = {
  // ... 其他系统调用名称 ...
  [SYS_shutdown]    "shutdown",
};
```

然后，我们还需要在内核实现 `sys_shutdown` 函数。

这一步在 `kernel/sysproc.c` 中实现：

```c
#include "include/types.h"
#include "include/sbi.h"

/**
 * @brief 实现 shutdown 系统调用，基于 SBI 调用实现
 * @return 0 成功，-1 失败
 */
uint64
sys_shutdown(void) {
    sbi_shutdown();
    return 0;
}
```

这个实现非常简单，只是调用了 SBI 层提供的关机功能。

这里又会有两个问题：

1. 我们如何决定要在哪个 `sys[?].c` 中实现我们的系统调用？
2. 为什么这里可以直接使用 SBI 的函数？

对于 1，决定在哪个 `sys[?].c` 文件中实现系统调用，主要依据该系统调用的功能类别。

观察可以发现，在 `kernel` 下，有四个文件分别以 `sys[?].c` 命名：

-   `sysproc.c`：用于实现与进程管理相关的系统调用，如：`fork()`, `exec()`, `wait()`, `kill()`, `getpid()`。
-   `sysfile.c`：用于实现与文件和文件系统相关的系统调用，如：`open()`, `read()`, `write()`, `close()`, `stat()`。
-   `sysctl.c`：用于 K210 芯片的系统控制器驱动，**在指定 `platform=qemu` 时根本不会参与编译、链接。**
-   `syscall.c`：用于实现系统调用分发，包含一个系统调用表（一个函数指针数组），根据用户传入的系统调用号，从这个表中查找到对应的实现函数（这些函数位于 `sysproc.c` 或 `sysfile.c` 等文件中）并调用它

从而，我们得知，对于 Part 1，最合理的组织方式是：

-   `sysproc.c`：实现 `shutdown`、`getpid`、`uname`、`times` 系统调用
-   `sysfile.c`：实现 `write`、`getcwd` 系统调用
-   `syscall.c`：仅实现系统调用分发

对于 2，为什么这里可以直接使用 SBI 的函数？

先讲一下什么是 SBI。SBI (Supervisor Binary Interface) 是 RISC-V 架构定义的标准接口，用于：

-   Supervisor 模式（内核，S-mode）向 Machine 模式（固件，M-mode）请求服务
-   通过 ecall 指令触发环境调用（Environment Call）

当程序运行到这行 `sbi_shutdown()` 时，实际上已经从用户态（U-mode）通过 `ecall` 指令陷入到了内核态（S-mode）。如果你点开这个函数看，你就会发现其本质就是经历了一系列的宏魔法，最终调用了 `ecall` 指令，从 S 模式再次陷入到 M 模式（Machine 模式），由底层的 SBI 固件（RustSBI）处理关机请求。

```c
static inline void sbi_shutdown(void)
{
	SBI_CALL_0(SBI_SHUTDOWN);
}
```

最后，我们还需要在 `xv6-user/user.h` 中添加用户态声明以处理链接：

```c
int shutdown(void); // call sbi_shutdown
```

现在，我们终于实现了 `shutdown` 系统调用，并且由于我们已经在 `usys.pl` 中完成了注册，所以可以直接在 xv6 自己的用户程序代码中直接使用。

在 `xv6-user/init.c` 的 `main` 函数末尾添加，我们便完成了这一部分：

```c
int main(void) {
    // ... 测试程序执行逻辑 ...

    shutdown();
    return 0;
}
```

## getcwd

首先贴一下原本仓库的代码：

```c
// get absolute cwd string
uint64
sys_getcwd(void)
{
  uint64 addr;
  if (argaddr(0, &addr) < 0)
    return -1;

  struct dirent *de = myproc()->cwd;
  char path[FAT32_MAX_PATH];
  char *s;
  int len;

  if (de->parent == NULL) {
    s = "/";
  } else {
    s = path + FAT32_MAX_PATH - 1;
    *s = '\0';
    while (de->parent) {
      len = strlen(de->filename);
      s -= len;
      if (s <= path)          // can't reach root "/"
        return -1;
      strncpy(s, de->filename, len);
      *--s = '/';
      de = de->parent;
    }
  }

  // if (copyout(myproc()->pagetable, addr, s, strlen(s) + 1) < 0)
  if (copyout2(addr, s, strlen(s) + 1) < 0)
    return -1;

  return 0;

}
```

根据助教提供的 [官方文档](https://man7.org/linux/man-pages/man3/getcwd.3.html)，我们得到其在 Linux 下的标准用法：

`getcwd(char *buf, size_t size)`：获取当前程序所在的文件夹路径

参数：

-   `buf`：你提供的一块内存（字符数组），用来存放路径结果。
-   `size`：你提供的内存块的大小。

输出：

-   成功：返回一个指向 `buf` 的指针，此时 `buf` 里已经存好了路径字符串。
-   失败：返回 `NULL`。

从而，我们发现，我们需要在原有代码的基础上，添加一个参数 `size`，用于限制路径字符串的长度。

于是，我们得到代码如下：

```c
/**
 * @brief 实现 getcwd 系统调用
 * @note 这段代码的实现是这样的，先构建一个 path 缓冲区，然后从末尾开始写，形成类似 [ ...垃圾数据... | /home/user\0 ] 这样的路径
 * @note 然后，再利用 memmove 将这个路径移动到开始，形成 [ /home/user\0 | ...垃圾数据... ] 这样的路径
 * @note 最后，再利用 copyout2 将这个路径从内核栈中拷贝到用户空间
 * @return 0 成功，-1 失败
 */
uint64
sys_getcwd(void) {
  uint64 addr;
  int size;
  if (argaddr(0, &addr) < 0 || argint(1, &size) < 0)
    return NULL;

  struct dirent* de = myproc()->cwd;
  char path[FAT32_MAX_PATH];

  char* s = path + sizeof(path) - 1;
  *s = '\0';

  if (de->parent == NULL) {
    s--;
    *s = '/';
  }
  else {
    while (de->parent) {
      int len = strlen(de->filename);
      s -= len;
      if (s < path)
        return NULL;
      memmove(s, de->filename, len);

      s--;
      if (s < path)
        return NULL;
      *s = '/';

      de = de->parent;
    }
  }

  memmove(path, s, strlen(s) + 1);

  int path_length = strlen(path) + 1;
  if (path_length > size) {
    return NULL;
  }

  if (copyout2(addr, path, strlen(path) + 1) < 0)
    return NULL;

  return addr;
}
```

注意在这里我们的函数列表是 `void`，请记住，**我们现在是在进行内核编程**，而不是编写一个简单的用户程序，可以直接通过函数传参来获得参数，学过 ICS 的同学都知道，用户态编程我们会使用寄存器或者压栈的方式来传参，但是我们现在是进行系统调用，已经发生了从用户态到内核态的转换，此时，用户空间的参数（`addr` 目标地址和 `size` 地址大小）并不会像普通函数调用那样被压入内核的函数栈。

这是因为，用户进程有自己独立的虚拟地址空间。内核也有自己的地址空间，两者之间是独立的。

所以，在陷入内核时，会进行一个叫做 **上下文保存** 的操作，CPU 会把用户态的寄存器值（包括存有参数的那些寄存器）保存在一个叫做 **陷阱帧 (Trapframe)** 的内核数据结构中。

相对的，当我们从内核态返回用户态时，也会进行一个叫做 **上下文恢复** 的操作，CPU 会把之前保存在陷阱帧（Trapframe）里的、属于用户态的寄存器值恢复，并且恢复到用户态的虚拟地址空间。

从而，我们要想获得函数调用的参数，就必须使用特殊的函数 `argaddr()` 和 `argint()` **从当前进程的陷阱帧中安全地提取出用户传递的参数**。

-   `argaddr(0, &addr)`：获取第 0 个参数，它应该是一个地址（指针），并把它存入内核变量 `addr` 中。
-   `argint(1, &size)`：获取第 1 个参数，它应该是一个整数，并把它存入内核变量 `size` 中。

并且，当我们想要将返回值返回给用户时，必须使用特殊的函数 `copyout2()` 将内核空间的数据拷贝到用户空间。

最后，简单贴一下这里用到的两个函数的签名和说明：

-   `memmove(void *dest, const void *src, size_t n)`：将 `src` 指向的内存块的前 `n` 个字节复制到 `dest` 指向的内存块中。
-   `copyout2(void *dest, const void *src, size_t n)`：将 `src` 指向的内存块（内核空间）的前 `n` 个字节复制到 `dest` 指向的内存块（用户空间）中（其实也就是封装了一下 `memmove` 函数）。

## write / getpid

直接修改系统调用号就行，不需要自己实现，没啥可说的。

## times

根据助教提供的 [官方文档](https://www.man7.org/linux/man-pages/man2/times.2.html)，我们得到其在 Linux 下的标准用法：

`clock_t times(struct tms *buf);`：获取当前进程及其已终结子进程的 CPU 使用时间。

参数：

-   `buf`：你提供的一个指向 `struct tms` 结构体的指针，用来存放结果。

输出：

-   成功：返回一个 `clock_t` 类型的值，表示系统某个时间点以来经过的时钟节拍数。同时，`buf` 指向的结构体被成功填充了时间信息。
-   失败：返回 `(clock_t) -1`。

这个测试点比较逆天的是，它真的只校验返回值合理性，只需要确保 `tms` 结构体内的值的含义符合预期即可。

这意味着你哪怕创建一个全 0 的结构体也无所谓，只需要把结构体按照示例弄出来，字段对就行了。

我们在 `kernel/include/timer.h` 中添加结构体定义：

```c
// 用于 sys_times 系统调用所定义的结构体
// ref: https://man7.org/linux/man-pages/man2/times.2.html
struct tms {
    long tms_utime; // 用户态时间，user time
    long tms_stime; // 系统态时间，system time
    long tms_cutime; // 子进程用户态时间，child user time
    long tms_cstime; // 子进程系统态时间，child system time
};
```

然后结合 `kernel/timer.c` 中定义的全局变量 `ticks` 和自旋锁 `tickslock` 来进行返回即可：

```c
/**
 * @brief 实现 times 系统调用，返回自启动以来经过的操作系统 tick 数。
 * @param addr tms 结构体存到的目标地址
 * @return 0 成功，-1 失败
 */
uint64 sys_times(void) {
  struct tms tms;

  acquire(&tickslock);
  tms.tms_utime = tms.tms_stime = tms.tms_cutime = tms.tms_cstime = ticks;
  release(&tickslock);

  if (get_and_copyout(0, (char *)&tms, sizeof(tms)) < 0) {
    return -1;
  }

  return 0;
}
```

这里用到了一个辅助函数，是对 `argaddr` 和 `copyout2` 的一个简单封装：

```c
/**
 * @brief 从系统调用参数（a0-a5寄存器）中获取一个用户空间的目标地址，然后将内核中的某块数据拷贝到这个目标地址去。
 * @param arg_index 系统调用参数的索引
 * @param dest 目标地址
 * @param size 数据大小
 * @return 0 成功，-1 失败
 */
int get_and_copyout(uint64 arg_index, char* src, uint64 size) {
  uint64 dest_addr;
  if (argaddr(arg_index, &dest_addr) < 0) {
    return -1;
  }
  if (copyout2(dest_addr, src, size) < 0) {
    return -1;
  }
  return 0;
}
```

现在如果进行测试，你会发现输出是：

```
========== START test_times ==========
mytimes success
{tms_utime:0, tms_stime:0, tms_cutime:0, tms_cstime:0}
========== END test_times ==========
```

题外话，也有看到前辈使用 `r_time()` 函数基于硬件 CPU 周期数来写的，即：

```c
// System call to get process times
uint64 sys_times(void) {
    struct tms tm;
    uint tick = r_time();

    tm.tms_utime = tm.tms_stime = tm.tms_cutime = tm.tms_cstime = tick / 1000000;

    if (get_and_copy(0, &tm, sizeof(tm)) < 0)
        return -1;

    return 0;
}
```

如果对其进行测试，你会发现输出是：

```
========== START test_times ==========
mytimes success
{tms_utime:3, tms_stime:3, tms_cutime:3, tms_cstime:3}
========== END test_times ==========
```

虽然都能过点，但是我认为第一种才是对的，因为如果依靠 CPU 周期数来进行计算，显然和接口描述不太一致，而且 1000000 也不知道是哪里弄出来的魔法数字...

## uname

没啥说的，和 `times` 几乎一样，唯一的区别是结构体要求变了，参照 [官方代码](https://github.com/oscomp/testsuits-for-oskernel/blob/02ed4fcb056d114f8e3d8b39106b0f79fc2f9170/riscv-syscalls-testing/user/src/oscomp/uname.c#L6-L13)，我们在 `kernel/sysproc.c` 下创建即可：

```c
/**
 * @brief 实现 uname 系统调用，返回操作系统名称和版本等信息。
 * @param addr 目标地址
 * @return 0 成功，-1 失败
 */
uint64 sys_uname(void) {
  struct uname_info {
    char sysname[65];
    char nodename[65];
    char release[65];
    char version[65];
    char machine[65];
    char domainname[65];
  };

  // 这个数据当前是准备在内核的栈内存中的
  struct uname_info info = {
    "xv6",
    "xv6-node",
    "1.0.0",
    "1.0.0",
    "arthals",
    "localhost"
  };

  if (get_and_copyout(0, (char *)&info, sizeof(info)) < 0) {
    return -1;
  }

  return 0;
}
```

## 测试

至此，我们已经完成了 Part1 的全部内容，只需要进行测试即可：

```c
qwe
make clean
make local
```

得到输出：

```
hart 0 init done
init: starting sh
========== START test_getcwd ==========
getcwd: / successfully!
========== END test_getcwd ==========
init: starting sh
========== START test_write ==========
Hello operating system contest.
========== END test_write ==========
init: starting sh
========== START test_getpid ==========
getpid success.
pid = 4
========== END test_getpid ==========
init: starting sh
========== START test_times ==========
mytimes success
{tms_utime:1, tms_stime:1, tms_cutime:1, tms_cstime:1}
========== END test_times ==========
init: starting sh
========== START test_uname ==========
Uname: xv6 xv6-node 1.0.0 1.0.0 arthals localhost
========== END test_uname ==========
```

就代表我们完成了这部分实验。
