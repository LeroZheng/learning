package com.learning.httpserver;

import java.util.Map;

/**
 * ====================================================================
 * 📌 功能用途说明：MimeTypes（MIME 类型识别器）
 * ====================================================================
 *
 * 【这个功能是什么】
 * 根据文件扩展名确定对应的 MIME 类型（Content-Type），
 * 告诉浏览器"这个文件应该怎么处理"。
 *
 * 【为什么需要它（解决什么问题）】
 * - 如果没有它：浏览器不知道返回的内容是什么格式
 *   · CSS 文件返回 text/plain → 浏览器不会应用样式
 *   · JS 文件返回 text/plain → 浏览器拒绝执行（MIME type mismatch）
 *   · 图片返回 text/html → 浏览器尝试按 HTML 解析，显示乱码
 * - 正确的 MIME 类型是浏览器正确渲染页面的前提条件
 * - 前端类比：你在 HTML 中写 &lt;script type="module"&gt; 告诉浏览器这是 ES Module，
 *   服务端的 Content-Type 做的是同样的事情
 *
 * 【它在系统中的位置】
 * <pre>
 * RequestHandler.serveFile()
 *        │
 *        │  获取文件名 "style.css"
 *        ▼
 * [👉 MimeTypes.getMimeType("style.css")]
 *        │
 *        │  返回 "text/css; charset=utf-8"
 *        ▼
 * HttpResponse.header("Content-Type", "text/css; charset=utf-8")
 *        │
 *        ▼
 * 浏览器根据 Content-Type 决定如何处理响应
 * </pre>
 *
 * 【它与其他模块的关系】
 * - 上游：RequestHandler 在返回文件时调用
 * - 下游：返回值传给 HttpResponse 设置 Content-Type 头
 * - 依赖：无外部依赖，纯内存映射表
 *
 * 【前端开发者视角的理解】
 * - Content-Type 就是前端 DevTools → Network → Response Headers 中看到的 content-type
 * - 前端的 fetch 可以通过 response.headers.get('content-type') 获取
 * - 当你写 &lt;link rel="stylesheet"&gt; 时，浏览器会验证返回的 Content-Type 是否为 text/css
 * - 当你写 &lt;script src="..."&gt; 时，浏览器要求 Content-Type 包含 javascript
 * - 相当于 webpack 的 file-loader / asset-modules 中配置的 mimetype 选项
 *
 * 【典型使用场景】
 * 1. "index.html" → "text/html; charset=utf-8"（浏览器渲染为网页）
 * 2. "app.js" → "text/javascript; charset=utf-8"（浏览器执行为脚本）
 * 3. "photo.png" → "image/png"（浏览器显示为图片）
 * 4. "unknown.xyz" → "application/octet-stream"（浏览器提示下载）
 * ====================================================================
 */
public final class MimeTypes {

    private MimeTypes() {
        // 工具类，禁止实例化
        // 【设计模式】私有构造函数 = 工具类模式（Utility Class）
        // 前端类比：类似 lodash 的纯函数集合，不需要 new Lodash()
    }

    /**
     * 文件扩展名 -> MIME 类型映射表
     *
     * 【MIME 类型命名规则】
     * 格式：主类型/子类型[; 参数]
     * - text/*: 人类可读的文本（html, css, js, json）
     * - image/*: 图片（png, jpg, gif, svg）
     * - application/*: 应用程序数据（pdf, zip, wasm）
     * - font/*: 字体文件（woff, woff2, ttf）
     * - audio/*, video/*: 音视频
     *
     * 【charset=utf-8 的作用】
     * 文本类型需要指定字符编码，否则浏览器可能用错误编码显示乱码
     * 前端类比：HTML 中的 &lt;meta charset="UTF-8"&gt; 做同样的事情
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
     *
     * application/octet-stream 表示 "原始二进制数据，浏览器会提示下载"
     * 【为什么用它作为默认值】
     * - 比返回错误更友好：用户至少可以下载文件
     * - 安全：浏览器不会尝试执行未知类型的内容
     * - 前端类比：类似 &lt;a download&gt; 属性强制下载而非在浏览器中打开
     */
    private static final String DEFAULT_MIME_TYPE = "application/octet-stream";

    /**
     * 根据文件名获取 MIME 类型
     *
     * 【解析逻辑】
     * 1. 找到最后一个 '.' 的位置
     * 2. 提取扩展名并转为小写（大小写不敏感）
     * 3. 在映射表中查找，找不到返回默认值
     *
     * 【边界情况处理】
     * - 没有扩展名（如 "Makefile"）→ 返回默认 octet-stream
     * - 点号在末尾（如 "file."）→ 返回默认 octet-stream
     * - 多个点号（如 "archive.tar.gz"）→ 取最后一个扩展名 "gz"
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
