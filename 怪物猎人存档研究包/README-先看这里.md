# 怪物猎人存档研究包

整理日期：2026-08-09

本目录用于存档结构、版本兼容和内容保存研究。不要直接覆盖唯一存档，也不要把异常装备、数值或任务状态带入联机。

## 已下载内容

### 01-荒野-PC

- `MHWeditor/MHW-Save-Editor-v1.0.2.zip`
- `MHWeditor/已解压/mhw-save-editor.exe`
- 来源：[this-nerd/MHWeditor](https://github.com/this-nerd/MHWeditor)
- 状态：早期测试版，不是100%完成存档；用于读取、编辑、导入角色数据。

### 03-崛起曙光-PC-Switch

- `MHR-SaveManager/MHR-SaveManager.exe`
- `MHR-SaveManager/MHR-SaveManager-v0.6.3-beta.rar`
- 来源：[keegars/MHR-SaveManager](https://github.com/keegars/MHR-SaveManager)
- 状态：备份管理器，不包含完成档。

### 02-世界冰原-PC

- `MHW.Save.Editor.exe`
- 来源：[AsteriskAmpersand/MHW-Save-Editor](https://github.com/AsteriskAmpersand/MHW-Save-Editor)
- 状态：旧版开源编辑器，可修改下载存档绑定的 Steam ID；新版本游戏使用前务必备份。

### 05-MHGU-MHXX-3DS-Switch

- `活动任务与随从猫存档/Save_Files_MHXX_MHGenU.zip`
- `活动任务与随从猫存档/已解压/`
- `MHXXSaveEditor.exe`
- 包含：
  - MHGU Switch `system` 与 `system_backup`
  - MHXX Switch `system` 与 `system_backup`
  - MHXX 3DS `system` 与 `system_backup`
  - 多个活动随从猫 `.catzx` 文件
- 来源：[FurkanM7 保存项目](https://github.com/FurkanM7/All-Event-Quests-and-Palicoes-MHXX-MHGenU)

## 统一安全流程

1. 核对游戏、平台、地区和更新版本。
2. 完全退出游戏。
3. 备份整个原存档目录，文件夹名称加日期。
4. PC 平台临时关闭对应游戏的 Steam Cloud，防止旧云存档自动覆盖。
5. 首次测试尽量离线，只读档，不立即保存。
6. 确认角色、任务、装备和 DLC 状态正常后再保存。
7. 保留原始备份，不要用测试后的文件覆盖备份。

## 《怪物猎人：荒野》PC

Steam App ID：`2246340`

常见目录：

`C:\Program Files (x86)\Steam\userdata\<Steam用户数字目录>\2246340\remote\win64_save`

使用下载好的编辑器：

1. 复制整个 `win64_save` 文件夹作为备份。
2. 运行 `01-荒野-PC\MHWeditor\已解压\mhw-save-editor.exe`。
3. 打开 `win64_save` 内的 `data.bin` 或角色槽位文件。
4. 先使用简单视图读取内容；不要一次修改大量字段。
5. 如果导入其他账号角色，需要处理 Steam ID，并清空旧角色的 `HunterId`、`HunterShortId`。
6. 保存到编辑器输出目录，再复制回游戏存档目录。
7. 离线启动验证。

警告：该编辑器属于早期测试版本。任务标记、物品数量和账号迁移都可能导致损坏，必须保留原档。

其他研究入口：

- [存档导入/导出与局部导入](https://www.nexusmods.com/monsterhunterwilds/mods/2522)
- [自动备份工具](https://www.nexusmods.com/monsterhunterwilds/mods/757)
- Nexus 文件通常需要登录后手动下载。

## 《怪物猎人：世界 / 冰原》PC

Steam App ID：`582010`

存档目录：

`C:\Program Files (x86)\Steam\userdata\<Steam用户数字目录>\582010\remote`

主存档文件通常为 `SAVEDATA1000`。

导入流程：

1. 备份原 `SAVEDATA1000`。
2. 从下方 Nexus 页面登录并下载目标档。
3. 使用已下载的 `02-世界冰原-PC\MHW.Save.Editor.exe`，或新版 [MHWI Save Editor](https://www.nexusmods.com/monsterhunterworld/mods/5995) 打开下载档。
4. 把存档内 Steam ID 改为自己的 SteamID64。
5. 保存后命名为 `SAVEDATA1000`，放入上述目录。
6. 离线启动检查人物、DLC 和任务进度。

可选存档：

- [本体100%未修改存档](https://www.nexusmods.com/monsterhunterworld/mods/1883)
- [冰原终局存档](https://www.nexusmods.com/monsterhunterworld/mods/4849)
- [分章节存档合集](https://www.nexusmods.com/monsterhunterworld/mods/2985)
- [冰原干净开局](https://www.nexusmods.com/monsterhunterworld/mods/6977)
- [全解锁空仓库新周目](https://www.nexusmods.com/monsterhunterworld/mods/6624)

这些文件因 Nexus 登录限制未自动下载，链接已集中保存。

## 《怪物猎人：崛起 / 曙光》PC

Steam App ID：`1446780`

存档目录：

`C:\Program Files (x86)\Steam\userdata\<Steam用户数字目录>\1446780\remote`

备份管理器用法：

1. 将 `MHR-SaveManager.exe` 单独放在固定目录。
2. 确保 Steam 已登录。
3. 运行管理器，它会自动定位存档并按间隔备份。
4. 备份默认进入 `Save Backup Folder`。
5. 恢复时先退出游戏，再把目标备份内容复制回 `1446780\remote`。

注意：该工具只是备份程序，不提供完成档。曙光存档跨 Steam 账号直接复制通常不能正常使用。

相关入口：

- [曙光完整档讨论](https://gbatemp.net/threads/pc-swich-monster-hunter-rise-sunbreak-complete-save-data.636034/)
- [物品及护石编辑工具](https://www.nexusmods.com/monsterhunterrise/mods/17)
- [提前进入曙光任务](https://www.nexusmods.com/monsterhunterrise/mods/3531)

## MHGU / MHXX：Switch

下载包中的 Switch 存档文件名为 `system`。

使用条件：

- 原版未改机 Switch 不能直接导入互联网下载的 `system` 文件。
- 通常需要已具备合法自制环境及 JKSV 等存档备份工具。
- 对系统进行改机、联网或修改系统分区存在封禁和损坏风险，本包不包含改机文件。

在已经具备存档管理环境的前提下：

1. 用存档工具备份自己当前的 MHGU 或 MHXX 存档。
2. 把备份复制到电脑，再额外保留一份。
3. 核对下载包中的目录：
   - `MH Gen U Switch Savedata`：国际版 MHGU
   - `MH XX Switch Savedata`：日版 MHXX
4. 不要混用国际版和日版。
5. 用下载包中的 `system` 替换目标备份里的同名文件。
6. 通过原存档工具恢复后，先离线启动检查。

随从猫：

- `.catzx` 文件可通过已下载的 `05-MHGU-MHXX-3DS-Switch\MHXXSaveEditor.exe` 导入。
- 也可使用第二台主机和本地大厅，通过游戏内方式转交。

## MHXX：3DS

下载包中的 `MH XX 3DS Savedata\system` 适用于日版 MHXX，不是欧美版 MH Generations。

使用条件：

- 普通3DS不能直接导入第三方解密存档。
- 已经具备存档导出环境时，可用 Checkpoint/JKSM 一类工具备份和恢复。

流程：

1. 先导出自己的 MHXX 存档并保留备份。
2. 核对 Title ID、地区及游戏更新版本。
3. 将下载包中的 `system` 放进对应备份目录。
4. 用原存档工具恢复。
5. 离线启动检查活动任务与角色槽位。

## PSP / PPSSPP

GameFAQs 页面提供按美版、欧版、日版分类的压缩存档：

- [怪物猎人：自由](https://gamefaqs.gamespot.com/psp/928336-monster-hunter-freedom/saves)
- [怪物猎人：自由2](https://gamefaqs.gamespot.com/psp/934395-monster-hunter-freedom-2/saves)
- [怪物猎人：自由联合](https://gamefaqs.gamespot.com/psp/943356-monster-hunter-freedom-unite/saves)
- [怪物猎人P3](https://gamefaqs.gamespot.com/psp/991479-monster-hunter-portable-3rd/saves)

GameFAQs 下载页在自动访问时会超时，因此未批量抓取，需在浏览器中点击具体条目下载。

真机 PSP：

1. USB 连接电脑。
2. 备份记忆棒的 `PSP\SAVEDATA`。
3. 解压下载档，把完整游戏存档文件夹放入 `PSP\SAVEDATA`。
4. 游戏地区必须匹配。

PPSSPP：

1. 打开 PPSSPP 的记忆棒目录。
2. 进入 `PSP\SAVEDATA`。
3. 放入解压后的完整存档文件夹。
4. 如果显示损坏，优先检查地区和版本，不要改动文件夹内部结构。

## PS2

- [初代《怪物猎人》存档合集](https://gamefaqs.gamespot.com/ps2/914914-monster-hunter/saves)

页面同时提供 CodeBreaker、Max Drive、SharkPort 2 等格式。真机需使用对应设备或转换工具；PCSX2 应先导入虚拟记忆卡，不要把下载文件直接改名为记忆卡镜像。

## PS4 / PS5 / Xbox

- 主机存档通常绑定账号并经过签名或加密。
- 官方环境通常只能恢复本账号自己的云端或 USB 备份。
- PC 存档不能直接复制到 PlayStation 或 Xbox。
- 本包没有提供绕过平台签名、账号绑定或联网校验的工具。

## 下载来源可信度

优先级：

1. GitHub 开源仓库及其 Release。
2. Nexus Mods 高使用量项目。
3. GameFAQs 长期存档库。
4. 论坛附件仅作为研究样本，使用前自行扫描。

任何可执行文件都应先使用 Windows Defender 或 VirusTotal 检查；“研究用途”不会消除存档损坏、封号或恶意文件风险。
