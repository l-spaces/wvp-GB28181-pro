package com.genersoft.iot.vmp.service;

import com.genersoft.iot.vmp.gb28181.bean.CommonGBChannel;
import com.genersoft.iot.vmp.gb28181.bean.DeviceChannel;
import com.genersoft.iot.vmp.vmanager.bean.ResourceBaseInfo;

import java.util.List;

/**
 * 用户通道关联业务类
 */
public interface IUserChannelService {

    /**
     * 查询某用户已关联的通道列表（JOIN wvp_device_channel 取通道明细）
     */
    List<DeviceChannel> getChannelsForUser(int userId);

    /**
     * 全量覆盖式保存某用户的通道关联（delete 旧关联 + batch insert 新集合）
     */
    void saveChannelsForUser(int userId, List<Integer> channelIds);

    /**
     * 当前登录用户是否需要查询过滤
     * 未登录（如内部 RPC 调用）或 roleId == 1（管理员）返回 false，其余返回 true
     */
    boolean isFilterNeeded();

    /**
     * 当前登录用户已关联的通道ID列表（wvp_device_channel.id 数据库主键）
     */
    List<Integer> getUserChannelIds();

    /**
     * 当前登录用户已关联通道所属的设备ID列表（wvp_device.id 数据库主键，即 wvp_device_channel.data_device_id）
     */
    List<Integer> getUserChannelDeviceIds();

    /**
     * 按当前登录用户关联范围统计的设备概况（总数=关联设备数，在线数=关联设备中在线的数量）
     */
    ResourceBaseInfo getUserDeviceOverview();

    /**
     * 按当前登录用户关联范围统计的通道概况（总数=关联通道数，在线数=关联通道中在线的数量）
     */
    ResourceBaseInfo getUserChannelOverview();

    /**
     * 当前登录用户已关联通道的明细列表（含区划/分组归属字段，用于组织结构树过滤）
     */
    List<CommonGBChannel> getUserChannels();

    /**
     * 设备删除时同步清理该设备下所有通道的用户关联（须在通道行删除前调用）
     */
    void removeByDeviceDbId(int deviceDbId);

    /**
     * 通道删除时同步清理这些通道的用户关联
     */
    void removeByChannelIds(List<Integer> channelIds);

    /**
     * 设备通知删除单个通道时同步清理其用户关联（须在通道行删除前调用）
     */
    void removeForNotify(Integer dataType, Integer dataDeviceId, String deviceId);
}
