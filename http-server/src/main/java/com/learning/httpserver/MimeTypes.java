package com.learning.httpserver;

import java.util.Map;

/**
 * MIME 类型识别器
 *
 * 类比前端理解：
 * - 前端在 <script> 和 <link> 标签中不需要手动指定 MIME 类型，浏览器根据服务器响应来判断
 * - 服务端需要根据文件扩展名告诉浏览器 "这个文件应该怎么处理"
 * - 如果 MIME 类型错误，浏览器可能拒绝执行（比如 JS 文件返回 text/plain 会报错）
 *
 * Content-Type 响应头的值就是 MIME 类型
 * 格式：主类型/子类型，如 text/html, application/json, image/png
 */
public final class MimeTypes {

    private MimeTypes() {
        // 工具类，禁止实例化
    }

    /**
     * 文件扩展名 -> MIME 类型映射表
     */
    private static final Map<String, String> MIME_MAP = Map.ofEntries(
            // 文本类型
            Map.entry("html", "text/html; charset=utf-8"),
            Map.entry("htm", "text/html; charset=utf-8"),
            Map.entry("css", "text/css; charset=utf-8"),
            Map.entry("js", "text/javascript; charset=utf-8"),
            Map.entry("mjs", "text/javascript; charset=utf-8"),
            Map.entry("json", "application/json; charset=utf-8"),
            Map.entry("xml", "application/xml; charset=utf-8"),
            Map.entry("txt", "text/plain; charset=utf-8"),
            Map.entry("csv", "text/csv; charset=utf-8"),
            Map.entry("md", "text/markdown; charset=utf-8"),

            // 图片类型
            Map.entry("png", "image/png"),
            Map.entry("jpg", "image/jpeg"),
            Map.entry("jpeg", "image/jpeg"),
            Map.entry("gif", "image/gif"),
            Map.entry("svg", "image/svg+xml"),
            Map.entry("ico", "image/x-icon"),
            Map.entry("webp", "image/webp"),
            Map.entry("bmp", "image/bmp"),

            // 字体类型
            Map.entry("woff", "font/woff"),
            Map.entry("woff2", "font/woff2"),
            Map.entry("ttf", "font/ttf"),
            Map.entry("otf", "font/otf"),
            Map.entry("eot", "application/vnd.ms-fontobject"),

            // 应用类型
            Map.entry("pdf", "application/pdf"),
            Map.entry("zip", "application/zip"),
            Map.entry("gz", "application/gzip"),
            Map.entry("tar", "application/x-tar"),
            Map.entry("wasm", "application/wasm"),

            // 音视频
            Map.entry("mp3", "audio/mpeg"),
            Map.entry("mp4", "video/mp4"),
            Map.entry("webm", "video/webm"),
            Map.entry("ogg", "audio/ogg")
    );

    /**
     * 默认 MIME 类型（未知扩展名时使用）
     * application/octet-stream 表示 "二进制数据，浏览器会提示下载"
     */
    private static final String DEFAULT_MIME_TYPE = "application/octet-stream";

    /**
     * 根据文件名获取 MIME 类型
     *
     * @param fileName 文件名，如 "index.html" 或 "style.css"
     * @return 对应的 MIME 类型字符串
     */
    public static String getMimeType(String fileName) {
        int dotIndex = fileName.lastIndexOf('.');
        if (dotIndex == -1 || dotIndex == fileName.length() - 1) {
            return DEFAULT_MIME_TYPE;
        }
        String extension = fileName.substring(dotIndex + 1).toLowerCase();
        return MIME_MAP.getOrDefault(extension, DEFAULT_MIME_TYPE);
    }
}
