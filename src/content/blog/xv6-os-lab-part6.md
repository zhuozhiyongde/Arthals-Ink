---
title: 更适合北大宝宝体质的 xv6 OS Lab 踩坑记 - Part6
description: '北京大学 2025 年秋季学期操作系统/OS Lab Part 6'
publishDate: 2026-01-11 23:00:00
tags:
  - 操作系统
  - xv6
  - PKU
language: '中文'
---

Part6 的核心是实现两种页面置换算法：

-   FIFO（先进先出）
-   LRU（最近最少使用）

助教给了两个对应的测例：

-   `test_vm_fifo`
-   `test_vm_lru`

我们要做的，是在 mmap 区域实现一个简化版的"虚拟内存"机制：当进程 mmap 区驻留的物理页数量超过限制时，需要按照指定的页面置换算法选择一个"受害者"页面换出到内存缓冲区（swap buffer），等到再次访问时再换入。

页面置换的核心在于为每个 mmap 页面维护状态追踪信息，包括页面当前状态 `state`（未分配、在内存中、已换出）、载入时间 `load_time`、最近访问时间 `last_access` 以及换出时保存数据的缓冲区指针 `swap_data`。当进程访问 mmap 区域触发缺页时，内核首先检查驻留页数是否已达上限，若是则需要执行换出操作。换出时根据 FIFO 或 LRU 策略选择受害者页面：

-   FIFO 选择 `load_time` 最小的页面，即最早载入的；
-   LRU 选择 `last_access` 最小的页面，即最久未访问的。

选定受害者后，将其内容复制到 swap 缓冲区，解除页表映射，释放物理页。换入时检查目标页面是否有 swap 数据，有则直接将缓冲区内容映射回页表，无则说明是首次访问，需要新分配物理页。

值得注意的是，FIFO 算法只需在页面载入时记录 `load_time` 即可，而 LRU 算法需要持续追踪页面的访问时间。由于 xv6 没有硬件 Access Bit 的支持，我们采用软件模拟的方式：用户态程序在每次访问页面后主动调用 `lru_access_notify` 系统调用来更新 `last_access` 时间戳。

这套实现与真实操作系统其实存在几点简化：

1. 真实系统使用磁盘作为 swap 空间，而我们直接使用内存缓冲区，本质上只是在内存中腾挪数据而已
2. 真实系统依赖硬件提供的 Access Bit 和 Dirty Bit 来追踪页面访问情况，而我们需要用户态程序显式通知内核
3. 真实系统的页面置换通常是全局的，会在所有进程间选择受害者，而我们的实现仅针对当前进程的 mmap 区域

## 评测框架

延续 Part4、Part5 的套路，`Makefile` 中新增了一组宏（简化版）：

```makefile
# Part 6: 选择页面置换算法测试类型
ALGO =

ifneq ($(ALGO),)
  CFLAGS += -DALGO
  USER_CFLAGS += -DALGO
endif

ifeq ($(ALGO), FIFO)
  TEST_PROGRAM = test_vm_fifo
  CFLAGS += -DALGO_FIFO
  USER_CFLAGS += -DALGO_FIFO
else ifeq ($(ALGO), LRU)
  TEST_PROGRAM = test_vm_lru
  CFLAGS += -DALGO_LRU
  USER_CFLAGS += -DALGO_LRU
endif
```

含义：

-   `ALGO=FIFO` 时：
    -   编译器会看到 `ALGO` 和 `ALGO_FIFO` 两个宏
    -   `TEST_PROGRAM` 被设置为 `test_vm_fifo`
-   `ALGO=LRU` 时：
    -   编译器会看到 `ALGO` 和 `ALGO_LRU` 两个宏
    -   `TEST_PROGRAM` 被设置为 `test_vm_lru`

配合 Part4 中使用的 `run_test` 命令启动时注入的 `ENABLE_JUDGER` 宏，就可以类似这样跑评测：

```bash
make run_test ALGO=FIFO
make run_test ALGO=LRU
```

`init.c` 和 `judger.c` 的逻辑与 Part4、Part5 类似，只是判断条件换成了：

