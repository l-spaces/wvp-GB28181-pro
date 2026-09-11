package com.genersoft.iot.vmp.storager.dao;

import com.genersoft.iot.vmp.gb28181.bean.CommonGBChannel;
import com.genersoft.iot.vmp.gb28181.bean.DeviceChannel;
import com.genersoft.iot.vmp.storager.dao.dto.UserChannel;
import org.apache.ibatis.annotations.*;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * 用户通道关联表操作
 * 注意：channel_id 使用 wvp_device_channel.id（数据库主键），不是通道国标编号
 */
@Mapper
@Repository
public interface UserChannelMapper {

    @Insert("<script> " +
            "INSERT INTO wvp_user_channel (user_id, channel_id, create_time) VALUES " +
            "<foreach item='item' index='index' collection='list' separator=','> " +
            "(#{item.userId}, #{item.channelId}, #{item.createTime}) " +
            "</foreach> " +
            "</script>")
    int batchAdd(@Param("list") List<UserChannel> list);

    @Delete("DELETE from wvp_user_channel WHERE user_id=#{userId}")
    int deleteByUserId(int userId);

    @Select("select uc.channel_id from wvp_user_channel uc " +
            "inner join wvp_device_channel dc on dc.id = uc.channel_id " +
            "WHERE uc.user_id=#{userId}")
    List<Integer> listChannelIdsByUserId(int userId);

    @Delete("DELETE from wvp_user_channel WHERE channel_id in " +
            "(select id from wvp_device_channel where data_type = 1 and data_device_id = #{deviceDbId})")
    int deleteByDeviceDbId(@Param("deviceDbId") int deviceDbId);

    @Delete("<script>" +
            "DELETE from wvp_user_channel WHERE channel_id in " +
            "<foreach collection='channelIds' item='item' open='(' separator=',' close=')'>#{item}</foreach>" +
            "</script>")
    int deleteByChannelIds(@Param("channelIds") List<Integer> channelIds);

    @Delete("DELETE from wvp_user_channel WHERE channel_id in " +
            "(select id from wvp_device_channel where data_type = #{dataType} and data_device_id = #{dataDeviceId} and device_id = #{deviceId})")
    int deleteForNotify(@Param("dataType") int dataType, @Param("dataDeviceId") int dataDeviceId, @Param("deviceId") String deviceId);

    @Select("<script>select id from wvp_device_channel where id in " +
            "<foreach collection='channelDbIds' item='item' open='(' separator=',' close=')'>#{item}</foreach>" +
            "</script>")
    List<Integer> listExistingChannelIds(@Param("channelDbIds") List<Integer> channelDbIds);

    @Select("select " +
            "dc.id, " +
            "dc.data_device_id, " +
            "dc.device_id, " +
            "coalesce(dc.gb_name, dc.name) as name, " +
            "coalesce(dc.gb_status, dc.status) as status " +
            "from wvp_user_channel uc " +
            "inner join wvp_device_channel dc on dc.id = uc.channel_id " +
            "WHERE uc.user_id=#{userId}")
    List<DeviceChannel> listChannelsByUserId(int userId);

    @Select("select distinct dc.data_device_id from wvp_user_channel uc " +
            "inner join wvp_device_channel dc on dc.id = uc.channel_id and dc.data_type = 1 " +
            "inner join wvp_device wd on wd.id = dc.data_device_id " +
            "WHERE uc.user_id=#{userId}")
    List<Integer> listDeviceIdsByUserId(int userId);

    @Select("<script>" +
            "select count(1) from wvp_device_channel dc " +
            "where dc.id in " +
            "<foreach collection='channelDbIds' item='item' open='(' separator=',' close=')'> #{item}</foreach> " +
            "and coalesce(dc.gb_status, dc.status) = 'ON'" +
            "</script>")
    int countOnlineChannelByDbIds(@Param("channelDbIds") List<Integer> channelDbIds);

    @Select("<script>" +
            "select count(1) from wvp_device wd " +
            "where wd.id in " +
            "<foreach collection='deviceDbIds' item='item' open='(' separator=',' close=')'> #{item}</foreach> " +
            "and wd.on_line = true" +
            "</script>")
    @Select(value = "<script>" +
            "select count(1) from wvp_device wd " +
            "where wd.id in " +
            "<foreach collection='deviceDbIds' item='item' open='(' separator=',' close=')'> #{item}</foreach> " +
            "and wd.on_line = 1" +
            "</script>", databaseId = "dm")
    int countOnlineDeviceByDbIds(@Param("deviceDbIds") List<Integer> deviceDbIds);

    @Select("<script>" +
            "select " +
            "dc.id as gb_id, " +
            "dc.data_type, " +
            "dc.data_device_id, " +
            "coalesce(dc.gb_device_id, dc.device_id) as gb_device_id, " +
            "coalesce(dc.gb_name, dc.name) as gb_name, " +
            "coalesce(dc.gb_status, dc.status) as gb_status, " +
            "coalesce(dc.gb_civil_code, dc.civil_code) as gb_civil_code, " +
            "coalesce(dc.gb_parent_id, dc.parent_id) as gb_parent_id, " +
            "coalesce(dc.gb_business_group_id, dc.business_group_id) as gb_business_group_id " +
            "from wvp_device_channel dc " +
            "where dc.id in " +
            "<foreach collection='channelDbIds' item='item' open='(' separator=',' close=')'> #{item}</foreach>" +
            "</script>")
    List<CommonGBChannel> listChannelsByDbIds(@Param("channelDbIds") List<Integer> channelDbIds);
}
