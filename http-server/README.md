# Simple HTTP Server

基于 Java `ServerSocket` 实现的 HTTP/1.1 静态文件服务器。

## 特性

- **底层实现**: 基于 `ServerSocket`，不依赖任何 Web 框架
- **HTTP/1.1 协议解析**: 手动解析请求行、请求头
- **静态文件服务**: 支持各种文件类型的读取和传输
- **目录列表**: 自动生成美观的目录浏览页面
- **MIME 类型识别**: 支持 html, css, js, json, xml, 图片, 字体等 30+ 种类型
- **安全防护**: 路径穿越攻击防护
- **错误处理**: 400, 403, 404, 405, 500 错误页面
- **多线程**: 使用线程池处理并发请求

## 构建与运行

### 前置要求

- Java 17+
- Maven 3.6+

### 构建

```bash
cd http-server
mvn clean package
```

### 运行

```bash
# 使用默认配置（端口 8080，webroot 为 ./webroot）
java -jar target/http-server-1.0.0.jar

# 指定端口和目录
java -jar target/http-server-1.0.0.jar -p 3000 -r /path/to/your/files

# 查看帮助
java -jar target/http-server-1.0.0.jar --help
```

### 命令行参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `-p, --port` | 服务器端口 | 8080 |
| `-r, --root` | 静态文件根目录 | ./webroot |
| `-h, --help` | 显示帮助信息 | - |

## 项目结构

```
http-server/
├── pom.xml                          # Maven 配置
├── src/main/java/com/learning/httpserver/
│   ├── HttpServer.java              # 主类：ServerSocket 监听 + 线程池
│   ├── RequestHandler.java          # 请求处理器：路由 + 文件服务 + 目录列表
│   ├── HttpRequest.java             # HTTP 请求解析器
│   ├── HttpResponse.java            # HTTP 响应构建器
│   ├── HttpParseException.java      # 解析异常
│   └── MimeTypes.java               # MIME 类型映射
└── webroot/                         # 默认静态文件目录
    ├── index.html
    ├── css/style.css
    ├── js/app.js
    ├── data/info.json
    └── images/
```

## 学习要点

### 对前端开发者的类比

| 后端概念 | 前端类比 |
|---------|---------|
| ServerSocket 监听 | webpack-dev-server 启动 |
| Socket 连接 | 浏览器发起的 fetch 请求 |
| 线程池 | Node.js 的 libuv 线程池 |
| 请求解析 | URL 构造函数 `new URL(...)` |
| 响应构建 | Express 的 `res.status().send()` |
| MIME 类型 | `<script type="...">` 的 type 属性 |
| 路径穿越防护 | 前端路由守卫 (route guard) |
