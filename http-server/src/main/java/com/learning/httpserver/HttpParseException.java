package com.learning.httpserver;

/**
 * ====================================================================
 * 📌 功能用途说明：HttpParseException（HTTP 请求解析异常）
 * ====================================================================
 *
 * 【这个功能是什么】
 * 自定义异常类，在 HTTP 请求报文格式无效时抛出，
 * 用于区分"客户端发了错误请求"（400）和"服务器内部出错"（500）。
 *
 * 【为什么需要它（解决什么问题）】
 * - 如果没有它：所有异常都是通用的 IOException 或 RuntimeException，
 *   无法区分是"网络中断"还是"请求格式错误"
 * - 有了它：RequestHandler 可以精准地 catch HttpParseException → 返回 400，
 *   catch Exception → 返回 500
 * - 这是"异常驱动的错误分类"设计模式
 * - 前端类比：类似自定义 Error 类（class ValidationError extends Error）来区分
 *   表单校验错误和网络请求错误
 *
 * 【它在系统中的位置】
 * <pre>
 * Socket InputStream（原始字节流）
 *        │
 *        ▼
 * HttpRequest.parse()
 *        │
 *        ├── 解析成功 → 返回 HttpRequest 对象
 *        │
 *        └── 格式错误 → throw [👉 HttpParseException]
 *                              │
 *                              ▼
 *                    RequestHandler catch → 返回 400 Bad Request
 * </pre>
 *
 * 【它与其他模块的关系】
 * - 上游（谁抛出）：HttpRequest.parse() 在遇到非法请求时抛出
 * - 下游（谁捕获）：RequestHandler.run() 捕获并返回 400 错误页面
 * - 与 IOException 的区别：
 *   · IOException = 网络层故障（连接断开、超时）→ 无法响应
 *   · HttpParseException = 请求格式错误（可响应 400）
 *
 * 【前端开发者视角的理解】
 * - 相当于前端自定义的 class ApiError extends Error { statusCode: number }
 * - 类似 JSON.parse() 抛出 SyntaxError 来表示"输入格式不对"
 * - 在 axios 拦截器中区分 network error 和 response error 的思路是一样的
 * - Java 用 checked exception（编译器强制处理）来确保调用者不会忽略错误
 *
 * 【典型使用场景】
 * 1. 空请求行：浏览器预连接但未发送数据 → "Empty request line"
 * 2. 格式错误：非法 HTTP 报文（如 "INVALID" 而非 "GET / HTTP/1.1"）→ "Invalid request line"
 * 3. 字节解码失败：请求中包含无法识别的字节序列
 *
 * 【Java 异常体系知识点】
 * - extends Exception = Checked Exception（调用者必须 try-catch 或 throws 声明）
 * - extends RuntimeException = Unchecked Exception（调用者可以不处理）
 * - 这里选择 Checked Exception 是因为请求解析失败是"预期内的异常情况"，
 *   调用者必须有意识地处理它
 * ====================================================================
 */
public class HttpParseException extends Exception {

    public HttpParseException(String message) {
        super(message);
    }

    public HttpParseException(String message, Throwable cause) {
        super(message, cause);
    }
}
