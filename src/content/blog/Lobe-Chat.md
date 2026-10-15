---
title: macOS 下的 GPT4 最佳实践
publishDate: 2024-01-27 22:25:12
description: '好看又好用的 LobeChat，你值得拥有！'
tags:
  - GPT4
  - AppleScript
  - Docker
language: '中文'
---

谨以此文，记录自己折腾的时光。

回想起我使用 GPT 的经历，从网页的免费版 3.5 到从朋友那里代付获得 API Key 之后搓了一个公用的 ChatGPT-Demo 供朋友们使用：

https://github.com/anse-app/chatgpt-demo

GPT 4 出来以后，我又折腾了包括 ChatGPT-Next-Web 在内的多个 GPT 客户端，直到现在，折腾出来了我心目中最好用的 Lobe-Chat。

可能是因为自己搞过很久的设计，甚至现在还兼任全元光滑的美工，我自己一向对于设计有很高的要求，无论是 macOS 还是 Windows，我选用软件的哲学永远是：在功能差不多的范围内，优先选择最好看的。甚至有时候，即使一个软件的功能很强大（比如 7zip），但是我觉得它没有提供一个很好的 GUI，我也会选择另外一个软件（比如 360 压缩海外版）。这也体现在我折腾 PKU VPN 的时候，我乐此不疲的折腾了 Docker、Openconnect、FastAPI，只为了能够彻底摆脱丑陋的 Pulse Secure。

说回 GPT。我折腾的历史正如前文所述，在 GPT 3.5 API 刚出的时候，我就毅然决然地选择了好看、简洁、优雅的 ChatGPT-Demo，而不是其他的一些功能更强大的前端项目（比如 ChatGPT-Next-Web），并一直用了很久，直到 GPT 4 出来以后，我发现原作者 DDiu 并没有及时的更新 GPT 4 Vision 相关的支持，只能辗转寻找其他的项目。终于，我在一个 DDiu 的前端粉丝群里知道了 Lobe-Chat：

https://github.com/lobehub/lobe-chat

Lobe Chat 作为一个 GPT API 的客户端来讲，几乎完全没有缺点：

- 界面简洁、优雅、美观，没有任何多余的东西
- 功能齐全，支持各种 API（包括 GPT 4 Vision），支持 Docker 部署，支持 PWA
- 代码开源，配置项多样，可以自己定制
- 作者用爱发电令人敬佩，issue 总是能得到及时的修复

几番探索下来，我终于确定了这个我认为的 macOS 下 GPT 4 的最佳实践，我通过撰写各类脚本，实现了如下功能：

- 自动更新的 Lobe-Chat 服务器 Docker，可以供任意平台以网页或者 PWA 的形式访问。
- 基于 Alfred Workflow 的 macOS Lobe-Chat PWA 随时快捷键 `Option+W` 的唤起 / 隐藏，方便使用。
- 限制模型，使用成本相对可控的 GPT 4 (Vision) Preview，隐藏 GPT 4 模型，避免小白朋友不小心刷爆 API Key。

## Lobe Chat 的服务器 Docker 部署

Lobe Chat 的部署十分简单，只需要服务器上安装好 Docker，然后使用：

```bash
docker pull lobehub/lobe-chat
docker run -d --network=host -e OPENAI_API_KEY=sk-xxx -e OPENAI_PROXY_URL=https://xxx -e ACCESS_CODE="xxx" -e CUSTOM_MODELS="-gpt-4,-gpt-4-32k,-gpt-3.5-turbo-16k,gpt-3.5-turbo-1106=gpt-3.5-turbo-16k,gpt-4-1106-preview=gpt-4-turbo,gpt-4-vision-preview=gpt-4-vision" --name=Lobe-Chat --restart=always lobehub/lobe-chat
```

完整的配置项可以参见：https://github.com/lobehub/lobe-chat/wiki/Docker-Deployment.zh-CN

我的设置修改了 API Key 与配套的代理地址以降低成本（将 GPT 作为公开服务供身边朋友使用后，在官方 API 计费下，我月均付费 200 ￥，上个月叠加期末季与论文季，甚至达到了 500 ￥，所以我选择了国内的代理 API），并且只保留了 4 个我认为是必要且成本可控的模型，设置了访问密码，以及设置了 Docker 的自动重启。

这是一个示例指令，我的完整脚本配置如下，其可以实现自动更新、重启最新的 Lobe Chat 的 Docker 服务，并移除旧的镜像：