```c
#elif defined(ENABLE_JUDGER) && defined(ALGO)
```

Judger 判断测例通过的标准是输出里有：

```text
FIFO Test PASSED
LRU Test PASSED
```

同时确保没有 `ERROR` 字样。

## 新增系统调用

要在用户态测试页面置换，需要内核提供三个观测和控制接口。在 `kernel/include/sysnum.h` 里新增：

```c
// kernel/include/sysnum.h
#define SYS_set_max_page_in_mem 600 // 设置最大物理页数
#define SYS_get_swap_count 601      // 获取交换次数
#define SYS_lru_access_notify 602   // 通知LRU页面替换算法
```

### sys_set_max_page_in_mem

设置当前进程 mmap 区域允许驻留的最大物理页数量。一旦超过这个限制，就必须触发页面置换。

```c
// kernel/sysproc.c
/**
 * @brief 设置最大物理页数
 * @param max_page_in_mem 最大物理页数
 * @return 0 成功，-1 失败
 */
uint64 sys_set_max_page_in_mem(void) {
  int max_page_in_mem;
  if (argint(0, &max_page_in_mem) < 0) {
    return -1;
  }

  if (max_page_in_mem < 1) {
    return -1;
  }
  struct proc* p = myproc();
  acquire(&p->lock);
  p->max_page_in_mem = max_page_in_mem;
  release(&p->lock);

  return 0;
}
```

### sys_get_swap_count

获取当前进程累计的 swap-out 次数。测例通过比较换出次数来验证页面置换算法是否正确。

```c
// kernel/sysproc.c
/**
 * @brief 获取交换次数
 * @return 交换次数
 */
uint64 sys_get_swap_count(void) {
  struct proc* p = myproc();
  acquire(&p->lock);
  int count = p->swap_count;
  release(&p->lock);
  return count;
}
```

### sys_lru_access_notify

LRU 算法需要知道页面的访问时间。由于 xv6 没有硬件 Access Bit 的支持，我们让用户态程序在访问页面后主动调用这个系统调用来更新访问时间戳。

```c
// kernel/sysproc.c
/**
 * @brief 通知LRU页面替换算法
 * @param addr 地址
 * @return 0 成功，-1 失败
 */
uint64 sys_lru_access_notify(void) {
  uint64 addr;
  if (argaddr(0, &addr) < 0) {
    return -1;
  }

  struct proc* p = myproc();
  struct vma* v = 0;
  // 查找地址所属的 VMA
  for (int i = 0; i < NVMA; i++) {
    if (p->vmas[i].valid && addr >= p->vmas[i].start && addr < p->vmas[i].end) {
      v = &p->vmas[i];
      break;
    }
  }
  if (v == 0) {
    return -1;
  }

  uint64 page_base = PGROUNDDOWN(addr);
  int page_index = (page_base - v->start) / PGSIZE;
  if (page_index < 0 || page_index >= v->page_count) {
    return -1;
  }
  if (v->pages == 0) {
    return -1;
  }

  // 更新该页的最近访问时间
  struct mmap_vpage* page = &v->pages[page_index];
  page->last_access = ticks;
  return 0;
}
#endif
```

## 数据结构扩展

要实现页面置换，首先需要扩展数据结构来追踪每个 mmap 页面的状态。

### PCB 扩展

在 PCB 中，我们需要记录三个信息：

1. `max_page_in_mem`：mmap 区域允许驻留的最大物理页数量
2. `mmap_pages_in_mem`：当前实际驻留的页数
3. `swap_count`：swap-out 次数统计

```c
// kernel/include/proc.h
struct proc {
  // ...
  #ifdef ALGO
  int max_page_in_mem;    // mmap 区域允许驻留的最大物理页数量
  int mmap_pages_in_mem;  // 当前 mmap 区域驻留物理页数量
  int swap_count;         // swap-out 次数统计
  #endif
  // ...
};
```

### mmap 页面追踪结构

