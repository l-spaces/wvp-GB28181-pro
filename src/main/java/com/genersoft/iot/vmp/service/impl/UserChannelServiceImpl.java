package com.genersoft.iot.vmp.service.impl;

import com.genersoft.iot.vmp.conf.security.SecurityUtils;
import com.genersoft.iot.vmp.conf.security.dto.LoginUser;
import com.genersoft.iot.vmp.gb28181.bean.CommonGBChannel;
import com.genersoft.iot.vmp.gb28181.bean.DeviceChannel;
import com.genersoft.iot.vmp.service.IUserChannelService;
import com.genersoft.iot.vmp.storager.dao.UserChannelMapper;
import com.genersoft.iot.vmp.storager.dao.dto.UserChannel;
import com.genersoft.iot.vmp.utils.DateUtil;
import com.genersoft.iot.vmp.vmanager.bean.ResourceBaseInfo;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Slf4j
@Service
public class UserChannelServiceImpl implements IUserChannelService {

    @Autowired
    private UserChannelMapper userChannelMapper;

    @Override
    public List<DeviceChannel> getChannelsForUser(int userId) {
        return userChannelMapper.listChannelsByUserId(userId);
    }

    @Override
    @Transactional
    public void saveChannelsForUser(int userId, List<Integer> channelIds) {
        userChannelMapper.deleteByUserId(userId);
        if (channelIds != null && !channelIds.isEmpty()) {
            String createTime = DateUtil.getNow();
            Set<Integer> uniqueChannelIds = new LinkedHashSet<>();
            for (Integer channelId : channelIds) {
                if (channelId != null && channelId > 0) {
                    uniqueChannelIds.add(channelId);
                }
            }
            if (uniqueChannelIds.isEmpty()) {
                return;
            }
            List<Integer> existingChannelIds = userChannelMapper.listExistingChannelIds(new ArrayList<>(uniqueChannelIds));
            if (existingChannelIds == null || existingChannelIds.isEmpty()) {
                return;
            }
            Set<Integer> existingChannelIdSet = new LinkedHashSet<>(existingChannelIds);
            List<UserChannel> items = new ArrayList<>(existingChannelIds.size());
            for (Integer channelId : uniqueChannelIds) {
                if (!existingChannelIdSet.contains(channelId)) {
                    continue;
                }
                UserChannel item = new UserChannel();
                item.setUserId(userId);
                item.setChannelId(channelId);
                item.setCreateTime(createTime);
                items.add(item);
            }
            if (!items.isEmpty()) {
                userChannelMapper.batchAdd(items);
            }
        }
    }

    @Override
    public boolean isFilterNeeded() {
        LoginUser userInfo = SecurityUtils.getUserInfo();
        if (userInfo == null || userInfo.getRole() == null) {
            // 未登录（如内部 RPC 调用）或角色信息缺失，不过滤
            return false;
        }
        return userInfo.getRole().getId() != 1;
    }

    @Override
    public List<Integer> getUserChannelIds() {
        LoginUser userInfo = SecurityUtils.getUserInfo();
        if (userInfo == null) {
            return new ArrayList<>();
        }
        return userChannelMapper.listChannelIdsByUserId(userInfo.getId());
    }

    @Override
    public List<Integer> getUserChannelDeviceIds() {
        LoginUser userInfo = SecurityUtils.getUserInfo();
        if (userInfo == null) {
            return new ArrayList<>();
        }
        return userChannelMapper.listDeviceIdsByUserId(userInfo.getId());
    }

    @Override
    public ResourceBaseInfo getUserDeviceOverview() {
        List<Integer> deviceDbIds = getUserChannelDeviceIds();
        if (deviceDbIds == null || deviceDbIds.isEmpty()) {
            return new ResourceBaseInfo(0, 0);
        }
        int online = userChannelMapper.countOnlineDeviceByDbIds(deviceDbIds);
        return new ResourceBaseInfo(deviceDbIds.size(), online);
    }

    @Override
    public ResourceBaseInfo getUserChannelOverview() {
        List<Integer> channelDbIds = getUserChannelIds();
        if (channelDbIds == null || channelDbIds.isEmpty()) {
            return new ResourceBaseInfo(0, 0);
        }
        int online = userChannelMapper.countOnlineChannelByDbIds(channelDbIds);
        return new ResourceBaseInfo(channelDbIds.size(), online);
    }

    @Override
    public List<CommonGBChannel> getUserChannels() {
        LoginUser userInfo = SecurityUtils.getUserInfo();
        if (userInfo == null) {
            return new ArrayList<>();
        }
        List<Integer> channelDbIds = userChannelMapper.listChannelIdsByUserId(userInfo.getId());
        if (channelDbIds == null || channelDbIds.isEmpty()) {
            // 空集合不入 SQL（listChannelsByDbIds 的 foreach 不支持空集合）
            return new ArrayList<>();
        }
        return userChannelMapper.listChannelsByDbIds(channelDbIds);
    }

    @Override
    public void removeByDeviceDbId(int deviceDbId) {
        userChannelMapper.deleteByDeviceDbId(deviceDbId);
    }

    @Override
    public void removeByChannelIds(List<Integer> channelIds) {
        if (channelIds == null || channelIds.isEmpty()) {
            return;
        }
        userChannelMapper.deleteByChannelIds(channelIds);
    }

    @Override
    public void removeForNotify(Integer dataType, Integer dataDeviceId, String deviceId) {
        if (dataType == null || dataDeviceId == null || deviceId == null) {
            return;
        }
        userChannelMapper.deleteForNotify(dataType, dataDeviceId, deviceId);
    }
}
