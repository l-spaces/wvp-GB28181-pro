export interface Camera {
  name: string
  type: '球机' | '枪机'
  ptz?: boolean
  img: string
}

export interface AlertItem {
  time: string
  type: string
  camera: string
  status: 'processing' | 'done'
}
