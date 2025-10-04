---
title: 从零开始配置 Windows
publishDate: 2024-02-12 04:18:09
description: '环境配置什么的真是烦死辣！'
tags:
  - Windows
  - Shell
  - WSL
  - Initialize
language: '中文'
---

## 原则

1. 能不装 C 盘就不装 C 盘，比如我装在 D:\Applications。原因是装在 C 盘一旦你重置系统之后软件就全没了。
2. 在修改注册表前，一定先使用导出进行备份。

先放一个 [Star List](https://github.com/stars/zhuozhiyongde/lists/windows) 在这里。

## 应用

### Chrome

[Chrome](https://www.google.com/intl/zh-CN/chrome/)：先进的网络浏览器。

### 沉浸式翻译

[沉浸式翻译](https://immersivetranslate.com/)：Chrome 插件，最好的网页翻译工具。

### Typora

[Typora](https://typora.io/)：体验最好的 Markdown 编辑器。

[NodeInject_Hook_example](https://github.com/DiamondHunters/NodeInject_Hook_example)：Hack 脚本，未经测试。

### Clash Nyanpasu

[Clash Nyanpasu](https://github.com/LibNyanpasu/clash-nyanpasu)：魔法上网工具。UI 相当精致。

### VS Code

[VS Code](https://code.visualstudio.com/)：最好的 IDE。

### Power Toys

[Power Toys](https://github.com/microsoft/PowerToys/releases/)：微软官方出品的实用工具。

### Pot

[Pot](https://pot-app.com/)：Windows 下的翻译工具，是 Bob 的平替，支持 OCR、划词翻译、截图翻译等。

### Local Send

[Local Send](https://localsend.org/#/download)：局域网文件传输工具。

如果安装后打不开，提示缺少 dll，则前往 [Microsoft Visual C++ Redistributable latest supported downloads](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist?view=msvc-170) 下载依赖安装。

### Hoppscotch

[Hoppscotch](https://hoppscotch.com/download)：API 请求工具。

### 360 压缩海外版

[360 压缩海外版](https://www.360totalsecurity.com/zh-cn/360zip/)：可能不是性能最好的，但是是可用的压缩软件中颜值最好的一档。

### Geek

[Geek](https://geekuninstaller.com/download)：Windows 下的 App Cleaner，可以完全彻底地卸载软件、清除注册表残留。

### Tai

[Tai](https://github.com/Planshit/Tai/releases)：时间统计工具。

### Project Eye

[Project Eye](https://github.com/Planshit/ProjectEye)：和 Tai 是同一家出品，好看好用的护眼软件，是一个基于 `20-20-20` 规则的用眼休息提醒软件，帮助保持健康的工作状态，追踪每天的用眼情况。

### Office 365

[Office 365](https://officecdn.microsoft.com/db/492350f6-3a01-4f97-b9c0-c7c6ddf67d60/media/zh-cn/ProPlus2021Retail.img)：Office 365 安装镜像，官方直链。

更多版本：[知乎总结](https://zhuanlan.zhihu.com/p/647589840)

License：[massgravel/Microsoft-Activation-Scripts](https://github.com/massgravel/Microsoft-Activation-Scripts)：Windows、Office 激活脚本。

```powershell
irm https://massgrave.dev/get | iex
```

### Auto Dark Mode

[Auto Dark Mode](https://apps.microsoft.com/store/detail/XP8JK4HZBVF435?ocid=pdpshare)：自动切换 Windows 深色模式。

### PicGo

[PicGo](https://github.com/Molunerfinn/PicGo/releases)：图床工具。

### Flow launcher

[Flow launcher](https://github.com/Flow-Launcher/Flow.Launcher)：快速启动、文件搜索工具，比 Fluent Search 好看。看上去优化也更好。

[Flow launcher ayu theme](https://github.com/icebruce/FlowLauncher-Ayu/blob/main/Ayu.xaml)：Ayu 颜色主题。

### Malware Patch

[the1812/Malware-Patch](https://github.com/the1812/Malware-Patch)：通过 UAC 阻止国产流氓软件的管理员授权, 无需后台运行.

注：开启此项后可能会导致对应软件无法安装，需要先临时禁用。

### Synergy

[Synergy-Binaries](https://github.com/DEAKSoftware/Synergy-Binaries)：可以同步 macOS 和 Windows 的键盘、鼠标、剪贴板的软件。

### Shell

[moudey/Shell](https://github.com/moudey/Shell)：功能强大的 Windows 文件资源管理器上下文菜单管理器。

### LyricEase

[LyricEase](https://install.appcenter.ms/users/brandonw3612/apps/lyricease/distribution_groups/public)：UWP 风格的第三方网易云音乐客户端，简洁、优雅，去除了多余评论功能等。

### EverythingToolbar

[srwi / EverythingToolbar](https://github.com/srwi/EverythingToolbar)：将 Everything 文件查找工具集成到搜索栏，替换原有的辣鸡搜索。

## CLI

### Chocolatey

[Chocolatey](https://chocolatey.org/install)：Windows 包管理器。

以管理员身份运行：

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))
```

### Gsudo

[Gsudo](https://github.com/gerardog/gsudo)：以管理员身份运行命令行。

```powershell
choco install gsudo
```

### Starship

[Starship](https://starship.rs/)：跨平台的命令行美化。

```powershell
choco install starship
```

移除自定义脚本限制：

```powershell
set-executionpolicy remotesigned
```

### PowerShell Ayu theme

[PowerShell Ayu theme](https://gist.github.com/joshtynjala/10dbdd4e449027fe9723b1d9f553c0bd)：PowerShell 主题。

### Miniconda

[Miniconda](https://docs.anaconda.com/free/miniconda/index.html)：Python 包管理器。

### Git

[Git](https://git-scm.com/download/win)：分布式代码版本控制系统。

选择：

- Override the default branch name of new reositories
- Git from the command line and also from 3rd-party software
- Use bundled OpenSSH
- Use the OpenSSL library
- Checkout as-is, commit Unix-style line endings
- Use MinTTY (the default terminal of MSYS2)
- Fast-forward or merge
- Git Credential Manager
- Enable file system caching + Enable symbolic links
- Enable experimental support for pseudo consoles + Enable experimental built-in file system monitor

### WSL

[WSL](https://github.com/microsoft/WSL)：适用于 Linux 的 Windows 子系统，可以在 Windows 上获得接近原生的 Linux 使用体验。

首先先从 [optional features](ms-settings:optionalfeatures) 打开 Hyper-V 、适用于 Linux 的 Windows 子系统、虚拟机平台。

运行指令安装最新版 Ubuntu：

```powershell
wsl --install
```

如果提示：

```text
没有注册类
Error code: Wsl/CallMsi/REGDB_E_CLASSNOTREG
```

则需要前往 [Github Release](https://github.com/microsoft/WSL/releases) 页面下载最新的 msi 文件安装。

如果提示：

```text
WslRegisterDistribution failed with error: 0x80070424
```

使用 Win+R，输入 optionalfeatures，打开虚拟机平台选项。

- PowerShell Config

以下是我的 PowerShell 配置文件，可以直接复制到 `~\Documents\PowerShell\Microsoft.PowerShell_profile.ps1`（或者 `$PROFILE`） 中。

```powershell
Set-Alias -Name open -Value explorer.exe
Invoke-Expression (&starship init powershell)
function Touch-File {
    param($fileName)
    New-Item $fileName -ItemType file
}
Set-Alias touch Touch-File

# Import the Chocolatey Profile that contains the necessary code to enable
# tab-completions to function for `choco`.
# Be aware that if you are missing these lines from your profile, tab completion
# for `choco` will not function.
# See https://ch0.co/tab-completion for details.
$ChocolateyProfile = "$env:ChocolateyInstall\helpers\chocolateyProfile.psm1"
if (Test-Path($ChocolateyProfile)) {
  Import-Module "$ChocolateyProfile"
}

function ChangeToProjectDirectory {
    cd D:\Project
}
Set-Alias -Name repo -Value ChangeToProjectDirectory
```

### Node.js

[Node.js](https://nodejs.org/en)：JavaScript 运行时。

## 系统

[Raphire / Win11Debloat](https://github.com/Raphire/Win11Debloat)：Windows 系统冗余组件清理

## 字体

- [JetBrains Mono](https://www.jetbrains.com/lp/mono/) / [Nerd Mono](https://github.com/ryanoasis/nerd-fonts/releases/download/v3.1.1/JetBrainsMono.zip)
- [思源黑体/宋体](https://github.com/adobe-fonts/source-han-serif/raw/release/Variable/OTC/SourceHanSerif-VF.ttf.ttc)
- [MiSans](https://hyperos.mi.com/font/zh/download/)

## WSL

```bash
# 安装 zsh，并设置为默认 shell
sudo apt install zsh
chsh -s /bin/zsh

# 安装 rcm，并恢复配置文件
sudo apt update
sudo apt install rcm
git clone https://github.com/zhuozhiyongde/dotfiles.git ~/.dotfiles
rcup -t wsl

# 安装必要的软件
sudo apt-get update
sudo apt-get install build-essential unzip
```

防火墙：

![wsl-defender](https://cdn.arthals.ink/bed/2024/02/wsl-defender-4f912690d544d64f165a56ddb4ecbdd5.png 'wsl-defender')

然后还需要注意要在 zsh 里手动配置 `http_proxy` `https_proxy` `all_proxy` 三个环境变量，并且要打开 Clash 的局域网连接选项，才可以实现正常的网络通信（可以通过设置 `.zshrc` 文件来实现自动配置）。

### Miniconda

```bash
mkdir -p ~/.miniconda3
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O ~/.miniconda3/miniconda.sh
bash ~/.miniconda3/miniconda.sh -b -u -p ~/.miniconda3
rm -rf ~/.miniconda3/miniconda.sh
~/.miniconda3/bin/conda init zsh
```

### SSH

先复制 .ssh 文件夹到根目录下，然后修改权限：

```bash
chmod 600 ~/.ssh/id_rda ~/.ssh/id_rsa.pub
```

如果你发现链接不上 github，但是其他的 ssh 服务器都正常，可能是你在 .ssh/config 中修改过对于 github.com 的链接代理，如下所示，请删除/更改之：

```
kex_exchange_identification: Connection closed by remote host
Connection closed by UNKNOWN port 65535
fatal: Could not read from remote repository.
```

### Git

先复制 .gnupg 文件夹到根目录下。

安装 [git-delta](https://github.com/dandavison/delta)，[Github CLI](https://github.com/cli/cli/)。

```bash
gh auth login
gh auth setup-git
```

选择 HTTPS 选项以配置 Git Credential。

## 其他

禁止管理员权限提升全局提示（**不建议开启**）
