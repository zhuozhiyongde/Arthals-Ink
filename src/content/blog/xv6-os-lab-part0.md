---
title: 更适合北大宝宝体质的 xv6 OS Lab 踩坑记 - Part0
description: '北京大学 2025 年秋季学期操作系统/OS Lab Part 0'
publishDate: 2025-10-02 16:17:53
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

操作系统的大作业看起来令人生畏，初次上手根本不知道各个部分在干啥，也不知道整个项目是如何跑起来的。文档看似很多但是东一块西一块的完全串不起来，所以我动笔记录一下自己完成这个大作业的过程，希望能帮助到后来者。

## 项目基础流程

xv6 OS Lab 的核心目标是通过修改一个简单的操作系统内核，来学习操作系统的核心概念。

在开始之前，让我们首先介绍一下整个项目是如何跑起来的：

1. **QEMU 启动**：QEMU 模拟器为操作系统提供了虚拟的硬件环境，包括 CPU、内存和硬盘。
2. **引导加载（Bootloader）**：`RustSBI` 程序首先运行，它负责初始化虚拟硬件，并将内核文件加载到内存中。
3. **内核运行**：CPU 开始执行内核代码。内核对各项系统服务进行初始化，例如进程管理和内存管理。
4. **内核初始化，挂载 fs.img**：内核初始化后，会挂载 `fs.img` 文件系统。
5. **创建第一个进程，运行 initcode**：内核创建第一个进程，并运行 `initcode` 程序。
6. **initcode 执行 `exec("/init")`**：`initcode` 程序执行 `exec("/init")` 系统调用，加载 `/init` 程序。
7. **`/init` 程序接管，开始执行测试或启动 Shell**：`/init` 程序接管，开始执行测试或启动 Shell。

完成以上步骤后，操作系统启动完毕，并将控制权交给用户程序。

## 常用命令

在整个项目的运行过程中，你会经常性地使用到 Docker 和 Make 两个工具。

其中，Docker 需要进行安装，而 Make 命令应当打包在了 Docker 环境中。

### Docker

