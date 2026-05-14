package com.learning.httpserver;

import java.io.IOException;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * ====================================================================
 * 📌 功能用途说明：RequestHandler（请求处理器）
 * ====================================================================
 *
 * 【这个功能是什么】
 * HTTP 请求的核心处理器，实现 Runnable 接口由线程池调度执行。
 * 负责完整的请求生命周期：解析请求 → 安全校验 → 路由分发 → 生成响应。
 *
 * 【为什么需要它（解决什么问题）】
 * - 如果没有它：ServerSocket 接收到连接后不知道该做什么，连接会被白白浪费
 * - 它将"原始 TCP 字节流"转化为"有意义的 HTTP 交互"
 * - 它集中处理了安全防护、路由决策、错误兜底等核心逻辑
 * - 前端类比：如果没有 Express 的路由中间件，每个请求都要从 TCP 层手动处理
 *
 * 【它在系统中的位置】
 * <pre>
 * HttpServer (ServerSocket.accept())
 *        │
 *        │  threadPool.submit(...)
 *        ▼
 * [👉 RequestHandler.run()]
 *        │
 *        ├── HttpRequest.parse()     ← 解析请求
 *        ├── resolveSecurePath()     ← 安全检查
 *        ├── serveFile()             ← 静态文件服务
 *        ├── serveDirectoryListing() ← 目录列表
 *        └── sendError()             ← 错误响应
 *              │
 *              ▼
 *        HttpResponse.writeTo(out)   → 返回给浏览器
 * </pre>
 *
 * 【它与其他模块的关系】
 * - 上游：HttpServer 通过线程池提交 RequestHandler 实例
 * - 下游：
 *   · HttpRequest —— 解析客户端发来的请求报文
 *   · HttpResponse —— 构建返回给客户端的响应报文
 *   · MimeTypes —— 查询文件对应的 Content-Type
 * - 依赖：
 *   · java.net.Socket —— 客户端连接（获取输入/输出流）
 *   · java.nio.file —— 文件系统操作（读取文件、列出目录）
 *   · webRoot 路径 —— 限定文件访问的安全边界
 *
 * 【前端开发者视角的理解】
 * - 相当于 Express 中 app.get('*', (req, res) => {...}) 这个万能路由处理函数
 * - resolveSecurePath() ≈ Vue Router 的 beforeEach 路由守卫
 * - serveFile() ≈ Express 的 express.static() 中间件
 * - serveDirectoryListing() ≈ webpack-dev-server 打开没有 index.html 的目录
 * - sendError() ≈ axios 拦截器中统一处理错误并返回友好提示
 *
 * 【典型使用场景】
 * 1. 浏览器请求 /index.html → 解析路径 → 安全检查通过 → 读取文件 → 返回 200
 * 2. 浏览器请求 /images/ → 目录无 index.html → 生成美观的目录列表页
 * 3. 攻击者请求 /../../etc/passwd → 安全检查拦截 → 返回 403
 * ====================================================================
 */
public class RequestHandler implements Runnable {

    private final Socket clientSocket;
    private final Path webRoot;

    public RequestHandler(Socket clientSocket, Path webRoot) {
        this.clientSocket = clientSocket;
        this.webRoot = webRoot;
    }

    @Override
    public void run() {
        try (clientSocket;
             OutputStream out = clientSocket.getOutputStream()) {

            // 1. 解析请求
            HttpRequest request = HttpRequest.parse(clientSocket.getInputStream());
            log(request.getMethod() + " " + request.getPath());

            // 2. 只支持 GET 和 HEAD 方法
            if (!request.getMethod().equals("GET") && !request.getMethod().equals("HEAD")) {
                sendError(out, 405, "Method Not Allowed",
                        "Only GET and HEAD methods are supported.");
                return;
            }

            // 3. 路径安全检查（防止路径穿越攻击）
            Path requestedPath = resolveSecurePath(request.getPath());
            if (requestedPath == null) {
                sendError(out, 403, "Forbidden",
                        "Access denied: path traversal detected.");
                return;
            }

            // 4. 处理请求
            if (Files.isDirectory(requestedPath)) {
                // 如果是目录，先尝试 index.html
                Path indexFile = requestedPath.resolve("index.html");
                if (Files.exists(indexFile) && Files.isRegularFile(indexFile)) {
                    serveFile(out, indexFile);
                } else {
                    // 否则显示目录列表
                    serveDirectoryListing(out, requestedPath, request.getPath());
                }
            } else if (Files.exists(requestedPath) && Files.isRegularFile(requestedPath)) {
                serveFile(out, requestedPath);
            } else {
                sendError(out, 404, "Not Found",
                        "The requested resource was not found: " + request.getPath());
            }

        } catch (HttpParseException e) {
            log("[WARN] Bad request: " + e.getMessage());
            try (OutputStream out = clientSocket.getOutputStream()) {
                sendError(out, 400, "Bad Request", e.getMessage());
            } catch (IOException ignored) {
            }
        } catch (Exception e) {
            log("[ERROR] " + e.getMessage());
            try (OutputStream out = clientSocket.getOutputStream()) {
                sendError(out, 500, "Internal Server Error",
                        "An unexpected error occurred.");
            } catch (IOException ignored) {
            }
        }
    }

