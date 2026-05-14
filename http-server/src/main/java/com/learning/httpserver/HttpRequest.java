package com.learning.httpserver;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.HashMap;
import java.util.Map;

/**
 * ====================================================================
 * 📌 功能用途说明：HttpRequest（HTTP 请求解析器）
 * ====================================================================
 *
 * 【这个功能是什么】
 * 将客户端发来的原始 TCP 字节流解析为结构化的 Java 对象，
 * 提取出请求方法（GET/POST）、路径、HTTP 版本、查询字符串、请求头等信息。
 *
 * 【为什么需要它（解决什么问题）】
 * - 如果没有它：你拿到的只是一堆字节（如 "GET /index.html HTTP/1.1\r\n..."），
 *   无法方便地获取"用户想访问哪个文件"等信息
 * - 它将"非结构化的文本协议"转化为"可编程操作的对象"
 * - 前端类比：浏览器帮你把 URL 字符串解析成 new URL() 对象，让你方便获取
 *   pathname、searchParams 等；HttpRequest 做的是更大范围的解析——整个 HTTP 报文
 *
 * 【它在系统中的位置】
 * <pre>
 * 浏览器发送原始字节流
 *        │
 *        ▼
 * Socket.getInputStream()  ← 原始 TCP 数据
 *        │
 *        ▼
 * [👉 HttpRequest.parse()]  ← 解析为结构化对象
 *        │
 *        ▼
 * RequestHandler 使用 request.getMethod()、request.getPath() 等
 *        │
 *        ▼
 * 路由决策 → 读取文件 → 构建响应
 * </pre>
 *
 * 【它与其他模块的关系】
 * - 上游：RequestHandler 从 Socket 获取 InputStream 传入
 * - 下游：RequestHandler 调用 getMethod()、getPath() 等获取解析结果
 * - 依赖：
 *   · java.io.InputStream —— Socket 的输入流
 *   · java.io.BufferedReader —— 按行读取文本（HTTP 协议以行为单位）
 *   · java.net.URLDecoder —— 解码 %20 等 URL 编码
 *
 * 【前端开发者视角的理解】
 * - 相当于浏览器内部的请求解析器（你在前端从未手动解析过请求报文）
 * - 解析后的对象类似 Express 的 req 对象：req.method, req.path, req.query, req.headers
 * - 类似 new URL('http://...') 解析 URL，但范围更大——解析整个 HTTP 报文
 * - 前端用 fetch() 时浏览器自动构造请求报文，这个类做的是反向操作：拆解报文
 *
 * 【典型使用场景】
 * 1. 解析 "GET /css/style.css HTTP/1.1" → method="GET", path="/css/style.css"
 * 2. 解析 "GET /search?q=hello HTTP/1.1" → path="/search", queryString="q=hello"
 * 3. 解析 URL 编码路径 "/文件夹/%E4%B8%AD%E6%96%87.html" → 正确的中文路径
 *
 * 【HTTP 请求报文格式参考】
 * <pre>
 * ┌─────────────────────────────────┐
 * │ GET /index.html HTTP/1.1        │  ← 请求行（方法 路径 协议版本）
 * │ Host: localhost:8080            │  ← 请求头（key: value）
 * │ Accept: text/html               │
 * │ Connection: keep-alive          │
 * │                                 │  ← 空行（标记头部结束）
 * │ (请求体，GET 请求通常没有)        │
 * └─────────────────────────────────┘
 * </pre>
 * ====================================================================
 */
public class HttpRequest {

    private String method;       // GET, POST, PUT, DELETE... （前端类比：fetch 的 method 选项）
    private String path;         // 请求路径，如 /index.html （前端类比：window.location.pathname）
    private String version;      // HTTP 版本，如 HTTP/1.1 （决定支持哪些特性）
    private String queryString;  // 查询字符串，如 ?key=value （前端类比：window.location.search）
    private final Map<String, String> headers = new HashMap<>(); // 请求头集合（前端类比：req.headers）

    private HttpRequest() {
    }

