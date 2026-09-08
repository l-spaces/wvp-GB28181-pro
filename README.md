# 开箱即用的国标28181和部标808+1078协议视频平台

[![Build Status](https://travis-ci.org/xia-chu/ZLMediaKit.svg?branch=master)](https://travis-ci.org/xia-chu/ZLMediaKit)
[![license](http://img.shields.io/badge/license-MIT-green.svg)](https://github.com/xia-chu/ZLMediaKit/blob/master/LICENSE)
[![JAVA](https://img.shields.io/badge/language-java-red.svg)](https://en.cppreference.com/)
[![platform](https://img.shields.io/badge/platform-linux%20|%20macos%20|%20windows-blue.svg)](https://github.com/xia-chu/ZLMediaKit)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-yellow.svg)](https://github.com/xia-chu/ZLMediaKit/pulls)


WEB VIDEO PLATFORM是一个基于GB28181-2016、部标808、部标1078标准实现的开箱即用的网络视频平台，负责实现核心信令与设备管理后台部分，支持NAT穿透，支持海康、大华、宇视等品牌的IPC、NVR接入。支持国标级联，支持将不带国标功能的摄像机/直播流/直播推流转发到其他国标平台。

流媒体服务基于@夏楚 ZLMediaKit [https://github.com/ZLMediaKit/ZLMediaKit](https://github.com/ZLMediaKit/ZLMediaKit)   
播放器使用@dexter jessibuca [https://github.com/langhuihui/jessibuca/tree/v3](https://github.com/langhuihui/jessibuca/tree/v3)  
播放器使用@Numberwolf-Yanlong h265web.js [https://github.com/numberwolf/h265web.js](https://github.com/numberwolf/h265web.js)  
前端页面基于vue-admin-template构建 [https://github.com/PanJiaChen/vue-admin-template?tab=readme-ov-file](https://github.com/PanJiaChen/vue-admin-template?tab=readme-ov-file)  

# 应用场景：
- 支持浏览器无插件播放摄像头视频。
- 支持国标设备(摄像机、平台、NVR等)设备接入
- 支持rtsp, rtmp，直播设备设备接入，充分利旧。
- 支持国标级联。多平台级联。跨网视频预览。
- 支持跨网网闸平台互联。

# 功能特性
- [X] 集成web界面
- [X] 兼容性良好
- [X] 跨平台服务，一次编译多端部署， 可以同时用于x86和arm架构
- [X] 国产环境适配，支持国产服务器部署，支持使用国产数据库，达梦、金仓。
- [X] 接入设备
  - [X] 视频预览
  - [X] 支持主码流子码流切换
  - [X] 无限制接入路数，能接入多少设备只取决于你的服务器性能
  - [X] 云台控制，控制设备转向，拉近，拉远
  - [X] 预置位查询，使用与设置
  - [X] 查询NVR/IPC上的录像与播放，支持指定时间播放与下载
  - [X] 无人观看自动断流，节省流量
  - [X] 视频设备信息同步
  - [X] 离在线监控
  - [X] 支持直接输出RTSP、RTMP、HTTP-FLV、Websocket-FLV、HLS多种协议流地址
  - [X] 支持通过一个流地址直接观看摄像头，无需登录以及调用任何接口
  - [X] 支持UDP和TCP两种国标信令传输模式
  - [X] 支持UDP和TCP两种国标流传输模式
  - [X] 支持检索,通道筛选
  - [X] 支持通道子目录查询
  - [X] 支持过滤音频，防止杂音影响观看
  - [X] 支持国标网络校时
  - [X] 支持播放H264和H265
  - [X] 报警信息处理，支持向前端推送报警信息
  - [X] 语音对讲
  - [X] 支持业务分组和行政区划树自定义展示以及级联推送
  - [X] 支持订阅与通知方法
    - [X] 移动位置订阅
    - [X] 移动位置通知处理
    - [X] 报警事件订阅
    - [X] 报警事件通知处理
    - [X] 设备目录订阅
    - [X] 设备目录通知处理
  -  [X] 移动位置查询和显示
  - [X] 支持手动添加设备和给设备设置单独的密码
-  [X] 支持平台对接接入
-  [X] 支持国标级联
  - [X] 国标通道向上级联
    - [X] WEB添加上级平台
    - [X] 注册
    - [X] 心跳保活
    - [X] 通道选择
    - [X] 支持通道编号自定义, 支持每个平台使用不同的通道编号
    - [X] 通道推送
    - [X] 点播
    - [X] 云台控制
    - [X] 平台状态查询
    - [X] 平台信息查询
    - [X] 平台远程启动
    - [X] 每个级联平台可自定义的虚拟目录
    - [X] 目录订阅与通知
    - [X] 录像查看与播放
    - [X] GPS订阅与通知（直播推流）
    - [X] 语音对讲
  - [X] 支持同时级联到多个上级平台
- [X] 支持自动配置ZLM媒体服务, 减少因配置问题所出现的问题;
- [X] 支持流媒体节点集群，负载均衡。
- [X] 支持启用udp多端口模式, 提高udp模式下媒体传输性能;
- [X] 支持公网部署；
- [X] 支持wvp与zlm分开部署，提升平台并发能力
- [X] 支持拉流RTSP/RTMP，分发为各种流格式，或者推送到其他国标平台
- [X] 支持推流RTSP/RTMP，分发为各种流格式，或者推送到其他国标平台
- [X] 支持推流鉴权
- [X] 支持接口鉴权
- [X] 云端录像，推流/代理/国标视频均可以录制在云端服务器，支持预览和下载
- [X] 支持打包可执行jar和war
- [X] 支持跨域请求，支持前后端分离部署
- [X] 支持Mysql，Postgresql，金仓等数据库
- [X] 支持录制计划, 根据设定的时间对通道进行录制. 暂不支持将录制的内容转发到国标上级
- [X] 支持国标信令集群
- [X] 新增支持部标808和部标1078，大量新特性不一一列表了。支持作为网关被国标上级调用部标设备
- [X] 支持电子地图。支持展示通道位置，支持在地图上修改通道位置。支持了数据分层抽稀数据能力，百万级数据也可以轻松展示。提供标准的矢量瓦片图层，常见地图引擎都可以直接展示。
- [X] 借用zlm闭源版本新能力，可以支持录像保存至s3存储，支持minio。
- [X] **全新虚拟线程支持，极大提升了平台的并发能力，局域网压测轻松接入五万+设备，这不是服务极限，这是我的压测工具和硬件测试服务器的极限，大家可自行测试。生产环境实际性能取决于服务器性能和网络带宽。**
- [X] **支持报警订阅和报警管理，支持报警事件的展示和查询，支持报警时自动获取快照、播放录像。**


# 授权协议
本项目自有代码使用宽松的MIT协议，在保留版权信息的情况下可以自由应用于各自商用、非商业的项目。 但是本项目也零碎的使用了一些其他的开源代码，在商用的情况下请自行替代或剔除； 由于使用本项目而产生的商业纠纷或侵权行为一概与本项目及开发者无关，请自行承担法律风险。 在使用本项目代码时，也应该在授权协议中同时表明本项目依赖的第三方库的协议

# 技术支持
有偿技术支持，一对一开发辅导，闭源内容合作请发送邮件到1154621540@qq.com咨询

# 致谢
感谢作者[夏楚](https://github.com/xia-chu) 提供这么棒的开源流媒体服务框架,并在开发过程中给予支持与帮助。     
感谢作者[dexter langhuihui](https://github.com/langhuihui)和[Numberwolf-Yanlong](https://github.com/numberwolf/h265web.js) 开源这么好用的WEB播放器。      
感谢各位大佬的赞助以及对项目的指正与帮助。包括但不限于代码贡献、问题反馈、资金捐赠等各种方式的支持！ 

