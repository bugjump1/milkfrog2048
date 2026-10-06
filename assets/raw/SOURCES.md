# 素材来源说明（assets/raw/）

以下素材均于 2026-10-06 从公开 GitHub 仓库下载，仅作本游戏（个人项目）素材备用。
注意：奶蛙/奶龙属于他人 IP 的二创形象，音效多为游戏语音、短视频热梗的截取，
**没有明确的商用授权，若要公开上线/商用请先自行确认版权**。

## 梗背景

- 「嘎嘎滴辣虾」「噶胶塞（卡胶塞）」「厚嘞刚把嘚」「安迪」都是《拳皇》/王者荣耀
  不知火舞日语台词的空耳（「安迪」=她喊的 "Andy!"），抖音上常配在奶蛙视频里。
- 「奶蛙」是奶龙的民间二创/变异形象，代表作是捧腹大笑系列。

## 音频（audio/，10 个）

| 本地文件 | 内容 | 来源仓库 |
| --- | --- | --- |
| 嘎嘎滴辣虾-1..4.mp3 | 不知火舞空耳系列（含安迪） | [MinimumBubble11/Heihade_music](https://github.com/MinimumBubble11/Heihade_music) `ggdlx/` |
| 奶蛙大笑.mp3 | 奶蛙哈哈哈哈 | 同上 `naiwa/` |
| andy.m4a | 安迪（切好的成品） | [mikumiiku/doubao-vs-naiwa](https://github.com/mikumiiku/doubao-vs-naiwa) `assets/audio/andy.m4a` |
| shiranui-fan.m4a | 不知火舞挥扇（嘎嘎滴辣虾，截 0-2.2s） | 同上 |
| naiwa-chew.m4a | 奶蛙嚼嚼嚼（失败音效向） | 同上 |
| nailong-laugh.m4a | 奶龙笑声 | 同上 |
| hachimi.m4a | 哈基米 | 同上 |

Heihade_music 仓库还有约 259 个热梗 mp3（按拼音首字母分目录，如 `bibilabu/`、`hajimi/`、
`dagaiajiao` 等），可按需补下；doubao-vs-naiwa 的 `assets/audio/` 里还有 `*.edit.json`
记录了音频剪辑参数。

## 图片（img/，12 张）

| 本地文件 | 来源仓库 |
| --- | --- |
| 奶蛙-*.png（6 张表情：侧立/吐舌比心/托腮/气鼓鼓/疑惑/红晕托颌；微愠、双V吐舌两张按用户要求已删除） | [Nailong-Studio/wallpaper](https://github.com/Nailong-Studio/wallpaper) `emotes/` |
| 角色-普通奶蛙 / 大笑奶蛙 / 不知火蛙 / 奶蛋 / 奶鸡 / 吼啦奶蛙.png | [mikumiiku/doubao-vs-naiwa](https://github.com/mikumiiku/doubao-vs-naiwa) `assets/characters/attackers/` |

Nailong-Studio/wallpaper 自称「奶蛙艺术圣殿官方素材仓库」，共约 190 件
（`emotes/ classic/ hd/ laugh-gallery/ art/ frames/` 等目录），PNG 均带同名 txt 叙事；
doubao-vs-naiwa 的角色图带 `*.prompts.json`（AI 生成提示词），还有行走/挥扇等动作分解图。

## 下载方式备忘

本机直连 raw.githubusercontent.com 不稳定，中文文件名需百分号编码，实际可用
gh-proxy 前缀下载，例如：

```
https://gh-proxy.com/https://raw.githubusercontent.com/owner/repo/main/<encoded-path>
```
