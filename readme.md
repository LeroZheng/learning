# Learning - 后端学习项目

## 项目概述

这是一个面向前端开发者的后端学习仓库，通过从零实现后端基础设施来理解后端核心概念。项目采用"动手实现"的学习方式，每个子项目都从底层原理出发，不依赖高层框架，帮助建立对后端技术的深入理解。

---

## 项目信息

| 属性 | 值 |
|------|------|
| **仓库** | LeroZheng/learning |
| **语言** | Java 17 |
| **构建工具** | Maven 3.9+ |
| **目标用户** | 前端开发者转后端 |
| **学习方法** | 底层实现 → 原理理解 → 框架对比 |

---

## 仓库结构

```
learning/
├── readme.md                    # 项目总览与架构文档（本文件）
├── .kiro/
│   └── skills/
│       └── backend-mentor.md    # Kiro Skill：后端学习辅助指令集
└── http-server/                 # 子项目：HTTP 静态文件服务器
    ├── pom.xml                  # Maven 构建配置
    ├── README.md                # 子项目说明
    ├── .gitignore
    ├── src/
    │   ├── main/
    │   │   ├── java/com/learning/httpserver/
    │   │   │   ├── HttpServer.java          # 入口：ServerSocket 监听 + 线程池
    │   │   │   ├── RequestHandler.java      # 请求处理：路由/文件服务/安全防护
    │   │   │   ├── HttpRequest.java         # HTTP 请求报文解析器
    │   │   │   ├── HttpResponse.java        # HTTP 响应报文构建器
    │   │   │   ├── MimeTypes.java           # MIME 类型映射（30+ 种）
    │   │   │   └── HttpParseException.java  # 请求解析异常
    │   │   └── resources/
    │   │       └── webroot/                 # 内置资源目录（备用）
    │   └── test/java/                       # 测试代码（待添加）
    └── webroot/                             # 默认静态文件服务目录
        ├── index.html                       # 首页
        ├── css/style.css                    # 样式文件
        ├── js/app.js                        # JavaScript 文件
        ├── data/
        │   ├── info.json                    # JSON 示例
        │   └── config.xml                   # XML 示例
        └── images/
            └── readme.txt                   # 图片目录占位
```

---

## 系统架构

### 整体架构（当前）

```
┌─────────────────────────────────────────────────────────────┐
│                      learning 仓库                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              http-server (子项目)                     │   │
│   │                                                     │   │
│   │   浏览器 ──HTTP请求──→ ServerSocket (端口 8080)       │   │
│   │                           │                         │   │
│   │                     线程池分发                        │   │
│   │                           │                         │   │
│   │                    RequestHandler                    │   │
│   │                     ┌─────┼─────┐                   │   │
│   │                     ▼     ▼     ▼                   │   │
│   │               解析请求  安全检查  路由处理             │   │
│   │                                 │                   │   │
│   │                     ┌───────────┼───────────┐       │   │
│   │                     ▼           ▼           ▼       │   │
│   │               静态文件服务   目录列表     错误页面     │   │
│   │                     │                               │   │
│   │                     ▼                               │   │
│   │              HttpResponse 构建                       │   │
│   │                     │                               │   │
│   │                     ▼                               │   │
│   │              返回给浏览器                             │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │           .kiro/skills (学习辅助配置)                 │   │
│   │                                                     │   │
│   │   backend-mentor.md → 指导 AI 如何辅助后端学习        │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## http-server 架构详解

### 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                    网络层 (Network Layer)                     │
│                                                             │
│   ServerSocket 监听端口，接收 TCP 连接                        │
│   类比前端：webpack-dev-server 启动监听                       │
├─────────────────────────────────────────────────────────────┤
│                   并发层 (Concurrency Layer)                  │
│                                                             │
│   ExecutorService 线程池，每个请求分配一个线程处理              │
│   类比前端：Node.js 的 libuv 线程池                           │
├─────────────────────────────────────────────────────────────┤
│                   协议层 (Protocol Layer)                     │
│                                                             │
│   HttpRequest  - 解析 HTTP/1.1 请求报文（请求行 + 请求头）     │
│   HttpResponse - 构建 HTTP/1.1 响应报文（状态行 + 响应头 + 体）│
│   类比前端：fetch API 的 Request/Response 对象                │
├─────────────────────────────────────────────────────────────┤
│                   安全层 (Security Layer)                     │
│                                                             │
│   路径穿越防护 - normalize() + startsWith() 校验             │
│   HTML 转义 - 防止目录列表中的 XSS                           │
│   类比前端：路由守卫 (route guard) + DOMPurify               │
├─────────────────────────────────────────────────────────────┤
│                   业务层 (Business Layer)                     │
│                                                             │
│   RequestHandler - 路由分发 + 静态文件 + 目录列表 + 错误处理  │
│   MimeTypes - 文件扩展名 → Content-Type 映射                 │
│   类比前端：Express 的路由中间件 + static 中间件              │
├─────────────────────────────────────────────────────────────┤
│                   存储层 (Storage Layer)                      │
│                                                             │
│   文件系统 (java.nio.file) - 读取 webroot 目录下的静态文件    │
│   类比前端：public/ 目录的文件被原样输出                      │
└─────────────────────────────────────────────────────────────┘
```

### 核心模块职责

