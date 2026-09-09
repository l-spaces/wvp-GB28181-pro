import * as echarts from 'echarts/core'
import { PieChart, BarChart, LineChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent, GridComponent, TitleComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

/** ECharts 按需注册：图表 + 组件 + 渲染器，控制打包体积 */
echarts.use([
  PieChart,
  BarChart,
  LineChart,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  TitleComponent,
  CanvasRenderer,
])

export { echarts }