    /**
     * 路径穿越攻击防护（Path Traversal Prevention）
     *
     * 【这个功能是什么】
     * 校验客户端请求的路径是否安全，防止通过 ../ 访问 webRoot 外的系统文件。
     *
     * 【攻击原理】
     * 攻击者请求 GET /../../etc/passwd 试图读取系统敏感文件。
     * 如果不做校验，拼接后变成 /webroot/../../etc/passwd = /etc/passwd
     *
     * 【防护策略（三步走）】
     * 1. 将请求路径与 webRoot 拼接：/webroot + /../../../etc/passwd
     * 2. 使用 normalize() 去除 ../ 等相对路径：得到 /etc/passwd
     * 3. 检查最终路径是否仍以 webRoot 开头：/etc/passwd 不以 /webroot 开头 → 拒绝
     *
     * 【前端类比】
     * - 类似 Vue Router 的 beforeEach 路由守卫，在处理前先验证合法性
     * - 类似前端表单校验：先 validate 再 submit
     * - 区别：前端校验可被绕过（客户端可修改），后端校验是最后一道防线
     *
     * @param requestPath 客户端请求的原始路径
     * @return 安全的绝对路径，如果检测到攻击则返回 null
     */
    private Path resolveSecurePath(String requestPath) {
        try {
            // 去掉开头的 /，拼接到 webRoot
            String relativePath = requestPath.startsWith("/")
                    ? requestPath.substring(1)
                    : requestPath;

            Path resolved = webRoot.resolve(relativePath).normalize();

            // 关键安全检查：解析后的路径必须在 webRoot 内
            if (!resolved.startsWith(webRoot)) {
                log("[SECURITY] Path traversal attempt blocked: " + requestPath);
                return null;
            }

            return resolved;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 提供静态文件服务
     *
     * 【这个功能是什么】
     * 读取磁盘上的文件并通过 HTTP 响应返回给浏览器。
     *
     * 【为什么需要它】
     * - 这是静态文件服务器的核心功能，没有它就只是一个 TCP echo 服务器
     * - 浏览器需要 HTML/CSS/JS 文件才能渲染页面
     *
     * 【前端类比】
     * - 相当于 Express 的 express.static('public') 中间件
     * - 相当于 Vite/Webpack Dev Server 自动响应 public/ 目录中的文件
     *
     * 【注意】
     * - 当前使用 readAllBytes 将整个文件加载到内存，适合小文件
     * - 大文件（如视频）应使用流式传输（streaming），避免内存溢出
     * - Cache-Control 头告诉浏览器可以缓存 1 小时（3600 秒）
     */
    private void serveFile(OutputStream out, Path filePath) throws IOException {
        byte[] fileBytes = Files.readAllBytes(filePath);
        String mimeType = MimeTypes.getMimeType(filePath.getFileName().toString());

        new HttpResponse()
                .status(200)
                .header("Content-Type", mimeType)
                .header("Cache-Control", "public, max-age=3600")
                .body(fileBytes)
                .writeTo(out);

        log("[200] " + filePath.getFileName() + " (" + fileBytes.length + " bytes)");
    }

    /**
     * 提供目录列表页面
     *
     * 【这个功能是什么】
     * 当访问的路径是目录且没有 index.html 时，动态生成一个包含文件列表的 HTML 页面。
     *
     * 【为什么需要它】
     * - 如果没有目录列表，访问一个目录只能返回 404 或空白页面
     * - 方便用户浏览目录结构、快速找到想要的文件
     *
     * 【前端类比】
     * - 类似 webpack-dev-server 打开一个没有 index.html 的目录时看到的文件列表
     * - 类似 VS Code 的文件资源管理器，但渲染成 HTML 页面
     * - 这里我们手动拼接 HTML 字符串返回（类似 SSR 服务端渲染）
     *
     * 【安全注意】
     * - 文件名经过 escapeHtml() 转义，防止恶意文件名导致 XSS
     * - 例如文件名 &lt;script&gt;alert(1)&lt;/script&gt;.txt 不会被浏览器执行
     *
     * @param out         输出流
     * @param dirPath     目录的文件系统路径
     * @param requestPath 原始请求路径（用于生成链接）
     */
    private void serveDirectoryListing(OutputStream out, Path dirPath, String requestPath)
            throws IOException {

        // 确保路径以 / 结尾
        String displayPath = requestPath.endsWith("/") ? requestPath : requestPath + "/";

        StringBuilder html = new StringBuilder();
        html.append("<!DOCTYPE html>\n")
                .append("<html lang=\"en\">\n<head>\n")
                .append("  <meta charset=\"UTF-8\">\n")
                .append("  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n")
                .append("  <title>Index of ").append(escapeHtml(displayPath)).append("</title>\n")
                .append("  <style>\n")
                .append("    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; ")
                .append("           max-width: 900px; margin: 0 auto; padding: 20px; }\n")
                .append("    h1 { color: #333; border-bottom: 1px solid #eee; padding-bottom: 10px; }\n")
                .append("    table { width: 100%; border-collapse: collapse; }\n")
                .append("    th, td { text-align: left; padding: 8px 12px; }\n")
                .append("    tr:hover { background: #f5f5f5; }\n")
                .append("    th { background: #fafafa; border-bottom: 2px solid #ddd; }\n")
                .append("    a { color: #0366d6; text-decoration: none; }\n")
                .append("    a:hover { text-decoration: underline; }\n")
                .append("    .size { color: #666; }\n")
                .append("    .dir { font-weight: bold; }\n")
                .append("    .icon { margin-right: 6px; }\n")
                .append("  </style>\n")
                .append("</head>\n<body>\n")
                .append("  <h1>Index of ").append(escapeHtml(displayPath)).append("</h1>\n")
                .append("  <table>\n")
                .append("    <thead><tr><th>Name</th><th>Size</th><th>Modified</th></tr></thead>\n")
                .append("    <tbody>\n");

        // 上级目录链接（如果不在根目录）
        if (!displayPath.equals("/")) {
            html.append("    <tr>")
                    .append("<td class=\"dir\"><span class=\"icon\">📁</span><a href=\"../\">../</a></td>")
                    .append("<td>-</td><td>-</td>")
                    .append("</tr>\n");
        }

        // 列出目录内容
        try (Stream<Path> entries = Files.list(dirPath).sorted()) {
            for (Path entry : entries.collect(Collectors.toList())) {
                String name = entry.getFileName().toString();
                boolean isDir = Files.isDirectory(entry);

                String icon = isDir ? "📁" : "📄";
                String link = isDir ? name + "/" : name;
                String size = isDir ? "-" : formatFileSize(Files.size(entry));
                String modified = Files.getLastModifiedTime(entry)
                        .toInstant()
                        .atZone(java.time.ZoneId.systemDefault())
                        .format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));

                String cssClass = isDir ? " class=\"dir\"" : "";

                html.append("    <tr>")
                        .append("<td").append(cssClass).append(">")
                        .append("<span class=\"icon\">").append(icon).append("</span>")
                        .append("<a href=\"").append(escapeHtml(link)).append("\">")
                        .append(escapeHtml(name)).append(isDir ? "/" : "").append("</a></td>")
                        .append("<td class=\"size\">").append(size).append("</td>")
                        .append("<td>").append(modified).append("</td>")
                        .append("</tr>\n");
            }
        }

        html.append("    </tbody>\n  </table>\n")
                .append("  <hr>\n")
                .append("  <p style=\"color:#999; font-size:12px;\">SimpleHTTP/1.0 Server</p>\n")
                .append("</body>\n</html>");

        new HttpResponse()
                .status(200)
                .header("Content-Type", "text/html; charset=utf-8")
                .body(html.toString())
                .writeTo(out);

        log("[200] Directory listing: " + displayPath);
    }

