package com.genersoft.iot.vmp.vmanager.user;

import com.genersoft.iot.vmp.conf.exception.ControllerException;
import com.genersoft.iot.vmp.conf.security.JwtUtils;
import com.genersoft.iot.vmp.conf.security.SecurityUtils;
import com.genersoft.iot.vmp.gb28181.bean.DeviceChannel;
import com.genersoft.iot.vmp.service.IUserChannelService;
import com.genersoft.iot.vmp.service.IUserService;
import com.genersoft.iot.vmp.storager.dao.dto.User;
import com.genersoft.iot.vmp.vmanager.bean.ErrorCode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.util.Assert;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "用户通道分配")

@RestController
@RequestMapping("/api/user/channel")
public class UserChannelController {

    @Autowired
    private IUserChannelService userChannelService;

    @Autowired
    private IUserService userService;

    @GetMapping("/list")
    @Operation(summary = "查询用户已关联的通道列表", security = @SecurityRequirement(name = JwtUtils.HEADER))
    @Parameter(name = "userId", description = "用户Id", required = true)
    public List<DeviceChannel> list(@RequestParam int userId){
        // 获取当前登录用户角色id
        int currenRoleId = SecurityUtils.getUserInfo().getRole().getId();
        if (currenRoleId != 1) {
            // 只有角色id为1（管理员）才可以查询用户通道分配
            throw new ControllerException(ErrorCode.ERROR403);
        }
        User user = getUser(userId);
        return userChannelService.getChannelsForUser(user.getId());
    }

    @PostMapping("/assign")
    @Operation(summary = "全量覆盖式保存用户的通道关联", security = @SecurityRequirement(name = JwtUtils.HEADER))
    @Parameter(name = "userId", description = "用户Id", required = true)
    @Parameter(name = "channelIds", description = "通道的数据库ID列表（wvp_device_channel.id，可为空表示清空关联）", required = false)
    public void assign(@RequestParam int userId,
                       @RequestParam(required = false, defaultValue = "") List<Integer> channelIds){
        // 获取当前登录用户角色id
        int currenRoleId = SecurityUtils.getUserInfo().getRole().getId();
        if (currenRoleId != 1) {
            // 只有角色id为1（管理员）才可以分配用户通道
            throw new ControllerException(ErrorCode.ERROR403);
        }
        User user = getAssignableUser(userId);
        userChannelService.saveChannelsForUser(user.getId(), channelIds);
    }

    private User getUser(int userId) {
        Assert.isTrue(userId > 0, "用户Id必须大于0");
        User user = userService.getUserById(userId);
        Assert.notNull(user, "用户不存在");
        return user;
    }

    private User getAssignableUser(int userId) {
        User user = getUser(userId);
        Assert.isTrue(user.getRole() == null || user.getRole().getId() != 1, "管理员用户默认关联全部通道，无需分配");
        return user;
    }
}
