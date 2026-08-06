package com.netsdk.demo.http.controller.gate;

import com.netsdk.demo.http.controller.BaseDeviceController;
import com.netsdk.demo.module.ext.GateExtModule;
import com.netsdk.lib.NetSDKLib;
import com.netsdk.demo.http.dto.CommonResponse;
import com.netsdk.demo.http.dto.gate.*;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import com.netsdk.demo.http.dto.gate.CardInfoDTO;
import com.netsdk.demo.http.adapt.GateDtoAdapt;
import com.netsdk.demo.http.util.TimeUtil;

@Tag(name = "门禁管理接口", description = "门禁相关操作API")
@RestController
@RequestMapping("/gate")
public class GateController extends BaseDeviceController {

    @Operation(summary = "添加卡", description = "添加门禁卡，支持多门通道")
    @PostMapping("/insertCard")
    public CommonResponse insertCard(@org.springframework.web.bind.annotation.RequestBody InsertCardRequest req) {
        boolean result = GateExtModule.insertCard(loginHandleHolder.get(), req.getCardNo(), req.getUserId(), req.getCardName(), req.getCardPwd(),
                req.getCardStatus(), req.getCardType(), req.getUseTimes(), req.getIsFirstEnter(), req.getIsValid(),
                req.getStartValidTime(), req.getEndValidTime(), req.getDoorIds());
        CommonResponse resp = new CommonResponse();
        resp.setSuccess(result);
        resp.setMessage(result ? "添加卡成功" : "添加卡失败");
        return resp;
    }

    @Operation(summary = "服务方式添加卡", description = "无需传门禁通道和有效期，人员侧已绑定")
    @PostMapping("/insertCardByService")
    public CommonResponse insertCardByService(@org.springframework.web.bind.annotation.RequestBody InsertCardByServiceRequest req) {
        boolean result = GateExtModule.insertCardByService(loginHandleHolder.get(), req.getCardNo(), req.getUserId(), req.getCardType());
        CommonResponse resp = new CommonResponse();
        resp.setSuccess(result);
        resp.setMessage(result ? "添加卡片成功" : "添加卡片失败");
        return resp;
    }

    @Operation(summary = "查询卡片列表", description = "支持按卡号和用户ID查询")
    @PostMapping("/findCardList")
    public CommonResponse<List<CardInfoDTO>> findCardList(@org.springframework.web.bind.annotation.RequestBody FindCardListRequest req) {
        List<NetSDKLib.NET_RECORDSET_ACCESS_CTL_CARD> cardList = GateExtModule.findCardList(loginHandleHolder.get(), req.getCardNo(), req.getUserId(), req.getMaxCount());
        List<CardInfoDTO> dtoList = GateDtoAdapt.toCardInfoDTOList(cardList);
        CommonResponse<List<CardInfoDTO>> resp = new CommonResponse<>();
        resp.setSuccess(true);
        resp.setMessage("查询成功");
        resp.setData(dtoList);
        return resp;
    }

    @Operation(summary = "获取门禁通道数量", description = "返回门禁通道数量")
    @GetMapping("/getAccessChannelCount")
    public CommonResponse<Integer> getAccessChannelCount() {
        int count = GateExtModule.getAccessChannelCount(loginHandleHolder.get());
        CommonResponse<Integer> resp = new CommonResponse<>();
        resp.setSuccess(true);
        resp.setMessage("查询成功");
        resp.setData(count);
        return resp;
    }

    @Operation(summary = "获取单个门禁通道信息", description = "根据通道号获取门禁通道信息")
    @PostMapping("/getAccessChannelInfo")
    public CommonResponse<AccessChannelInfoDTO> getAccessChannelInfo(@org.springframework.web.bind.annotation.RequestBody GetAccessChannelInfoRequest req) {
        NetSDKLib.CFG_ACCESS_EVENT_INFO info = GateExtModule.getAccessChannelInfo(loginHandleHolder.get(), req.getChannel());
        AccessChannelInfoDTO dto = info != null ? GateDtoAdapt.toAccessChannelInfoDTO(info, req.getChannel()) : null;
        CommonResponse<AccessChannelInfoDTO> resp = new CommonResponse<>();
        resp.setSuccess(dto != null);
        resp.setMessage(dto != null ? "查询成功" : "未查询到数据");
        resp.setData(dto);
        return resp;
    }

