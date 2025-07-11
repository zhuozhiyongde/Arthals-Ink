---
title: 从零开始配置 Linux
publishDate: 2023-10-05 06:26:09
description: '环境配置什么的真是烦死辣！'
tags:
  - Linux
  - Initialize
language: '中文'
---

先放两个 Star List 在这里：

- [zhuozhiyongde/Tools](https://github.com/stars/zhuozhiyongde/lists/tools)
- [zhuozhiyongde/Linux](https://github.com/stars/zhuozhiyongde/lists/linux)

## 1Panel

[文档](https://1panel.cn/docs/installation/online_installation/)

[1Panel-dev/1Panel](https://github.com/1Panel-dev/1Panel)

安装命令

```bash
curl -sSL https://resource.fit2cloud.com/1panel/package/quick_start.sh -o quick_start.sh && sudo bash quick_start.sh
```

## 猫猫

[mihomo](https://github.com/MetaCubeX/mihomo/tree/Meta)

从备份中获取：

- clash 二进制文件
- Country.mmdb 地理数据库

通过 sftp 上传到服务器，目标地址 `~/.config/clash`

我使用 [yacd](https://github.com/haishanh/yacd) 来作为 web 界面。

如果你需要 GUI，那么可以考虑 [clash-nyanpasu](https://github.com/LibNyanpasu/clash-nyanpasu)

## Nvm

我使用 nvm 来对 Node.js 版本进行管理。

[nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
```

安装完成后，换源，将如下命令追加到 `.bashrc`

```bash
export NVM_NODEJS_ORG_MIRROR=http://npm.taobao.org/mirrors/node
```

## Nrm

[nrm](https://github.com/Pana/nrm)

```zsh
npm install -g nrm
```

## MiniConda

[Minoconda](https://docs.anaconda.com/free/miniconda/index.html)

我使用 MiniConda 来管理 Python 版本、环境。

```shell
mkdir -p ~/.miniconda3
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O ~/.miniconda3/miniconda.sh
bash ~/.miniconda3/miniconda.sh -b -u -p ~/.miniconda3
rm ~/.miniconda3/miniconda.sh
```

## Zoxide

[zoxide](https://github.com/ajeetdsouza/zoxide)

```bash
curl -sS https://raw.githubusercontent.com/ajeetdsouza/zoxide/main/install.sh | bash
```

## Starship

[starship](https://github.com/starship/starship)

```bash
curl -sS https://starship.rs/install.sh | sh
```

## fzf

[fzf](https://github.com/junegunn/fzf#using-homebrew)

```bash
git clone --depth 1 https://github.com/junegunn/fzf.git ~/.fzf
~/.fzf/install
```

搭配 ag 使用

```bash
sudo apt-get install silversearcher-ag
```

## Zsh

我使用 [rcm](https://github.com/thoughtbot/rcm) 来管理配置文件 dotfiles, 通过 rcm 可以将配置文件备份至 `~/.dotfiles`，也可以从 `~/.dotfiles` 通过软连接的形式还原备份至 `~`。

从 dotfiles 还原备份至 ~/.dotfiles

```zsh
rcup -t linux
```

## Pnpm

[pnpm](https://github.com/pnpm/pnpm)

```zsh
npm i pnpm -g
```