然后，我们需要为每个 mmap 页面维护元数据。页面有三种状态：未分配（`VMA_PAGE_UNUSED`）、在内存中（`VMA_PAGE_INMEM`）、已换出到 swap 缓冲（`VMA_PAGE_SWAPPED`）。

对于在内存中的页面，需要记录载入时间供 FIFO 使用、记录最近访问时间供 LRU 使用；对于已换出的页面，需要保存指向 swap 缓冲区的指针：

```c
// kernel/include/vm.h
#ifdef ALGO
#define VMA_MAX_TRACKED_PAGES 128

// 页面状态枚举
enum mmap_page_state {
  VMA_PAGE_UNUSED = 0,  // 未分配
  VMA_PAGE_INMEM,       // 在内存中
  VMA_PAGE_SWAPPED,     // 已换出到 swap 缓冲
};

// mmap 页面元数据
struct mmap_vpage {
  int state;            // 页面状态
  uint64 load_time;     // 页面载入时间（FIFO 用）
  uint64 last_access;   // 最近访问时间（LRU 用）
  char *swap_data;      // swap 缓冲区指针
};
#endif
```

### VMA 结构扩展

最后，我们还需要在 `struct vma` 中增加页面追踪数组的指针。每个 VMA 创建时会分配一个 `mmap_vpage` 数组，用于跟踪该 VMA 覆盖的所有页面：

```c
// kernel/include/vm.h
struct vma {
    // 原有字段

    #ifdef ALGO
    int page_count;              // VMA 覆盖的页数量
    struct mmap_vpage *pages;    // 指向跟踪 mmap 页信息的数组
    #endif
};
```

## mmap 系统调用改造

原本 Part2 实现的 `sys_mmap` 只需要记录 VMA 元数据，并不真正分配物理页（懒分配）。现在还需要额外分配页面追踪数组。

改造的关键点是：在设置好 VMA 的基本信息后，用 `kalloc()` 分配一页内存作为 `pages` 数组（一页 4KB 可以容纳 `4096 / sizeof(struct mmap_vpage)` 个页面元数据，足够 128 页使用），然后初始化所有页面状态为 `VMA_PAGE_UNUSED`：

```c
// kernel/sysproc.c
uint64 sys_mmap(void) {
  // 参数解析

  len = PGROUNDUP(len);

  #ifdef ALGO
  int page_cnt = len / PGSIZE;
  // 限制单个 VMA 的最大页数
  if (page_cnt > VMA_MAX_TRACKED_PAGES) {
    return -1;
  }
  #endif

  // 初始化字段、映射

  #ifdef ALGO
  v->pages = 0;
  #endif

  // 查找可用 VMA 槽位、设置 VMA 元数据

  #ifdef ALGO
  v->page_count = page_cnt;
  v->pages = (struct mmap_vpage*)kalloc();
  if (v->pages == 0) {
    if (v->vm_file) {
      fileclose(v->vm_file);
      v->vm_file = NULL;
    }
    return -1;
  }
  memset(v->pages, 0, PGSIZE);
  // 初始化所有页面状态为 UNUSED
  for (int i = 0; i < page_cnt && i < VMA_MAX_TRACKED_PAGES; i++) {
    v->pages[i].state = VMA_PAGE_UNUSED;
    v->pages[i].swap_data = 0;
    v->pages[i].load_time = 0;
    v->pages[i].last_access = 0;
  }
  #endif

  v->valid = 1;
  return va;
}
```

## 页面置换算法核心实现

页面置换的核心逻辑都在 `kernel/trap.c` 里实现，因为它要和缺页处理紧密配合。

### 选择受害者页面

我们首先需要一个选择受害者的函数。FIFO 和 LRU 的区别仅在于选择受害者的依据不同：

-   FIFO：选择 `load_time` 最小的页面（最早载入的）
-   LRU：选择 `last_access` 最小的页面（最久未访问的）

我们用一个统一的 `select_victim_page` 函数来实现，遍历所有 VMA 的所有驻留页，找出"度量值"最小的那个，这里使用条件编译区分：

