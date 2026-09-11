import request from '@/utils/request'

// 用户通道分配API

export function getList(userId) {
  return request({
    method: 'get',
    url: '/api/user/channel/list',
    params: {
      userId: userId
    }
  })
}

export function assign(params) {
  const { userId, channelIds } = params
  return request({
    method: 'post',
    url: '/api/user/channel/assign',
    params: {
      userId: userId,
      channelIds: channelIds && channelIds.length > 0 ? channelIds.join(',') : ''
    }
  })
}
