<template>
  <div id="assignDevice" v-loading="loading">
    <el-dialog
      v-el-drag-dialog
      title="分配设备"
      width="40%"
      top="2rem"
      :close-on-click-modal="false"
      :visible.sync="showDialog"
      :destroy-on-close="true"
      @close="close()"
    >
      <div style="margin-right: 20px;">
        <el-tree
          ref="channelTree"
          :data="treeData"
          :props="treeProps"
          node-key="key"
          show-checkbox
          :expand-on-click-node="true"
          default-expand-all
        >
          <span slot-scope="{ node, data }" class="custom-tree-node">
            <span v-if="data.type === 'device'">
              <i class="el-icon-s-platform" style="margin-left: 5px; color: #409EFF;"></i>{{ node.label }}
              <el-tag v-if="data.channelCount !== null" size="mini" style="margin-left: 5px;">{{ data.channelCount }}</el-tag>
            </span>
            <span v-else>{{ node.label }}</span>
          </span>
        </el-tree>
        <div style="margin-top: 10px; text-align: right;">
          <el-button type="primary" :loading="submitLoading" @click="onSubmit">保存</el-button>
          <el-button @click="close">取消</el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script>

import elDragDialog from '@/directive/el-drag-dialog'

export default {
  name: 'AssignDevice',
  directives: { elDragDialog },
  props: {},
  data() {
    return {
      userId: null,
      treeData: [],
      treeProps: {
        label: 'label',
        isLeaf: 'isLeaf'
      },
      loadedChannelIds: [],
      loading: false,
      submitLoading: false,
      listChangeCallback: null,
      showDialog: false
    }
  },
  methods: {
    openDialog: function(row, callback) {
      this.userId = row.id
      this.listChangeCallback = callback
      this.showDialog = true
      this.initData()
    },
    initData: function() {
      this.loading = true
      // 拉取全部设备
      this.$store.dispatch('device/queryDevices', {
        page: 1,
        count: 1000000
      }).then(data => {
        this.treeData = []
        data.list.forEach(device => {
          this.treeData.push({
            key: 'device_' + device.id,
            label: device.name ? (device.name + '(' + device.deviceId + ')') : device.deviceId,
            type: 'device',
            deviceId: device.deviceId,
            isLeaf: false,
            channelCount: null
          })
        })
        // 拉取该用户已关联的通道并回显勾选
        this.$store.dispatch('userChannel/getList', this.userId).then(list => {
          this.loadedChannelIds = []
          list.forEach(channel => {
            if (channel.id) {
              this.loadedChannelIds.push(channel.id)
            }
          })
          this.loadAllChannels()
        }).catch(() => {
          this.loading = false
        })
      }).catch(() => {
        this.loading = false
      })
    },
    // 逐个设备拉取通道并挂到设备节点下，全部完成后回显勾选
    loadAllChannels: function() {
      if (this.treeData.length === 0) {
        this.loading = false
        return
      }
      let finishedCount = 0
      const total = this.treeData.length
      this.treeData.forEach(deviceNode => {
        this.$store.dispatch('device/queryChannels', [deviceNode.deviceId, {
          page: 1,
          count: 1000000,
          channelType: false
        }]).then(data => {
          this.appendChildren(deviceNode, data.list)
          this.channelLoaded(finishedCount + 1, total)
          finishedCount++
        }).catch(() => {
          this.channelLoaded(finishedCount + 1, total)
          finishedCount++
        })
      })
    },
    channelLoaded: function(finished, total) {
      if (finished >= total) {
        this.$nextTick(() => {
          this.loadedChannelIds.forEach(channelId => {
            this.$refs.channelTree.setChecked(channelId + '', true)
          })
          this.loading = false
        })
      }
    },
    appendChildren: function(deviceNode, channelList) {
      this.$set(deviceNode, 'children', [])
      channelList.forEach(channel => {
        deviceNode.children.push({
          key: channel.id + '',
          label: channel.name ? (channel.name + '(' + channel.deviceId + ')') : channel.deviceId,
          type: 'channel',
          channelId: channel.id
        })
      })
    },
    onSubmit: function() {
      // 仅收集通道（叶子）节点的勾选，即通道的数据库主键ID
      const checkedNodes = this.$refs.channelTree.getCheckedNodes()
      const channelIds = []
      checkedNodes.forEach(node => {
        if (node.type === 'channel' && node.channelId) {
          channelIds.push(node.channelId)
        }
      })
      this.submitLoading = true
      this.$store.dispatch('userChannel/assign', {
        userId: this.userId,
        channelIds: channelIds
      }).then(() => {
        this.submitLoading = false
        this.$message({
          showClose: true,
          message: '设备分配成功',
          type: 'success'
        })
        this.showDialog = false
        if (this.listChangeCallback) {
          this.listChangeCallback()
        }
      }).catch((error) => {
        this.submitLoading = false
        this.$message({
          showClose: true,
          message: error,
          type: 'error'
        })
      })
    },
    close: function() {
      this.showDialog = false
      this.userId = null
      this.treeData = []
    }
  }
}
</script>