    @Operation(summary = "获取所有门禁通道信息", description = "根据通道数量获取所有门禁通道信息")
    @PostMapping("/getAllAccessChannelInfo")
    public CommonResponse<List<AccessChannelInfoDTO>> getAllAccessChannelInfo(@org.springframework.web.bind.annotation.RequestBody GetAllAccessChannelInfoRequest req) {
        List<NetSDKLib.CFG_ACCESS_EVENT_INFO> list = GateExtModule.getAllAccessChannelInfo(loginHandleHolder.get(), req.getChannelCount());
        List<AccessChannelInfoDTO> dtoList = GateDtoAdapt.toAccessChannelInfoDTOList(list);
        CommonResponse<List<AccessChannelInfoDTO>> resp = new CommonResponse<>();
        resp.setSuccess(true);
        resp.setMessage("查询成功");
        resp.setData(dtoList);
        return resp;
    }

    @Operation(summary = "分页查询开门记录", description = "带分页参数，返回开门记录列表")
    @PostMapping("/getOpenDoorRecords")
    public CommonResponse<List<OpenDoorRecordDTO>> getOpenDoorRecords(@org.springframework.web.bind.annotation.RequestBody GetOpenDoorRecordsRequest req) {
        // 使用TimeUtil处理默认时间
        req.setStart(TimeUtil.getDefaultStartIfBlank(req.getStart()));
        req.setEnd(TimeUtil.getDefaultEndIfBlank(req.getEnd()));
        List<NetSDKLib.NET_RECORDSET_ACCESS_CTL_CARDREC> list = GateExtModule.getOpenDoorRecords(loginHandleHolder.get(), req.getStart(), req.getEnd(), req.getCardNo(), req.getPageNum(), req.getPageSize());
        List<OpenDoorRecordDTO> dtoList = GateDtoAdapt.toOpenDoorRecordDTOList(list, req.getPageNum(), req.getPageSize());
        CommonResponse<List<OpenDoorRecordDTO>> resp = new CommonResponse<>();
        resp.setSuccess(true);
        resp.setMessage("查询成功");
        resp.setData(dtoList);
        return resp;
    }

    @Operation(summary = "获取开门记录总数", description = "根据条件统计开门记录总数")
    @PostMapping("/getOpenDoorRecordCount")
    public CommonResponse<Integer> getOpenDoorRecordCount(@org.springframework.web.bind.annotation.RequestBody GetOpenDoorRecordCountRequest req) {
        // 使用TimeUtil处理默认时间
        req.setStart(TimeUtil.getDefaultStartIfBlank(req.getStart()));
        req.setEnd(TimeUtil.getDefaultEndIfBlank(req.getEnd()));
        int count = GateExtModule.getOpenDoorRecordCount(loginHandleHolder.get(), req.getStart(), req.getEnd(), req.getCardNo());
        CommonResponse<Integer> resp = new CommonResponse<>();
        resp.setSuccess(true);
        resp.setMessage("查询成功");
        resp.setData(count);
        return resp;
    }

    @Operation(summary = "开门", description = "门禁控制：开门")
    @PostMapping("/openDoor")
    public CommonResponse<Void> openDoor(@org.springframework.web.bind.annotation.RequestBody OpenDoorRequest req) {
        boolean result = GateExtModule.openDoor(loginHandleHolder.get(), req.getChannelNo());
        CommonResponse<Void> resp = new CommonResponse<>();
        resp.setSuccess(result);
        resp.setMessage(result ? "开门成功" : "开门失败");
        return resp;
    }

    @Operation(summary = "关门", description = "门禁控制：关门")
    @PostMapping("/closeDoor")
    public CommonResponse<Void> closeDoor(@org.springframework.web.bind.annotation.RequestBody OpenDoorRequest req) {
        boolean result = GateExtModule.closeDoor(loginHandleHolder.get(), req.getChannelNo());
        CommonResponse<Void> resp = new CommonResponse<>();
        resp.setSuccess(result);
        resp.setMessage(result ? "关门成功" : "关门失败");
        return resp;
    }

    @Operation(summary = "常开", description = "门禁控制：常开")
    @PostMapping("/alwaysOpenDoor")
    public CommonResponse<Void> alwaysOpenDoor(@org.springframework.web.bind.annotation.RequestBody OpenDoorRequest req) {
        boolean result = GateExtModule.alwaysOpenDoor(loginHandleHolder.get(), req.getChannelNo());
        CommonResponse<Void> resp = new CommonResponse<>();
        resp.setSuccess(result);
        resp.setMessage(result ? "常开成功" : "常开失败");
        return resp;
    }

