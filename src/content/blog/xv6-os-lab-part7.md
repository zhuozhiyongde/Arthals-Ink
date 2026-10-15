---
title: 更适合北大宝宝体质的 xv6 OS Lab 踩坑记 - Part7
description: '北京大学 2025 年秋季学期操作系统/OS Lab Part 7'
publishDate: 2025-10-13 01:15:36
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

Part7 的测试样例涉及了多个文件系统相关的系统调用，它们大多是已有功能的 “增强版”，提供了更灵活的路径处理方式。同时，也引入了对挂载（mount）机制的初步支持（？）。

本次需要额外实现的系统调用包括：

-   `dup3`
-   `getdents`
-   `mkdirat`
-   `unlinkat`
-   `mount` / `umount`
-   `fstat`

还有一些可以直接修改系统调用号即可实现的系统调用，这里不再做展开了。

## dup / dup3

`dup`：创建指向同一打开文件对象的副本，文件偏移量和状态共享。

```c
int dup(int oldfd);
```

参数：

-   `oldfd`：要复制的已打开文件描述符。

返回值：

-   成功：返回新的（最低可用）文件描述符。
-   失败：返回 -1，并设置 `errno`。

测试仓库说明和标准文档出入不大。

```c
#define SYS_dup 23
```

xv6-k210 默认已经实现 `dup`。

`dup3` 是 `dup` 系统调用的一个扩展版本。`dup` 的作用是复制一个现有的文件描述符，返回一个新的、未被使用的文件描述符，这两个描述符指向同一个打开的文件实例（`struct file`）。而 `dup3` 则更进一步，它允许调用者 **指定** 新的文件描述符的值。

```c
int dup3(int oldfd, int newfd, int flags);
```

参数：

-   `oldfd`：源文件描述符。
-   `newfd`：目标文件描述符（若已打开则会被重用为副本；若等于 `oldfd` 则失败）。
-   `flags`：目前仅支持 `O_CLOEXEC`；其他值会失败。

返回值：

-   成功：返回 `newfd`。
-   失败：返回 -1，并设置 `errno`。

说明：若 `oldfd == newfd` 则返回 `EINVAL`。

测试仓库说明和标准文档出入不大。

```c
#define SYS_dup3 24
```

`dup3` 在需要进行输入输出重定向时非常有用。例如，我们想把标准输出（`stdout`，通常是 `fd=1`）重定向到一个文件，可以先用 `openat` 打开文件得到 `file_fd`，然后调用 `dup3(file_fd, 1)`，这样之后所有写入到 `fd=1` 的数据都会被写入到文件中。

实现 `sys_dup3` 的逻辑很清晰：

1.  从用户态获取旧的文件描述符 `old_fd` 和新的文件描述符 `new_fd`。
2.  进行参数检查：`old_fd` 必须是一个有效的文件描述符，`new_fd` 必须在合法范围内（0 到 `NOFILE`），且 `old_fd` 和 `new_fd` 不能相同。
3.  获取当前进程的 PCB (`struct proc`)。
4.  **核心逻辑**：检查 `p->ofile[new_fd]` 是否已经被占用。如果 `new_fd` 已经指向了一个打开的文件，我们需要先调用 `fileclose()` 将其关闭，释放资源。
5.  调用 `filedup()` 复制 `old_fd` 指向的 `struct file` 实例。
6.  将 `p->ofile[new_fd]` 指向这个新复制的 `struct file` 实例。
7.  返回 `new_fd`。

```c
/**
 * @brief 实现 dup3 系统调用，复制文件描述符
 * @param old_fd 被复制的文件描述符
 * @param new_fd 指定的新的文件描述符
 * @return 成功则返回新的文件描述符 new_fd，失败返回 -1
 * @note dup3 与 dup 的主要区别在于可以指定 new_fd。如果 new_fd 已经被占用，会先关闭它。
 */
uint64
sys_dup3(void)
{
  struct file* f;
  int old_fd, new_fd;

  // 1. 获取参数
  if (argfd(0, &old_fd, &f) < 0 || argint(1, &new_fd) < 0) {
    return -1;
  }

  // 2. 参数检查
  if (new_fd < 0 || new_fd >= NOFILE) {
    return -1;
  }
  if (new_fd == old_fd) {
    return -1;
  }

  struct proc* p = myproc();

  // 3. 如果 new_fd 已被占用，先关闭
  if (p->ofile[new_fd] != NULL) {
    fileclose(p->ofile[new_fd]);
  }

  // 4. 复制文件实例并赋给 new_fd
  p->ofile[new_fd] = filedup(f);

  return new_fd;
}
```

