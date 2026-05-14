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
 * HTTP 请求处理器（每个请求一个线程执行）
 *
 * 类比前端理解：
 * - 这相当于 Express 中的路由处理函数 (req, res) => { ... }
 * - 接收解析后的请求，决定如何响应
 * - 区别是：Express 帮你做了底层通信，这里我们自己处理 Socket I/O
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
     * 路径穿越攻击防护
     *
     * 攻击原理：
     * 攻击者请求 GET /../../etc/passwd 试图读取系统文件
     *
     * 防护策略：
     * 1. 将请求路径与 webRoot 拼接
     * 2. 使用 normalize() 去除 ../ 等相对路径
     * 3. 检查最终路径是否仍在 webRoot 内
     *
     * 类比前端：类似前端路由守卫 (route guard)，在处理前先验证合法性
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
     * 类比前端理解：
     * - 类似 webpack-dev-server 打开一个没有 index.html 的目录时看到的文件列表
     * - 这里我们手动构建 HTML 返回
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
     */
    private String formatFileSize(long bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return String.format("%.1f KB", bytes / 1024.0);
        if (bytes < 1024 * 1024 * 1024) return String.format("%.1f MB", bytes / (1024.0 * 1024));
        return String.format("%.1f GB", bytes / (1024.0 * 1024 * 1024));
    }

    /**
     * HTML 转义，防止 XSS
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
     */
    private void log(String message) {
        String timestamp = LocalDateTime.now()
                .format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        String clientAddr = clientSocket.getInetAddress().getHostAddress();
        System.out.printf("[%s] %s - %s%n", timestamp, clientAddr, message);
    }
}