    /**
     * 发送错误响应页面
     *
     * 【这个功能是什么】
     * 统一的错误响应生成器，返回带有美观样式的错误页面。
     *
     * 【为什么需要它】
     * - 没有统一错误处理：每个错误场景都要重复写 HTML，代码冗余
     * - 用户体验：比浏览器默认的白屏 "Connection Reset" 友好得多
     * - 调试友好：开发时能快速知道是 404（找不到）还是 403（没权限）
     *
     * 【前端类比】
     * - 相当于 axios 响应拦截器中统一处理错误码并显示 toast/页面
     * - 相当于 React 的 ErrorBoundary fallback UI
     * - 相当于 Vue 的 router.onError() 统一错误页
     *
     * @param out     输出流
     * @param code    HTTP 状态码（400/403/404/405/500）
     * @param title   错误标题（如 "Not Found"）
     * @param message 错误详细描述
     */
    private void sendError(OutputStream out, int code, String title, String message) {
        String html = """
                <!DOCTYPE html>
                <html lang="en">
                <head>
                  <meta charset="UTF-8">
                  <title>%d %s</title>
                  <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                           display: flex; align-items: center; justify-content: center;
                           min-height: 80vh; margin: 0; color: #333; }
                    .error { text-align: center; }
                    h1 { font-size: 72px; margin: 0; color: #e74c3c; }
                    h2 { margin: 10px 0; color: #555; }
                    p { color: #777; }
                    a { color: #0366d6; }
                  </style>
                </head>
                <body>
                  <div class="error">
                    <h1>%d</h1>
                    <h2>%s</h2>
                    <p>%s</p>
                    <p><a href="/">← Back to Home</a></p>
                  </div>
                </body>
                </html>
                """.formatted(code, title, code, title, escapeHtml(message));

        try {
            new HttpResponse()
                    .status(code)
                    .header("Content-Type", "text/html; charset=utf-8")
                    .body(html)
                    .writeTo(out);
            log("[" + code + "] " + title);
        } catch (IOException e) {
            log("[ERROR] Failed to send error response: " + e.getMessage());
        }
    }