| 模块 | 文件 | 职责 | 用途 |
|------|------|------|------|
| **入口 & 监听** | HttpServer.java | 端口监听、连接接收、线程池管理、优雅停机 | 整个服务的启动入口，管理生命周期 |
| **请求处理** | RequestHandler.java | 协调请求解析→安全检查→路由→响应 | 类似 Controller，串联所有处理逻辑 |
| **请求解析** | HttpRequest.java | 解析 HTTP 报文为 Java 对象 | 从原始字节流提取结构化信息 |
| **响应构建** | HttpResponse.java | 构建 HTTP 响应并写入 Socket | 将处理结果序列化为标准 HTTP 报文 |
| **MIME 识别** | MimeTypes.java | 文件扩展名→Content-Type 映射 | 告诉浏览器如何处理返回的文件 |
| **异常定义** | HttpParseException.java | 请求解析失败时抛出 | 区分"请求格式错误"和"服务器内部错误" |

### 请求处理流程

```
浏览器发起 GET /css/style.css HTTP/1.1
    │
    ▼
[1. ServerSocket.accept()] 接收 TCP 连接
    │
    ▼
[2. 线程池分发] 将 Socket 交给空闲线程
    │
    ▼
[3. HttpRequest.parse()] 解析请求行和请求头
    │   ├── 解析失败 → 400 Bad Request
    │
    ▼
[4. 方法检查] 只允许 GET / HEAD
    │   ├── 其他方法 → 405 Method Not Allowed
    │
    ▼
[5. 路径安全检查] resolveSecurePath()
    │   ├── normalize() 去除 ../
    │   ├── startsWith(webRoot) 确保在根目录内
    │   ├── 检查失败 → 403 Forbidden
    │
    ▼
[6. 路由决策]
    ├── 是目录？
    │     ├── 有 index.html → 返回 index.html
    │     └── 无 index.html → 生成目录列表页
    ├── 是文件？→ 读取文件 + 识别 MIME 类型 → 200 OK
    └── 不存在？→ 404 Not Found
    │
    ▼
[7. HttpResponse 构建] 状态行 + 响应头 + 响应体
    │
    ▼
[8. 写入 OutputStream] 发送给浏览器
    │
    ▼
[9. 关闭连接] Socket.close()
```

---

## 技术选型

| 技术 | 选择 | 选择理由 |
|------|------|---------|
| 语言 | Java 17 | 强类型+丰富的标准库，企业级后端主流语言 |
| 网络 | ServerSocket | 最底层的 TCP 通信 API，理解 HTTP 本质 |
| 并发 | ExecutorService | 理解线程池模型，对比 Node.js 事件循环 |
| 文件 I/O | java.nio.file | 现代文件操作 API，支持路径规范化 |
| 构建 | Maven | Java 标准构建工具，管理编译/打包/依赖 |
| Java 版本 | 17 LTS | 长期支持版本，支持 switch 表达式、文本块等现代语法 |

---

## 安全设计

| 威胁 | 攻击示例 | 防护措施 | 实现位置 |
|------|---------|---------|---------|
| 路径穿越 | `GET /../../etc/passwd` | `Path.normalize()` + `startsWith(webRoot)` | RequestHandler.resolveSecurePath() |
| XSS（目录列表） | 文件名包含 `<script>` | HTML 实体转义 | RequestHandler.escapeHtml() |
| 方法滥用 | `DELETE /index.html` | 仅允许 GET/HEAD | RequestHandler.run() |
| 资源耗尽 | 大量并发连接 | 固定大小线程池 | HttpServer 构造函数 |

---

## 构建与运行

```bash
# 进入项目目录
cd http-server

# 编译
mvn clean compile

# 打包
mvn clean package

# 运行（默认端口 8080，服务 ./webroot 目录）
java -jar target/http-server-1.0.0.jar

# 自定义端口和目录
java -jar target/http-server-1.0.0.jar -p 3000 -r /path/to/files
```

---

## 学习路线规划

本仓库计划按以下路线逐步添加子项目：

| 阶段 | 子项目 | 学习目标 | 状态 |
|------|--------|---------|------|
| 1 | http-server | 网络编程、HTTP 协议、多线程、文件 I/O | ✅ 已完成 |
| 2 | database-crud | 数据库连接、SQL、ORM、事务 | 📋 规划中 |
| 3 | auth-service | 认证授权、JWT、Session、加密 | 📋 规划中 |
| 4 | rest-api | RESTful 设计、JSON 序列化、参数校验 | 📋 规划中 |
| 5 | cache-demo | Redis 缓存、缓存策略、连接池 | 📋 规划中 |
| 6 | message-queue | 异步处理、消息队列、事件驱动 | 📋 规划中 |
| 7 | docker-deploy | 容器化、Dockerfile、Compose 编排 | 📋 规划中 |

---

## 前端→后端 概念对照速查

| 你已经会的（前端） | 对应的后端概念 | 本仓库哪个项目体现 |
|-----------------|--------------|-----------------|
| webpack-dev-server 监听端口 | ServerSocket 监听 | http-server |
| fetch / axios 发请求 | HTTP 请求报文解析 | http-server |
| res.json() 返回数据 | HTTP 响应报文构建 | http-server |
| 路由守卫 beforeEach | 路径安全检查 | http-server |
| public/ 静态资源目录 | webroot 文件服务 | http-server |
| Content-Type / MIME | MimeTypes 映射 | http-server |
| Promise / async-await | 线程池并发处理 | http-server |
| npm scripts | Maven 构建 | http-server |