```bash
#!/bin/bash
# auto-update-gpt.sh

# 设置代理
export https_proxy=http://127.0.0.1:7890 http_proxy=http://127.0.0.1:7890 all_proxy=socks5://127.0.0.1:7890

# 拉取最新的镜像并将输出存储在变量中
output=$(docker pull lobehub/lobe-chat:latest 2>&1)

# 检查拉取命令是否成功执行
if [ $? -ne 0 ]; then
    exit 1
fi

# 检查输出中是否包含特定的字符串
echo "$output" | grep -q "Image is up to date for lobehub/lobe-chat:latest"

# 如果镜像已经是最新的，则不执行任何操作
if [ $? -eq 0 ]; then
    exit 0
fi

echo "Detected Lobe-Chat update"

# 删除旧的容器
echo "Removed: $(docker rm -f Lobe-Chat)"

# 运行新的容器
echo "Started: $(docker run -d --network=host -e OPENAI_API_KEY=sk-xxx -e OPENAI_PROXY_URL=https://xxx -e ACCESS_CODE="xxx" -e CUSTOM_MODELS="-gpt-4,-gpt-4-32k,-gpt-3.5-turbo-16k,gpt-3.5-turbo-1106=gpt-3.5-turbo-16k,gpt-4-1106-preview=gpt-4-turbo,gpt-4-vision-preview=gpt-4-vision" --name=Lobe-Chat --restart=always lobehub/lobe-chat)"

# 打印更新的时间和版本
echo "Update time: $(date)"
echo "Version: $(docker inspect lobehub/lobe-chat:latest | grep 'org.opencontainers.image.version' | awk -F'"' '{print $4}')"

# 清理不再使用的镜像
docker images | grep 'lobehub/lobe-chat' | grep -v 'latest' | awk '{print $3}' | xargs -r docker rmi > /dev/null 2>&1
echo "Removed old images."

```

配置 Crontab，每 5 分钟执行一次脚本：

```bash
*/5 * * * * /home/ubuntu/APTX4869/auto-update-gpt.sh >> /home/ubuntu/APTX4869/auto-update-gpt.log 2>&1
```

使用 1Panel 配置 Nginx 反代，感觉比较重要的相关折腾内容包括：

在国内无法访问 OpenAI 官方 API 时，设置基于 Vercel 的透明代理（由于 `vercel.app` 已经被墙，你还是需要有一个自己的域名）：

https://github.com/lobehub/lobe-chat/discussions/466

配置 Nginx 以实现流式传输：

https://github.com/lobehub/lobe-chat/discussions/531

更进一步的，配置域名解析与 SSL 证书等，就不在此处展开了。

## macOS 上的 Lobe Chat PWA

macOS 需要更新到最新的 Sonoma（macOS 14），才能使用基于 Safari 的 PWA 功能。

在先前版本上，只能使用 Chrome PWA 作为替代，缺点是打开时必须同时打开 Chrome。或者直接设置网页标签也可以。

我在 Safari PWA 的基础上，额外使用了 ~~Alfred Workflow~~ [Raycast](https://www.raycast.com/) 与 AppleScript，实现了快捷键 `Option+W` 的唤起 / 隐藏，方便使用：

```applescript
#!/usr/bin/osascript

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Lobe Chat
# @raycast.mode silent

# Optional parameters:
# @raycast.icon ./icons/lobe-chat.png
# @raycast.packageName Open/Hide Lobe Chat

# Documentation:
# @raycast.author Arthals
# @raycast.authorURL https://raycast.com/Arthals

-- AppleScript to check if LobeChat is the frontmost application
tell application "System Events"
    set frontmostProcess to first application process whose frontmost is true
    set frontmostApp to displayed name of frontmostProcess
end tell

-- Determining if LobeChat is the frontmost application
if frontmostApp is "LobeChat" then
    set isLobeChatFrontmost to true
else
    set isLobeChatFrontmost to false
end if

-- Output the status of LobeChat (whether it is frontmost or not)

-- AppleScript to hide LobeChat
if isLobeChatFrontmost then
    tell application "System Events" to set visible of process "LobeChat" to false
else
    -- AppleScript to bring LobeChat to the front
    tell application "LobeChat" to activate
end if
on "LobeChat" to activate
end if
```

这个脚本可以实现在 Lobe Chat 未打开时，打开 Lobe Chat，而在 Lobe Chat 已打开时，隐藏 Lobe Chat。我认为这十分符合我的使用习惯。

如果没有安装 Raycast，也可以使用 Automator 与快捷键绑定来实现类似的功能，具体请自行谷歌。

![preview](https://cdn.arthals.ink/bed/2024/01/preview-e758e0b30b569357a23367b01d74ce3b.png)
