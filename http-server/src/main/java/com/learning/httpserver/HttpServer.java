package com.learning.httpserver;

import java.io.IOException;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * ====================================================================
 * 📌 功能用途说明：HttpServer（服务器入口 & 连接管理）
 * ====================================================================
 *
 * 【这个功能是什么】
 * 整个 HTTP 服务器的入口类，负责在指定端口监听 TCP 连接，
 * 并通过线程池将每个连接分发给 RequestHandler 处理。
 *
 * 【为什么需要它（解决什么问题）】
 * - 如果没有它：程序无法接收网络请求，浏览器无法访问你的服务
 * - 它解决了"如何让一个 Java 程序变成网络服务"的核心问题
 * - 同时通过线程池解决了"多个用户同时访问时不会卡死"的并发问题
 * - 前端类比：没有 webpack-dev-server 的 listen()，你的页面就无法在浏览器打开
 *
 * 【它在系统中的位置】
 * <pre>
 * 浏览器 ─── TCP 连接 ──→ [👉 HttpServer (ServerSocket)]
 *                                    │
 *                              线程池分发
 *                                    │
 *                                    ▼
 *                           [RequestHandler]
 *                                    │
 *                                    ▼
 *                           [HttpRequest / HttpResponse]
 * </pre>
 *
 * 【它与其他模块的关系】
 * - 上游：操作系统网络栈 → 浏览器发起的 TCP 连接
 * - 下游：RequestHandler（将 Socket 连接交给它处理具体请求）
 * - 依赖：
 *   · java.net.ServerSocket —— 底层 TCP 监听
 *   · java.util.concurrent.ExecutorService —— 线程池管理并发
 *   · java.nio.file.Path —— webRoot 目录路径
 *
 * 【前端开发者视角的理解】
 * - 相当于 Express 的 app.listen(8080)，但这里我们自己实现了底层
 * - 相当于 webpack-dev-server 启动后在终端看到 "Listening on port 8080"
 * - ExecutorService 线程池 ≈ Node.js 的 libuv 线程池（处理 I/O 密集任务）
 * - volatile running + shutdown hook ≈ 前端 SPA 的 beforeunload 优雅退出
 *
 * 【典型使用场景】
 * 1. 开发环境：启动后浏览器访问 localhost:8080 查看静态页面
 * 2. 文件共享：在局域网内快速共享目录文件（类似 python -m http.server）
 * 3. 学习目的：理解 HTTP 服务器底层是如何接收和分发请求的
 * ====================================================================
 */
public class HttpServer {

    private final int port;
    private final Path webRoot;
    private final ExecutorService threadPool;
    private volatile boolean running = false;

    /**
     * 构造函数：初始化服务器配置
     *
     * @param port    监听端口号（前端类比：webpack devServer.port）
     * @param webRoot 静态文件根目录（前端类比：webpack 的 contentBase / public 目录）
     *
     * 【为什么用固定大小线程池】
     * - 无限创建线程会耗尽系统资源（每个线程约占 1MB 栈内存）
     * - 固定大小 = CPU核心数 × 2，适合 I/O 密集型任务
     * - 前端类比：浏览器同一域名最多 6 个并发连接，也是类似的"限流"思想
     */
    public HttpServer(int port, Path webRoot) {
        this.port = port;
        this.webRoot = webRoot.toAbsolutePath().normalize();
        // 固定大小线程池，防止无限创建线程导致资源耗尽
        this.threadPool = Executors.newFixedThreadPool(
                Runtime.getRuntime().availableProcessors() * 2
        );
    }

