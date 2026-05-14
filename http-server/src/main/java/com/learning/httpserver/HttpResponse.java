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
 * ====================================================================
 * 📌 功能用途说明：HttpResponse（HTTP 响应构建器）
 * ====================================================================
 *
 * 【这个功能是什么】
 * 将服务器的处理结果（状态码、响应头、响应体）组装为标准 HTTP/1.1 响应报文，
 * 并通过 Socket 输出流发送给客户端浏览器。
 *
 * 【为什么需要它（解决什么问题）】
 * - 如果没有它：你需要每次手动拼接 "HTTP/1.1 200 OK\r\nContent-Type: ..." 字符串
 * - 它封装了 HTTP 协议的格式细节，让调用者只关心"返回什么内容"
 * - 采用 Builder 模式（链式调用），代码简洁易读
 * - 前端类比：Express 帮你封装了 res.status(200).json({...})，你不需要手动拼响应报文；
 *   而这个类就是我们自己实现的那个 "res" 对象
 *
 * 【它在系统中的位置】
 * <pre>
 * RequestHandler 处理完请求
 *        │
 *        │ 决定返回什么内容
 *        ▼
 * [👉 HttpResponse]
 *        │ .status(200)
 *        │ .header("Content-Type", "text/html")
 *        │ .body(fileBytes)
 *        │ .writeTo(outputStream)
 *        ▼
 * Socket OutputStream → 发送给浏览器
 *        │
 *        ▼
 * 浏览器收到响应 → 渲染页面 / 执行 JS / 应用 CSS
 * </pre>
 *
 * 【它与其他模块的关系】
 * - 上游：RequestHandler（调用 HttpResponse 构建响应）
 * - 下游：Socket 的 OutputStream（最终写入的目标）
 * - 依赖：
 *   · java.io.OutputStream —— 写入目标
 *   · java.nio.charset.StandardCharsets —— 字符编码
 *   · java.time.ZonedDateTime —— 生成 Date 响应头
 *
 * 【前端开发者视角的理解】
 * - 相当于 Express 中的 res 对象：res.status(200).set('Content-Type', 'text/html').send(body)
 * - 相当于 Koa 中的 ctx.status = 200; ctx.body = data;
 * - 你在前端调用 fetch() 后拿到的 Response 对象，就是由服务端的这个类生成的
 * - Builder 模式（链式调用）≈ jQuery 的 $().css().addClass().show() 链式操作
 *
 * 【典型使用场景】
 * 1. 返回静态文件：.status(200).header("Content-Type", "image/png").body(pngBytes).writeTo(out)
 * 2. 返回错误页面：.status(404).header("Content-Type", "text/html").body(errorHtml).writeTo(out)
 * 3. 返回 JSON 数据：.status(200).header("Content-Type", "application/json").body(jsonStr).writeTo(out)
 *
 * 【HTTP 响应报文格式参考】
 * <pre>
 * ┌─────────────────────────────────┐
 * │ HTTP/1.1 200 OK                 │  ← 状态行（协议 状态码 状态描述）
 * │ Content-Type: text/html         │  ← 响应头
 * │ Content-Length: 1234            │
 * │ Date: Thu, 14 May 2026 ...     │
 * │                                 │  ← 空行（分隔头部和主体）
 * │ &lt;html&gt;...&lt;/html&gt;                │  ← 响应体
 * └─────────────────────────────────┘
 * </pre>
 * ====================================================================
 */
public class HttpResponse {

    private int statusCode;
    private String statusMessage;
    private final Map<String, String> headers = new LinkedHashMap<>();
    private byte[] body;

    /**
     * 构造函数：设置默认响应头
     *
     * 【默认头说明】
     * - Server: 标识服务器软件名称（前端类比：在 DevTools 的 Response Headers 中看到的 server 字段）
     * - Connection: close 表示每次请求后关闭连接（HTTP/1.0 行为）
     *   · 优点：实现简单，不需要处理请求边界
     *   · 缺点：每次请求都要重新建立 TCP 连接（三次握手），性能较差
     *   · 改进方向：实现 keep-alive 复用连接
     * - Date: 响应时间（RFC 1123 格式），用于缓存计算和日志记录
     */
    public HttpResponse() {
        // 默认响应头
        headers.put("Server", "SimpleHTTP/1.0");
        headers.put("Connection", "close");
        headers.put("Date", ZonedDateTime.now(ZoneOffset.UTC)
                .format(DateTimeFormatter.RFC_1123_DATE_TIME));
    }