```c
// kernel/trap.c
struct swap_victim {
  struct vma* v;
  struct mmap_vpage* page;
  int index;
};

/**
 * @brief 从进程的 mmap 区域中挑选可换出的页面。
 * @param p 进程指针
 * @param victim 输出受害者页面信息
 * @return 0 表示找到受害者，-1 表示没有可换页面
 */
static int select_victim_page(struct proc *p, struct swap_victim *victim)
{
  struct vma* chosen_v = 0;
  struct mmap_vpage* chosen_page = 0;
  int chosen_index = -1;
  uint64 chosen_metric = 0;
  uint64 chosen_secondary = 0;

  // 遍历所有 VMA
  for (int i = 0; i < NVMA; i++) {
    struct vma* v = &p->vmas[i];
    if (!v->valid || v->pages == 0) {
      continue;
    }
    int total_pages = v->page_count;
    if (total_pages > VMA_MAX_TRACKED_PAGES) {
      total_pages = VMA_MAX_TRACKED_PAGES;
    }

    // 遍历 VMA 内所有驻留内存的页面
    for (int idx = 0; idx < total_pages; idx++) {
      struct mmap_vpage* page = &v->pages[idx];
      if (page->state != VMA_PAGE_INMEM) {
        continue;
      }

      uint64 metric;
      uint64 secondary;

      #ifdef ALGO_FIFO
      // FIFO：主要依据载入时间，次要依据访问时间
      metric = page->load_time;
      secondary = page->last_access;
      #else
      // LRU：主要依据访问时间，次要依据载入时间
      metric = page->last_access;
      secondary = page->load_time;
      #endif

      // 选择 metric 最小的页面作为受害者
      if (chosen_page == 0 ||
          metric < chosen_metric ||
          (metric == chosen_metric && secondary < chosen_secondary)) {
        chosen_page = page;
        chosen_v = v;
        chosen_index = idx;
        chosen_metric = metric;
        chosen_secondary = secondary;
      }
    }
  }

  if (chosen_page == 0) {
    return -1;
  }

  victim->v = chosen_v;
  victim->page = chosen_page;
  victim->index = chosen_index;
  return 0;
}
```

### 换出页面

选定受害者后，`swap_out_one_page` 负责执行换出操作。它先用 `kalloc()` 分配一页作为 swap 缓冲区，把受害者页面的内容 `memmove` 过去，然后解除用户页表和内核页表的映射（`vmunmap`），最后更新页面元数据和统计信息：

```c
/**
 * @brief 将一个 mmap 页面换出到 swap 缓冲。
 * @param p 进程指针
 * @return 0 成功，-1 失败
 */
static int swap_out_one_page(struct proc *p)
{
  struct swap_victim victim;
  if (select_victim_page(p, &victim) < 0) {
    return -1;
  }

  uint64 va = victim.v->start + (uint64)victim.index * PGSIZE;
  pte_t* pte = walk(p->pagetable, va, 0);
  if (pte == 0 || (*pte & PTE_V) == 0) {
    return -1;
  }

  uint64 pa = PTE2PA(*pte);

  // 分配 swap 缓冲区并复制页面内容
  char* buf = kalloc();
  if (buf == 0) {
    return -1;
  }
  memmove(buf, (char*)pa, PGSIZE);

  // 解除用户页表和内核页表的映射
  vmunmap(p->pagetable, va, 1, 1);  // 释放物理页
  vmunmap(p->kpagetable, va, 1, 0); // 不释放物理页（已被上一行释放）

  // 更新页面元数据
  victim.page->swap_data = buf;
  victim.page->state = VMA_PAGE_SWAPPED;
  victim.page->load_time = 0;
  victim.page->last_access = ticks;

  // 更新统计信息
  if (p->mmap_pages_in_mem > 0) {
    p->mmap_pages_in_mem--;
  }
  p->swap_count++;

  return 0;
}
```

### 确保页面预算

有了换出函数，还需要一个"预算检查"函数 `ensure_mmap_budget`，在分配新页面之前调用，确保驻留页数不超过限制。如果超了就持续换出，直到有空间为止：

