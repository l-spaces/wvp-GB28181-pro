# visual — 智慧安防监控平台大屏（Vue 3 + TypeScript）

基于 `visual/bigscreen-mockup.html` 静态原型生成的 Vue 3 单页应用，样式与交互 1:1 移植。

## 技术栈

- Vue 3.5（`<script setup lang="ts">` 组合式 API）
- TypeScript 5.9（strict 模式，`vue-tsc` 类型检查）
- Vite 7
- Naive UI（暗色主题，主色对齐大屏青蓝配色；交互组件按需使用）
- ECharts（按需注册 Pie/Bar/Line + Canvas 渲染，`src/components/BaseChart.vue` 封装）
- pnpm

## 运行

```bash
pnpm install
pnpm dev        # http://localhost:5190
pnpm build      # vue-tsc --noEmit && vite build
pnpm preview
```

## 后端地址配置

编辑 `visual/.env`：

```env
VITE_API_BASE_URL=http://localhost:18080
```

业务代码从 `src/config/env.ts` 导入 `API_BASE_URL` 或 `apiUrl('/api/...')`，不要直接访问 `import.meta.env`。修改 `.env` 后需重启 dev server 才生效。

## 目录结构

```
src/
├── App.vue                  # dashboard 骨架（header / main / bottom 三段 grid）
├── main.ts
├── style.css                # 全局样式（CSS 变量、panel 等通用样式）
├── assets/                  # 摄像头快照（cam-0.jpg ~ cam-8.jpg，提取自原型 base64）
├── components/
│   ├── AppHeader.vue        # 顶栏：logo、标题、时钟、天气
│   ├── AppToast.vue         # 全局 toast 通知
│   ├── DeviceTree.vue       # 左侧设备树（branch 层级连线、离线置灰、选中）
│   ├── VideoWall.vue        # 中部视频墙（1/4/9/16 分屏、单卡全屏覆盖）
│   ├── PtzPanel.vue         # 右侧云台控制（摇杆、速度、预置位、巡航）
│   ├── LayoutPanel.vue      # 底部：分屏模式
│   └── FooterPanels.vue     # 底部：设备状态 / 告警表格 / 快捷操作
├── composables/useToast.ts  # toast 状态共享
├── data/mock.ts             # mock 数据（视频源、设备树、告警）
└── types/index.ts           # Camera / AlertItem 类型
```

## 状态联动

- `selectedCamera`（`v-model`）贯穿设备树 / 视频墙 / 云台面板三处。
- `layoutCount`（`v-model:count`）由分屏模式面板控制视频墙布局。
- 摄像头图片来自原型内嵌的 base64 快照，接真实流时可替换 `src/data/mock.ts` 的 `feeds` 数据源。
