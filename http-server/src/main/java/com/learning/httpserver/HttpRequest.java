package com.learning.httpserver;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.HashMap;
import java.util.Map;

/**
 * HTTP 请求解析器
 *
 * 类比前端理解：
 * - 前端用 fetch/axios 发请求时，浏览器自动构造请求报文
 * - 这个类做的是反向操作：从原始字节流中解析出请求信息
 * - 类似前端解析 URL 的 new URL(urlString)，但这里解析的是整个 HTTP 报文
 *
 * HTTP 请求报文格式：
 * ┌─────────────────────────────────┐
 * │ GET /index.html HTTP/1.1        │  ← 请求行（方法 路径 协议版本）
 * │ Host: localhost:8080            │  ← 请求头（key: value）
 * │ Accept: text/html               │
 * │ Connection: keep-alive          │
 * │                                 │  ← 空行（标记头部结束）
 * │ (请求体，GET 请求通常没有)        │
 * └─────────────────────────────────┘
 */
public class HttpRequest {

    private String method;       // GET, POST, PUT, DELETE...
    private String path;         // 请求路径，如 /index.html
    private String version;      // HTTP 版本，如 HTTP/1.1
    private String queryString;  // 查询字符串，如 ?key=value
    private final Map<String, String> headers = new HashMap<>();

    private HttpRequest() {
    }

    /**
     * 从 InputStream 中解析 HTTP 请求
     *
     * @param inputStream Socket 的输入流
     * @return 解析后的 HttpRequest 对象
     * @throws IOException      读取失败
     * @throws HttpParseException 请求格式无效
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
