package com.genersoft.iot.vmp.storager.dao.dto;

public class UserChannel {

    private int id;
    private int userId;
    /**
     * 通道数据库主键ID（wvp_device_channel.id），不是通道国标编号
     */
    private int channelId;
    private String createTime;

    public int getId() {
        return id;
    }

    public void setId(int id) {
        this.id = id;
    }

    public int getUserId() {
        return userId;
    }

    public void setUserId(int userId) {
        this.userId = userId;
    }

    public int getChannelId() {
        return channelId;
    }

    public void setChannelId(int channelId) {
        this.channelId = channelId;
    }

    public String getCreateTime() {
        return createTime;
    }

    public void setCreateTime(String createTime) {
        this.createTime = createTime;
    }
}
