import { assign, getList } from '@/api/userChannel'

const actions = {
  getList({ commit }, userId) {
    return new Promise((resolve, reject) => {
      getList(userId).then(response => {
        const { data } = response
        resolve(data)
      }).catch(error => {
        reject(error)
      })
    })
  },
  assign({ commit }, params) {
    return new Promise((resolve, reject) => {
      assign(params).then(response => {
        const { data } = response
        resolve(data)
      }).catch(error => {
        reject(error)
      })
    })
  }
}

export default {
  namespaced: true,
  actions
}