注意，这里还需要修改一下 `param.h` 中的 `NOFILE`，将每个进程能打开的最大文件数从 16 增加一些，这是因为测试代码使用了一个 110 的大 fd。

```c
// kernel/include/param.h
#define NOFILE      256  // open files per process
```

## getdents

### FAT32 目录的物理存储

一般来讲，我们很容易直观上认为文件系统是像 “树” 一样组织的，这在逻辑上没错。

但在物理磁盘上，**一个目录的内容其实是线性存储的**。如果你还记得 ICS 的知识，就应该知道磁盘是由很多扇区组成的，如果你忘了，可以参考 [这里](https://slide.huh.moe/06/10) 回顾一下。

那么，操作系统是如何完成这个从物理的线性存储到逻辑的树形存储的转换的呢？答案就是目录项。

假设让你来设计 **实际物理存放** 文件名的数据结构，你会怎么设计？是直接使用一个类似如下的结构体吗？

```c
#define FAT32_MAX_PATH      260
struct dirent {
    char  filename[FAT32_MAX_FILENAME + 1];
}
```

可以是可以，然而这样太差了，一般的目录名根本用不了这么多，这么存绝大多数短名文件会浪费空间。

所以，FAT32 的目录项采用了变长存储（`fat32.c`）：

```c
typedef struct short_name_entry {
    char        name[CHAR_SHORT_NAME];
    uint8       attr;
    uint8       _nt_res;
    uint8       _crt_time_tenth;
    uint16      _crt_time;
    uint16      _crt_date;
    uint16      _lst_acce_date;
    uint16      fst_clus_hi;
    uint16      _lst_wrt_time;
    uint16      _lst_wrt_date;
    uint16      fst_clus_lo;
    uint32      file_size;
} __attribute__((packed, aligned(4))) short_name_entry_t;

typedef struct long_name_entry {
    uint8       order;
    wchar       name1[5];
    uint8       attr;
    uint8       _type;
    uint8       checksum;
    wchar       name2[6];
    uint16      _fst_clus_lo;
    wchar       name3[2];
} __attribute__((packed, aligned(4))) long_name_entry_t;

union dentry {
    short_name_entry_t  sne;
    long_name_entry_t   lne;
};
```

一个 32 字节的目录项，要么是 `SNE`，要么是 `LNE`，一个完整的目录项都是由 1 个 `SNE` 和若干个（可以是 0 个） `LNE` 组成的，顺序是 `LNE` 在前，`SNE` 在后。

上面代码中，以 `_` 开头的字段实际上未使用，你大致阅读就可以发现，目录项有两种类型：

1.  **短文件名目录项（Short Name Entry, SNE）**：这是经典 8.3 格式（`CHAR_SHORT_NAME = 11`，8 个字符主文件名 + 3 个字符扩展名，即要求主文件名不超过 8 个字符，扩展名不超过 3 个字符）的目录项。它包含了文件的所有元数据。
2.  **长文件名目录项（Long Name Entry, LNE）**：一个长文件名会被切分成多个 13（上述代码中的 `name1`、`name2`、`name3`） 字符的片段，每个片段存放在一个 LNE 中。多个 LNE 会紧挨着放在它们对应的 SNE 前面。LNE 的 `attr` 字段有一个特殊的 `ATTR_LONG_NAME` 标记，然后 `order` 字段表示 LNE 的顺序。

什么是 8.3 格式？如果一个文件名很短，一个 `SNE` 就足够表示的话（直接存在 `SNE` 的 `name` 字段里），那么就不会使用 `LNE`；反之，这个文件名会超出 `CHAR_SHORT_NAME` 的长度，那么就会使用 `LNE`，而此时 `SNE` 的 `name` 字段会用于校验 LNE 的完整性（通过截取片段实现，比如 `Annual Financial Report 2023.docx` 会被处理成 `ANNUAL~1.DOC`）。

比如，一个名为 `KERNEL.C` 的文件，就满足 `SNE` 的 8.3 格式，那么在 `SNE` 的 `name` 字段中会这样存储（以字符数组表示）：

```
['K', 'E', 'R', 'N', 'E', 'L', ' ', ' ', 'C', ' ', ' ']
```

-   `KERNEL` 占 6 字节，后面补 2 个空格。
-   `C` 占 1 字节，后面补 2 个空格。
-   不含 `.`，隐式分割。

现在，我们已经大概理解了目录项的名字的存储方式，那么，给定一个目录项，我们如何获取他的数据呢？

回顾结构体，你会发现 `SNE` 中除了 `name` 字段，其他字段都是文件的元数据，比如文件大小、属性这些一眼就知道是啥的，除此之外，还有两个字段 `fst_clus_hi` 和 `fst_clus_lo`，他们是什么呢？

```c
uint16      fst_clus_hi;
uint16      fst_clus_lo;
```

他们实际上是文件的起始簇号的高 16 位和低 16 位。

**簇（Cluster）** 是 FAT32 管理磁盘空间的最小单位，它由一个或多个连续的 **扇区（Sector）** 组成（在我们的 xv6 中，1 簇 = 8 扇区 = 4096 字节）。一个文件的数据就是存储在一个或多个簇里，这些簇通过 FAT 表（File Allocation Table）形成一个链表，不要求在磁盘上连续。上述两个字段拼在一起就是文件的起始簇号，也就是链表的头结点。

那么，现在我们也知道如何从一个文件的目录项中获取他的数据了：

1. 根据 `SNE` 的 `fst_clus_hi` 和 `fst_clus_lo` 字段，拼出文件的起始簇号。
2. 根据文件的起始簇号，通过 FAT 表找到文件的簇链的头结点。
3. 顺着链表读取每个簇的数据，直到读完整个文件。

但是，我们还有一个问题没有解决：如何获取一个目录的子成员（子目录项）呢？

**这里我们要指出，目录实际上也是一种文件，它的 “内容” 就是一串 32 字节的目录项（含 `LNE` 与 `SNE`）。**

所以，获取一个目录的子成员（子目录项）实际上和读取一个文件差不了太多，都是先确定这个父目录的数据簇链，然后连续读取多个簇的数据，再把数据拼起来，得到完整数据后，按照若干个 `LNE` 和一个 `SNE` 的顺序，逐个解析，从而得到每个子目录项的元数据。

### enext

`getdents` 的实现严重依赖于一个辅助函数 `enext`（entry next，定义在 `fat32.c`）。这个函数的作用就是：给定一个目录 `dp` 和一个起始偏移量 `off`，找到并返回下一个 **有效** 的目录项。

`enext` 的具体流程不需要关心，你就知道它的输入输出如下即可：

```c
int enext(struct dirent *dp, struct dirent *ep, uint off, int *count);
```

参数：

-   `dp`：目录 `dirent` 指针。
-   `ep`：输出参数，用于存储找到的目录项。
-   `off`：起始偏移量。
-   `count`：输出参数，用于存储找到的目录项的数量。

返回值：

-   成功：返回 0，并将找到的目录项信息填充到 `ep` 中。
-   失败：返回 -1。

### sys_getdents 的实现

功能：获取目录的条目。

```c
int getdents(unsigned int fd, struct linux_dirent *dirp, unsigned int count);
```

参数：

- `fd`：打开的目录文件描述符。
- `dirp`：用户缓冲区，用于接收目录项。
- `count`：缓冲区大小（字节）。

返回值：

- 成功：返回读入的字节数；返回 0 表示目录结束。
- 失败：返回 -1，并设置 `errno`。

测试仓库说明和标准文档出入不大。

```c
#define SYS_getdents64 61
```

`getdents` 是 “get directory entries” 的缩写，是 `ls`、`find` 这类命令的底层实现基础。它允许用户程序像读文件一样，一块一块地读取一个目录下的所有 **逻辑目录项** 的信息。

有了对底层存储和 `enext` 的理解，`sys_getdents` 的逻辑就清晰了。它本质上是一个循环，不断调用 `enext` 来获取目录项，然后把内核态的 `struct dirent` 格式转换成用户态需要的 `struct dirent64` 格式，再拷贝到用户空间。

为了对齐 Linux 的接口，我们需要定义一个新的结构体 `dirent64`，它是 `SNE` 和 `LNE` 这两种 **物理目录项** 的上层封装，我们也可以叫他 **逻辑目录项**，它实际上已经可以用于用户态编程了，它包含了：

-   `d_ino`：inode 号，FAT32 不支持，直接设为 0 就行
-   `d_off`：偏移量，记录的是当前这个 `dirent64` 逻辑目录项读完后，下一个逻辑目录项在父目录数据流中的起始字节位置。每次读取完一个 **逻辑目录项** 后，偏移量增加 `count * 32`，即经过的 **物理目录项** 的数量乘以 32。
-   `d_reclen`：记录长度，固定为 `sizeof(struct dirent64)`。记录当前 `dirent64` 结构体在返回给用户的缓冲区中所占的总字节数，用于帮助程序在缓冲区内定位到下一个 `dirent64`。
-   `d_type`：文件类型，根据 `struct dirent` 的 `attribute` 字段判断，如果是目录，则设为 `DT_DIR`，否则设为 `DT_REG`
-   `d_name`：文件名，从 `struct dirent` 的 `filename` 字段拷贝过来

**注意，`getdents` 系统调用实际上可以被连续多次调用，每次调用都会从上一次调用结束的位置开始，继续读取目录项，直到读取到目录末尾。**

```c
// kernel/include/fat32.h
#define DT_UNKNOWN 0
#define DT_FIFO 1
#define DT_CHR 2
#define DT_DIR 4
#define DT_BLK 6
#define DT_REG 8
#define DT_LNK 10
#define DT_SOCK 12
#define DT_WHT 14

struct dirent64 {
    uint64 d_ino;
    uint64 d_off;
    unsigned short d_reclen;
    unsigned char d_type;
    char d_name[FAT32_MAX_FILENAME + 1];
};
```

`sys_getdents` 的实现逻辑是一个循环：

1.  从用户态获取文件描述符 `fd`、一个用于存放结果的缓冲区 `addr` 和缓冲区的长度 `len`。
2.  检查 `fd` 对应的文件是否是一个目录，以及是否可读。
3.  在一个 `while` 循环中，不断地从目录中读取下一个目录项，直到缓冲区装满或者目录读取完毕。
    -   调用 `enext(f->ep, &de, f->off, &count)` 函数，这个函数会从文件 `f` 的当前偏移 `f->off` 处开始，查找下一个有效的目录项，并将其信息填充到 `de` 中。
    -   如果 `enext` 成功返回，说明找到了一个目录项。
    -   我们将内核的 `struct dirent de` 里的信息，转换成用户态需要的 `struct dirent64 out` 格式。
    -   调用 `copyout2` 将 `out` 拷贝到用户空间的 `addr` 处。
    -   更新 `addr` 指针和已读取的字节数 `nread`。
    -   更新文件偏移 `f->off`，准备下一次读取。
4.  循环结束后，返回总共读取的字节数 `nread`。

```c
/**
 * @brief 实现 getdents 系统调用，读取目录项
 * @param fd 目录的文件描述符
 * @param addr 用户空间缓冲区的地址，用于存放读取结果
 * @param len 缓冲区的长度
 * @return 成功则返回读取的字节数，读到目录末尾返回 0，失败返回 -1
 * @note getdents 是 ls 等命令的底层实现。
 */
uint64 sys_getdents(void) {
  int fd, len;
  uint64 addr;
  struct file* f;
  int nread = 0;
  int reclen = (int)sizeof(struct dirent64);

  if (argfd(0, &fd, &f) < 0 || argaddr(1, &addr) < 0 || argint(2, &len) < 0) {
    return -1;
  }

  // 缓冲区太小，至少要能装下一个目录项
  if (len < reclen) {
    return 0;
  }

  if (fd < 0 || fd >= NOFILE) {
    return -1;
  }

  // 必须是目录且可读
  if (f->readable == 0) {
    return -1;
  }

  if (f->ep == 0 || !(f->ep->attribute & ATTR_DIRECTORY)) {
    return -1;
  }

  // 循环读取，直到缓冲区满或目录读完
  while (nread + reclen <= len) {
    struct dirent de;
    int count = 0;
    int ret;

    elock(f->ep);
    // enext 会找到下一个有效的目录项，并填充到 de 中
    // 它会跳过空目录项和 LNE，直接返回一个完整的 SNE
    while ((ret = enext(f->ep, &de, f->off, &count)) == 0) {
      f->off += count * 32;
    }
    eunlock(f->ep);

    if (ret == -1) { // 读到目录末尾
      return nread; // 退出循环，返回已经读取的字节数
    }

    // 将内核的 dirent 格式转换为用户态的 dirent64 格式
    struct dirent64 out;
    out.d_ino = 0; // FAT32 没有 inode number 的概念
    out.d_off = f->off;
    out.d_reclen = sizeof(struct dirent64);
    if (de.attribute & ATTR_DIRECTORY) {
      out.d_type = DT_DIR;
    }
    else {
      out.d_type = DT_REG;
    }
    safestrcpy(out.d_name, de.filename, FAT32_MAX_FILENAME + 1);

    // 拷贝到用户空间
    if (copyout2(addr, (char*)&out, sizeof(out)) < 0) {
      return -1;
    }

    // 更新指针和计数器
    addr += sizeof(out);
    nread += sizeof(out);
    f->off += count * 32;
  }

  return nread;
}
```

## mkdirat

功能：在指定目录下创建子目录。

```c
int mkdirat(int dirfd, const char *pathname, mode_t mode);
```

参数：

- `dirfd`：目录文件描述符；可用特殊值 `AT_FDCWD` 表示相对当前工作目录。
- `pathname`：要创建的目录路径（可相对 `dirfd`）。
- `mode`：权限模式位（会受进程 `umask` 掩码影响）。

返回值：

- 成功：返回 0。
- 失败：返回 -1，并设置 `errno`。

测试仓库说明和标准文档出入不大。

```c
#define SYS_mkdirat 34
```

`mkdirat` 是 `mkdir` 的 `at` 版本，它允许我们基于一个目录文件描述符 `dirfd` 来创建新的目录，这比单纯依赖当前工作目录要更安全和灵活。

这里和我们在实现 `openat` 时类似，只需要在 `mkdir` 的基础上，根据新传入的 `dirfd` 解析出正确的 `path` 即可。

实现 `sys_mkdirat` 的逻辑非常直观：

1.  解析 `dirfd`, `path`, `mode` 三个参数。
2.  调用我们在 Part2 中实现的 `get_path(path, dirfd)` 函数，这个函数会处理 `dirfd` 和 `path` 的各种组合（绝对路径、相对路径、`AT_FDCWD`），最终将 `path` 转换为一个内核可以直接使用的绝对路径。
3.  调用 xv6 文件系统提供的 `create(path, T_DIR, 0)` 函数来创建目录。`T_DIR` 告诉 `create` 我们要创建的是一个目录。
4.  `create` 函数会返回一个锁住的 `dirent`，我们需要解锁并释放它，然后返回成功。

```c
/**
 * @brief 实现 mkdirat 系统调用，在指定位置创建目录
 * @param dirfd 目录文件描述符
 * @param path 目录路径
 * @param mode 创建模式（本次实验中未使用）
 * @return 成功返回 0，失败返回 -1
 * @note 核心是复用 get_path 将路径转换为绝对路径。
 */
uint64
sys_mkdirat(void)
{
  char path[FAT32_MAX_PATH];
  int dirfd, mode;
  struct dirent* ep;

  if (
    argint(0, &dirfd) < 0 ||
    argstr(1, path, FAT32_MAX_PATH) < 0 ||
    argint(2, &mode) < 0) {
    return -1;
  }

  if (strlen(path) == 0) {
    return -1;
  }

  // 将路径转换为绝对路径
  if (get_path(path, dirfd) < 0) {
    return -1;
  }

  // 调用底层 create 函数创建目录
  ep = create(path, T_DIR, 0);
  if (ep == NULL) {
    return -1;
  }

  // 释放资源并返回
  eunlock(ep);
  eput(ep);
  return 0;
}
```

## unlinkat

删除目录项（对普通文件是 “解除链接”；实际回收取决于是否仍有打开引用）。

```c
int unlinkat(int dirfd, const char *pathname, int flags);
```

参数：

- `dirfd`：目录文件描述符；`AT_FDCWD` 表示相对当前工作目录。
- `pathname`：要删除的路径（可相对 `dirfd`）。
- `flags`：支持 `AT_REMOVEDIR`（删除目录）；为 0 时删除非目录名称。

返回值：

- 成功：返回 0。
- 失败：返回 -1，并设置 `errno`。

说明：

- 若目标是目录且未设置 `AT_REMOVEDIR` 会失败（`EPERM`）。
- 符号链接的删除作用于链接自身，不跟随到目标。

测试仓库说明和标准文档出入不大。

```c
#define SYS_unlinkat 35
```

`unlinkat` 的功能是移除文件的链接，当链接数为 0 时，文件就被删除了，它也可以用来删除空目录，**它是 `rm` 命令的底层实现**。

`flags` 参数是区分这两种行为的关键。

实现逻辑稍微复杂一些，因为它需要处理文件和目录两种情况：

1.  解析 `dirfd`, `path`, `flags` 三个参数。
2.  调用 `get_path(path, dirfd)` 转换为绝对路径。
3.  调用 `ename(path)` 获取路径对应的 `dirent`。
4.  **核心判断逻辑**：
    -   检查 `dirent` 是否是一个挂载点，如果是，则不允许删除。
    -   如果目标是目录 (`ATTR_DIRECTORY`)：
        -   检查 `flags` 是否包含 `AT_REMOVEDIR`，如果不包含，则说明用户意图删除文件而非目录，操作非法，返回错误。
        -   检查目录是否为空 (`isdirempty`)，如果不为空，不能删除，返回错误。
    -   如果目标是文件：
        -   检查 `flags` 是否包含 `AT_REMOVEDIR`，如果包含，则说明用户意图删除目录而非文件，操作非法，返回错误。
5.  加锁，调用 `eremove(ep)` 执行删除操作，然后解锁并释放资源。

```c
/**
 * @brief 实现 unlinkat 系统调用，删除文件或目录
 * @param dirfd 目录文件描述符
 * @param path 文件或目录的路径
 * @param flags 标志位，AT_REMOVEDIR 用于删除目录
 * @return 成功返回 0，失败返回 -1
 * @note 需要根据 flags 和文件类型（文件/目录）进行精细的判断。
 */
uint64 sys_unlinkat(void) {
  char path[FAT32_MAX_PATH];
  int dirfd, flags;
  struct dirent* ep;

  if (
    argint(0, &dirfd) < 0 ||
    argstr(1, path, FAT32_MAX_PATH) < 0 ||
    argint(2, &flags) < 0
  ) {
    return -1;
  }

  if (strlen(path) == 0) {
    return -1;
  }

  if (get_path(path, dirfd) < 0) {
    return -1;
  }

  char* basename = path;
  char* p = path;

  // 禁止删除 "." 和 ".."
  // 找到最后一个 '/'
  while (*p) {
    if (*p == '/') {
      basename = p + 1;
    }
    p++;
  }
  // 现在 basename 指向路径的最后一部分
  if (strncmp(basename, ".", 1) == 0 || strncmp(basename, "..", 2) == 0) {
    return -1;
  }

  // 获取路径对应的 dirent
  ep = ename(path);
  if (ep == NULL) {
    return -1;
  }
  elock(ep);
  if (ep->attribute & ATTR_DIRECTORY) {
    eremove(ep);
  }

  // 不允许删除挂载点
  if (is_mounted(ep)) {
    eunlock(ep);
    eput(ep);
    return -1;
  }

  // 根据文件类型和 flags 进行判断
  if (ep->attribute & ATTR_DIRECTORY) {
    // 意图删除目录，但 flags 不对
    if (!(flags & AT_REMOVEDIR)) {
      eunlock(ep);
      eput(ep);
      return -1;
    }
    // 目录非空
    if (!isdirempty(ep)) {
      eunlock(ep);
      eput(ep);
      return -1;
    }
  }
  else {
    // 意图删除文件，但 flags 不对
    if (flags & AT_REMOVEDIR) {
      eunlock(ep);
      eput(ep);
      return -1;
    }
  }

  // 执行删除
  elock(ep->parent);
  eremove(ep);
  eunlock(ep->parent);
  eunlock(ep);
  eput(ep);
  return 0;
}
```

## fstat

获取文件状态信息（不跟随符号链接，因为针对已打开的 `fd`）。

```c
int fstat(int fd, struct stat *statbuf);
```

参数：

-   `fd`：已打开文件描述符
-   `statbuf`：输出缓冲区，返回文件的元数据

返回值：

-   成功：返回 0，并填充 `statbuf`
-   失败：返回 -1，并设置 `errno`

测试仓库说明和标准文档出入不大。

```c
#define SYS_fstat 80
```

直接调用已经 xv6-k210 已经实现的 `sys_fstat` 可以通过本地测试，但是远程测试会有一个点无法通过。

`fstat` 系统调用本身没有啥变化，不过测试样例是在 Linux 标准下编译的，所以它的 `struct stat` 和 xv6-k210 现有的有些出入。

这里只需要仿照 [Linux 的标准](https://www.man7.org/linux/man-pages/man3/stat.3type.html)，增加一个 `kstat` 结构体即可，然后基本上也就是按照字面意思填填字段就行了：

```c
// kernel/include/stat.h
struct kstat {
  uint64 st_dev;
  uint64 st_ino;
  uint st_mode;
  uint32 st_nlink;
  uint32 st_uid;
  uint32 st_gid;
  uint64 st_rdev;
  unsigned long __pad;
  long int st_size;
  uint32 st_blksize;
  int __pad2;
  uint64 st_blocks;
  long st_atime_sec;
  long st_atime_nsec;
  long st_mtime_sec;
  long st_mtime_nsec;
  long st_ctime_sec;
  long st_ctime_nsec;
  unsigned __unused[2];
};
```

我们来看一下关键字段的含义以及在 `ekstat` 中是如何填充的：

```c
/**
 * @brief 将 dirent 信息填充到 kstat 结构体中
 * @param de 源 dirent
 * @param st 目标 kstat 结构体指针
 * @note 这是 fstat 的核心辅助函数，用于对齐 Linux 的 stat 结构。
 */
void ekstat(struct dirent* de, struct kstat* st)
{
    memset(st, 0, sizeof(*st));
    st->st_dev = de->dev;
    st->st_ino = 0;

    st->st_mode = (de->attribute & ATTR_DIRECTORY) ? DT_DIR : DT_REG;

    st->st_nlink = 1;
    st->st_rdev = 0;
    st->st_size = de->file_size;
    st->st_blksize = 4096;
    st->st_blocks = (st->st_size + 511) / 512;
}
```

-   `uint64 st_dev`：文件所在的设备号。我们直接用 `de->dev` 填充。
-   `uint64 st_ino`：Inode 号。FAT32 没有 Inode 的概念，所以我们填 0。
-   `uint st_mode`：文件类型和权限。我们通过检查 `de->attribute` 是否有 `ATTR_DIRECTORY` 标志，来决定填充 `DT_DIR`（目录）还是 `DT_REG`（普通文件）。
-   `uint32 st_nlink`：硬链接数量。FAT32 也不支持硬链接，所以我们简单地填 1。
-   `long int st_size`：文件大小（字节）。直接用 `de->file_size` 填充。
-   `uint32 st_blksize`：文件系统 I/O 操作的最佳块大小。填充为 FAT32 文件系统的簇（Cluster）的大小，所以我们填常见默认值 `4096` 即可。
-   `uint64 st_blocks`：文件占用的块数（固定以 512 字节为一块，和 `st_blksize` 无关）。计算方式是 `(st_size + 511) / 512`，这是一个向上取整的技巧。

### `ekstat` 的实现

对比旧的 `estat`，新的 `ekstat` 提供了更丰富、更符合 Linux 标准的信息，特别是 `st_mode`、`st_blksize` 和 `st_blocks`，这些都是通过测试的关键。

最后，改一下 `sys_fstat` 调用的 `file.c` 中的 `filestat` 函数，把 `estat` 换成 `ekstat`，并将 `struct stat` 换成 `struct kstat` 即可。

```c
// Get metadata about file f.
// addr is a user virtual address, pointing to a struct stat.
int
filestat(struct file *f, uint64 addr)
{
  // struct proc *p = myproc();
  // 这行修改为使用 kstat 结构体
  struct kstat st;

  if(f->type == FD_ENTRY){
    elock(f->ep);
    // 这行修改为使用 ekstat 函数
    ekstat(f->ep, &st);
    eunlock(f->ep);
    // if(copyout(p->pagetable, addr, (char *)&st, sizeof(st)) < 0)
    if(copyout2(addr, (char *)&st, sizeof(st)) < 0)
      return -1;
    return 0;
  }
  return -1;
}
```

## mount / umount

`mount` 是 Unix/Linux 系统中一个非常核心的概念，它允许我们将一个存储设备（比如另一个硬盘分区）的根目录 “附加” 到当前文件系统的一个现有目录上。这个现有目录就被称为 “挂载点”。

`mount` 将文件系统或绑定挂载到目标路径。

```c
int mount(const char *source, const char *target,
          const char *filesystemtype, unsigned long mountflags,
          const void *data);
```

参数（mount）：

-   `source`：块设备路径、绑定源路径或特殊文件系统标识（如 `"proc"`）；可为 `NULL`/`"none"` 取决于类型
-   `target`：挂载点目录（需已存在）
-   `filesystemtype`：文件系统类型（如 `"ext4"`、`"proc"`、`"tmpfs"` 等）
-   `mountflags`：挂载标志位组合，如 `MS_RDONLY`、`MS_NOSUID`、`MS_NODEV`、`MS_NOEXEC`、`MS_RELATIME`、`MS_BIND`、`MS_REMOUNT`、`MS_SHARED`/`MS_PRIVATE` 等
-   `data`：可选的文件系统特定选项，通常为以逗号分隔的 `"key=value"` 字符串或类型特定结构

返回值：

-   成功：返回 0
-   失败：返回 -1，并设置 `errno`

`umount2` 卸载挂载点；若有占用（打开文件、当前工作目录在该挂载）可能失败。

```c
int umount2(const char *target, int flags);
```

参数：
-   `target`：挂载点路径。
-   `flags`：如 `MNT_FORCE`（强制，仅部分网络 FS）、`MNT_DETACH`（懒卸载）、`MNT_EXPIRE`、`UMOUNT_NOFOLLOW` 等。

返回值：
-   成功：返回 0。
-   失败：返回 -1，并设置 `errno`。

测试仓库说明和标准文档出入不大，不过这些字段也不需要太过在意，**因为我们不涉及实际的挂载逻辑**。

```c
#define SYS_mount 40
#define SYS_umount2 39
```

根据提示，本次实验中的 `mount` 和 `umount` 并不需要实现真正的挂载逻辑，只需要 “假装” 成功，即直接返回 0 即可通过本地和远程的所有测试。

> 助教的原话是：mount 的逻辑比较奇怪，不同系统的差距太大了，所以没必要细扣。

但是，这里我们还是稍微维护一个挂载点列表，以便在 `unlinkat` 等操作中能检查一个目录是否是挂载点。

为此，我们定义了 `struct mount` 结构体和全局的 `mounts` 数组。

```c
// kernel/include/fat32.h
#define NMOUNT 16

struct mount {
    struct dirent* de;
    char path[FAT32_MAX_PATH];
    int used;
};

// kernel/sysfile.c
struct mount mounts[NMOUNT];
```

`sys_mount` 的实现非常简单：找到一个空闲的 `mount` 槽位，记录下挂载点的信息即可。`sys_umount` 则是根据路径找到记录并清除它。

```c
/**
 * @brief 实现 mount 系统调用（伪实现）
 * @param src 源设备（未使用）
 * @param dst 挂载点路径
 * @param fstype 文件系统类型（未使用）
 * @param flags 标志（未使用）
 * @param data 数据（未使用）
 * @return 成功返回 0，失败返回 -1
 * @note 仅记录挂载点信息，不执行实际挂载操作。
 */
uint64 sys_mount(void) {
  char src[FAT32_MAX_PATH];
  char dst[FAT32_MAX_PATH];
  char fstype[32];
  int flags;
  uint64 data;

  if (
    argstr(0, src, FAT32_MAX_PATH) < 0 ||
    argstr(1, dst, FAT32_MAX_PATH) < 0 ||
    argstr(2, fstype, sizeof(fstype)) < 0 ||
    argint(3, &flags) < 0 ||
    argaddr(4, &data) < 0
  ) {
    return -1;
  }

  if (get_path(dst, AT_FDCWD) < 0) {
    return -1;
  }

  struct dirent* dst_ep = ename(dst);
  if (dst_ep == NULL) {
    return -1;
  }

  elock(dst_ep);
  if (!(dst_ep->attribute & ATTR_DIRECTORY)) {
    eunlock(dst_ep);
    eput(dst_ep);
    return -1;
  }

  // 检查是否是挂载点，实现逻辑见后文，实际上没用，可以删掉
  if (is_mounted(dst_ep) || find_mount(dst) >= 0) {
    eunlock(dst_ep);
    eput(dst_ep);
    return -1;
  }

  int idx = -1;
  for (int i = 0; i < NMOUNT; i++) {
    if (!mounts[i].used) {
      idx = i;
      break;
    }
  }
  if (idx == -1) {
    eunlock(dst_ep);
    eput(dst_ep);
    return -1;
  }
  mounts[idx].de = edup(dst_ep);
  mounts[idx].used = 1;
  safestrcpy(mounts[idx].path, dst, FAT32_MAX_PATH);
  eunlock(dst_ep);
  eput(dst_ep);
  return 0;
}

/**
 * @brief 实现 umount 系统调用（伪实现）
 * @param path 挂载点路径
 * @param flags 标志（未使用）
 * @return 成功返回 0，失败返回 -1
 * @note 仅清除挂载点信息，不执行实际卸载操作。
 */
uint64 sys_umount(void) {
  char path[FAT32_MAX_PATH];
  int flags;

  if (
    argstr(0, path, FAT32_MAX_PATH) < 0 ||
    argint(1, &flags) < 0
  ) {
    return -1;
  }

  if (get_path(path, AT_FDCWD) < 0) {
    return -1;
  }

  int idx = find_mount(path);
  if (idx < 0) {
    return -1;
  }

  if (mounts[idx].de) {
    eput(mounts[idx].de);
  }

  mounts[idx].de = NULL;
  safestrcpy(mounts[idx].path, "", FAT32_MAX_PATH);
  mounts[idx].used = 0;

  return 0;
}
```

这里额外实现 `is_mounted` 和 `find_mount` 这两个辅助函数，它们通过遍历 `mounts` 数组来检查一个 `dirent` 或路径是否是挂载点。

```c
// kernel/fat32.c

// 全局挂载点数组的外部声明
extern struct mount mounts[NMOUNT];

/**
 * @brief 检查一个 dirent 是否是挂载点
 * @param de 要检查的 dirent
 * @return 如果是挂载点返回 1，否则返回 0
 */
int is_mounted(const struct dirent* de) {
    for (int i = 0; i < NMOUNT; i++) {
        if (mounts[i].used && mounts[i].de == de) {
            return 1;
        }
    }
    return 0;
}

/**
 * @brief 根据路径查找挂载点
 * @param path 要查找的路径
 * @return 如果找到，返回 mount 数组的索引，否则返回 -1
 */
int find_mount(const char* path) {
    for (int i = 0; i < NMOUNT; i++) {
        if (mounts[i].used && strncmp(mounts[i].path, path, FAT32_MAX_PATH) == 0) {
            return i;
        }
    }
    return -1;
}
```