    @Operation(summary = "常闭", description = "门禁控制：常闭")
    @PostMapping("/alwaysCloseDoor")
    public CommonResponse<Void> alwaysCloseDoor(@org.springframework.web.bind.annotation.RequestBody OpenDoorRequest req) {
        boolean result = GateExtModule.alwaysCloseDoor(loginHandleHolder.get(), req.getChannelNo());
        CommonResponse<Void> resp = new CommonResponse<>();
        resp.setSuccess(result);
        resp.setMessage(result ? "常闭成功" : "常闭失败");
        return resp;
    }

    @Operation(summary = "新增或修改用户", description = "新增或修改门禁用户")
    @PostMapping("/addOrUpdateUser")
    public CommonResponse<Void> addOrUpdateUser(@org.springframework.web.bind.annotation.RequestBody AddOrUpdateUserRequest req) {
        NetSDKLib.NET_ACCESS_USER_INFO userInfo = GateDtoAdapt.toNetAccessUserInfo(req);
        boolean result = GateExtModule.addOrUpdateUser(loginHandleHolder.get(), userInfo);
        CommonResponse<Void> resp = new CommonResponse<>();
        resp.setSuccess(result);
        resp.setMessage(result ? "用户添加/更新成功" : "用户添加/更新失败");
        return resp;
    }

    @Operation(summary = "删除用户", description = "根据用户ID删除门禁用户")
    @PostMapping("/deleteUser")
    public CommonResponse<Void> deleteUser(@org.springframework.web.bind.annotation.RequestBody DeleteUserRequest req) {
        boolean result = GateExtModule.deleteUser(loginHandleHolder.get(), req.getUserId().getBytes());
        CommonResponse<Void> resp = new CommonResponse<>();
        resp.setSuccess(result);
        resp.setMessage(result ? "用户删除成功" : "用户删除失败");
        return resp;
    }

    @Operation(summary = "清空所有用户", description = "清空门禁设备所有用户")
    @PostMapping("/clearAllUsers")
    public CommonResponse<Void> clearAllUsers() {
        boolean result = GateExtModule.clearAllUsers(loginHandleHolder.get());
        CommonResponse<Void> resp = new CommonResponse<>();
        resp.setSuccess(result);
        resp.setMessage(result ? "清空用户成功" : "清空用户失败");
        return resp;
    }

    @Operation(summary = "查询用户信息列表", description = "分页查询门禁用户信息")
    @PostMapping("/getUserRecords")
    public CommonResponse<List<UserInfoDTO>> getUserRecords(@org.springframework.web.bind.annotation.RequestBody GetUserRecordsRequest req) {
        List<NetSDKLib.NET_ACCESS_USER_INFO> list = GateExtModule.getUserRecords(loginHandleHolder.get(), req.getUserId(), req.getMaxCount());
        List<UserInfoDTO> dtoList = GateDtoAdapt.toUserInfoDTOList(list);
        CommonResponse<List<UserInfoDTO>> resp = new CommonResponse<>();
        resp.setSuccess(true);
        resp.setMessage("查询成功");
        resp.setData(dtoList);
        return resp;
    }

    @Operation(summary = "查询用户总数", description = "查询门禁用户总数")
    @PostMapping("/getUserRecordsCount")
    public CommonResponse<Integer> getUserRecordsCount(@org.springframework.web.bind.annotation.RequestBody GetUserRecordsCountRequest req) {
        int count = GateExtModule.getUserRecordsCount(loginHandleHolder.get(), req.getUserId());
        CommonResponse<Integer> resp = new CommonResponse<>();
        resp.setSuccess(true);
        resp.setMessage("查询成功");
        resp.setData(count);
        return resp;
    }

    @Operation(summary = "设备连通性测试", description = "仅登录设备验证连通性（请求头登录成功即返回成功），同时自动校准设备时间")
    @GetMapping("/ping")
    public CommonResponse<String> ping() {
        // 连通性测试时顺便校准设备时间，保证开门记录时间与真实时间一致
        GateExtModule.syncDeviceTime(loginHandleHolder.get());
        CommonResponse<String> resp = new CommonResponse<>();
        resp.setSuccess(true);
        resp.setMessage("设备登录成功");
        resp.setData("ok");
        return resp;
    }

    @Operation(summary = "同步设备时间", description = "将设备时间校准为服务器当前时间")
    @PostMapping("/syncTime")
    public CommonResponse<Void> syncTime() {
        boolean result = GateExtModule.syncDeviceTime(loginHandleHolder.get());
        CommonResponse<Void> resp = new CommonResponse<>();
        resp.setSuccess(result);
        resp.setMessage(result ? "设备时间已同步" : "设备时间同步失败");
        return resp;
    }

