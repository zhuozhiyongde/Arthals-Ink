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

以下所有操作在完全新创建的 Clab 实例中验证通过：

- 系统版本 Ubuntu 24.04.2 LTS
- 网卡组 pku

#### Apt

最简单的方法是直接使用 apt 安装。

首先，安装 shadowsocks-libev：

```bash
sudo apt install -y shadowsocks-libev
```

然后，修改配置文件 `/etc/shadowsocks-libev/config.json`（你可能需要向 LLM 学习一下怎么用 vim 编辑文件）：

```bash
sudo vim /etc/shadowsocks-libev/config.json
```

删掉原有的内容，重新填写：

```json
{
  "server": "0.0.0.0",
  "server_port": 1898,
  "password": "your_password",
  "method": "aes-256-gcm",
  "timeout": 300
}
```

然后重启服务：

```bash
sudo systemctl enable shadowsocks-libev
sudo systemctl restart shadowsocks-libev
sudo systemctl status shadowsocks-libev
```

如此，你应该能看到：

```sh
● shadowsocks-libev.service - Shadowsocks-libev Default Server Service
     Loaded: loaded (/usr/lib/systemd/system/shadowsocks-libev.service; enabled; preset: enabled)
     Active: active (running) since Mon 2025-07-21 23:37:13 CST; 3s ago
       Docs: man:shadowsocks-libev(8)
   Main PID: 3782896 (ss-server)
      Tasks: 1 (limit: 19138)
     Memory: 400.0K (peak: 664.0K)
        CPU: 13ms
     CGroup: /system.slice/shadowsocks-libev.service
             └─3782896 /usr/bin/ss-server -c /etc/shadowsocks-libev/config.json

Jul 21 23:37:13 arthals systemd[1]: Started shadowsocks-libev.service - Shadowsocks-libev Default Server Service.
Jul 21 23:37:13 arthals ss-server[3782896]:  2025-07-21 23:37:13 INFO: initializing ciphers... aes-256-gcm
Jul 21 23:37:13 arthals ss-server[3782896]:  2025-07-21 23:37:13 INFO: tcp server listening at 0.0.0.0:1898
```

从而启动成功！

#### Docker

还有一个比较简单的方法是使用 Docker 镜像。

首先，参照 [官方指引](https://docs.docker.com/engine/install/ubuntu/#install-using-the-repository) 安装：

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
      - DNS_ADDRS=114.114.115.115
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
2025-07-22 00:07:01 INFO: UDP relay enabled
2025-07-22 00:07:01 INFO: initializing ciphers... aes-256-gcm
2025-07-22 00:07:01 INFO: using nameserver: 114.114.115.115
2025-07-22 00:07:01 INFO: tcp server listening at 0.0.0.0:8388
2025-07-22 00:07:01 INFO: udp server listening at 0.0.0.0:8388
```

即说明代理服务器已经成功启动。

Docker 安装的无需手动配置守护进程，不过已知可能存在一些 DNS 问题导致运行失败。

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

其中，`100.255.255.255` 是校内服务器在 Tailscale 上组网的内网 IP 地址，你可以在校内服务器上通过 `tailscale ip` 命令查看，或者在本地主机使用 `tailscale status` 命令查看。

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

如果你需要在已有订阅上添加上述配置，请确保你使用的 Clash 客户端支持覆写功能，如 [Mihomo Party](https://github.com/mihomo-party-org/mihomo-party)。

然后，新建覆写：

```
+proxies:
-   cipher: aes-256-gcm
    name: PKU
    password: your_password
    port: 1898
    server: 100.255.255.255
    type: ss

+proxy-groups:
-   name: 🎓 北京大学
    proxies:
    - PKU
    - DIRECT
    type: select

+rules:
-   DOMAIN-SUFFIX,pku.edu.cn,🎓 北京大学
-   IP-CIDR,10.0.0.0/8,🎓 北京大学
-   IP-CIDR,162.105.0.0/16,🎓 北京大学
-   IP-CIDR,115.27.0.0/16,🎓 北京大学
```

并全局生效即可。

### SSH

只需修改 `~/.ssh/config` 文件，添加如下内容：

```
Host pku
    HostName 100.255.255.255 # 校内服务器在 Tailscale 上组网的内网 IP 地址
    User ubuntu # 校内服务器用户名
    IdentityFile ~/.ssh/id_rsa # 私钥文件路径
```

然后，使用 `ssh pku` 即可连接到校内服务器。