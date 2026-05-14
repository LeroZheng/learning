package com.learning.httpserver;

import java.io.IOException;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 基于 ServerSocket 的 HTTP/1.1 静态文件服务器
 *
 * 类比前端理解：
 * - ServerSocket 类似 webpack-dev-server 的监听端口
 * - 每个 Socket 连接类似浏览器发起的一个 HTTP 请求
 * - ExecutorService 线程池类似 Node.js 的 libuv 线程池，处理并发请求
 */
public class HttpServer {

    private final int port;
    private final Path webRoot;
    private final ExecutorService threadPool;
    private volatile boolean running = false;

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
     * 优雅关闭服务器
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
