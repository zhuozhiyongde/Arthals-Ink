---
title: 北京大学医学部课表转 Wakeup 课程表导入
publishDate: 2023-09-04 03:20:32
description: '背不完的书，上不完的课，这就是医学部'
tags:
  - Python
  - PKUHSC
language: '中文'
---

## 前言

由于 Wakeup 课程表并未支持医学部课表的在线导入，故摸此鱼，写了一个 python 脚本来完成转换，从而完成医学部课表导入到 Wakeup 课程表的功能：

## 使用方法

1. 登录 [医学部门户](http://apps.bjmu.edu.cn/)，然后选择服务大厅 - 我的课表，点选 `列表模式`，然后依次点击 `导出`、 `导出文件列表`，下载 `我的课表.xlsx`。

![](https://cdn.arthals.ink/bed/2023/09/ee23c596d3de36885a622c9747498f26.png)
![](https://cdn.arthals.ink/bed/2023/09/28c6bf6a4282411c5a2a8a8a74b8703c.png)
![](https://cdn.arthals.ink/bed/2023/09/ccc7359c62310135baea2071cc4f469d.png)

2. 下载 [Converter.py](https://cdn.arthals.ink/bed/2023/09/465ba6ca5de15ea4ffdc127459cf920d.py) ，或直接使用以下代码，将其移动至和课表文件同一目录下，然后运行即可。

```python
# -*- encoding:utf-8 -*-
#@Time		:	2022/08/30 02:01:39
#@File		:	converter.py
#@Author	:	Arthals
#@Contact	:	zhuozhiyongde@126.com
#@Software	:	Visual Studio Code

from openpyxl import Workbook, load_workbook
import os
import re

# wb = Workbook()
# ws = wb.create_sheet('mysheet', 0)
# wb.save('test.xlsx')
# wb.close()

wb = load_workbook('我的课表.xlsx')
ws = wb['sheet1']

maxRow = ws.max_row
maxCol = ws.max_column


def extractInterger(strin):
    return int(re.findall(r'\d+', strin)[0])


def extractWeek(strin):
    strin = re.sub(r"[周()]", "", strin)
    weeks = re.sub(r",", r"、", strin)
    return weeks


def extractDay(strin):
    dayDic = {
        "星期一": 1,
        "星期二": 2,
        "星期三": 3,
        "星期四": 4,
        "星期五": 5,
        "星期六": 6,
        "星期日": 7
    }
    return dayDic[strin]


courseList = []
for row in range(2, maxRow + 1):
    courseName = ws.cell(row=row, column=2).value
    courseStart = extractInterger(ws.cell(row=row, column=8).value)
    courseEnd = extractInterger(ws.cell(row=row, column=9).value)
    courseWeek = extractWeek(ws.cell(row=row, column=6).value)
    courseDay = extractDay(ws.cell(row=row, column=7).value)
    courseLocation = ws.cell(row=row, column=11).value
    courseTeacher = ws.cell(row=row, column=10).value
    courseList.append([
        courseName, courseDay, courseStart, courseEnd, courseTeacher,
        courseLocation, courseWeek
    ])

# print(courseList)

wb.close()

output = open("mySchedule.csv", "w+")
output.write("课程名称,星期,开始节数,结束节数,老师,地点,周数\n")
for course in courseList:
    for info in range(len(course)):
        course[info] = f'"{course[info]}"'
    print(course)
    output.write(",".join('%s' % id for id in (course)) + "\n")
output.close()
```

## 注意事项

- 本脚本除了内置库外，需要安装 `openpyxl` 库来读写 xlsx 文件，如果你在运行过程中报错没有此库，可以在终端 / Windows Terminal 中使用 `pip3 install openpyxl` 来安装。
- 关于如何将 csv 文件导入到 Wakeup 课程表中，可以参见 Wakeup 课程表的 [官方教程](https://www.wakeup.fun/doc/import_from_csv.html)
- 笔者发现门户上的课表与班群里的课表实际上有一些出入，并不完全相同，但我认为这是教务的问题，所以也提醒下各位记得检查一下，根据实际情况修改。
- 如果有任何问题，欢迎与笔者联系，或在本文下留言。
