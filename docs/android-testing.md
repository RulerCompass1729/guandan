# 原生 Android 验证

目标：安装同一个签名 APK，在独立系统里从原生按钮完成亲友同桌、电脑补位与恢复。脚本控制的是人类席位，不等于四位真人或长辈试用。通用 Android API33 ARM64 不等于华为 ROM，不能承诺“100%拟真”。

旧 `mobile-test.mjs` 的 WebContext 曾绕过遮挡前台的 Chrome 通知引导，原前台可玩结论撤回；旧录像保留为反例。新的 `native-test.mjs` 仅接受 `NATIVE_APP`，截图来自 ADB 整屏，不使用浏览器控件或 DOM 点击。

## 构建 APK

Android Studio 打开 `android/`。验证使用 Android Studio 2025.3 随附 JDK21、SDK36.1、Build Tools36.1.0、AGP8.13.2 和 Gradle8.13；IDE图形界面导入未作为已验项目。其他环境先设置自己的 `JAVA_HOME` 和 Android SDK，`local.properties` 不提交。

```sh
android/gradlew -p android :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
```

Gradle 检查预编译练习规则与 TS 源指纹，源码变更后先运行 `npm ci && npm run build:android-engine`。JVM 差分测试使用 Node 生成的54个参考样例，覆盖三档电脑难度，并分别完整推进练习、重开进度、改难度后继续下一副；存储故障测试模拟先改 RAM 再返回写失败，不能用只抛异常的假存储替代。

发行密钥保留私有。环境变量 `GUANDAN_KEYSTORE`、`GUANDAN_STORE_PASSWORD`、`GUANDAN_KEY_PASSWORD` 指定签名，别名 `rulercompass1729`；随后运行 `:app:assembleRelease :app:testReleaseUnitTest :app:lintRelease`，使用 `apksigner verify --verbose --print-certs` 核签名。发布前对最终 APK 和源码分别检查秘密、个人信息和版本。

## 四个独立系统

需要已安装 Android SDK 和 API33 ARM64 Google APIs 镜像。只新建本项目的 Guandan_A 至 D，不复制用户登录快照；各有独立磁盘和 Android ID。

```sh
python3 tools/android_devices.py start
python3 tools/android_devices.py status
npm ci --prefix tools/mobile
APPIUM_HOME="$PWD/.local/appium" tools/mobile/node_modules/.bin/appium driver install uiautomator2@8.7.3
```

启动本机 Appium，实际版本3.9.0；使用独立 `APPIUM_HOME` 和各设备独立 `udid`、`systemPort`。原生测试不需要 ChromeDriver 或其自动下载权限：

```sh
APPIUM_HOME="$PWD/.local/appium" ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}" tools/mobile/node_modules/.bin/appium --address 127.0.0.1 --port 4723
```

另一个终端中：

```sh
npm ci
npm run build
npm run test:android
```

默认测试 `android/app/build/outputs/apk/release/app-release.apk`，`GUANDAN_APK` 可指定其他包。测试先复制不可变 APK，记录 SHA256；只在经过名称、PID、专用磁盘归属验证的四个客体中卸载/重装本应用。不要对个人手机或来源不明设备运行。

## 原生流程与故障

测试使用自己的回环服务3212、四条代理3310—3313和独立数据库。座位凭据由每个 APK 自己生成保存；通过帮助菜单设置各端服务、建桌、输入桌号和入座。测试能力仅允许本机只读快照，不直接提交出牌或写牌局状态。

- 先以客体健康探针确认可观测，再限制各自的网络通道；记录 A 的存储标记在其他系统不存在。只改专用客体防火墙，清理时恢复自己创建的链，不改宿主机防火墙。
- 1/2/3/4人工席位及两人同队，各经原生界面完整一副、共同结算并继续；三人默认覆盖AI3，不能声称全部座位排列都已在原生端遍历。
- 用原生层级找唯一、可见且启用的目标，按密度核对48dp及完整屏内边界，再执行系统物理触摸。服务回执、动作ID和手牌变化与每次触摸对应；大字逐张取消、紧凑展开全部和取消均检查。
- 正常四人局必须没有电脑出牌；之后单独断A通道，默认20秒后其他三端看见代打，A恢复原席并接回。另测真实服务重启保牌与单端延迟。
- 服务接受出牌后丢确认，保留待确认动作，实际强制关闭 APK；离线冷启动显示只读旧桌，恢复网络后一次重试取得同ID重复回执并恢复连接，手牌只扣一次。
- 四个有人类所有者的席位经按钮明确委托电脑，继续跨副到过A。这是托管赛程，不冒称全程四人手动比赛。
- 牌型框打开后真实退到后台，等待托管更新，再回前台检查旧框关闭；另在关闭Google服务与Chrome、切断游戏通道的客体内运行完整本机练习，验证进程重开、布局记忆及系统字号130%。这不等于华为真机验证。

`GUANDAN_NATIVE_MODES=1,2,3,4,team` 选择组合；`GUANDAN_NATIVE_EXTRAS=0` 可跳过后台牌型和离线附加检查，跳过必须单列，不能计通过。测试日志、原始回执和录屏保留 `.local/native-evidence/`；截图/UI dump在个人Pictures的dogfood目录。

难度与升级的补充入口：`node tools/native-difficulty-test.mjs`，使用同四台专用客体和独立回环服务3310。先将0.2.0包放在`.local/release/guandan-0.2.0.apk`，或用`GUANDAN_OLD_APK`指定。它检查同签名覆盖更新保留手牌/当前副/排列、三档练习及冷启、四端共享难度与服务重启、两人加两电脑完成一副及副间调整。人类出牌须等服务持久回执，按动作ID去重；本机练习须比较持久化的手牌、版本与AI推进。多行选择文字先完整解码XML，等目标矩形连续稳定后再系统点击。此入口清除的仅是经过所有权验证的专用客体内本应用数据，不应对个人设备运行。

## 判定与收尾

作者和独审均须亲看ADB整屏录像抽帧，核对真实牌面、手牌减少、布局切换和结算。文件存在、录像字节数、服务已推进、包名前台或WebContext截图都不足以单独放行。

测试只关闭自己创建的会话、代理和服务，并恢复客体字体与被临时禁用的包。模拟器由 `python3 tools/android_devices.py stop` 关闭，停止前再次核对所有权；不杀共享ADB或个人设备。实际结果见[验收记录](acceptance.md)，真机后续见[Mate 30试用](phone-check.md)。