```c
/**
 * @brief 确保进程 mmap 区域的驻留页数不超过限制，必要时触发换出。
 * @param p 进程指针
 * @return 0 成功，-1 失败
 */
static int ensure_mmap_budget(struct proc *p)
{
  if (p->max_page_in_mem <= 0) {
    return 0;
  }
  // 如果当前驻留页数 >= 限制，持续换出直到有空间
  while (p->mmap_pages_in_mem >= p->max_page_in_mem) {
    if (swap_out_one_page(p) < 0) {
      return -1;
    }
  }
  return 0;
}
```

## VMA 缺页处理改造

原本 Part2 的 `vma_handler` 只处理懒分配缺页，逻辑很简单：分配一页，映射到页表，如果是文件映射就从文件读取内容。现在需要加入页面置换逻辑，变成一个完整的换入/换出流程。

新的处理函数 `handle_vma_fault_with_algo` 首先计算缺页地址对应的页面索引，然后检查页面状态：如果已经在内存中就直接返回（可能是权限问题触发的 fault，不归我们管）；如果是首次访问（`VMA_PAGE_UNUSED`）或需要换入（`VMA_PAGE_SWAPPED`），就需要分配物理页。

分配之前先调用 `ensure_mmap_budget` 确保有空间。如果是换入，直接使用 `swap_data` 指向的缓冲区作为物理页（省去一次复制）；如果是首次访问，就 `kalloc` 新页并按需从文件读取内容。最后映射到用户页表和内核页表，更新页面元数据：

```c
// kernel/trap.c
/**
 * @brief 处理启用页面置换算法时的 VMA 缺页或换入请求。
 * @param p 触发缺页的进程
 * @param v 命中的 VMA
 * @param stval 访问的地址
 * @return 0 成功，-1 参数错误，-2 表示需要杀死进程
 */
static int handle_vma_fault_with_algo(struct proc *p, struct vma *v, uint64 stval)
{
  uint64 va_page_start = PGROUNDDOWN(stval);
  int page_index = (va_page_start - v->start) / PGSIZE;

  // 各种边界检查

  struct mmap_vpage* page = &v->pages[page_index];

  // 如果页面已在内存中，直接返回
  if (page->state == VMA_PAGE_INMEM) {
    return 0;
  }

  // 确保有空间容纳新页面
  if (ensure_mmap_budget(p) < 0) {
    printf("vma_handler(): no victim for swap\n");
    return -2;
  }

  char* mem = 0;
  int from_swap = (page->state == VMA_PAGE_SWAPPED);

  if (from_swap) {
    // 从 swap 缓冲区恢复，直接使用已有的缓冲区
    if (page->swap_data == 0) {
      return -1;
    }
    mem = page->swap_data;
  } else {
    // 首次访问，分配新页面
    mem = kalloc();
    if (mem == 0) {
      printf("vma_handler(): out of memory\n");
      return -2;
    }
    memset(mem, 0, PGSIZE);
    // 如果是文件映射，从文件读取内容
    if (v->vm_file) {
      elock(v->vm_file->ep);
      uint64 file_offset = v->offset + (va_page_start - v->start);
      eread(v->vm_file->ep, 0, (uint64)mem, file_offset, PGSIZE);
      eunlock(v->vm_file->ep);
    }
  }

  // 设置页表项权限
  int pte_flags = PTE_U;
  if (v->prot & PROT_READ)  pte_flags |= PTE_R;
  if (v->prot & PROT_WRITE) pte_flags |= PTE_W;
  if (v->prot & PROT_EXEC)  pte_flags |= PTE_X;

  // 映射到用户页表
  if (mappages(p->pagetable, va_page_start, PGSIZE, (uint64)mem, pte_flags) != 0) {
    if (!from_swap) {
      kfree(mem);
    }
    return -2;
  }
  // 映射到内核页表
  int kpte_flags = pte_flags & ~PTE_U;
  if (mappages(p->kpagetable, va_page_start, PGSIZE, (uint64)mem, kpte_flags) != 0) {
    vmunmap(p->pagetable, va_page_start, 1, 0);
    if (!from_swap) {
      kfree(mem);
    }
    return -2;
  }

  // 更新页面元数据
  if (from_swap) {
    page->swap_data = 0;  // 缓冲区现在被页表使用，不再是 swap 数据
  }
  page->state = VMA_PAGE_INMEM;
  uint64 ts = ticks;
  page->load_time = ts;
  page->last_access = ts;
  p->mmap_pages_in_mem++;

  return 0;
}
```

