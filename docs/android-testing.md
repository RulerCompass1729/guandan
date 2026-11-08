# Android验证

目标是证明独立手机系统里的玩家共同参与同一桌。自动化操作的是人类玩家席位，不等于已经让四位真人试用；Mate 30实机、系统浏览器和国内网络另行验收。

## 环境

四个专用AVD使用各自用户数据、Android ID和浏览器存储。`tools/android_devices.py`只新建本项目的Guandan_A至D，不拷贝已有登录快照。默认使用Android API33 ARM64 Google APIs镜像；这不是华为ROM，也不证明无Google服务环境。

```sh
python3 tools/android_devices.py start
python3 tools/android_devices.py status
```

需要已安装Android SDK及该系统镜像。工具从`ANDROID_SDK_ROOT`读取SDK，未设置时使用macOS常见SDK目录。更换镜像前应同步核对脚本配置与浏览器驱动，不靠AVD显示名称推断系统。

安装Appium到本项目：

```sh
npm ci --prefix tools/mobile
```

使用项目专用`APPIUM_HOME`安装与当前Appium兼容的UiAutomator2驱动，然后在本机回环地址启动Appium。本次验证使用Appium 3.9.0和UiAutomator2 8.7.3：

```sh
APPIUM_HOME="$PWD/.local/appium" tools/mobile/node_modules/.bin/appium driver install uiautomator2@8.7.3
APPIUM_HOME="$PWD/.local/appium" ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}" tools/mobile/node_modules/.bin/appium --address 127.0.0.1 --port 4723 --allow-insecure uiautomator2:chromedriver_autodownload
```

驱动版本必须匹配；各设备指定独立的`udid`、`systemPort`和`chromedriverPort`。ChromeDriver也必须与Android浏览器版本匹配。自动下载驱动只对本机测试Appium启用，不能把无鉴权的Appium暴露到外网。

运行入口：

```sh
npm ci
npm run build
node tools/mobile-test.mjs
```

入口将建立本次测试专用数据库、四条独立故障代理和本机牌桌服务，使用WebDriver的查找、输入、点击操作。JavaScript执行只用于读取UI状态、创建存储隔离标记和网络探针，不直接修改游戏状态或代替出牌点击。

## 检查内容

1. 同源存储标记只在A出现；四个Android ID和数据目录不同。
2. 在专用可调试AVD内先证明健康探针可观测，再设置客体防火墙；只允许各自的游戏代理、回环和调试所需流量。验证自己的渠道可达、其他渠道不可达。脚本会先确认AVD名称，绝不修改宿主机防火墙。
3. 1人3电脑、2人2电脑、3人1电脑、4人0电脑，每种组合经实际UI打完、共同结算并进入下一副；另补两名真人经界面换到对家座位的同队对局。原生Android三人配置覆盖真人0/1/2、电脑3，其他AI位置另由浏览器套件轮换；不声称原生端已穷尽所有座位布局。四人配置的正常对局不能出现隐藏电脑代打。
4. 单独断开A的TCP通道，其余三端能继续观测；使用默认20秒等待后托管，A恢复原席并接回。另验单端延迟和真实服务进程重启。
5. 连续跨副到过A；规则与AI逻辑另有固定样例和1,000副种子回归，不用模拟器数量替代正确性。

本次专用AVD需要可调试镜像以设置客体网络规则；不能在不明设备上运行root或清理。测试可能保留浏览器、设备与数据库，结束后只关闭本项目记录的会话和进程。`python3 tools/android_devices.py stop`只针对本项目记录的模拟器。

证据保留在`.local/mobile-evidence/`，截图放个人Pictures目录的dogfood子目录，不进入Git。记录系统/浏览器/驱动版本、每步操作、服务事件、UI截图/视频和准确通过范围。证据不完整或资源不足记未验，不能记通过。
