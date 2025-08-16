---
title: Surge 过 ChatGPT Mac 认证
publishDate: 2024-05-14 11:10:38
description: '再体验一把 Hacker 的感觉'
tags:
  - MiTM
  - Surge
language: '中文'
---

## 下载

[ChatGPT_Desktop_public_latest.dmg](https://persistent.oaistatic.com/sidekick/public/ChatGPT_Desktop_public_latest.dmg)

## activator.js

在 Surge 配置文件的同目录下创建一个 `activator.js`，内容如下：

```js
'use strict'

function hackOpenAiMacApp() {
  let body = JSON.parse($response.body)
  console.log(body)
  for (let key in body.feature_gates) {
    if (body.feature_gates[key].value === false) {
      body.feature_gates[key].value = true
    }
  }
  $done({
    body: JSON.stringify(body)
  })
}

const activator = {
  chatgpt: {
    base: 'https://ab.chatgpt.com/v1/initialize',
    activate: {
      base: '*',
      func: hackOpenAiMacApp
    }
  }
}

const url = $request.url
/**
 * Determine whether the URL matches the base
 */
function isMatchBase(url, base) {
  if (Array.isArray(base)) {
    for (let item of base) {
      if (url.includes(item)) {
        return true
      }
    }
    return false
  }
  return url.includes(base)
}
/**
 * Automatic execution of the corresponding function according to the URL
 */
function launch() {
  for (let module in activator) {
    if (isMatchBase(url, activator[module].base)) {
      for (let key in activator[module]) {
        if (key === 'base') continue
        if (Array.isArray(activator[module][key])) {
          for (let custom of activator[module][key]) {
            // 检查 custom.base 是否为通配符 '*'，如果是，则匹配任何以 activator[module].base 开头的URL
            if (custom.base === '*' && url.startsWith(activator[module].base)) {
              return custom.func()
            }
            // 否则，检查精确匹配
            else if (url === `${activator[module].base}/${custom.base}`) {
              return custom.func()
            }
          }
          continue
        }
        if (typeof activator[module][key] === 'object') {
          if (activator[module][key]['base'] === '*' && url.startsWith(activator[module].base)) {
            return activator[module][key].func()
          }
          if (url === `${activator[module].base}/${activator[module][key].base}`) {
            return activator[module][key].func()
          }
        } else if (!url.includes(`${activator[module].base}/${key}`)) {
          continue
        }
        if (typeof activator[module][key] === 'function') {
          return activator[module][key]()
        }
      }
    }
  }
  console.log(`[activator] ${url} is not matched`)
  console.log(`[activator] returnDefaultResponse: ${url} - ${$request.method.toLowerCase()}`)
  $done({})
  return
}

launch()
```

## Script 块

修改 Surge 配置文件中的 `[Script]` 块，添加如下一行：

```ini
OpenAI-activate-ab.chatgpt.com = type=http-response,pattern=^https://ab.chatgpt.com/v1/initialize,requires-body=1,max-size=0,debug=1,script-path=activator.js
```

## Credit

https://twitter.com/NickADobos/status/1790172043117486212