然后在原来的 `vma_handler` 中，用条件编译切换到新逻辑：

```c
static int vma_handler(struct proc *p, uint64 scause, uint64 stval)
{
  // 查找 VMA

  #ifdef ALGO
  int algo_ret = handle_vma_fault_with_algo(p, v, stval);
  if (algo_ret == -1) {
    return -1;
  }
  if (algo_ret < 0) {
    p->killed = 1;
  }
  return 0;
  #else
  // 原有的懒分配逻辑
  #endif
}
```

## fork/clone 时的 VMA 复制

原本 `fork` 只是简单地复制 VMA 元数据和文件引用计数，现在还需要额外处理页面追踪信息。这里有个设计决策：子进程的 mmap 页面应该处于什么状态？

我们选择把父进程所有的 mmap 页面（无论在内存中还是在 swap 中）都复制到子进程的 swap 缓冲区。这样做的好处是：子进程首次访问时会触发缺页，走正常的换入流程，不需要额外处理共享页面的问题。代价是 fork 时需要为每个已分配的页面分配一个 swap 缓冲区并复制内容。

```c
// kernel/proc.c
/**
 * @brief 重置 mmap 跟踪页的状态，清除时间戳和 swap 数据。
 * @param page 待重置的页面元数据指针
 */
static void reset_vma_page(struct mmap_vpage *page) {
  page->state = VMA_PAGE_UNUSED;
  page->load_time = 0;
  page->last_access = 0;
  page->swap_data = 0;
}

/**
 * @brief 回收克隆 VMA 过程中分配的 swap 缓冲并重置元数据。
 * @param v 目标 VMA
 * @param upto 已处理的页数量
 */
static void cleanup_cloned_pages(struct vma *v, int upto) {
  if (v->pages == 0) {
    return;
  }
  for (int i = 0; i < upto; i++) {
    if (v->pages[i].swap_data) {
      kfree(v->pages[i].swap_data);
      v->pages[i].swap_data = 0;
    }
    reset_vma_page(&v->pages[i]);
  }
}

/**
 * @brief 克隆源 VMA 的页追踪信息，包括驻留页和 swap 中的数据。
 * @param src_proc 源进程指针
 * @param dst 目标 VMA
 * @param src 源 VMA
 * @return 0 成功，-1 失败（kalloc 失败）
 */
static int clone_vma_pages(struct proc *src_proc, struct vma* dst, struct vma* src) {
  if (src->pages == 0) {
    dst->page_count = 0;
    return 0;
  }

  int total = src->page_count;
  if (total > VMA_MAX_TRACKED_PAGES) {
    total = VMA_MAX_TRACKED_PAGES;
  }

  // 为子进程分配页面追踪数组
  dst->pages = (struct mmap_vpage*)kalloc();
  if (dst->pages == 0) {
    return -1;
  }

  // 初始化所有页面状态
  for (int i = 0; i < VMA_MAX_TRACKED_PAGES; i++) {
    dst->pages[i].state = VMA_PAGE_UNUSED;
    dst->pages[i].load_time = 0;
    dst->pages[i].last_access = 0;
    dst->pages[i].swap_data = 0;
  }

  // 复制每个页面的内容
  for (int i = 0; i < total; i++) {
    struct mmap_vpage *src_page = &src->pages[i];
    struct mmap_vpage *dst_page = &dst->pages[i];

    if (src_page->state == VMA_PAGE_SWAPPED && src_page->swap_data) {
      // 复制 swap 缓冲区
      char* buf = kalloc();
      if (buf == 0) {
        // 清理已分配的资源
        cleanup_cloned_pages(dst, i);
        return -1;
      }
      memmove(buf, src_page->swap_data, PGSIZE);
      dst_page->swap_data = buf;
      dst_page->state = VMA_PAGE_SWAPPED;
    }
    else if (src_page->state == VMA_PAGE_INMEM) {
      // 将父进程内存中的页面复制到子进程的 swap 缓冲区
      // 这样子进程首次访问时会触发缺页，重新建立映射
      uint64 va = src->start + (uint64)i * PGSIZE;
      uint64 pa = walkaddr(src_proc->pagetable, va);
      if (pa == 0) {
        continue;
      }
      char* buf = kalloc();
      if (buf == 0) {
        cleanup_cloned_pages(dst, i);
        return -1;
      }
      memmove(buf, (char*)pa, PGSIZE);
      dst_page->swap_data = buf;
      dst_page->state = VMA_PAGE_SWAPPED;
    }
  }
  dst->page_count = total;
  return 0;
}

/**
 * @brief 拷贝源进程的 VMA 元数据到目标进程，并复制 mmap 追踪信息。
 * @param dst 目标进程
 * @param src 源进程
 * @return 0 成功，-1 失败
 */
static int copy_process_vmas(struct proc* dst, struct proc* src) {
  for (int i = 0; i < NVMA; i++) {
    if (!src->vmas[i].valid) {
      dst->vmas[i].valid = 0;
      continue;
    }
    dst->vmas[i] = src->vmas[i];
    if (dst->vmas[i].vm_file) {
      dst->vmas[i].vm_file = filedup(dst->vmas[i].vm_file);
    }

    #ifdef ALGO
    dst->vmas[i].pages = 0;
    if (clone_vma_pages(src, &dst->vmas[i], &src->vmas[i]) < 0) {
      return -1;
    }
    #endif
  }
  return 0;
}
```

