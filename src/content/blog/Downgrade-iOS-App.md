---
title: 如何降级 iOS / iPadOS App
publishDate: 2025-11-28 22:33:33
description: '唉，商业化，原本好好的 App 就这么被塞满了广告'
tags:
  - ICS
  - PKU
language: '中文'
---

起因是发现 Wakeup 课程表更新后被塞入了一大堆冗余功能（搜题、提示登录等），本来想去官方反馈一下好歹给一个关闭的选项，结果到了 QQ 频道发现此 App 已经被售出并商业化，只能自己设法回退版本。

谷歌搜索之后，得到了如下解决方法，在此记录一下，方便以后使用。

## ipatool

首先，下载 [ipatool](https://github.com/majd/ipatool)：

```bash
brew install ipatool
```

然后，执行登录：

```bash
ipatool auth login -e <your_apple_id_email>
```

随后输入提示和 2FA 码，完成登录：

```bash
9:52PM INF email=<your_apple_id_email> name="Your Name" success=true
```

使用 search 命令搜索你想要降级的 App：

```bash
ipatool search <app_name>
```

此例中，搜索：

```bash
ipatool search Wakeup --format json
```

得到如下 JSON 结果：

```json
{
    "level": "info",
    "count": 5,
    "apps": [
        {
            "id": 1553402284,
            "bundleID": "com.wakeup.schedule",
            "name": "WakeUp课程表-超级好用的课程表",
            "version": "6.0.80",
            "price": 0
        },
        // ...
    ],
    "time": "2025-11-28T22:21:57+08:00"
}
```

很明显，第一个是我们要的，记录下来他的 `bundleID`，也即 `com.wakeup.schedule`。

使用 `list-versions` 命令列出该 App 的所有版本

```bash
ipatool list-versions -b com.wakeup.schedule --format json
```

得到结果如下：

```js
{
    "level": "info",
    "externalVersionIdentifiers": [
        "840461360",
        "842067932",
        "842408761",
        "842433648",
        "842569452",
        "842608243",
        // ...
    ],
    "bundleID": "com.wakeup.schedule",
    "success": true,
    "time": "2025-11-28T22:21:43+08:00"
}
```

你可以直接使用 `jq` 来对结果进行排序：

```bash
ipatool list-versions -b com.wakeup.schedule --format json | jq '.externalVersionIdentifi
ers | sort_by(tonumber) | reverse'
```

得到结果如下：

```js
[
  "879551069",
  "879389049",
  "878503093",
  "878288344",
  "878285945",
  "877806886",
  "877585055",
  "877474991",
  "877453456",
  "876777068",
  // ...
]
```

当前的最新版本是 6.0.40，最后一个无广告、冗余功能版本是 6.0.32。然而并不是往回数 8 个版本就是 6.0.32，我们可以通过 `get-version-metadata` 命令来获取实际版本：

```bash
ipatool get-version-metadata -b com.wakeup.schedule --external-version-id 877585055
```

得到结果：

```bash
10:36PM INF displayVersion=6.0.32 externalVersionID=877585055 releaseDate=2021-03-14T08:00:00Z success=true
```

可以看到，`877585055` 对应的版本才是 6.0.32。

找到这个 externalVersionId 之后，我们可以使用 `download` 命令下载该版本：

```bash
ipatool download -b com.wakeup.schedule --external-version-id 877585055
```

然后我们就能得到对应的 `ipa` 安装包文件 `com.wakeup.schedule_1553402284_6.0.32.ipa`。

## Apple Configurator

首先，下载 [Apple Configurator](https://apps.apple.com/cn/app/apple-configurator/id1037126344?mt=12)，安装后打开。

使用数据线连接到你的 iPhone，完成授权后直接将上一步下载得到的 IPA 文件直接拖入到你的 iPhone 中，即可完成安装。

此时，会提示你「已存在名为“WakeUp课程表”的 App」，选择「替换」即可。

![apple-configurator](https://cdn.arthals.ink/bed/2025/11/apple-configurator-ff8f0f2f9f8eb37bd40fc8868f954624.jpg)

## Reference

- [qnblackcat / Downloading older versions of iOS apps using ipatool](https://gist.github.com/qnblackcat/4f7b77f685ccda2ff4ef916a27d66107)