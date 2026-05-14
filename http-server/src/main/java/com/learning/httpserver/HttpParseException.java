package com.learning.httpserver;

/**
 * HTTP 请求解析异常
 */
public class HttpParseException extends Exception {

    public HttpParseException(String message) {
        super(message);
    }

    public HttpParseException(String message, Throwable cause) {
        super(message, cause);
    }
}