然后在 `fork()` 和 `clone()` 中调用 `copy_process_vmas`，替换原有的简单循环：

```c
int fork(void)
{
  // 复制进程状态

  // 复制 VMA（替换原有的简单循环）
  if (copy_process_vmas(np, p) < 0) {
    vma_free(np);
    freeproc(np);
    release(&np->lock);
    return -1;
  }

  // 复制文件描述符等
}
```

## 清理逻辑

解除映射（`munmap`）或进程退出时，需要释放页面追踪数组和所有 swap 缓冲区。`vma_reset_pages` 遍历所有页面，释放 swap 缓冲区，更新驻留页计数，最后释放追踪数组本身：

```c
// kernel/vm.c
#ifdef ALGO
void vma_reset_pages(struct proc* p, struct vma* v) {
  if (p == 0 || v == 0 || v->pages == 0) {
    v->page_count = 0;
    return;
  }

  int page_cnt = v->page_count;
  if (page_cnt > VMA_MAX_TRACKED_PAGES) {
    page_cnt = VMA_MAX_TRACKED_PAGES;
  }

  for (int i = 0; i < page_cnt; i++) {
    struct mmap_vpage* page = &v->pages[i];
    // 更新驻留页计数
    if (page->state == VMA_PAGE_INMEM && p->mmap_pages_in_mem > 0) {
      p->mmap_pages_in_mem--;
    }
    // 释放 swap 缓冲区
    if (page->state == VMA_PAGE_SWAPPED && page->swap_data) {
      kfree(page->swap_data);
    }
    page->state = VMA_PAGE_UNUSED;
    page->load_time = 0;
    page->last_access = 0;
    page->swap_data = 0;
  }

  v->page_count = 0;
  kfree((char*)v->pages);
  v->pages = 0;
}
#endif
```

在 `sys_munmap` 和 `vma_free` 中调用：

```c
// sys_munmap 中
#ifdef ALGO
vma_reset_pages(p, v);
#endif
v->valid = 0;

// vma_free 中
#ifdef ALGO
vma_reset_pages(p, v);
#endif
v->valid = 0;
```

## PCB 初始化与释放

在 `allocproc` 和 `freeproc` 中处理新增字段：

