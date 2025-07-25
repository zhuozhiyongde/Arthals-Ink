---
title: 从零开始配置 Mac
publishDate: 2024-09-14 20:03:24
description: '环境配置什么的真是烦死辣！'
tags:
  - Mac
  - Initialize
language: '中文'
---

## 写在前面

本文所涉及的所有安装，均带有强烈的个人偏好，例如，我会在功能性接近的情况下更倾向于更好看的界面设计，而非追求最极致的性能。我偏好开源，但也通过 SetApp 订阅获得了许多付费的正版软件。

个人定位是设计师+程序员。

## App 列表

### Homebrew

[Homebrew](https://brew.sh/) 是一个 macOS 下的包管理器，可以通过它安装许多软件。

```shell
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

- git：代码版本控制
- ffmpeg：视频处理
- gpg：git 提交加密工具
- tree：树状目录
- btop：资源监控工具

```shell
brew install git ffmpeg gpg tree btop
```

- [EasyFind](https://www.devontechnologies.com/apps/freeware)：功能极其强大的文件搜索工具，HoudahSpot 的高阶替代品，搜索效果更好但是界面不如 HoudahSpot 好看。

```shell
brew install --cask easyfind
```

### SetApp

[SetApp](https://setapp.com/) 是 macOS 的一个基础软件订阅服务，它类似于 AppStore，但不同的是，你只需要为它支付一个统一的费用，便可以免费使用其中的所有软件。

- [AirBuddy](https://v2.airbuddy.app/)：AirPods 管理，提供了一个类似 iOS 的连接弹窗
- [AlDento Pro](https://apphousekitchen.com/)：macOS 电池管理，我用来锁定电池充电百分比为 75%，以延长电池寿命，有开源平替 [Battery-Toolkit](https://github.com/mhaeuser/Battery-Toolkit)，但其几乎没有 GUI，只保留了最基础的功能
- [Bartender](https://www.macbartender.com/)：菜单栏管理器，有开源平替 [Ice](https://github.com/jordanbaird/Ice)
- [CleanShotX](https://cleanshot.com/)：截图工具，优雅、接近原生的界面，便捷的修改操作
- [PixelSnap](https://getpixelsnap.com/zh/)：像素级精确截图测量工具，CleanShotX 的扩展
- [DevUtils](https://devutils.com/)：开发工具箱，现已不常用，有开源平替 [DevToysMac](https://github.com/DevToys-app/DevToysMac)
- [Downie](https://software.charliemonroe.net/downie/)：视频下载工具，偶尔用用，如果想要下载高分辨率 Bilibili 视频，推荐使用 [BBDown](https://github.com/nilaoda/BBDown)
- [Permute](https://software.charliemonroe.net/permute/)：视频、照片等文件转码
- [ForkLift](https://binarynights.com/)：FTP 文件管理器，有着接近原生的 UI 设计
- [HazeOver](https://hazeover.com/)：高亮当前窗口，同时掩蔽其他窗口，辅助集中注意力
- [HoudahSpot](https://www.houdah.com/houdahSpot/)：文件搜索，不如 EasyFind 好用，但胜在界面好看
- [MindNode](https://www.mindnode.com/)：好看好用的思维导图
- [Noizio](https://noiz.io/)：环境音、白噪音软件，界面好看
- [Paste](https://pasteapp.io/)：剪贴板管理，界面极其好看，强推，有开源平替 [Maccy](https://github.com/p0deje/Maccy)，但操作体验略逊。在 [BoringNotch](https://github.com/TheBoredTeam/boring.notch)、[Raycast](https://www.raycast.com/) 上也有类似的剪贴板管理功能。
- [Moment](https://fireball.studio/moment)：菜单栏日期计数（正数、倒数）
- [OneSwitch](https://fireball.studio/oneswitch/)：菜单栏功能快捷开关，包括屏幕常亮防止睡眠、清洁屏幕（黑屏、锁定键盘）等功能，除清洁屏幕已经不常用。有开源平替 [OnlySwitch](https://github.com/jacklandrin/OnlySwitch)
- [NotchNook](https://lo.cafe/notchnook)：构思巧妙、UI/UX 设计精致的 macOS 灵动岛，有开源平替 [BoringNotch](https://github.com/TheBoredTeam/boring.notch)
- [Squash](https://www.realmacsoftware.com/squash/)：图片压缩工具，可以批量处理，界面好看
- [Timing](https://timingapp.com)：时间追踪工具，界面好看、功能强大

### AppStore

- [Bob](https://bobtranslate.com/)：macOS 下最优秀的识图、划词翻译工具，可以配合 OpenAI 等多家服务使用，58 ￥买断制。有开源平替 [EasyDict](https://github.com/tisfeng/Easydict)，其基于 Bob 早年的开源版本 Fork 开发，近期也已经换到 Swift 编写，感觉体验已经接近 Bob。
- [Immersive Translate](https://immersivetranslate.com/)：最强的网页翻译工具，也可以配合 OpenAI 等多家服务使用
- [Cascadea](https://cascadea.app/)：Safari 插件，自定义网页样式，18 ￥买断制
- [Userscripts](https://github.com/quoid/userscripts)：开源的 Safari 插件，自定义网页脚本
- [超级右键 Pro](https://www.better365.cn/irightmousepro.html)：右键增强工具，包括拷贝路径、在各种 IDE/终端中打开等功能，68 ￥买断制
- [Sorted3](https://www.sortedapp.com/)：任务管理、日程安排，238 ￥买断制（iOS+macOS）
- [DarkReader for Safari](https://apps.apple.com/us/app/dark-reader-for-safari/id1438243180)：Safari 的 DarkReader 插件
- [Flow](https://www.flow.app/)：高颜值、功能强大的番茄钟工具，可以阻止应用、网站。168 ￥买断制或者 7 ￥/月的订阅制
- [Pure Paste](https://apps.apple.com/cn/app/pure-paste/id1611378436?mt=12)：剪贴板移除格式工具，可以移除剪贴板中的格式，保留纯文本

### Github

先放一份 Star List 在这里：[zhuozhiyongde / Mac](https://github.com/stars/zhuozhiyongde/lists/mac)

- [Rectangle](https://github.com/rxhanson/Rectangle)：窗口管理，分屏工具。出了新一代 Rectangle 2，但功能上没差，不需要升级
- [Clash Nyanpasu](https://github.com/LibNyanpasu/clash-nyanpasu)：好看的猫猫
- [Sequel Ace](https://github.com/Sequel-Ace/Sequel-Ace)：好看的 MySQL 数据库管理工具
- [IINA](https://iina.io/)：macOS 下最好的视频播放器
- [KeyCastr](https://github.com/keycastr/keycastr)：按键显示工具，录屏时使用
- [Motrix](https://motrix.app/)：下载工具，支持多线程下载
- [YesPlayMusic](https://github.com/qier222/YesPlayMusic)：基于 Vue 编写网易云音乐第三方客户端，功能更加简洁，设计优雅，移除了评论和各种杂七杂八功能。
- [PicGo](https://github.com/Molunerfinn/PicGo)：图床工具，与 Typora 配合使用
- [Local Send](https://github.com/localsend/localsend)：局域网文件传输工具
- [MessAuto](https://github.com/LeeeSe/MessAuto)：自动提取短信中的验证码并填写
- [SourceCodeSyntaxHighlight](https://github.com/sbarex/SourceCodeSyntaxHighlight)：在 Finder 中使用空格进行代码文件预览，支持多种语言高亮
- [AirBattery](https://github.com/lihaoyun6/AirBattery)：蓝牙设备电量显示，支持在程序坞、桌面小组件、菜单栏显示
- [Upscayl](https://github.com/upscayl/upscayl)：macOS 下的图片放大工具，基于 SOTA 的 AI 模型，效果不错，操作简单

### Other

- [VS Code](https://code.visualstudio.com/)：最好的 IDE（？）
- [Cursor](https://www.cursor.com/)：基于 VS Code 开源代码的闭源 IDE，主要是对 AI 的功能支持更好，可以对工作区多个文件协同处理、提问
- [Typora](https://typora.io/)：所见即所得的 Markdown 编辑器
- [Warp](https://warp.dev/)：超好用的终端，支持界面自定义，支持输入区类似文本编辑一样的体验，再也不用按半天 <kbd>←</kbd> <kbd>→</kbd> 或者 <kbd>option</kbd>了，但是在开源方面有所争议，也有开源平替 [Wave](https://www.waveterm.dev/)
- [Keka](https://www.keka.io/)：压缩解压工具
- [Raycast](https://www.raycast.com/)：macOS 下最好用的快捷启动工具，可以安装多种插件、管理剪贴板、快捷判断、启动脚本，功能强大界面优雅，Pro 订阅 20\$/月，~~但是可以通过一些方法绕过~~
- [Alfred 5](https://www.alfredapp.com/)：同 Raycast，但是我更喜欢 Raycast 的界面设计，34\$ 买断制，在脚本制作方面可能比 Raycast 更容易一些，但是因为颜值的原因已经被我抛弃
- [Arc](https://arc.net/)：macOS 下好看、新颖的浏览器，Chromium 内核，垂直标签页，多工作空间切换
- [Umbra](https://replay.software/umbra)：macOS 下缺失的黑暗模式桌面壁纸切换工具
- [DaisyDisk](https://daisydiskapp.com/)：磁盘清理工具，9.99\$ 买断制
- [Itsycal](https://www.mowglii.com/itsycal/)：菜单栏日历，简洁可爱
- [Hoppscotch](https://hoppscotch.io/)：好看的 API 调试工具
- [PDF Expert](https://pdfexpert.com/)：很好看好用的 PDF 阅读、编辑器，但 MAS 年费太贵了
- [FreeDownload Manager](https://www.freedownloadmanager.org/)：功能极其强大的多线程下载工具，只可惜是基于 QT 编写的，界面不够好看
- [EndNote](https://endnote.com/)：参考文献管理工具
- [Battery Buddy](https://batterybuddy.app/)：菜单栏电量显示，简洁可爱
- [RightFont](https://rightfontapp.com/)：字体管理工具，界面好看，59\$ 买断制
- [Mathpix](https://mathpix.com/)：数学公式截图转 LaTeX，可惜教育版免费额度已经降低至 20 张/月
- [SimpleTex](https://simpletex.cn/)：数学公式截图转 LaTeX，国产且免费额度足够多，效果比 Mathpix 略差
- [App Cleaner & Uninstaller](https://nektony.com/mac-app-cleaner)，功能强大，但是贵
- [App Cleaner](https://freemacsoft.net/appcleaner/)：好用的卸载工具，简洁免费，但是功能上略有欠缺
- [Surge](https://surge.mitsea.com/overview)：macOS 下最好的网络调试工具
- [Tailscale](https://tailscale.com/)：让你的多个设备处于同一局域网内
- [Parsec](https://parsec.app/)：远程桌面工具，效果极好，甚至可以让我在 Mac 上链接到家中 PC 打 3A 游戏
- [OneThing](https://sindresorhus.com/one-thing)：菜单栏文本显示
- [Dark Mode Buddy](https://insidegui.gumroad.com/l/darkmodebuddy)：根据环境光线明暗自动切换暗黑模式
- [Screen Studio](https://screen.studio/)：颜值很高的录屏软件，与 CleanShotX 或者其他常规录屏软件不同的是，可以动态录制键盘鼠标操作，适时放大，适合作为操作教学录屏工具。89\$ 买断制
- [Orb Stack](https://orbstack.dev/)：macOS 下颜值很高、功能强大的 Docker Desktop 替代品
- [Snap Art](https://exposure.software/snapart/)：搭配 Photoshop 使用，超多艺术风格滤镜
- [Vector Magic](https://vectormagic.com/)：位图转矢量图转换工具

### VS Code 插件

#### 主题

- Ayu
- Moegi Theme
- Catppuccin Icons for VSCode

#### 其他

仅列出知名度不高的插件

- Auto Rename Tag
- Code Runner
- CodeTime：编码时间统计
- Markdown Image：Markdown 图片插入，支持便捷的重命名
- Open In Typora
- Ruff：Python 代码检查器和格式化工具

### Raycast 插件

- Color Picker
- Gitmoji
- Kill Process
- Visual Studio Code
- Quick LaTeX
- Port Manager
- Quit Applications
- SimpleTexOCR
- Surge
- Coffee

## CLI

依旧是先放一个 Star List：[zhuozhiyongde / Tools](https://github.com/stars/zhuozhiyongde/lists/tools)。

### Zsh

我使用 [rcm](https://github.com/thoughtbot/rcm) 来管理配置文件 dotfiles, 通过 rcm 可以将配置文件备份至 `~/.dotfiles`，也可以从 `~/.dotfiles` 通过软连接的形式还原备份至 `~`。

我的配置项基本修改自 [Innei/dotfiles](https://github.com/Innei/dotfiles)，在此基础上做了一些客制化修改，不便开源，建议你基于这个仓库维护一份自己的 dotfiles。

从 dotfiles 还原备份至 `~/.dotfiles`

```zsh
rcup -t mac
```

我使用的部分 CLI 工具：

- [starship](https://github.com/starship/starship)：漂亮的终端美化工具
- [zoxide](https://github.com/ajeetdsouza/zoxide)：目录导航工具，快速切换目录
- [btop](https://github.com/aristocratos/btop)：类似 htop 的资源监控工具，信息更加详尽，且操作性比 htop 更好
- [tmux](https://github.com/tmux/tmux)：终端多窗口管理工具，但我更常用来当做守护进程工具，较 pm2 相比，可以在启动后仍然进行交互操作
- [BBDown](https://github.com/nilaoda/BBDown)：Bilibili 视频 CLI 下载工具
- [fx](https://github.com/antonmedv/fx)：终端 JSON 交互工具
- [gh](https://github.com/cli/cli#installation)：GitHub CLI
- [lobe-cli-toolbox](https://github.com/lobehub/lobe-cli-toolbox)：好用的标准化 git commit 信息生成工具，支持 AI 生成

### MiniConda

我使用 MiniConda 来管理 Python 版本、环境。

[Minoconda](https://docs.anaconda.com/free/miniconda/index.html)

```shell
mkdir -p ~/.miniconda3
curl https://repo.anaconda.com/miniconda/Miniconda3-latest-MacOSX-arm64.sh -o ~/.miniconda3/miniconda.sh
bash ~/.miniconda3/miniconda.sh -b -u -p ~/.miniconda3
rm ~/.miniconda3/miniconda.sh
```

- [ruff](https://github.com/astral-sh/ruff)：Rust 编写的 Python 代码检查器和格式化工具

### nvm / node

我使用 nvm 来对 Node.js 版本进行管理。

[nvm](https://github.com/nvm-sh/nvm)

```shell
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
```

安装完成后，换源，将如下命令追加到 `.bashrc`

```bash
export NVM_NODEJS_ORG_MIRROR=http://npm.taobao.org/mirrors/node
```

- [pm2](https://pm2.keymetrics.io/)：守护进程
- [pnpm](https://pnpm.io/)：Node 包管理器
- [nrm](https://github.com/Pana/nrm): Node 镜像源管理

```bash
npm install -g pm2 nrm pnpm
```

## 字体

- [JetBrains Mono](https://www.jetbrains.com/lp/mono/) / [Nerd Mono](https://github.com/ryanoasis/nerd-fonts/releases/download/v3.1.1/JetBrainsMono.zip)
- [思源黑体/宋体](https://github.com/adobe-fonts/source-han-serif/raw/release/Variable/OTC/SourceHanSerif-VF.ttf.ttc)
- [MiSans](https://hyperos.mi.com/font/zh/download/)