    /**
     * 格式化文件大小为人类可读格式
     *
     * 【用途】让目录列表中的文件大小易于阅读
     * 例：1024 → "1.0 KB"，1048576 → "1.0 MB"
     * 前端类比：类似 filesize.js 库或 Intl.NumberFormat 格式化数字
     */
    private String formatFileSize(long bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return String.format("%.1f KB", bytes / 1024.0);
        if (bytes < 1024 * 1024 * 1024) return String.format("%.1f MB", bytes / (1024.0 * 1024));
        return String.format("%.1f GB", bytes / (1024.0 * 1024 * 1024));
    }

    /**
     * HTML 转义，防止 XSS（跨站脚本攻击）
     *
     * 【为什么需要它】
     * - 文件名可能包含 HTML 特殊字符（如 < > & " '）
     * - 不转义直接插入 HTML 会被浏览器当作代码执行（XSS 攻击）
     * - 例：文件名 "&lt;img onerror=alert(1)&gt;" 若不转义会触发弹窗
     *
     * 【前端类比】
     * - 相当于 React 默认的 JSX 转义（{variable} 自动转义）
     * - 相当于 Vue 的 {{ }} 模板语法（自动转义 HTML 实体）
     * - 如果你在前端用 v-html 或 dangerouslySetInnerHTML，就失去了这层保护
     */
    private String escapeHtml(String text) {
        return text.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    /**
     * 日志输出
     *
     * 【用途】记录每个请求的处理情况，方便调试和监控
     * 格式：[时间] 客户端IP - 消息
     * 前端类比：类似浏览器 DevTools 的 Network 面板日志
     *
     * 【生产环境建议】
     * 实际项目应使用日志框架（如 Log4j2 / SLF4J），支持：
     * - 日志级别（DEBUG/INFO/WARN/ERROR）
     * - 日志文件轮转
     * - 结构化日志（JSON 格式，便于 ELK 等平台分析）
     */
    private void log(String message) {
        String timestamp = LocalDateTime.now()
                .format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        String clientAddr = clientSocket.getInetAddress().getHostAddress();
        System.out.printf("[%s] %s - %s%n", timestamp, clientAddr, message);
    }
}