```c
// kernel/proc.c
static struct proc* allocproc(void)
{
  // ...
  #ifdef ALGO
  p->max_page_in_mem = VMA_MAX_TRACKED_PAGES;  // 默认不限制
  p->mmap_pages_in_mem = 0;
  p->swap_count = 0;
  #endif
  // ...
}

static void freeproc(struct proc *p)
{
  // ...
  #ifdef ALGO
  p->max_page_in_mem = VMA_MAX_TRACKED_PAGES;
  p->mmap_pages_in_mem = 0;
  p->swap_count = 0;
  #endif
}
```

在 `fork` 和 `clone` 中初始化子进程的字段：

```c
#ifdef ALGO
np->max_page_in_mem = p->max_page_in_mem;  // 继承父进程的限制
np->mmap_pages_in_mem = 0;                  // 子进程初始没有驻留页
np->swap_count = 0;                         // 子进程重新计数
#endif
```

## 测试

### FIFO

```bash
make run_test ALGO=FIFO
```

得到输出：

```
Starting test program: test_vm_fifo
Target type: FIFO

init: starting test_vm_fifo
testing output size:491, contents:
Testing FIFO Page Replacement Algorithm
Max pages in memory set to: 4
Initial swap count: 0
Memory mapped at address: 0x5FFF8000
Starting FIFO access pattern...
Accessed page 0
Accessed page 1
Accessed page 2
Accessed page 3
Accessed page 0
Accessed page 1
Accessed page 4
Accessed page 5
Accessed page 0
Accessed page 1
Accessed page 6
Accessed page 7
Accessed page 0
Accessed page 1
Accessed page 2
Accessed page 3
Total swaps: 8 (expected: 8)
Check consistency succeeded
FIFO Test PASSED
init: process pid=2 exited
init: test execution completed, starting judger
Judger: Starting evaluation
Test1 output:
Testing FIFO Page Replacement Algorithm
Max pages in memory set to: 4
Initial swap count: 0
Memory mapped at address: 0x5FFF8000
Starting FIFO access pattern...
Accessed page 0
Accessed page 1
Accessed page 2
Accessed page 3
Accessed page 0
Accessed page 1
Accessed page 4
Accessed page 5
Accessed page 0
Accessed page 1
Accessed page 6
Accessed page 7
Accessed page 0
Accessed page 1
Accessed page 2
Accessed page 3
Total swaps: 8 (expected: 8)
Check consistency succeeded
FIFO Test PASSED

TEST 1 PASSED
SCORE: 1
init: judger completed
```

### LRU

```bash
make run_test ALGO=LRU
```

得到输出：

```
Starting test program: test_vm_lru
Target type: LRU

init: starting test_vm_lru
testing output size:488, contents:
Testing LRU Page Replacement Algorithm
Max pages in memory set to: 4
Initial swap count: 0
Memory mapped at address: 0x5FFF8000
Starting LRU access pattern...
Accessed page 0
Accessed page 1
Accessed page 2
Accessed page 3
Accessed page 0
Accessed page 1
Accessed page 4
Accessed page 5
Accessed page 0
Accessed page 1
Accessed page 6
Accessed page 7
Accessed page 0
Accessed page 1
Accessed page 2
Accessed page 3
Total swaps: 6 (expected: 6)
Check consistency succeeded
LRU Test PASSED
init: process pid=2 exited
init: test execution completed, starting judger
Judger: Starting evaluation
Test2 output:
Testing LRU Page Replacement Algorithm
Max pages in memory set to: 4
Initial swap count: 0
Memory mapped at address: 0x5FFF8000
Starting LRU access pattern...
Accessed page 0
Accessed page 1
Accessed page 2
Accessed page 3
Accessed page 0
Accessed page 1
Accessed page 4
Accessed page 5
Accessed page 0
Accessed page 1
Accessed page 6
Accessed page 7
Accessed page 0
Accessed page 1
Accessed page 2
Accessed page 3
Total swaps: 6 (expected: 6)
Check consistency succeeded
LRU Test PASSED

TEST 2 PASSED
SCORE: 1
init: judger completed
```