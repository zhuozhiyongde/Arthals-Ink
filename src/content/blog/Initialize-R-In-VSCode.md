---
title: 从零开始的 R 语言配置过程
publishDate: 2024-09-07 04:23:00
description: '受够了 R Studio 的丑陋？想要享受 AI 时代的便利？本文教你如何配置 R 语言~'
tags:
  - R
  - PKUHSC
  - Statistics
  - Study
  - Initialize
language: '中文'
---

阅前须知：在本文中，可能会不可避免的使用一些境外网站资源，如果你已经有了科学上网工具，请打开，调整到规则或者全局模式，打开 TUN 或者增强模式。

## macOS

### 安装 R

1. 访问 [R 语言网站的清华镜像源](https://mirrors.tuna.tsinghua.edu.cn/CRAN/)，选择 Download R for macOS，根据你的芯片架构，选择对应的 arm64 /x86_64 版本，下载

2. 打开下载下来的安装包，安装 R，推荐全默认配置进行

3. 找到你的 R 的位置，注意不是 Rgui，是单纯的 R，你可以在终端中输入 `where R` 来找到它，假设为：

   ```
   /usr/local/bin/r
   ```

   记录之。

4. 配置清华源镜像

   R 的用户目录在 macOS 系统下默认位于当前用户的家文件夹，所以你需要在你的家目录下创建一个名为 `.Rprofile` 的文件来进行配置，你可以在终端中输入如下指令来一键完成：

   ```bash
   echo 'options("repos" = c(CRAN="https://mirrors.tuna.tsinghua.edu.cn/CRAN/"))' >> ~/.Rprofile
   ```
   
   这样，R 在安装包时，就会默认使用清华源镜像。

### 安装 Python

1. 访问 [Miniconda](https://docs.anaconda.com/miniconda/index.html) 官网，根据你的芯片架构，选择对应的项目进行下载：

   - [Miniconda3 macOS Intel x86 64-bit pkg](https://repo.anaconda.com/miniconda/Miniconda3-latest-MacOSX-x86_64.pkg)
   - [Miniconda3 macOS Apple M1 64-bit pkg](https://repo.anaconda.com/miniconda/Miniconda3-latest-MacOSX-arm64.pkg)

2. 打开下载下来的安装包，安装 Python，如果出现询问 `Advanced Installation Options` ，勾选全部选项：

   ![win-miniconda](https://cdn.arthals.ink/bed/2024/09/win-miniconda-cae2686cd4c1190920c716835978692c.jpg)

   > 这里是 windows 的配图，macOS 我不想重新装一遍，所以就借用一下了

3. 点击安装

4. 换源为清华源：打开终端，键入如下命令，并执行：

   ```bash
   python -m pip install -i https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple --upgrade pip
   pip config set global.index-url https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple
   ```

5. 安装 radian

   ```bash
   pip install radian
   ```

6. 获取 radian 路径

   在终端输入：

   ```bash
   where radian
   ```

   得到类似如下输出：

   ```
   /Users/zhuozhiyongde/.miniconda3/bin/radian
   ```

   记录之。

7. 在你的家目录（如 `/Users/zhuozhiyongde`）下创建一个 `.radian_profile` 的文件，写入如下内容：

   ```r
   Sys.setenv(LANG = "en_US.UTF-8")
   ```

   这样，你的 radian 将会默认使用英文，从而避免报错乱码。

8. 在终端输入 `radian`，即可进入 radian 的交互式 R 终端，然后输入：

   ```r
   options("repos" = c(CRAN="https://mirrors.tuna.tsinghua.edu.cn/CRAN/"))
   install.packages("languageserver")
   install.packages("httpgd")
   ```

   安装完毕后，按住 <kbd>Ctrl</kbd> + <kbd>D</kbd>，即可退出 radian 的交互式 R 终端。

### 安装 VS Code

VSCode 是一个现代 IDE，可以通俗理解为写代码的软件，它具有可高度自定义的用户界面与丰富的插件系统，我们需要配置它来写 R 语言。

1. 访问 [Visual Studio Code](https://code.visualstudio.com/) 官网，下载 macOS 安装包

2. 打开下载下来的安装包，安装 VS Code

3. 在左侧的 `扩展（Extentions）` 选项卡中，搜索如下插件并安装：

   - Chinese (Simplified) （简体中文）：这个是中文语言包
   - R：R 语言官方的 VSCode 插件
   - R Debugger：R 语言官方的调试器
   - Ayu：好看的颜色主题
   - Moegi Theme：好看的颜色主题 + 1
   - Catppuccin Icons for VSCode：好看的文件图标主题

4. 回到 `资源管理器` 选项卡，打开一个文件夹，没有的话可以新建

5. 按住 <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd>，输入 Settings，选择 `首选项：打开用户设置`，搜索如下关键字，对 `R/R Debugger` 插件进行配置：

   1. `r.rpath.mac`：配置为之前在安装 R 哪一步的 R 路径，如

      ```
      /usr/local/bin/r
      ```

   2. `r.rterm.mac`：配置为之前在安装 Python 哪一步的 radian 路径，如：

      ```
      /Users/zhuozhiyongde/.miniconda3/bin/radian
      ```

   3. `r.bracketedPaste`：勾选

   4. `r.lsp.debug`：勾选

   5. `r.plot.defaults.colorTheme`：选择 `vscode`

   6. `r.plot.useHttpgd`：勾选

   7. `r.sessionWatcher`：勾选

   8. `r.rterm.option`：添加如下几项：

      1. `--no-save`
      2. `--no-restore`
      3. `--no-site-file`

      ![win-rterm-option](https://cdn.arthals.ink/bed/2024/09/win-rterm-option-dd9460df04c73b0f2d4308318b722af7.jpg)

至此，你就完成了 R 的所有配置。

## Windows

### 安装 R

1. 访问 [R 语言网站的清华镜像源](https://mirrors.tuna.tsinghua.edu.cn/CRAN/)，选择 Download R for Windows，选择 base，下载

2. 打开下载下来的安装包，安装 R，推荐全默认配置进行

3. 找到你的 R 的位置，注意不是 Rgui，是单纯的 R，假设为：

   ```
   C:\Program Files\R\R-4.4.1\bin\x64\R.exe
   ```

   记录之。

4. 配置清华源镜像

   R 的用户目录在 Windows 系统下默认位于当前用户的 Documents 文件夹，所以你需要在

   ```
   C:\Users\arthals\Documents\
   ```

   下创建一个名为 `.Rprofile` 的文件（创建一个 `txt` 文件，然后重命名，记得删掉 `.txt` 后缀），写入如下内容并保存：

   ```r
   options("repos" = c(CRAN="https://mirrors.tuna.tsinghua.edu.cn/CRAN/"))
   ```

   这样，R 在安装包时，就会默认使用清华源镜像。

### 安装 Python

1. 访问 [Miniconda](https://docs.anaconda.com/miniconda/index.html) 官网，找到名为 `Miniconda3 Windows 64-bit` 的链接，点击下载

2. 打开下载下来的安装包，安装 Python，注意询问 `Advanced Installation Options` 时，勾选全部选项：

   ![win-miniconda](https://cdn.arthals.ink/bed/2024/09/win-miniconda-cae2686cd4c1190920c716835978692c.jpg)

3. 点击安装

4. 换源为清华源：打开终端，键入如下命令，并执行：

   ```powershell
   python -m pip install -i https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple --upgrade pip
   pip config set global.index-url https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple
   ```

5. 安装 radian

   ```powershell
   pip install radian
   ```

6. 获取 miniconda 路径

   ```powershell
   conda info --base
   ```

   默认情况下，输出应当类似于：

   ```
   C:\Users\arthals\miniconda3
   ```

7. 获取 radian 路径

   把这个路径在后面加上 `\Scripts\radian.exe`，然后就得到了你的 radian 路径，如：

   ```
   C:\Users\arthals\miniconda3\Scripts\radian.exe
   ```

   记录之。

8. 在你的家目录（如 `C:\Users\arthals`）下创建一个 `.radian_profile` 的文件，写入如下内容：

   ```r
   Sys.setenv(LANG = "en_US.UTF-8")
   ```

   这样，你的 radian 将会默认使用英文，从而避免报错乱码。

9. 在终端输入 `radian`，即可进入 radian 的交互式 R 终端，然后输入：

   ```r
   options("repos" = c(CRAN="https://mirrors.tuna.tsinghua.edu.cn/CRAN/"))
   install.packages("languageserver")
   install.packages("httpgd")
   ```

   安装完毕后，按住 <kbd>Ctrl</kbd> + <kbd>D</kbd>，即可退出 radian 的交互式 R 终端。

### 安装 VS Code

VSCode 是一个现代 IDE，可以通俗理解为写代码的软件，它具有可高度自定义的用户界面与丰富的插件系统，我们需要配置它来写 R 语言。

1. 访问 [Visual Studio Code](https://code.visualstudio.com/) 官网，下载 Windows 安装包

2. 打开下载下来的安装包，安装 VS Code

3. 在左侧的 `扩展（Extentions）` 选项卡中，搜索如下插件并安装：

   - Chinese (Simplified) （简体中文）：这个是中文语言包
   - R：R 语言官方的 VSCode 插件
   - R Debugger：R 语言官方的调试器
   - Ayu：好看的颜色主题
   - Moegi Theme：好看的颜色主题 + 1
   - Catppuccin Icons for VSCode：好看的文件图标主题

4. 回到 `资源管理器` 选项卡，打开一个文件夹，没有的话可以新建

5. 按住 <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd>，输入 Settings，选择 `首选项：打开用户设置`，搜索如下关键字，对 `R/R Debugger` 插件进行配置：

   1. `r.rpath.windows`：配置为之前在安装 R 哪一步的 R 路径，如

      ```
      C:\Program Files\R\R-4.4.1\bin\x64\R.exe
      ```

   2. `r.rterm.windows`：配置为之前在安装 Python 哪一步的 radian 路径，如：

      ```
      C:\Users\arthals\miniconda3\Scripts\radian.exe
      ```

   3. `r.bracketedPaste`：勾选

   4. `r.lsp.debug`：勾选

   5. `r.plot.defaults.colorTheme`：选择 `vscode`

   6. `r.plot.useHttpgd`：勾选

   7. `r.sessionWatcher`：勾选

   8. `r.rterm.option`：添加如下几项：

      1. `--no-save`
      2. `--no-restore`
      3. `--no-site-file`

      ![win-rterm-option](https://cdn.arthals.ink/bed/2024/09/win-rterm-option-dd9460df04c73b0f2d4308318b722af7.jpg)

至此，你就完成了 R 的所有配置。

## 使用 R

常用的使用方式有这几种：

1. 光标停在某行，按下 <kbd>Ctrl</kbd> / <kbd>Cmd</kbd> + <kbd>Enter</kbd> 即可逐行运行
2. 选中多行，再按下 <kbd>Ctrl</kbd> / <kbd>Cmd</kbd> + <kbd>Enter</kbd> 即可多行运行
3. 右键点击右上角的运行按钮，选择 `Run source`，即可运行当前文件

   ![win-run-source](https://cdn.arthals.ink/bed/2024/09/win-run-source-ece96c11e6a4d50a60ffe4cca7a5cd32.jpg)

## 使用 Copilot

Copilot 是一个 AI 辅助编程工具，可以帮助你快速生成代码。

白嫖 Copilot 需要完成学生认证，这里不做展开，你可以自行搜索相关教程。这里简要提示一下可能有用的技巧：

- 保证人的 GPS 位置在校园附近
- 保证你的邮箱是学校邮箱
- 拍摄照片时，在学生卡旁边附上手写的英文版、含有 `Valid Until: MM / YYYY` 的纸张

当你完成了学生认证之后，只需在 VSCode 中登录，然后安装 `GitHub Copilot` 插件，即可使用 Copilot，实现 AI 代码自动补全。

## 使用 ChatGPT

请参见我发的树洞 6561773。
