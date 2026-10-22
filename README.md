# 奥智联 / 奥捷智行 · Scripting 车辆小组件

适用于 iPhone / iPad 的 Scripting 车辆小组件，当前版本 **3.0.2**。

| 脚本 | 对应服务 | 胎压 | 添加 |
| --- | --- | --- | --- |
| [小组件奥智联](./小组件奥智联) | 奥智联（`kds.askdwl.com`） | 不包含 | [添加到 Scripting](https://scripting.fun/import_scripts?urls=%5B%22https%3A%2F%2Fgithub.com%2Femilylakewa%2Fscripting-car-widgets%2Ftree%2Fmain%2F%25E5%25B0%258F%25E7%25BB%2584%25E4%25BB%25B6%25E5%25A5%25A5%25E6%2599%25BA%25E8%2581%2594%22%5D) |
| [小组件奥捷智行](./小组件奥捷智行) | 奥捷智联（`ck.shjza.cn`） | 接口返回读数时显示四轮胎压 | [添加到 Scripting](https://scripting.fun/import_scripts?urls=%5B%22https%3A%2F%2Fgithub.com%2Femilylakewa%2Fscripting-car-widgets%2Ftree%2Fmain%2F%25E5%25B0%258F%25E7%25BB%2584%25E4%25BB%25B6%25E5%25A5%25A5%25E6%258D%25B7%25E6%2599%25BA%25E8%25A1%258C%22%5D) |

仓库：[emilylakewa/scripting-car-widgets](https://github.com/emilylakewa/scripting-car-widgets)

## 在 Scripting 中添加

1. 在本仓库打开所需的脚本文件夹，确认能看到 `script.json`、`index.tsx` 和 `widget.tsx`。
2. 复制这个**文件夹的 GitHub 地址**。应包含 `/tree/main/` 和脚本文件夹名称。
3. 在 Scripting 选择添加云端脚本，使用该目录地址导入。
4. 也可以打开 [Scripting 官方导入页面](https://scripting.fun/import_scripts)，粘贴目录地址生成分享链接，再在 Scripting 中导入。

请选择对应的脚本目录；仓库根目录同时包含两个脚本。不要只导入 `index.tsx`，每个脚本需要目录内全部文件。

## 首次配置

1. 运行脚本，进入 **组件设置 → 授权与地图**。
2. 填写自己账号的完整 Authorization 值，保留原有前缀并保存。
3. 如需高德地址解析，填写自己的高德 Web 服务 Key；可以留空。
4. 返回车辆中心刷新车况，然后在桌面添加 Scripting 小组件并选择对应脚本。
5. 小号、中号、大号、超大号的显示内容和外观可以分别设置。

脚本内不提供账号 Token 或高德密钥。这两项由使用者自行填写，保存在其设备的系统钥匙串中。

## 功能

- 小号、中号、大号、超大号组件，按尺寸独立保存设置。
- 自定义车辆名称、车牌、车图、背景图片、车图大小及字体大小。
- 信息卡片内容、字体颜色、背景颜色及透明度可设置。
- 显示 1–4 个快捷按钮，按钮可选空白，图标与文字颜色可分别设置。
- 每个按钮独立设置二次确认，默认关闭。
- 开启后在小组件内显示确认 / 取消，确认有效期 60 秒，取消不会发送车辆指令。
- 刷新时间可选择具体时间或相对时间。
- 保养、保险、年检日期和保养里程提醒。
- 车辆未锁或发动机运行时以橙色提醒。
- 奥捷智行包含四轮胎压；奥智联不包含胎压。

## 确认页面

以下是设计预览，实际字体与间距以设备显示为准。

![组件内二次确认设计预览](./docs/confirmation-preview.png)

## 更新

更新前保留脚本名称“**小组件奥智联**”或“**小组件奥捷智行**”，以便继续使用原有的钥匙串配置。脚本文件中的版本号用于区分发布版本；再次导入或更新时请核对版本。

## 运行与验证

脚本依赖 Scripting 的原生接口，通过 Scripting 运行，无需在手机额外安装 npm 依赖。

3.0.2 已完成离线构建和模拟检查；实际接口返回值、桌面刷新时机和设备显示效果仍以真机为准。仓库没有包含账号数据、车况缓存或个人设置。

## 参考

- [Scripting 官方脚本及导入说明](https://github.com/ScriptingApp/scripts)
- [Scripting 文档](https://scriptingapp.github.io)
