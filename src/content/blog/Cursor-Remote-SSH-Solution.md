---
title: 如何彻底解决 Cursor Remote-SSH Server 下载问题
description: '当然是写个脚本啦！'
publishDate: 2025-08-17 01:02:27
tags: ['cursor', 'remote-ssh']
---

由于众所周知的原因，某些情况下国内进行下载会遇到一些问题。我尝试过如下方法，但都不太稳定，完全搞不明白这个插件的下载黑箱：

1. 启用 `remote.SSH.localServerDownload` 选项，本地下载后 scp 上去
2. 启用 `remote.SSH.useCurlAndWgetConfigurationFiles` 选项，然后在远程服务器的 `~/.wgetrc` 中配置代理

终于，在又一次被蜗牛一样的下载速度恶心到后，我谷歌了一下，最终得到了最可控、稳定的解决方案：使用脚本进行下载，然后直接解压到目标目录。

这个脚本支持如下功能：

- 支持 SSH 别名和 user@host
- 支持远程直接下载 (-r, --remote)，直接在远程服务器上进行下载，默认行为是在本地下载后 scp 上去
- 支持通过代理下载 (-p, --proxy)，默认不开启代理

假设你将其放到了某个环境变量目录后（比如我就放到了 `~/APTX4869` 目录下），重命名为 cs（cursor server），那么你就可以通过如下命令进行下载：

```bash
cs art
cs art -r
cs user@host -r
cs user@host -p http://127.0.0.1:7890
```

