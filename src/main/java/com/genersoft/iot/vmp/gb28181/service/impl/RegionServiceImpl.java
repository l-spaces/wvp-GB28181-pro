package com.genersoft.iot.vmp.gb28181.service.impl;

import com.genersoft.iot.vmp.common.CivilCodePo;
import com.genersoft.iot.vmp.conf.exception.ControllerException;
import com.genersoft.iot.vmp.gb28181.bean.CommonGBChannel;
import com.genersoft.iot.vmp.gb28181.bean.Region;
import com.genersoft.iot.vmp.gb28181.bean.RegionTree;
import com.genersoft.iot.vmp.gb28181.dao.CommonGBChannelMapper;
import com.genersoft.iot.vmp.gb28181.dao.RegionMapper;
import com.genersoft.iot.vmp.gb28181.event.EventPublisher;
import com.genersoft.iot.vmp.gb28181.service.IGbChannelService;
import com.genersoft.iot.vmp.gb28181.service.IRegionService;
import com.genersoft.iot.vmp.service.IUserChannelService;
import com.genersoft.iot.vmp.utils.CivilCodeUtil;
import com.genersoft.iot.vmp.utils.DateUtil;
import com.genersoft.iot.vmp.vmanager.bean.ErrorCode;
import com.github.pagehelper.PageHelper;
import com.github.pagehelper.PageInfo;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.Assert;
import org.springframework.util.ObjectUtils;

import java.util.*;

/**
 * 区域管理类
 */
@Service
@Slf4j
public class RegionServiceImpl implements IRegionService {

    @Autowired
    private RegionMapper regionMapper;

    @Autowired
    private CommonGBChannelMapper commonGBChannelMapper;

    @Autowired
    private IGbChannelService gbChannelService;

    @Autowired
    private EventPublisher eventPublisher;

    @Autowired
    private IUserChannelService userChannelService;

    @Override
    public void add(Region region) {
        Assert.hasLength(region.getName(), "名称必须存在");
        Assert.hasLength(region.getDeviceId(), "国标编号必须存在");
        if (ObjectUtils.isEmpty(region.getParentDeviceId()) || ObjectUtils.isEmpty(region.getParentDeviceId().trim())) {
            region.setParentDeviceId(null);
        }
        region.setCreateTime(DateUtil.getNow());
        region.setUpdateTime(DateUtil.getNow());
        try {
            regionMapper.add(region);
        }catch (DuplicateKeyException e){
            throw new ControllerException(ErrorCode.ERROR100.getCode(), "此行政区划已存在");
        }

    }

    @Override
    @Transactional
    public boolean deleteByDeviceId(Integer regionDeviceId) {
        Region region = regionMapper.queryOne(regionDeviceId);
        // 获取所有子节点
        List<Region> allChildren = getAllChildren(regionDeviceId);
        allChildren.add(region);
        // 设置使用这些节点的通道的civilCode为null,
        gbChannelService.removeCivilCode(allChildren);
        regionMapper.batchDelete(allChildren);
        return true;
    }

    private List<Region> getAllChildren(Integer deviceId) {
        if (deviceId == null) {
            return new ArrayList<>();
        }
        List<Region> children = regionMapper.getChildren(deviceId);
        if (ObjectUtils.isEmpty(children)) {
            return children;
        }
        List<Region> regions = new ArrayList<>(children);
        for (Region region : children) {
            if (region.getDeviceId().length() < 8) {
                regions.addAll(getAllChildren(region.getId()));
            }
        }
        return regions;
    }

    @Override
    public PageInfo<Region> query(String query, int page, int count) {
        PageHelper.startPage(page, count);
        if (query != null) {
            query = query.replaceAll("/", "//")
                    .replaceAll("%", "/%")
                    .replaceAll("_", "/_");
        }
        List<Region> regionList =  regionMapper.query(query, null);
        return new PageInfo<>(regionList);
    }

    @Override
    @Transactional
    public void update(Region region) {
        Assert.notNull(region.getDeviceId(), "编号不可为NULL");
        Assert.notNull(region.getName(), "名称不可为NULL");
        Region regionInDb = regionMapper.queryOne(region.getId());
        Assert.notNull(regionInDb, "待更新行政区划在数据库中不存在");
        if (!regionInDb.getDeviceId().equals(region.getDeviceId())) {
            Region regionNewInDb = regionMapper.queryByDeviceId(region.getDeviceId());
            Assert.isNull(regionNewInDb, "此行政区划已存在");
            // 编号发生变化，把分配了这个行政区划的通道全部更新，并发送数据
            gbChannelService.updateCivilCode(regionInDb.getDeviceId(), region.getDeviceId());
            // 子节点信息更新
            regionMapper.updateChild(region.getId(), region.getDeviceId());
        }
        regionMapper.update(region);
        // 发送变化通知
        try {
            // 发送catalog
            eventPublisher.channelEventPublishForUpdate(CommonGBChannel.build(region), null);
        }catch (Exception e) {
            log.warn("[行政区划变化] 发送失败，{}", region.getDeviceId(), e);
        }
    }

