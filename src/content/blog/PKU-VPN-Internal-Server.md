---
title: PKU VPN 3 - 用校内服务器实现 PKU 内网和 Clash/Surge 兼容使用
publishDate: 2024-09-20 22:19:20
description: '我真没想到这玩意还会出第三篇'
tags:
  - Clash
  - Surge
  - PKU
language: '中文'
---

近来不知道学校 VPN 又开始抽什么风，原先还算稳定的 docker 内 openconnect 方案突然变得极不稳定，经常断连，动不动就显示：

```
ESP session established with server
ESP detected dead peer
ESP session established with server
```

这显然是无法接受的，打开一个网页都能卡半天，谁受得了啊！

于是，一个新的、稳定的方案诞生了。

新的代理链路为：

```
Clash/Surge -> tailscale -> 校内服务器/北大内网
```

我们使用 [Tailscale](https://tailscale.com/) 作为内网穿透工具，将身处内网的机器暴露出来，从而就能在任何外网机器上通过其来间接访问北大内网。

## Tailscale

注册一个 Tailscale 账号，然后在 [下载页面](https://tailscale.com/download) 安装 macOS / Windows 客户端。

安装完成后，在你的电脑上启动它。

## 校内服务器

### Tailscale

以下假设你的校内服务器是 ubuntu 系统，进入终端：

```bash
curl -fsSL https://tailscale.com/install.sh | sh # 安装 Tailscale
sudo tailscale up # 启动 Tailscale
```

这会跳出一个形如：

```
https://login.tailscale.com/a/xxxxxxxx
```

的链接，在你自己电脑上打开它，登录你的 Tailscale 账号，然后按照指引进行操作，便能在校内服务器上成功登录 Tailscale。

### 代理服务器

随后，我们需要在校内服务器上启动一个代理服务器，你可以选择 v2ray / shadowsocks 等，这里以 shadowsocks 为例。

#### Docker（推荐）

最简单的方法是使用 Docker 镜像，考虑到 Clab 位于境内，所以你可能需要先添加 Docker 镜像源：

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

然后，创建一个目录并配置 `docker-compose.yml`

```bash
mkdir -p ~/Shadowsocks
cd ~/Shadowsocks
tee docker-compose.yml <<-'EOF'
services:
  shadowsocks:
    image: shadowsocks/shadowsocks-libev
    container_name: shadowsocks
    ports:
      - "1898:8388"
      - "1898:8388/udp"
    environment:
      - METHOD=aes-256-gcm
      - PASSWORD=your_password
      - TZ=Asia/Shanghai
    restart: always
EOF
```

然后，启动容器：

```bash
docker compose up -d
```

即可完成代理服务器的部署。

检查：

```bash
docker logs -f shadowsocks
```

出现：

```
2025-07-17 10:05:55 INFO: UDP relay enabled
2025-07-17 10:05:55 INFO: initializing ciphers... aes-256-gcm
2025-07-17 10:05:55 INFO: using nameserver: 8.8.8.8,8.8.4.4
2025-07-17 10:05:55 INFO: tcp server listening at 0.0.0.0:8388
2025-07-17 10:05:55 INFO: udp server listening at 0.0.0.0:8388
```

即说明代理服务器已经成功启动。

Docker 安装的无需手动配置守护进程。

#### Pip（不推荐）

首先，安装 shadowsocks：

```bash
pip install shadowsocks
```

在某一目录（假设为 `~/.config/shadowsocks`）下创建一个 `config.json` 文件：

```json
{
  "server": "0.0.0.0",
  "server_port": 1898,
  "password": "your_password",
  "method": "aes-256-gcm",
  "timeout": 300
}
```

然后启动 `ssserver`：

```bash
ssserver -c ~/.config/shadowsocks/config.json --pid-file ~/.config/shadowsocks/PID.log --log-file ~/.config/shadowsocks/LOG.log -d start
```

即可完成代理服务器的部署。

然而，如果你的 Python 版本比较高，你可能会遇到各种 AttributeError 的问题，我就遇到了如下两个问题：

```
Traceback (most recent call last):
  File "/home/ubuntu/.miniconda3/bin/ssserver", line 5, in <module>
    from shadowsocks.server import main
  File "/home/ubuntu/.miniconda3/lib/python3.12/site-packages/shadowsocks/server.py", line 27, in <module>
    from shadowsocks import shell, daemon, eventloop, tcprelay, udprelay, \
  File "/home/ubuntu/.miniconda3/lib/python3.12/site-packages/shadowsocks/udprelay.py", line 71, in <module>
    from shadowsocks import encrypt, eventloop, lru_cache, common, shell
  File "/home/ubuntu/.miniconda3/lib/python3.12/site-packages/shadowsocks/lru_cache.py", line 34, in <module>
    class LRUCache(collections.MutableMapping):
                   ^^^^^^^^^^^^^^^^^^^^^^^^^^
AttributeError: module 'collections' has no attribute 'MutableMapping'
```

此时，我们打开报错的文件 `/home/ubuntu/.miniconda3/lib/python3.12/site-packages/shadowsocks/lru_cache.py`

修改其中的 `collections.MutableMapping` 为 `collections.abc.MutableMapping` 即可。[^1]

```
AttributeError: /home/ubuntu/.miniconda3/lib/python3.12/lib-dynload/../../libcrypto.so.3: undefined symbol: EVP_CIPHER_CTX_cleanup. Did you mean: 'EVP_CIPHER_CTX_new'?
```

此时，我们同样打开报错的文件 `openssl.py`，修改 `CIPHER_CTX_cleanup` 为 `CIPHER_CTX_reset` 即可。[^2]

### 检查代理服务器

```bash
tail -f ~/.config/shadowsocks/LOG.log
```

如果发现如下内容，则说明代理服务器已经成功启动：

```
2024-09-20 21:41:16 INFO     starting server at 0.0.0.0:1898
```

### 守护进程

你可以使用 tmux 或者 pm2 来作为守护进程避免代理的中断，以下给出一个 pm2 的配置文件示例：

```js
module.exports = {
  apps: [
    {
      name: 'Shadowsocks',
      script: 'ssserver',
      args: 'c ~/.config/shadowsocks/config.json --pid-file ~/.config/shadowsocks/PID.log --log-file ~/.config/shadowsocks/LOG.log start',
      interpreter: '/home/ubuntu/.miniconda3/bin/python',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
}
```

注意，这里有意移除了 `-d` 参数，因为我们希望用 pm2 来管理守护进程，并且通过 `pm2 ls` 来查看进程状态，而不是直接在后台运行（另起守护进程）。

然后，使用 `pm2 start` 启动守护进程即可。

## 配置本机代理

### Surge

最小配置如下：

```
[Proxy]
PKU = ss, 100.255.255.255, 1898, encrypt-method=aes-256-gcm, password=your_password

[Proxy Group]
🎓 北京大学 = select, PKU, DIRECT

[Rule]
DOMAIN-SUFFIX,pku.edu.cn,🎓 北京大学
IP-CIDR,10.0.0.0/8,🎓 北京大学
IP-CIDR,162.105.0.0/16,🎓 北京大学
IP-CIDR,115.27.0.0/16,🎓 北京大学
```

其中，`100.255.255.255` 是校内服务器在 Tailscale 上组网的内网 IP 地址。

### Clash

最小配置如下：

```
proxies:
-   cipher: aes-256-gcm
    name: PKU
    password: your_password
    port: 1898
    server: 100.255.255.255
    type: ss

proxy-groups:
-   name: 🎓 北京大学
    proxies:
    - PKU
    - DIRECT
    type: select

rules:
-   DOMAIN-SUFFIX,pku.edu.cn,🎓 北京大学
-   IP-CIDR,10.0.0.0/8,🎓 北京大学
-   IP-CIDR,162.105.0.0/16,🎓 北京大学
-   IP-CIDR,115.27.0.0/16,🎓 北京大学
```

其中，`100.255.255.255` 是校内服务器在 Tailscale 上组网的内网 IP 地址。

最后，在你的代理软件中为对应规则分流选择 PKU 节点即可。

[^1]: https://blog.megaowier.cc/p/proxy-conf/

[^2]: https://blog.csdn.net/asmartkiller/article/details/124402206