    /**
     * 设置状态码和状态消息
     *
     * 【HTTP 状态码分类】
     * - 2xx 成功：200 OK, 204 No Content
     * - 3xx 重定向：301 永久, 302 临时, 304 未修改（缓存命中）
     * - 4xx 客户端错误：400 参数错误, 403 无权限, 404 不存在, 405 方法不允许
     * - 5xx 服务端错误：500 内部错误, 502 网关错误, 503 服务不可用
     *
     * 【前端类比】
     * - 前端 fetch 后通过 response.status 获取状态码
     * - 前端通常只关心 200/401/403/404/500，后端需要精确使用每一个状态码
     * - 正确的状态码让前端能做精准的错误处理（如 401 跳登录页，403 显示无权限）
     *
     * @param code HTTP 状态码
     * @return this（支持链式调用）
     */
    public HttpResponse status(int code) {
        this.statusCode = code;
        this.statusMessage = getReasonPhrase(code);
        return this;
    }

    /**
     * 设置响应头
     *
     * 【常用响应头】
     * - Content-Type: 告诉浏览器如何解读响应体（前端最关心的头）
     * - Content-Length: 响应体字节长度（浏览器据此判断何时读取完成）
     * - Cache-Control: 缓存策略（前端性能优化的关键）
     * - Set-Cookie: 设置 Cookie（认证相关）
     *
     * 【前端类比】
     * - 相当于 Express 的 res.set('Content-Type', 'text/html')
     * - 前端在 DevTools → Network → Response Headers 看到的就是这些头
     *
     * @param name  头名称
     * @param value 头值
     * @return this（支持链式调用）
     */
    public HttpResponse header(String name, String value) {
        headers.put(name, value);
        return this;
    }

    /**
     * 设置响应体（文本内容）
     *
     * 【用途】返回 HTML、JSON、CSS 等文本数据
     * 自动将字符串编码为 UTF-8 字节并设置 Content-Length
     *
     * 【为什么要设置 Content-Length】
     * - 浏览器需要知道响应体有多长，才知道什么时候读取完成
     * - 没有它浏览器只能依赖连接关闭（Connection: close）来判断
     * - 前端类比：类似 arrayBuffer 的 byteLength
     */
    public HttpResponse body(String content) {
        this.body = content.getBytes(StandardCharsets.UTF_8);
        headers.put("Content-Length", String.valueOf(this.body.length));
        return this;
    }

    /**
     * 设置响应体（二进制数据，用于文件传输）
     *
     * 【用途】返回图片、字体、PDF 等二进制文件
     * 直接使用原始字节数组，不做编码转换
     *
     * 【前端类比】
     * - 前端通过 response.blob() 或 response.arrayBuffer() 获取二进制数据
     * - 这里我们从服务端设置这些二进制内容
     */
    public HttpResponse body(byte[] content) {
        this.body = content;
        headers.put("Content-Length", String.valueOf(content.length));
        return this;
    }

    /**
     * 将响应写入 OutputStream（发送给客户端）
     *
     * 【这是最终将 Java 对象序列化为 HTTP 报文并发送的步骤】
     *
     * 【写入顺序（严格遵循 HTTP 协议）】
     * 1. 状态行：HTTP/1.1 200 OK\r\n
     * 2. 响应头：Key: Value\r\n（每行一个）
     * 3. 空行：\r\n（分隔头部和主体，HTTP 协议的硬性规定）
     * 4. 响应体：文件内容 / HTML / JSON 等
     *
     * 【为什么用 \r\n 而非 \n】
     * - HTTP 协议规定行结束符必须是 CRLF（\r\n）
     * - \r = 回车 (Carriage Return)，\n = 换行 (Line Feed)
     * - Windows 文件用 \r\n，Unix 用 \n，HTTP 协议强制 \r\n
     *
     * 【前端类比】
     * - 类似 JSON.stringify(obj) 将对象序列化为字符串再发送
     * - Express 内部调用 res.end() 时也是做类似的事情
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
     * 根据状态码获取标准描述（Reason Phrase）
     *
     * 【用途】HTTP 状态行需要状态码后面跟一个人类可读的描述
     * 例：HTTP/1.1 404 Not Found（其中 "Not Found" 就是 reason phrase）
     *
     * 【注意】HTTP/2 已经移除了 reason phrase，只保留数字状态码
     * 但 HTTP/1.1 仍然需要它（虽然浏览器通常忽略它，依赖数字码判断）
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
