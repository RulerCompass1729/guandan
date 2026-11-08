# 亲友掼蛋

面向亲友的原生 Android 掼蛋，作者 **RulerCompass1729**。安装 APK 后可直接和三个电脑练习；多人连接同一服务，用八位桌号入座，空位由电脑补齐。

**当前是本机试玩和模拟器联机阶段，尚未部署国内公网游戏服务。** 发布包不预填服务器，异地联机需要组织者提供可达的 HTTPS 服务。Mate 30 实机和长辈独立试用仍待验，模拟器结果不代表华为 ROM 已通过。

## 安装与操作

在 [Releases](https://github.com/RulerCompass1729/guandan/releases) 下载签名 APK，最低 Android 8.0（API 26）。界面使用 Android 原生控件，无 WebView、浏览器入口或 Google 服务依赖。

- 点“先和电脑练一局”，无需联网。
- 牌桌右上角点“紧凑”或“大字”切换排列，应用记住选择，默认大字。紧凑排列显示各组总数，点牌组展开全部手牌。
- 点牌选择，再点取消；提示也只帮忙选牌，最后仍需点“确认出牌”。
- 暂时休息可点“代打”，回来点“接回”。关闭应用保留进度或联机座位；卸载、清除应用数据会移除凭据。
- 联机服务只设置一次：帮助 → 设置亲友联机服务。组织者也可构建时预填地址，亲友无需自行配置。

规则使用 `gd-2022-home-v1`，见[本桌规则](docs/rules.md)。支持对家合作、配牌解释、贡还与抗贡、升级过 A、断线恢复和动作去重。电脑为受限观测的规则策略，不调用外部大模型，未承诺棋力等级。陌生人匹配、商城和实时语音尚未实现。

## Android Studio 工程

用 Android Studio 打开 [android](android/)。实际构建使用 Android Studio 2025.3 自带 JDK 21、SDK 36.1、Build Tools 36.1.0、AGP 8.13.2 和 Gradle 8.13。也可使用已有 Android SDK/JDK：

```sh
cd android
./gradlew :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
```

练习通过解释器运行仓库中同份规则和策略，界面不运行 HTML。预编译规则随源码提供，Android Studio 构建无需 Node；源文件变化后 Gradle 拒绝旧资源。更新资源：

```sh
npm ci
npm run build:android-engine
node tools/native-engine-fixtures.mjs
```

发行构建使用环境变量 `GUANDAN_KEYSTORE`、`GUANDAN_STORE_PASSWORD`、`GUANDAN_KEY_PASSWORD`，签名别名 `rulercompass1729`；签名材料不得提交。`-PguandanServer=https://your-service.example` 可预填联机地址。详见 [Android 验证](docs/android-testing.md)。

## 联机服务

需要 Node.js 24 或更新版本，SQLite 将牌局和动作回执一起保存。默认只监听本机：

```sh
npm ci
npm run build
npm start
```

开发网页在 `http://127.0.0.1:3210`，用于浏览器回归；Android 安装包使用独立原生界面。模拟器设置中可填写 `http://10.0.2.2:3210`。其他 HTTP 地址会被原生客户端拒绝，异地手机须使用 HTTPS。

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `GUANDAN_HOST` | `127.0.0.1` | 服务监听地址 |
| `GUANDAN_PORT` | `3210` | 端口 |
| `GUANDAN_DATA_DIR` | `data` | 需持久保存的牌局和回执目录 |
| `GUANDAN_BOT_DELAY_MS` | `750` | 电脑操作展示间隔 |
| `GUANDAN_GRACE_MS` | `20000` | 离线后转为代打的等待时间 |

共享服务需另行部署 HTTPS 和持久存储。公开仓库和 APK 下载地址不提供游戏服务，也不能让国内手机访问开发电脑 localhost。正式运营前须按实际主体与渠道核定适用要求。

## 验证

```sh
npm run check
npm test
npm run test:simulation
npm run test:browser
```

浏览器测试首次安装 `npx playwright install chromium`，共享缓存可设 `PLAYWRIGHT_SKIP_BROWSER_GC=1`。原生验收使用四个独立 Android 实例、原生控件层级、ADB 物理点击和整屏录像，入口 `npm run test:android`；前置环境见 [Android 验证](docs/android-testing.md)。真实结果与限制见[验收记录](docs/acceptance.md)及 [Mate 30 试用清单](docs/phone-check.md)。

旧 Android 浏览器录像曾被 Chrome 通知面板遮住，而后台 DOM 仍推进；该前台可玩结论已撤回，反例保留。原生验收须亲看整屏证据，不能以网页截图或录像字节数代替。

测试数据、录屏、座位凭据、环境文件和签名材料不得提交。`GUANDAN_TEST_CONTROL` 与 `GUANDAN_TEST_SEED` 仅供回环测试；普通服务不开放测试入口，真实发牌使用加密随机源。

## License

MIT © 2026 RulerCompass1729。原生依赖许可及源码出处见 [THIRD_PARTY_NOTICES.txt](android/app/src/main/assets/THIRD_PARTY_NOTICES.txt)，应用“关于与开源许可”也可查看。