    /**
     * 从 InputStream 中解析 HTTP 请求（静态工厂方法）
     *
     * 【解析流程】
     * 1. 读取第一行（请求行）→ 拆分出 method / path / version
     * 2. 分离 path 中的查询字符串（? 后面的部分）
     * 3. URL 解码路径（%20→空格，%E4%B8%AD→中）
     * 4. 逐行读取请求头，直到遇到空行
     *
     * 【为什么用 BufferedReader 而非直接读字节】
     * - HTTP/1.1 是文本协议，以 \r\n 为行分隔符
     * - BufferedReader.readLine() 自动处理行结束符
     * - 前端类比：类似 readline 模块按行处理输入
     *
     * 【为什么是 static 方法而非构造函数】
     * - 解析可能失败（抛异常），用静态工厂方法比构造函数语义更清晰
     * - 前端类比：JSON.parse() 是静态方法而非 new JSON(str)
     *
     * @param inputStream Socket 的输入流
     * @return 解析后的 HttpRequest 对象
     * @throws IOException        读取失败（网络中断等）
     * @throws HttpParseException 请求格式无效（非法报文）
     */
    public static HttpRequest parse(InputStream inputStream) throws IOException, HttpParseException {
        BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream));
        HttpRequest request = new HttpRequest();

        // 1. 解析请求行（第一行）
        String requestLine = reader.readLine();
        if (requestLine == null || requestLine.isBlank()) {
            throw new HttpParseException("Empty request line");
        }

        String[] parts = requestLine.split(" ");
        if (parts.length != 3) {
            throw new HttpParseException("Invalid request line: " + requestLine);
        }

        request.method = parts[0].toUpperCase();
        request.version = parts[2];

        // 解析路径和查询字符串
        String fullPath = parts[1];
        int queryIndex = fullPath.indexOf('?');
        if (queryIndex != -1) {
            request.path = fullPath.substring(0, queryIndex);
            request.queryString = fullPath.substring(queryIndex + 1);
        } else {
            request.path = fullPath;
            request.queryString = "";
        }

        // URL 解码路径（处理 %20 等编码字符）
        request.path = decodeUrl(request.path);

        // 2. 解析请求头
        String headerLine;
        while ((headerLine = reader.readLine()) != null && !headerLine.isEmpty()) {
            int colonIndex = headerLine.indexOf(':');
            if (colonIndex > 0) {
                String key = headerLine.substring(0, colonIndex).trim().toLowerCase();
                String value = headerLine.substring(colonIndex + 1).trim();
                request.headers.put(key, value);
            }
        }

        return request;
    }

    /**
     * 简单的 URL 解码
     *
     * 【为什么需要 URL 解码】
     * - URL 中不能包含空格、中文等特殊字符，必须编码为 %XX 格式
     * - 例：空格 → %20，中 → %E4%B8%AD
     * - 服务端收到后需要解码还原，否则找不到对应文件
     *
     * 【前端类比】
     * - 相当于 JavaScript 的 decodeURIComponent()
     * - 前端调用 encodeURIComponent('你好') → '%E4%BD%A0%E5%A5%BD'
     * - 后端这里做反向操作：'%E4%BD%A0%E5%A5%BD' → '你好'
     *
     * 处理常见的百分号编码，如 %20 -> 空格, %E4%B8%AD -> 中
     */
    private static String decodeUrl(String url) {
        try {
            return java.net.URLDecoder.decode(url, "UTF-8");
        } catch (Exception e) {
            return url; // 解码失败返回原始值
        }
    }

    // ============ Getter 方法 ============

    public String getMethod() {
        return method;
    }

    public String getPath() {
        return path;
    }

    public String getVersion() {
        return version;
    }

    public String getQueryString() {
        return queryString;
    }

    public String getHeader(String name) {
        return headers.get(name.toLowerCase());
    }

    public Map<String, String> getHeaders() {
        return headers;
    }

    @Override
    public String toString() {
        return method + " " + path + " " + version;
    }
}
