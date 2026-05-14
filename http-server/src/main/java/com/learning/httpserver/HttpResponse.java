package com.learning.httpserver;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * HTTP 响应构建器
 *
 * 类比前端理解：
 * - 前端的 fetch() 返回 Response 对象（status, headers, body）
 * - 这个类负责构建那个 Response 的原始报文格式
 * - 类似 Express 中的 res.status(200).header('Content-Type', 'text/html').send(body)
 *
 * HTTP 响应报文格式：
 * ┌─────────────────────────────────┐
 * │ HTTP/1.1 200 OK                 │  ← 状态行（协议 状态码 状态描述）
 * │ Content-Type: text/html         │  ← 响应头
 * │ Content-Length: 1234            │
 * │ Date: Thu, 14 May 2026 ...     │
 * │                                 │  ← 空行
 * │ <html>...</html>                │  ← 响应体
 * └─────────────────────────────────┘
 */
public class HttpResponse {

    private int statusCode;
    private String statusMessage;
    private final Map<String, String> headers = new LinkedHashMap<>();
    private byte[] body;

    public HttpResponse() {
        // 默认响应头
        headers.put("Server", "SimpleHTTP/1.0");
        headers.put("Connection", "close");
        headers.put("Date", ZonedDateTime.now(ZoneOffset.UTC)
                .format(DateTimeFormatter.RFC_1123_DATE_TIME));
    }

    /**
     * 设置状态码和状态消息
     */
    public HttpResponse status(int code) {
        this.statusCode = code;
        this.statusMessage = getReasonPhrase(code);
        return this;
    }

    /**
     * 设置响应头
     */
    public HttpResponse header(String name, String value) {
        headers.put(name, value);
        return this;
    }

    /**
     * 设置响应体（文本）
     */
    public HttpResponse body(String content) {
        this.body = content.getBytes(StandardCharsets.UTF_8);
        headers.put("Content-Length", String.valueOf(this.body.length));
        return this;
    }

    /**
     * 设置响应体（二进制数据，用于文件传输）
     */
    public HttpResponse body(byte[] content) {
        this.body = content;
        headers.put("Content-Length", String.valueOf(content.length));
        return this;
    }

    /**
     * 将响应写入 OutputStream（发送给客户端）
     *
     * 这是最终将 Java 对象序列化为 HTTP 报文并发送的步骤
     */
    public void writeTo(OutputStream out) throws IOException {
        StringBuilder headerBuilder = new StringBuilder();

        // 1. 状态行
        headerBuilder.append("HTTP/1.1 ")
                .append(statusCode)
                .append(" ")
                .append(statusMessage)
                .append("\r\n");

        // 2. 响应头
        for (Map.Entry<String, String> entry : headers.entrySet()) {
            headerBuilder.append(entry.getKey())
                    .append(": ")
                    .append(entry.getValue())
                    .append("\r\n");
        }

        // 3. 空行（分隔头部和主体）
        headerBuilder.append("\r\n");

        // 写入头部
        out.write(headerBuilder.toString().getBytes(StandardCharsets.UTF_8));

        // 4. 写入响应体
        if (body != null && body.length > 0) {
            out.write(body);
        }

        out.flush();
    }

    /**
     * 根据状态码获取标准描述
     */
    private static String getReasonPhrase(int code) {
        return switch (code) {
            case 200 -> "OK";
            case 301 -> "Moved Permanently";
            case 304 -> "Not Modified";
            case 400 -> "Bad Request";
            case 403 -> "Forbidden";
            case 404 -> "Not Found";
            case 405 -> "Method Not Allowed";
            case 500 -> "Internal Server Error";
            default -> "Unknown";
        };
    }
}
