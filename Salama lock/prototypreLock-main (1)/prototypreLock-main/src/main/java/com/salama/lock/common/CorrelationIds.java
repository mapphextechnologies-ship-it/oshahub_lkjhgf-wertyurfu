package com.salama.lock.common;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.util.StringUtils;

/** Resolves the request correlation id (header or filter-generated). */
public final class CorrelationIds {

    public static final String HEADER = "X-Correlation-Id";
    public static final String REQUEST_ATTR = "salama.correlationId";

    private CorrelationIds() {}

    public static String from(HttpServletRequest request) {
        Object attr = request.getAttribute(REQUEST_ATTR);
        if (attr instanceof String s && StringUtils.hasText(s)) {
            return s.trim();
        }
        String header = request.getHeader(HEADER);
        return StringUtils.hasText(header) ? header.trim() : null;
    }
}
