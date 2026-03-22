---
title: mx-space + Shiro：如纸一般纯净的新博客
publishDate: 2023-09-06 10:52:22
description: '受不了正则解析 Markdown，已润'
tags:
  - React
  - Next.js
  - Docker
language: '中文'
---
## 壹・为什么要使用 Shiro

其实最开始基于 WordPress + Argon 的博客系统可以正常运作，但前段时间发现因为没有设置缓存插件的原因，我的博客甚至扛不起友人的一次全国测速，当请求数只要高到几十 QPS，即可导致 MySQL 的锁表、高 CPU 和高内存占用，进而导致服务器所有服务均不可用，必须需要强制重启才可以恢复，这无疑是十分离谱的。再加上对于 PHP 的完全不了解，所以我就动了迁移博客的想法。

由于自己人菜瘾大还颜控，所以我为新的博客框架设立了如下要求：

-   足够好看
-   可定制，足够好玩
-   使用的技术栈最好是比较新的，如果能和我的已有技术栈重叠就更好了（方便魔改 hhh）

最开始我盯上了 [xLog](https://xlog.app/)，它足够好看、好玩，内置的 Markdown 编辑器也很合我的口味，但好不容易折腾完了之后才发现其主站域名在国内已经阻断，且 IPFS 系统导致媒体在国内也不可用，更不必提其每次操作都需要 MetaMask 发起区块链操作这种让我感觉很奇怪的问题，所以在草草同步完几篇现有博文后便又搁置了。

我本想在这个暑假尝试移除 xLog 中和区块链相关的东西并尝试私有化部署，但几经搜索都没找到很好的教程，CONTRIBUTING 看了也感觉帮助不大，所以还是不了了之。

正当我心灰意冷准备还是老老实实回到 WordPress 的怀抱时，我无意中看到了 Innei 大佬在 xLog 上发的文章，并顺藤摸瓜找到了他的主站，从而得知了 mx-space + Shiro 这套系统，进过了解后顿时感到其完美符合我的需求，故开始了迁移的尝试。

## 贰・踩坑

### 后端 mx-space

[官方网站](https://mx-space.js.org/)

[仓库地址](https://github.com/mx-space/core)

采用 Docker 部署，部署过程中按照文档操作即可。我此前从未用过 Docker，属于是纯现学，顺带捡起了之前下过但没有用过的 [OrbStack](https://orbstack.dev/)（一个更好看的 Docker Desktop 的替代品）

![OrbStack](https://orbstack.dev/_next/image?url=%2Fimg%2Fhero.png&w=1080&q=75)

按照 [社区教程](https://blog.cnmobile.link/posts/tutorial/deploy_mix-space_locally)，在腾讯云轻量服务器上通过宝塔面板部署后端，并配置反向代理。

![Cleanshot-2023-09-06-at-18.12.41](https://cdn.arthals.ink/bed/2023/09/2c042741ff62bfee85ee4caf1ff09cd3.png)

先申请 SSL 证书，选择 Let's Encrypt 证书即可。

然后修改配置文件，添加反向代理配置（不要使用宝塔面板自带的反向代理配置，因为其会导致 WebSocket 建立实时状态链接不可用）。

```nginx
server
{
    listen 80;
    listen 443 ssl http2;
    server_name api.arthals.ink;
    index index.php index.html index.htm default.php default.htm default.html;
    root /www/wwwroot/api.arthals.ink;


    #SSL-START SSL相关配置，请勿删除或修改下一行带注释的404规则

    #SSL配置隐去

    #SSL-END


    location ~ /purge(/.*) {
        proxy_cache_purge cache_one $host$1$is_args$args;
        #access_log  /www/wwwlogs/api.arthals.ink_purge_cache.log;
    }

    #提升申请SSL证书所需目录的匹配规则到反向代理前，可以保证自动续签SSL证书正常运行
    #一键申请SSL证书验证目录相关设置
    location ~ \.well-known{
        root /www/wwwroot/api.arthals.ink;
        allow all;
    }

    #禁止在证书验证目录放入敏感文件
    if ( $uri ~ "^/\.well-known/.*\.(php|jsp|py|js|css|lua|ts|go|zip|tar\.gz|rar|7z|sql|bak)$" ) {
        return 403;
    }

    #以下为核心配置项，设置反向代理，并设置 Upgrade / Connection 头以启用 WebSocket 链接
    location ~ / {
         proxy_pass http://127.0.0.1:2333;
         proxy_read_timeout 300s;
         proxy_send_timeout 300s;
         #proxy_set_header Host $host;
         proxy_set_header X-Real-IP $remote_addr;
         proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
         proxy_http_version 1.1;
         proxy_set_header Upgrade $http_upgrade;
         proxy_set_header Connection $connection_upgrade;
    }
    #禁止访问的文件或目录
    location ~ ^/(\.user.ini|\.htaccess|\.git|\.svn|\.project|LICENSE|README.md)
    {
        return 404;
    }

    access_log  /www/wwwlogs/api.arthals.ink.log;
    error_log  /www/wwwlogs/api.arthals.ink.error.log;
}
```

进入后台 - 设定 - 系统 - 网站设置，按照如下配置设定：

![Cleanshot-2023-09-06-at-18.23.46](https://cdn.arthals.ink/bed/2023/09/f855435c228e9127bba60bd76b64e4fb.png)

> 前端地址：https://arthals.ink
>
> 管理后台地址：https://api.arthals.ink/qaqdmin
>
> API 地址：https://api.arthals.ink/api/v2
>
> Gateway 地址：https://api.arthals.ink

至此，后端部分完成配置。

### 前端 Shiro

参考：

-   [官方教程](https://mx-space.js.org/themes/shiro)
-   [社区教程](https://blog.cnmobile.link/posts/tutorial/deploy_mix-space_locally)

基本上按照官方教材配置即可，注意不要使用 Docker 部署，就正常的 `pnpm i`、`pnpm build` 编译即可，Docker 部署经尝试存在问题。

注意，如果你的机子配置很低（像我一样，2H4G 的最低配置腾讯云轻量服务器），你可能无法在服务器上编译，这时你需要首先在本地编译后，使用 SFTP 推送 `.next` 文件夹到服务器。

特别地，你可能会发现 `.next` 文件夹很大（~1G），导致 SFTP 上传很慢，对此你可以通过将实际运行并不需要但却占有极大体积（~700MB）的 `.next/cache` 文件夹加入到你的 `.vscode/sftp.json` 的 `ignore` 配置项里，从而忽略它，实现加速上传。

服务器进入包含 `.next` 的文件后，通过 pm2 启动服务：

```js
// ecosystem.config.js
module.exports = {
    apps: [
        {
            name: 'Shiro',
            script: 'npx next start -p 2323',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '180M',
            env: {
                NODE_ENV: 'production',
            },
        },
    ],
};
```

↑ 此为 pm2 配置文件，请放到 `.next` 同一文件夹下。

```text
.
├── ecosystem.config.js
└── .next
```

然后运行 `pm2 start` 即可启动服务并加入守护进程。

你可以使用 `pm2 list` 、`pm2 monit` 来监视运行状况。

注意对于配置中使用的后端配置 json，前端并非动态绑定的，而是在打包的时候单次请求，所以如果你有任何对于 shiro theme config 的修改，都需要重新编译（以及使用 pm2 重启该服务）。

最后，按照后端的同样配置方式，建站并设置 2323 端口的反向代理即可。

## 叁・不足

以下为具体使用过程中遇见的问题 / 想要改进的地方，正在抓紧学习 React / Next.js 中，希望能尽快提请 PR 来帮助 Innei 大佬解决 / 改进吧。

-   不支持定时发布、草稿保存
-   ~~Markdown 不支持 LaTeX 渲染，支持，但需要在 \$ \$ 和内容间额外加入空格，且不支持块级语法：~~ 都已完全支持。

    ```latex
     $ \lim _{R \rightarrow+\infty} I(R)=0 $
    ```

    $ \lim \_{R \rightarrow+\infty} I(R)=0 $

-   ~~希望 Markdown 支持类似 xLog 一样的实时预览~~，支持，但实测编辑器仍存在 Bug。
-   Github 代码块在网络不佳时无法正常显示
-   ~~后台有新版本的时候的升级提示无法永久关闭（甚至不关闭的话会堆叠）~~ mx-admin 的最新版已解决。

## 肆・更新

### 更新前端

如果你有本地更改，你可以参照下述方法更新：

```bash
# 进入工作目录
cd /home/ubuntu/Mx-Space/shiro
# 设置代理
export https_proxy=http://127.0.0.1:7890 http_proxy=http://127.0.0.1:7890 all_proxy=socks5://127.0.0.1:7890
# 更新
git fetch origin
git merge origin/main --no-gpg-sign -m "merge: sync with latest version"
# git push
pm2 stop Shiro
# 重新安装依赖，打包，部署
nrm use taobao
pnpm i
pnpm build && pnpm prod:pm2
```

注意，Next.js 打包所需内存较大，如果你的内存不够（≤ 4 GB），请不要尝试在服务端打包，而是在本地打包后上传 `.next` 文件。另外 git merge 有冲突的时候，你可能需要手动合并。

如果你没有本地更改：

```bash
# 进入工作目录
cd /home/ubuntu/Mx-Space/shiro
# 设置代理
export https_proxy=http://127.0.0.1:7890 http_proxy=http://127.0.0.1:7890 all_proxy=socks5://127.0.0.1:7890
# 更新
git pull
# git push
pm2 stop Shiro
# 重新安装依赖，打包，部署
nrm use taobao
pnpm i
pnpm build && pnpm prod:pm2
```

如果你有本地更改：

```bash
#!/usr/bin/zsh
cd /home/ubuntu/Mx-Space/shiro
export https_proxy=http://127.0.0.1:7890 http_proxy=http://127.0.0.1:7890 all_proxy=socks5://127.0.0.1:7890
git fetch origin

# 检查 package.json 是否有变化
PACKAGE_CHANGED=$(git diff origin/main...HEAD -- package.json)

# 尝试 rebase
git rebase origin/main --no-gpg-sign  || {
    echo "Rebase conflict detected, aborting script."
    exit 1
}

# 如果 package.json 有变化，则重新安装依赖
if [[ $PACKAGE_CHANGED ]]; then
    echo "package.json has changed. Reinstalling dependencies."
    rm -rf ./node_modules/
    pnpm i
else
    echo "package.json has not changed. Skipping dependency installation."
fi

pnpm build && pm2 stop Shiro && pm2 start Shiro

git push -f
```

### 更新后端

#### 更新 core，同时更新捆绑的 admin

```bash
docker pull innei/mx-server:latest
# 重新运行
docker compose up -d
# 可选，移除旧的镜像
docker images | grep 'innei/mx-server' | grep -v 'latest' | awk '{print $3}' | xargs docker rmi
```

注意，这只会更新最新的 latest tag 版本，如果你想要体验 alpha 版本，请自行更改 `docker pull` 指令至对应的 tag 版本。

#### 单独更新 admin

mx-admin 有时候会出现 admin 的跨小版本升级，此时无法通过更新 core 的 docker 版本更新，你可以参照下述方式更新：

首先，前往 [Release](https://github.com/mx-space/mx-admin/releases/) 页面，找到最新的版本，复制 `release.zip` 的下载链接，然后：

```bash
# 在容器外部下载 release.zip（也可以直接在容器内部下载，如果网络通畅的话）
wget https://github.com/mx-space/mx-admin/releases/download/v3.38.1/release.zip
# 如果是在容器外部下载，将 release.zip 上传到容器内部
docker cp release.zip mx-server:/app
# 进入容器
docker exec -it mx-server /bin/bash
# 进入工作目录
cd /app
# 解压 release.zip，解压出来的应该是 dist 文件夹
unzip release.zip
# 删除旧的 admin 文件夹
rm -rf /app/admin
# 移动新的 admin 文件夹
mv /app/dist /app/admin
```

如此，即可完成 mx-admin 的手动更新。