    @Override
    public List<Region> getAllChild(String parent) {
        List<Region> allChild = CivilCodeUtil.INSTANCE.getAllChild(parent);
        Collections.sort(allChild);
        return allChild;
    }

    @Override
    public Region queryRegionByDeviceId(String regionDeviceId) {
        return null;
    }

    @Override
    public List<RegionTree> queryForTree(Integer parent, Boolean hasChannel) {
        // 显示级过滤：非管理员用户只显示包含其关联通道的行政区划分支（含祖先节点）
        if (userChannelService.isFilterNeeded()) {
            List<CommonGBChannel> userChannels = userChannelService.getUserChannels();
            Set<Integer> visibleRegionDbIds = getVisibleRegionDbIds(userChannels);
            if (visibleRegionDbIds.isEmpty()) {
                return new ArrayList<>();
            }
            List<RegionTree> regionList = regionMapper.queryForTree(parent);
            // 节点列表只保留可见分支内的节点（根节点与子节点同理）
            regionList.removeIf(regionTree -> !visibleRegionDbIds.contains(regionTree.getId()));
            if (parent != null && hasChannel != null && hasChannel) {
                Region parentRegion = regionMapper.queryOne(parent);
                if (parentRegion != null) {
                    List<RegionTree> channelList = commonGBChannelMapper.queryForRegionTreeByCivilCode(parentRegion.getDeviceId());
                    // 只保留当前用户关联的通道
                    Set<Integer> channelDbIdSet = userChannelDbIdSet(userChannels);
                    channelList.removeIf(channel -> !channelDbIdSet.contains(channel.getId()));
                    regionList.addAll(channelList);
                }
            }
            return regionList;
        }
        List<RegionTree> regionList = regionMapper.queryForTree(parent);
        if (parent != null && hasChannel != null && hasChannel) {
            Region parentRegion = regionMapper.queryOne(parent);
            if (parentRegion != null) {
                List<RegionTree> channelList = commonGBChannelMapper.queryForRegionTreeByCivilCode(parentRegion.getDeviceId());
                regionList.addAll(channelList);
            }
        }
        return regionList;
    }

    /**
     * 计算对当前用户可见的行政区划数据库主键集合（关联通道所在区划节点 + 沿 parent 链向上的全部祖先）
     */
    private Set<Integer> getVisibleRegionDbIds(List<CommonGBChannel> userChannels) {
        Set<Integer> visibleRegionDbIds = new HashSet<>();
        if (userChannels.isEmpty()) {
            return visibleRegionDbIds;
        }
        for (CommonGBChannel channel : userChannels) {
            String civilCode = channel.getGbCivilCode();
            if (ObjectUtils.isEmpty(civilCode)) {
                continue;
            }
            Region region = regionMapper.queryByDeviceId(civilCode);
            while (region != null && visibleRegionDbIds.add(region.getId())) {
                // 沿 parent 链向上补齐祖先节点
                if (region.getParentId() == null) {
                    break;
                }
                Region parentRegion = regionMapper.queryOne(region.getParentId());
                if (parentRegion == null) {
                    break;
                }
                region = parentRegion;
            }
        }
        return visibleRegionDbIds;
    }

    /**
     * 当前用户关联通道的库主键ID集合
     */
    private static Set<Integer> userChannelDbIdSet(List<CommonGBChannel> userChannels) {
        Set<Integer> channelDbIdSet = new HashSet<>();
        for (CommonGBChannel channel : userChannels) {
            channelDbIdSet.add(channel.getGbId());
        }
        return channelDbIdSet;
    }

    @Override
    public void syncFromChannel() {
        // 获取未初始化的行政区划节点
        List<String> civilCodeList = regionMapper.getUninitializedCivilCode();
        if (civilCodeList.isEmpty()) {
            return;
        }
        List<Region> regionList = new ArrayList<>();
        // 收集节点的父节点,用于验证哪些节点的父节点不存在,方便一并存入
        Map<String, Region> regionMapForVerification = new HashMap<>();
        civilCodeList.forEach(civilCode->{
            CivilCodePo civilCodePo = CivilCodeUtil.INSTANCE.getCivilCodePo(civilCode);
            if (civilCodePo != null) {
                Region region = Region.getInstance(civilCodePo);
                regionList.add(region);
                // 获取全部的父节点
                List<CivilCodePo> civilCodePoList = CivilCodeUtil.INSTANCE.getAllParentCode(civilCode);
                if (!civilCodePoList.isEmpty()) {
                    for (CivilCodePo codePo : civilCodePoList) {
                        regionMapForVerification.put(codePo.getCode(), Region.getInstance(codePo));
                    }
                }
            }
        });
        if (regionList.isEmpty()){
            return;
        }
        if (!regionMapForVerification.isEmpty()) {
            // 查询数据库中已经存在的.
            List<String> civilCodesInDb = regionMapper.queryInList(regionMapForVerification.keySet());
            if (!civilCodesInDb.isEmpty()) {
                for (String code : civilCodesInDb) {
                    regionMapForVerification.remove(code);
                }
            }
        }
        for (Region region : regionList) {
            regionMapForVerification.put(region.getDeviceId(), region);
        }

        regionMapper.batchAdd(new ArrayList<>(regionMapForVerification.values()));
    }