    /**
     * 启动服务器，开始监听端口
     *
     * 【核心流程】
     * 1. 创建 ServerSocket 绑定端口
     * 2. 进入无限循环，调用 accept() 等待客户端连接
     * 3. 每收到一个连接，封装为 RequestHandler 提交到线程池
     *
     * 【为什么 accept() 放在 while 循环里】
     * - 一次 accept() 只处理一个连接，循环才能持续接收新连接
     * - 前端类比：addEventListener 注册后持续监听事件，而非只触发一次
     *
     * 【为什么用 try-with-resources】
     * - 确保 ServerSocket 在异常或退出时自动关闭，释放端口
     * - 前端类比：类似 finally 中清理 WebSocket 连接
     */
    public void start() {
        running = true;
        System.out.println("========================================");
        System.out.println("  Simple HTTP Server v1.0");
        System.out.println("========================================");
        System.out.println("  Port:     " + port);
        System.out.println("  WebRoot:  " + webRoot);
        System.out.println("  Threads:  " + Runtime.getRuntime().availableProcessors() * 2);
        System.out.println("========================================");
        System.out.println("  http://localhost:" + port);
        System.out.println("========================================");

        try (ServerSocket serverSocket = new ServerSocket(port)) {
            System.out.println("[INFO] Server started, waiting for connections...");

            while (running) {
                // accept() 会阻塞，直到有新的客户端连接进来
                // 类比：像 Express 的 app.listen() 后等待请求到来
                Socket clientSocket = serverSocket.accept();
                // 将请求处理交给线程池，不阻塞主线程接收新连接
                threadPool.submit(new RequestHandler(clientSocket, webRoot));
            }
        } catch (IOException e) {
            if (running) {
                System.err.println("[ERROR] Server error: " + e.getMessage());
                e.printStackTrace();
            }
        } finally {
            shutdown();
        }
    }

    /**
     * 优雅关闭服务器（Graceful Shutdown）
     *
     * 【为什么需要优雅关闭】
     * - 直接 kill 进程会导致正在处理的请求中断，客户端收到连接重置错误
     * - 优雅关闭：先停止接收新请求，等待已有请求处理完毕，再退出
     * - 前端类比：SPA 路由切换时先 abort 未完成的 fetch，而非直接销毁组件
     *
     * 【volatile 关键字的作用】
     * - 确保 running 变量的修改对所有线程立即可见
     * - 前端没有这个问题（JS 单线程），但 Java 多线程需要处理内存可见性
     */
    public void shutdown() {
        running = false;
        threadPool.shutdown();
        System.out.println("[INFO] Server shut down.");
    }

    public static void main(String[] args) {
        // 默认配置
        int port = 8080;
        String rootDir = "./webroot";

        // 解析命令行参数
        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "-p", "--port" -> {
                    if (i + 1 < args.length) {
                        port = Integer.parseInt(args[++i]);
                    }
                }
                case "-r", "--root" -> {
                    if (i + 1 < args.length) {
                        rootDir = args[++i];
                    }
                }
                case "-h", "--help" -> {
                    printUsage();
                    return;
                }
            }
        }

        Path webRoot = Path.of(rootDir).toAbsolutePath().normalize();

        // 检查 webroot 目录是否存在
        if (!Files.isDirectory(webRoot)) {
            System.err.println("[ERROR] WebRoot directory not found: " + webRoot);
            System.err.println("[INFO] Creating directory...");
            try {
                Files.createDirectories(webRoot);
            } catch (IOException e) {
                System.err.println("[ERROR] Failed to create directory: " + e.getMessage());
                System.exit(1);
            }
        }

        HttpServer server = new HttpServer(port, webRoot);

        // 注册 JVM 关闭钩子，优雅停机
        // 【用途】当用户按 Ctrl+C 或 kill 进程时，JVM 会先执行这个钩子
        // 前端类比：window.addEventListener('beforeunload', cleanup)
        Runtime.getRuntime().addShutdownHook(new Thread(server::shutdown));

        server.start();
    }

    private static void printUsage() {
        System.out.println("Usage: java -jar http-server.jar [options]");
        System.out.println();
        System.out.println("Options:");
        System.out.println("  -p, --port <port>    Server port (default: 8080)");
        System.out.println("  -r, --root <path>    Web root directory (default: ./webroot)");
        System.out.println("  -h, --help           Show this help message");
    }
}
