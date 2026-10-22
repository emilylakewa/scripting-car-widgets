# 小组件车联 · 自动识别奥智联 / 奥捷智行

适用于 iPhone / iPad 的 Scripting 车辆小组件，当前统一版 **3.2.0**。

**一个脚本即可使用两种服务：粘贴 Token → 识别并保存 → 自动切换到对应服务。**

[添加统一版到 Scripting](https://scripting.fun/import_scripts?urls=%5B%22https%3A%2F%2Fgithub.com%2Femilylakewa%2Fscripting-car-widgets%2Ftree%2Fmain%2F%25E5%25B0%258F%25E7%25BB%2584%25E4%25BB%25B6%25E8%25BD%25A6%25E8%2581%2594%22%5D) · [下载 3.2.0 安装包](https://github.com/emilylakewa/scripting-car-widgets/releases/download/v3.2.0/carlink-3.2.0.scripting) · [查看源码](./小组件车联)

## 3.2.0 更新

- 大号 / 超大号刷新时间移到车图下方，保留在线状态与气温右侧竖排，信息卡片、地址和提醒居中。
- 小号油量圆环重新排版，车图下方内容支持自定义或隐藏。
- 控车不再预先查询车况、定位和地址，直接使用缓存设备号提交。
- 确认后优先显示“正在提交…”，完成后返回；首次点击不再有 1.2 秒无响应限制，并调整初次打开确认页的背景过渡。
- 保留各尺寸自定义设置、按钮独立确认与防重复提交；奥捷支持胎压，奥智联不显示胎压。

完整变化见 [更新记录](./CHANGELOG.md)。现有正式版同名升级，名称及正式版按钮标识保持兼容；“试用版”仍可独立保留。

## 支持的服务

| 服务 | 接口域名 | 胎压 |
| --- | --- | --- |
| 奥智联 | `kds.askdwl.com` | 不显示 |
| 奥捷智行 / 奥捷智联 | `ck.shjza.cn` | 接口返回读数时显示四轮胎压 |

## 首次配置

1. 使用上方“添加统一版到 Scripting”链接导入，或下载 `.scripting` 安装包。
2. 运行 **小组件车联**，进入 **组件设置 → 授权与地图**。
3. 粘贴自己账号的完整 Authorization 值，保留原有前缀，点击 **识别并保存 Token**。
4. 识别成功后会显示当前服务。返回车辆中心刷新车况，再在桌面选择“小组件车联”。
5. 如需高德地址解析，填写自己的高德 Web 服务 Key；可以留空。
6. 小号、中号、大号、超大号的显示内容和外观可以分别设置。

手动添加云端脚本时，请使用[小组件车联目录](https://github.com/emilylakewa/scripting-car-widgets/tree/main/%E5%B0%8F%E7%BB%84%E4%BB%B6%E8%BD%A6%E8%81%94)的 GitHub 地址；请完整导入该文件夹，不要只导入 `index.tsx`。

## 自动识别与切换

- 默认通过两个服务的只读车辆接口验证 Token，不发送任何控车指令。
- 自动识别会将填写的 Token 发送到上表中的两个服务，验证可用车辆；不会发送到其他识别服务。
- 验证成功后，服务类型与 Token 一起写入系统钥匙串。
- Token 无效、服务异常或识别不明确时保留原配置，不随意猜测平台。
- 若两个服务都接受同一 Token，或其中一个服务暂时无法连接，可在“识别方式”中选择“仅验证奥智联”或“仅验证奥捷智行”。手动选择也需要通过该服务验证。
- 控车直接使用当前 Token 和对应车况缓存中的设备号，不再额外比对旧按钮的账号或车辆快照；切换 Token 后请先刷新车况。
- 只有识别为奥捷智行时才提供胎压相关选项和显示；奥智联不显示胎压。

## 功能

- 四种尺寸独立保存设置，自定义车辆名称、车牌、车图与图片背景。
- 车图大小、字体大小、信息卡片内容、文字颜色、背景颜色及透明度可设置。
- 显示 1–4 个快捷按钮，按钮可选空白，图标与文字颜色可分别设置。
- 每个按钮独立设置二次确认，默认关闭。
- 开启后在小组件内显示确认 / 取消，确认有效期 60 秒，取消不发送车辆指令。
- 刷新时间可选择具体时间或相对时间。
- 保养、保险、年检日期和保养里程提醒。
- 车辆未锁或发动机运行时以橙色提醒。

## 确认页面

以下为设计预览，实际字体与间距以设备显示为准。

![组件内二次确认设计预览](./docs/confirmation-preview.png)

## 从 3.0.2 独立版切换

统一版的脚本名称是 **小组件车联**，采用独立的授权与显示设置。首次导入请重新填写 Token 和所需的高德 Key，并设置外观。旧版脚本不会被覆盖。

旧版 3.0.2 的独立目录和下载链接仍保留：

| 脚本 | 对应服务 | 胎压 | 云端添加 | 安装包 |
| --- | --- | --- | --- | --- |
| [小组件奥智联](./小组件奥智联) | 奥智联（`kds.askdwl.com`） | 不包含 | [添加到 Scripting](https://scripting.fun/import_scripts?urls=%5B%22https%3A%2F%2Fgithub.com%2Femilylakewa%2Fscripting-car-widgets%2Ftree%2Fmain%2F%25E5%25B0%258F%25E7%25BB%2584%25E4%25BB%25B6%25E5%25A5%25A5%25E6%2599%25BA%25E8%2581%2594%22%5D) | [下载](https://github.com/emilylakewa/scripting-car-widgets/releases/download/v3.0.2/aozhilian-3.0.2.scripting) |
| [小组件奥捷智行](./小组件奥捷智行) | 奥捷智联（`ck.shjza.cn`） | 接口返回读数时显示四轮胎压 | [添加到 Scripting](https://scripting.fun/import_scripts?urls=%5B%22https%3A%2F%2Fgithub.com%2Femilylakewa%2Fscripting-car-widgets%2Ftree%2Fmain%2F%25E5%25B0%258F%25E7%25BB%2584%25E4%25BB%25B6%25E5%25A5%25A5%25E6%258D%25B7%25E6%2599%25BA%25E8%25A1%258C%22%5D) | [下载](https://github.com/emilylakewa/scripting-car-widgets/releases/download/v3.0.2/aojie-3.0.2.scripting) |

## 运行与验证

通过 Scripting 运行，手机无需额外安装 npm 依赖。3.2.0 基于用户确认通过的试用版 3.1.11，完成 286 项模拟检查与构建，涵盖服务识别、请求路由、控车操作、确认反馈、四种尺寸和设置。模拟检查没有调用真实车辆接口，实际执行状态以车辆反馈为准。

源码与安装包不包含账号 Token、高德密钥、个人配置或车况缓存。Token 和高德 Key 由使用者自行填写，保存在其设备的系统钥匙串中。

## 参考

- [Scripting 官方脚本及导入说明](https://github.com/ScriptingApp/scripts)
- [Scripting 文档](https://scriptingapp.github.io)