    @Override
    public boolean delete(int id) {
        return regionMapper.delete(id) > 0;
    }

    @Override
    @Transactional
    public boolean batchAdd(List<Region> regionList) {
        if (regionList== null || regionList.isEmpty()) {
            return false;
        }
        Map<String, Region> regionMapForVerification = new HashMap<>();
        for (Region region : regionList) {
            regionMapForVerification.put(region.getDeviceId(), region);
        }
        // 查询数据库中已经存在的.
        List<Region> regionListInDb = regionMapper.queryInRegionListByDeviceId(regionList);
        if (!regionListInDb.isEmpty()) {
            for (Region region : regionListInDb) {
                regionMapForVerification.remove(region.getDeviceId());
            }
        }
        if (!regionMapForVerification.isEmpty()) {
            List<Region> regions = new ArrayList<>(regionMapForVerification.values());
            regionMapper.batchAdd(regions);
            regionMapper.updateParentId(regions);
        }

        return true;
    }

    @Override
    public List<Region> getPath(String deviceId) {
        Region region = regionMapper.queryByDeviceId(deviceId);
        if (region == null) {
            throw new ControllerException(ErrorCode.ERROR100.getCode(), "行政区划不存在");
        }
        List<Region> allParent = getAllParent(region);
        List<Region> regionList = new LinkedList<>(allParent);
        regionList.add(region);
        return regionList;
    }


    private List<Region> getAllParent(Region region) {
        if (region.getParentId() == null) {
            return new ArrayList<>();
        }

        Region parent = regionMapper.queryByDeviceId(region.getParentDeviceId());
        if (parent == null) {
            return new ArrayList<>();
        }
        List<Region> allParent = getAllParent(parent);
        allParent.add(parent);
        return allParent;
    }

    @Override
    public String getDescription(String civilCode) {

        CivilCodePo civilCodePo = CivilCodeUtil.INSTANCE.getCivilCodePo(civilCode);
        Assert.notNull(civilCodePo, String.format("节点%s未查询到", civilCode));
        StringBuilder sb = new StringBuilder();
        sb.append(civilCodePo.getName());
        List<CivilCodePo> civilCodePoList = CivilCodeUtil.INSTANCE.getAllParentCode(civilCode);
        if (civilCodePoList.isEmpty()) {
            return sb.toString();
        }
        for (int i = 0; i < civilCodePoList.size(); i++) {
            CivilCodePo item = civilCodePoList.get(i);
            sb.insert(0, item.getName());
            if (i != civilCodePoList.size() - 1) {
                sb.insert(0, "/");
            }
        }
        return sb.toString();
    }

    @Override
    @Transactional
    public void addByCivilCode(String civilCode) {
        CivilCodePo civilCodePo = CivilCodeUtil.INSTANCE.getCivilCodePo(civilCode);
        // 查询是否已经存在此节点
        Assert.notNull(civilCodePo, String.format("节点%s未查询到", civilCode));
        List<CivilCodePo> civilCodePoList = CivilCodeUtil.INSTANCE.getAllParentCode(civilCode);
        civilCodePoList.add(civilCodePo);

        Set<String> civilCodeSet = regionMapper.queryInCivilCodePoList(civilCodePoList);
        if (!civilCodeSet.isEmpty()) {
            civilCodePoList.removeIf(item ->  civilCodeSet.contains(item.getCode()));
        }
        if (civilCodePoList.isEmpty()) {
            return;
        }
        int parentId = -1;
        for (int i = civilCodePoList.size() - 1; i > -1; i--) {
            CivilCodePo codePo =  civilCodePoList.get(i);

            Region region = new Region();
            region.setDeviceId(codePo.getCode());
            region.setParentDeviceId(codePo.getParentCode());
            region.setName(civilCodePo.getName());
            region.setCreateTime(DateUtil.getNow());
            region.setUpdateTime(DateUtil.getNow());
            if (parentId == -1 && codePo.getParentCode() != null) {
                Region parentRegion = regionMapper.queryByDeviceId(codePo.getParentCode());
                if (parentRegion == null){
                    log.error(String.format("行政区划%sy已存在，但查询错误", codePo.getParentCode()));
                    throw new ControllerException(ErrorCode.ERROR100.getCode(), String.format("行政区划%sy已存在，但查询错误", codePo.getParentCode()));
                }
                region.setParentId(parentRegion.getId());
            }else {
                region.setParentId(parentId);
            }
            regionMapper.add(region);
            parentId = region.getId();
        }
    }

    @Override
    public PageInfo<Region> queryList(int page, int count, String query) {
        PageHelper.startPage(page, count);
        if (query != null) {
            query = query.replaceAll("/", "//")
                    .replaceAll("%", "/%")
                    .replaceAll("_", "/_");
        }
        List<Region> all = regionMapper.query(query, null);
        return new PageInfo<>(all);
    }
}
