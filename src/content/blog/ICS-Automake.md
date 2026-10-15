---
title: ICS-Automake
publishDate: 2023-09-26 00:52:21
description: 没用的小技巧
tags:
  - ICS
  - Python
language: '中文'
---

每次更改完代码，还要自己 make 一下，于是我开始犯懒...

以下所有操作均默认在 `datalab-handout` 文件夹下进行。推荐使用 Python 法，对于网络环境没有要求，可以在 ICS Class Machine 上正常使用。PM2 法优点是操作简单，但是 Watch 效果好像不算及时。

## Python

在 `datalab-handout` 文件夹下，新建如下 Python 脚本 `automake.py` ：

```python
#!/usr/bin/env python
# -*- encoding: utf-8 -*-
#@Author  :   Arthals
#@File    :   monitor.py
#@Time    :   2023/09/25 08:13:23
#@Contact :   zhuozhiyongde@126.com
#@Software:   Visual Studio Code

import os
import hashlib
import time


def get_file_hash(file_path):
    with open(file_path, 'rb') as f:
        content = f.read()
        file_hash = hashlib.md5(content).hexdigest()
    return file_hash


def monitor_file(file_path):
    last_file_hash = get_file_hash(file_path)

    while True:
        current_file_hash = get_file_hash(file_path)

        if current_file_hash != last_file_hash:
            print("文件内容已修改")
            os.system("make")
            last_file_hash = current_file_hash

        time.sleep(1)  # 每秒监测一次


file_path = "./bits.c"
monitor_file(file_path)

```

### 启动：

```bash
nohup python automake.py > automake.log 2>&1 &
```

### 查看日志：

```bash
tail -f automake.log
```

### 终止：

```bash
kill $(ps aux | grep automake.py | awk '{print $2}')
```

## PM2

注：以下方法在 ICS Class Machine 上**不可用**，因为其限制了对于外网的访问，无法安装 pm2，所以你只能在本地 WSL2 或者远程 Ubuntu 系统中使用。

### 安装 `pm2`：

```bash
sudo apt update
sudo apt upgrade

sudo apt install nodejs npm

npm config set registry http://registry.npm.taobao.org/ # 换源淘宝源

sudo npm install pm2 -g
```

进入 `datalab-handout` 文件夹，创建 `ecosystem.config.js`，然后输入以下配置：

```js
module.exports = {
  apps: [
    {
      name: 'ics-automake',
      script: 'make',
      watch: 'bits.c'
    }
  ]
}
```

### 启动 `pm2` 服务：

```bash
pm2 start
```

然后你就可以享受自动 `make` 了~

### 终止：

```bash
pm2 delete ics-automake
```

## 遇到报错

### 没有执行权限

执行以下命令为当前目录下的所有文件添加可执行权限：

```bash
chmod +x ./**/*
```

### libc.so.6: version 'GLIBC_2.16' not found

执行 `make` 可能会提示 libc6 版本过低（如我使用的 Ubuntu 20.04），此时你可能需要参照以下步骤：

- 参照 [Ubuntu 官方说明](https://packages.ubuntu.com/jammy/amd64/libc6/download)，修改 ` /etc/apt/sources.list` 进行换源。我选择的是清华源：

  ```bash
  deb https://mirrors.tuna.tsinghua.edu.cn/ubuntu/ jammy main
  ```

- 输入 `sudo apt-get upgrade libc6`

然后即可按照 `datalab-writeup.pdf` 中的说明，使用各种的本地评测工具，并实现自动在 `bits.c` 更新时 `make` 了。

## DataLab 踩坑

- 使用 `btest -f [fuction]` 可以对单函数进行简单检验
- 使用 `./ishow ./fshow` 看不到二进制表示，你可能需要自己转码或者上网搜相关工具
- `btest` 过了不一定 `driver.pl` 可以过，只有当 `./driver.pl ` 过了才可以满分
- 变量名要声明在函数顶部
- 要善用 debug 工具，如 `./dlc -z bits.c` 检查 ops 数目与代码规范，不要忽视任何一个 `warning/error` ，如果格式检查没过会直接 0 分
- 本文中的 ics-automake 能存在时延，可以同时使用 `pm2 logs ics-automake` 观察
- `float64_f2i` 这道题，是 uf2 在高位，uf1 在低位，即 uf2的第一位是符号位。
- 对于后面几个浮点数的题，不再有任何对于大常数、`== <= >=` 这种东西的限制，所以不必每个 mask 都自己生成一遍，或者用异或去判断等于，这样反而容易导致操作符超限。
- `float_negpwr` 最后一题 scoreboard 能卷到 1 的是打表的，不要学（？