    @Operation(summary = "新增用户并下发人脸", description = "先创建门禁用户，再下发人脸照片；人脸下发失败时自动回滚删除用户")
    @PostMapping("/addUserFace")
    public CommonResponse<Void> addUserFace(@org.springframework.web.bind.annotation.RequestBody AddUserFaceRequest req) {
        CommonResponse<Void> resp = new CommonResponse<>();
        if (req.getUserId() == null || req.getUserId().isEmpty()
                || req.getImageBase64() == null || req.getImageBase64().isEmpty()) {
            resp.setSuccess(false);
            resp.setMessage("参数缺失: userId/imageBase64");
            return resp;
        }
        byte[] imageBytes;
        try {
            imageBytes = java.util.Base64.getDecoder().decode(req.getImageBase64());
        } catch (Exception e) {
            resp.setSuccess(false);
            resp.setMessage("imageBase64 解码失败: " + e.getMessage());
            return resp;
        }
        // 下发前校准设备时间，保证开门记录时间与真实时间一致（尽力而为，失败不阻断）
        GateExtModule.syncDeviceTime(loginHandleHolder.get());
        // 1. 创建用户（普通用户，有效期放宽为1年，到期由业务侧调用 deleteUserFace 回收）
        NetSDKLib.NET_ACCESS_USER_INFO userInfo = new NetSDKLib.NET_ACCESS_USER_INFO();
        com.netsdk.lib.ToolKits.StringToByteArray(req.getUserId(), userInfo.szUserID);
        if (req.getName() != null && !req.getName().isEmpty()) {
            com.netsdk.lib.ToolKits.StringToByteArray(req.getName(), userInfo.szName);
        }
        userInfo.emUserType = 0; // General
        userInfo.emAuthority = 0;
        userInfo.nUserStatus = 0;
        java.time.LocalDateTime now = java.time.LocalDateTime.now();
        java.time.format.DateTimeFormatter fmt = java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        userInfo.stuValidBeginTime = com.netsdk.lib.ToolKitEx.parseDateTime(now.format(fmt));
        userInfo.stuValidEndTime = com.netsdk.lib.ToolKitEx.parseDateTime(now.plusYears(1).format(fmt));
        userInfo.nDoorNum = 0;
        boolean userOk = GateExtModule.addOrUpdateUser(loginHandleHolder.get(), userInfo);
        if (!userOk) {
            resp.setSuccess(false);
            resp.setMessage("添加用户失败");
            return resp;
        }
        // 2. 下发人脸
        boolean faceOk = GateExtModule.addFaceInfo(loginHandleHolder.get(), req.getUserId(), req.getName(), imageBytes);
        if (!faceOk) {
            // 回滚：删除刚创建的用户
            GateExtModule.deleteUser(loginHandleHolder.get(), req.getUserId().getBytes());
            // 透传 SDK 错误，便于前端展示具体原因
            String sdkErr = GateExtModule.lastFaceError;
            String msg;
            if (sdkErr != null && sdkErr.contains("1030")) {
                msg = "照片未检测到合格人脸：请正对镜头、保证光线充足、人脸占画面大部分（摘掉口罩/墨镜），重新拍摄";
            } else if (sdkErr != null && !sdkErr.isEmpty()) {
                msg = "下发人脸失败：" + sdkErr.replaceAll("[\\r\\n]+", " ");
            } else {
                msg = "下发人脸失败（用户已回滚删除）";
            }
            resp.setSuccess(false);
            resp.setMessage(msg);
            return resp;
        }
        resp.setSuccess(true);
        resp.setMessage("用户与人脸下发成功");
        return resp;
    }

    @Operation(summary = "删除用户及人脸", description = "先删除人脸凭证，再删除门禁用户")
    @PostMapping("/deleteUserFace")
    public CommonResponse<Void> deleteUserFace(@org.springframework.web.bind.annotation.RequestBody DeleteUserRequest req) {
        CommonResponse<Void> resp = new CommonResponse<>();
        if (req.getUserId() == null || req.getUserId().isEmpty()) {
            resp.setSuccess(false);
            resp.setMessage("参数缺失: userId");
            return resp;
        }
        // 人脸删除失败不阻断流程（用户可能未下发过人脸）
        GateExtModule.deleteFaceInfo(loginHandleHolder.get(), req.getUserId());
        boolean userOk = GateExtModule.deleteUser(loginHandleHolder.get(), req.getUserId().getBytes());
        resp.setSuccess(userOk);
        resp.setMessage(userOk ? "用户及人脸删除成功" : "删除用户失败");
        return resp;
    }
}