本脚本修改自 [这里](https://forum.cursor.com/t/how-to-download-cursor-remote-ssh-server-manually/30455/7)，感谢原作者。

```bash
#!/bin/bash

# =========================================================
# Cursor Remote Server Deployment Script (cs) - v4 (Final)
#
# 功能:
# - 支持 SSH 别名和 user@host
# - 支持远程直接下载 (-r, --remote)
# - 支持通过代理下载 (-p, --proxy)
# - 自动清理本地临时文件
# =========================================================

# ==================== 架构配置 ====================
REMOTE_ARCH="x64" # 可选 "x64" 或 "arm64"
REMOTE_OS="linux"

# ==================== 脚本函数 ====================

# 打印带颜色的消息
print_message() {
    local color=$1 message=$2
    case $color in
        "green") echo -e "\033[0;32m$message\033[0m" ;;
        "red")   echo -e "\033[0;31m$message\033[0m" ;;
        "yellow")echo -e "\033[0;33m$message\033[0m" ;;
        "blue")  echo -e "\033[0;34m$message\033[0m" ;;
        *)       echo "$message" ;;
    esac
}

# 打印用法
print_usage() {
    print_message "red" "错误：参数不正确。"
    print_message "yellow" "用法: $0 [选项] <ssh_alias | user@host>"
    print_message "yellow" "  <ssh_alias|user@host>: 目标主机 (必需)。"
    print_message "yellow" "选项:"
    print_message "yellow" "  -r, --remote:          在远程服务器上直接下载，不经过本地。"
    print_message "yellow" "  -p, --proxy <URL>:     使用代理下载 (例如 http://127.0.0.1:7890)。"
    print_message "yellow" "  -h, --help:            显示此帮助信息。"
    exit 1
}

# 检查命令是否存在
check_command() {
    if ! command -v "$1" &> /dev/null; then
        print_message "red" "错误: 命令 '$1' 未找到，请先安装。"
        exit 1
    fi
}

# 获取 Cursor 版本信息
get_cursor_version() {
    print_message "blue" "正在获取本地 Cursor 版本信息..."
    local version_info
    if ! version_info=$(cursor --version 2>/dev/null); then
        print_message "red" "错误: 'cursor' 命令执行失败。请确保 Cursor 已正确安装并位于 PATH 中。"
        exit 1
    fi
    CURSOR_VERSION=$(echo "$version_info" | sed -n '1p')
    CURSOR_COMMIT=$(echo "$version_info" | sed -n '2p')
    print_message "green" "成功获取 Cursor 信息 (版本: $CURSOR_VERSION, Commit: $CURSOR_COMMIT)"
}

# 在本地下载服务器文件
download_locally() {
    print_message "blue" "准备在本地下载 Cursor Server..."
    local PROXY_OPT=""
    if [ -n "$PROXY_URL" ]; then
        PROXY_OPT="--proxy $PROXY_URL"
        print_message "yellow" "使用本地代理: $PROXY_URL"
    fi
    
    DOWNLOAD_PATH="$LOCAL_DOWNLOAD_DIR/$DOWNLOAD_FILENAME"
    print_message "yellow" "下载链接: $DOWNLOAD_URL"
    
    if curl -L --progress-bar $PROXY_OPT "$DOWNLOAD_URL" -o "$DOWNLOAD_PATH"; then
        print_message "green" "Cursor Server 下载成功！"
    else
        print_message "red" "下载失败！"
        exit 1
    fi
}

# 上传并部署
upload_and_deploy() {
    print_message "blue" "准备上传到远程服务器: $REMOTE_TARGET"
    
    print_message "yellow" "正在上传并部署..."
    # 通过 && 将创建、上传、解压、清理命令串联执行，确保原子性
    ssh "$REMOTE_TARGET" "mkdir -p $REMOTE_SERVER_PATH" && \
    scp "$DOWNLOAD_PATH" "${REMOTE_TARGET}:${REMOTE_TMP_TAR_PATH}" && \
    ssh "$REMOTE_TARGET" "tar -xzf $REMOTE_TMP_TAR_PATH -C $REMOTE_SERVER_PATH --strip-components=1 && rm $REMOTE_TMP_TAR_PATH"
    
    if [ $? -ne 0 ]; then
        print_message "red" "上传或远程部署失败！"
        exit 1
    fi
    print_message "green" "部署成功！"
}

# 清理本地下载目录
cleanup_local() {
    print_message "blue" "清理本地临时目录..."
    if [ -d "$LOCAL_DOWNLOAD_DIR" ]; then
        rm -rf "$LOCAL_DOWNLOAD_DIR"
        print_message "green" "本地临时目录已删除: $LOCAL_DOWNLOAD_DIR"
    fi
}

# 在远程服务器上直接部署
deploy_remotely() {
    print_message "blue" "准备在远程服务器上直接下载和部署: $REMOTE_TARGET"
    
    local REMOTE_PROXY_CMD=""
    if [ -n "$PROXY_URL" ]; then
        REMOTE_PROXY_CMD="export https_proxy='${PROXY_URL}' http_proxy='${PROXY_URL}';"
        print_message "yellow" "将在远程服务器上使用代理: $PROXY_URL"
    fi

    # 核心修正: 移除了路径变量周围的引号，以确保远程 shell 能正确进行 tilde(~) 扩展
    ssh "$REMOTE_TARGET" "
        ${REMOTE_PROXY_CMD}
        set -e # 如果任何命令失败，立即退出脚本
        
        echo -e '\033[0;33m正在检查远程 wget 或 curl 命令...\033[0m'
        if ! command -v wget &> /dev/null && ! command -v curl &> /dev/null; then
            echo -e '\033[0;31m错误: 远程服务器上未找到 wget 或 curl。\033[0m'; exit 1;
        fi
        
        echo -e '\033[0;33m正在创建目录...\033[0m'
        mkdir -p $REMOTE_SERVER_PATH
        
        echo -e '\033[0;33m正在下载文件 (通过代理: ${PROXY_URL:-无})...\033[0m'
        if command -v wget &> /dev/null; then
            wget -q -O $REMOTE_TMP_TAR_PATH \"$DOWNLOAD_URL\"
        else
            curl -L -o $REMOTE_TMP_TAR_PATH \"$DOWNLOAD_URL\"
        fi
        
        echo -e '\033[0;33m正在解压文件...\033[0m'
        tar -xzf $REMOTE_TMP_TAR_PATH -C $REMOTE_SERVER_PATH --strip-components=1
        
        echo -e '\033[0;33m正在清理临时文件...\033[0m'
        rm $REMOTE_TMP_TAR_PATH
        
        echo -e '\033[0;32m远程部署成功！\033[0m'
    "
    if [ $? -ne 0 ]; then
        print_message "red" "远程部署脚本执行失败！"
        exit 1
    fi
}

# ==================== 主程序 ====================

# --- 参数解析 ---
REMOTE_DOWNLOAD=false
REMOTE_TARGET=""
PROXY_URL=""

if [ "$#" -eq 0 ]; then
    print_usage
fi

while [[ "$#" -gt 0 ]]; do
    case $1 in
        -r|--remote)
            REMOTE_DOWNLOAD=true
            shift
            ;;
        -p|--proxy)
            if [ -z "$2" ]; then
                print_message "red" "错误: -p/--proxy 选项需要一个代理地址参数。"
                print_usage
            fi
            PROXY_URL="$2"
            shift 2
            ;;
        -h|--help)
            print_usage
            ;;
        -*)
            print_message "red" "未知选项: $1"
            print_usage
            ;;
        *)
            if [ -n "$REMOTE_TARGET" ]; then
                print_message "red" "错误：只能指定一个目标主机。"
                print_usage
            fi
            REMOTE_TARGET="$1"
            shift
            ;;
    esac
done

if [ -z "$REMOTE_TARGET" ]; then
    print_usage
fi

# --- 脚本执行 ---
check_command "cursor"
check_command "ssh"
if [ "$REMOTE_DOWNLOAD" = false ]; then
    check_command "curl"
    check_command "scp"
fi

get_cursor_version

# 定义通用变量
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
LOCAL_DOWNLOAD_DIR="$SCRIPT_DIR/cursor_downloads"
DOWNLOAD_URL="https://cursor.blob.core.windows.net/remote-releases/${CURSOR_VERSION}-${CURSOR_COMMIT}/vscode-reh-${REMOTE_OS}-${REMOTE_ARCH}.tar.gz"
DOWNLOAD_FILENAME="cursor-server-${CURSOR_VERSION}-${CURSOR_COMMIT}-${REMOTE_OS}-${REMOTE_ARCH}.tar.gz"
REMOTE_SERVER_PATH="~/.cursor-server/cli/servers/Stable-${CURSOR_COMMIT}/server/"
REMOTE_TMP_TAR_PATH="~/.cursor-server/cursor-server.tar.gz"

# 确认操作
print_message "blue" "--------------------------------------------------"
print_message "blue" "目标主机: $REMOTE_TARGET"
print_message "blue" "远程路径: $REMOTE_SERVER_PATH"
if [ "$REMOTE_DOWNLOAD" = true ]; then
    print_message "blue" "模式: 远程直接下载"
else
    print_message "blue" "模式: 本地下载后上传"
fi
if [ -n "$PROXY_URL" ]; then
    print_message "blue" "代理地址: $PROXY_URL"
fi
print_message "blue" "--------------------------------------------------"
read -p "$(print_message 'yellow' '是否继续? [y/N]: ')" -r confirmation

if [[ ! $confirmation =~ ^[Yy]$ ]]; then
    print_message "yellow" "操作已取消。"
    exit 0
fi

# 根据模式执行
if [ "$REMOTE_DOWNLOAD" = true ]; then
    deploy_remotely
else
    mkdir -p "$LOCAL_DOWNLOAD_DIR"
    download_locally
    upload_and_deploy
    cleanup_local
fi

print_message "green" "脚本执行完毕！"
```
