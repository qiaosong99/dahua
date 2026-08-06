package com.netsdk.demo.http.dto.gate;

import lombok.Data;
import io.swagger.v3.oas.annotations.media.Schema;

@Data
public class AddUserFaceRequest {
    @Schema(description = "用户ID")
    private String userId;
    @Schema(description = "用户姓名")
    private String name;
    @Schema(description = "人脸照片Base64（JPEG，建议≤100KB）")
    private String imageBase64;
}