安装 Docker 可以详见助教提供的文档，或者参照 [官方指引](https://docs.docker.com/engine/install/ubuntu/#install-using-the-repository) 安装：

```bash
# Add Docker's official GPG key:
sudo apt-get update
sudo apt-get install ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Add the repository to Apt sources:
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
```

然后安装：

```shell
sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

不过你可能遇到 `Could not handshake` 问题，此时我们强制使用 IPv4 来安装：

```bash
sudo apt-get -o Acquire::ForceIPv4=true install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

你可能还需要将当前用户添加到 `docker` 组：

```bash
sudo usermod -aG docker $USER
```

然后重启终端（<kbd>Ctrl</kbd> + <kbd>D</kbd>，或者 `exit`，然后重新 ssh 到服务器）。

考虑到 Clab 位于境内，所以你可能需要先添加 Docker 镜像源：

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json <<-'EOF'
{
  "registry-mirrors": [
    "https://docker.1panel.live/"
  ]
}
EOF
sudo systemctl daemon-reload
sudo systemctl restart docker
```

助教提供了一个一键启动 Docker 的命令，我们对之稍加修改，得到

```shell
docker run -ti --rm -v ./:/xv6 -w /xv6 --privileged=true docker.educg.net/cg/os-contest:2024p6 /bin/bash
```

其中：

-   `-v ./:/xv6` 表示将当前目录挂载到容器内的 `/xv6` 目录
-   `-w /xv6` 表示将工作目录设置为 `/xv6`，这样你每次启动 Docker 后都会自动进入 `/xv6` 目录
-   `-ti` 表示打开一个交互式的伪终端，一般和 `/bin/bash` 连用（这里其实是 `-t -i`，所以写成 `-it` 一样）；
-   `--rm` 表示每次退出容器后自动删除，在我的使用场景下不需要向评测镜像里安装写入其他东西，所以如此设置；也可以使用 `--restart=always` 指定每次都会重启容器，该选项和 `--rm` 互斥；
-   `--privileged=true` 指定启动特权容器，拥有容器内的所有 capabilities，否则后文 `make fs` 会出错；
-   `docker.educg.net/cg/os-contest:2024p6` 对应助教提供的镜像名称和 tag。

很长对吧，出于简便起见，你可以直接使用别名（Alias），通过在 `~/.bashrc` 或者 `~/.zshrc` 中添加如下内容：

```shell
alias qwe='docker run -ti --rm -v ./:/xv6 -w /xv6 --privileged=true docker.educg.net/cg/os-contest:2024p6 /bin/bash'
```

然后重载一下 Shell（删了重新创建，或者使用 `. ~/.bashrc` 或者 `. ~/.zshrc`）。

这样，你每次就可以直接使用 `qwe` 进入 Docker 环境了。

### Make

Make 是一个用来进行项目构建的工具，其可以将一系列命令组合成一个命令，从而简化操作。

`Makefile` 文件定义了这些简便的命令背后要执行的命令，他们的依赖链如下：

<center>

**`run` → `fs` → `build` → (`$T/kernel` + `userprogs`)**

</center>

其中你需要重点关注以下几个命令：

#### `make build`

```makefile
build: $T/kernel userprogs
```

此命令执行两个核心任务：

1.  **`$T/kernel` 编译内核可执行文件**：
    -   它依赖于一系列的内核目标文件 `$(OBJS)`。
    -   `make` 会自动查找并执行编译命令，将每个 `.c` 或 `.S` 源文件（如 `printf.c`, `vm.c`）编译成对应的 `.o` 目标文件。
    -   所有 `.o` 文件编译完成后，`make` 会执行链接命令，将它们链接成最终的内核文件 `$T/kernel`。
2.  **`userprogs` 编译所有用户程序**：
    -   它依赖于 `$(UPROGS)` 列表中的所有用户程序（如 `$U/_sh`）。
    -   对于每个用户程序（以 `_sh` 为例），它依赖于对应的 `.o` 文件（`sh.o`）和用户库 `$(ULIB)`。
    -   `make` 先将 `sh.c` 编译成 `sh.o`，然后将其与用户库链接，生成可执行文件 `$U/_sh`。

#### `make fs`

```makefile
fs: $(UPROGS)
	@if [ ! -f "fs.img" ]; then \
		echo "making fs image..."; \
		dd if=/dev/zero of=fs.img bs=512k count=512; \
		mkfs.vfat -F 32 fs.img; fi
	@mount fs.img $(dst)
	@if [ ! -d "$(dst)/bin" ]; then mkdir $(dst)/bin; fi
	@cp README $(dst)/README
	@for file in $$( ls $U/_* ); do \
		cp $$file $(dst)/$${file#$U/_};\
		cp $$file $(dst)/bin/$${file#$U/_}; done
	@cp -r riscv64/* $(dst)
	@umount $(dst)
```

此命令用于创建文件系统镜像，生成 `fs.img` 虚拟磁盘文件。

1. **创建镜像文件**：如果 `fs.img` 不存在，则创建一个 256MB 的空白文件。
2. **格式化**：将该文件格式化为 FAT32 文件系统。
3. **拷贝文件**：将 `make build` 生成的所有用户程序和 `riscv64/` 目录下的所有测试程序，拷贝到 `fs.img` 中。

**注意：`make fs` 必须在 `make build` 之后执行。**

这里相对于原版仓库还有一行额外的修改，即添加 `@cp -r riscv64/* $(dst)` 这一行，将 `riscv64/` 目录下的所有测试程序拷贝到 `fs.img` 中。这是出于评测需要所添加的。

你可能会好奇为什么需要额外创建一个 `fs.img` 作为虚拟磁盘，而不是直接将所有东西都打包到内核中，其实就和你自己电脑一样，你的操作系统内核本身是不包含任何用户程序（如 `sh`、`ls`、`cat` 等命令）的，它只负责最核心的功能（如进程管理、内存管理、文件系统等）。所以，内核会在启动后，通过挂载 `fs.img` 的方式将所有用户程序加载到内存中，从而才能运行这些用户程序。

而且，`fs.img` 作为虚拟磁盘，是持久化存储设备，它会被 QEMU 模拟器作为块设备挂载，为操作系统提供了一个可以进行文件和目录操作（如读写、创建、删除）的空间，从而能够测试文件系统的相关功能。

#### `make run`

此命令使用 QEMU 模拟器来运行操作系统。

```makefile
run: build
	@$(QEMU) $(QEMUOPTS)
```

-   它会加载 `target/kernel` 作为内核运行。
-   它会将 `fs.img` 作为虚拟硬盘挂载。

**注意：`make run` 依赖 `make build`。此命令不会自动更新 `fs.img`，如果用户程序有变动，需要先手动执行 `make fs`。**

#### `make local`

这段代码需要你手动添加。

```makefile
local:
	@make build platform=qemu
	@make fs
	@$(QEMU) $(QEMUOPTS)
```

基本上就是把前面这些东西按照依赖顺序组合在一起执行一遍，从而简化操作流程。

#### `make all`

这段代码需要你手动添加。

```makefile
all: build
	@cp $(T)/kernel ./kernel-qemu
	@cp ./bootloader/SBI/sbi-qemu ./sbi-qemu
```

这个是出于评测需要添加的，它会将内核和引导程序（`sbi-qemu`）拷贝到当前目录，从而方便评测系统进行评测。

> ref：需要在 Makefile 里指定 target all 的行为，这将编译你的项目内核，并产生 kernel-qemu 这个二进制文件和 sbi-qemu 这个二进制文件（我们在本地运行时，它已经被放在 bootloader 目录下了，无需重新编译），这两个文件需要出现在根目录下，因此请自行在 Makefile 里用 cp 指令把它们以正确的名字放到正确的位置。

#### `make clean`

```makefile
clean:
	rm -f *.tex *.dvi *.idx *.aux *.log *.ind *.ilg \
	*/*.o */*.d */*.asm */*.sym \
	$T/* \
	$U/initcode $U/initcode.out \
	$K/kernel \
	.gdbinit \
	$U/usys.S \
	$(UPROGS)
```

此命令用于删除所有编译生成的中间文件和最终产品，如 `.o` 文件和 `target/` 目录的内容。

**注意**：`make clean` 不会删除 `fs.img` 文件。如需重新生成，要手动删除该文件。

## 测评相关

不是很懂流程，但按照文档操作就完了，你需要从 [oscomp/testsuits-for-oskernel](https://github.com/oscomp/testsuits-for-oskernel) 这个仓库下载测试样例并编译（需要先切换到 main 分支）：

```shell
git clone https://github.com/oscomp/testsuits-for-oskernel.git
cd testsuits-for-oskernel
git checkout main
rm -rf .git
```

然后，使用如下命令进入 Docker 环境：

```shell
docker run -ti --rm -v ./riscv-syscalls-testing:/testing -w /testing/user --privileged=true docker.educg.net/cg/os-contest:2024p6 /bin/bash
```

进入容器后，直接执行：

```shell
sh build-oscomp.sh
```

执行完毕后，使用 <kbd>Ctrl</kbd> + <kbd>D</kbd> 退出容器，打包出来的产物在 `./riscv-syscalls-testing/user/build/riscv64` 目录下。

将这个目录完整复制到你的项目根目录下即可。

你也可以直接 `clone` 本项目，然后直接使用 `git reset --hard` 命令到第一次提交即可。

完成以上内容后，你便完成了所有的准备工作，可以开始做 Lab 了。

你可以使用 `qwe` 命令进入临时容器，然后使用 `make local` 命令来进行一个简单的测试，你得到的结果应该类似于：

```
root@3b8b89279200:/xv6# make local
make[1]: Entering directory '/xv6'
make[1]: Nothing to be done for 'build'.
make[1]: Leaving directory '/xv6'
make[1]: Entering directory '/xv6'
make[1]: Leaving directory '/xv6'
[rustsbi] RustSBI version 0.3.0-alpha.2, adapting to RISC-V SBI v1.0.0
.______       __    __      _______.___________.  _______..______   __
|   _  \     |  |  |  |    /       |           | /       ||   _  \ |  |
|  |_)  |    |  |  |  |   |   (----`---|  |----`|   (----`|  |_)  ||  |
|      /     |  |  |  |    \   \       |  |      \   \    |   _  < |  |
|  |\  \----.|  `--'  |.----)   |      |  |  .----)   |   |  |_)  ||  |
| _| `._____| \______/ |_______/       |__|  |_______/    |______/ |__|
[rustsbi] Implementation     : RustSBI-QEMU Version 0.2.0-alpha.2
[rustsbi] Platform Name      : riscv-virtio,qemu
[rustsbi] Platform SMP       : 1
[rustsbi] Platform Memory    : 0x80000000..0x82000000
[rustsbi] Boot HART          : 0
[rustsbi] Device Tree Region : 0x81000000..0x81000ef2
[rustsbi] Firmware Address   : 0x80000000
[rustsbi] Supervisor Address : 0x80200000
[rustsbi] pmp01: 0x00000000..0x80000000 (-wr)
[rustsbi] pmp02: 0x80000000..0x80200000 (---)
[rustsbi] pmp03: 0x80200000..0x82000000 (xwr)
[rustsbi] pmp04: 0x82000000..0x00000000 (-wr)
  (`-.            (`-.                            .-')       ('-.    _   .-')
 ( OO ).        _(OO  )_                        .(  OO)    _(  OO)  ( '.( OO )_
(_/.  \_)-. ,--(_/   ,. \  ,--.                (_)---\_)  (,------.  ,--.   ,--.) ,--. ,--.
 \  `.'  /  \   \   /(__/ /  .'       .-')     '  .-.  '   |  .---'  |   `.'   |  |  | |  |
  \     /\   \   \ /   / .  / -.    _(  OO)   ,|  | |  |   |  |      |         |  |  | | .-')
   \   \ |    \   '   /, | .-.  '  (,------. (_|  | |  |  (|  '--.   |  |'.'|  |  |  |_|( OO )
  .'    \_)    \     /__)' \  |  |  '------'   |  | |  |   |  .--'   |  |   |  |  |  | | `-' /
 /  .'.  \      \   /    \  `'  /              '  '-'  '-. |  `---.  |  |   |  | ('  '-'(_.-'
'--'   '--'      `-'      `----'                `-----'--' `------'  `--'   `--'   `-----'
hart 0 init done
init: starting sh
-> / $
```

这个时候，使用 <kbd>Ctrl</kbd> + <kbd>A</kbd>（这个是 QEMU 的前缀组合键，表明你接下来输入的命令是给 QEMU 的，而不是给虚拟机的），再按下 <kbd>X</kbd> 键，即可退出 QEMU。再输入一次 <kbd>Ctrl</kbd> + <kbd>D</kbd>，即可退出容器。
