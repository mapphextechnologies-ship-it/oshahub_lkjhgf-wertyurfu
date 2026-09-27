# syntax=docker/dockerfile:1.7

# Stage 1 — build fat jar with Maven + Java 21
FROM maven:3.9.9-eclipse-temurin-21-alpine AS build
WORKDIR /workspace

# Dependency layer: invalidated only when pom.xml changes
COPY pom.xml .
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -q org.apache.maven.plugins:maven-dependency-plugin:3.6.1:go-offline -DskipTests \
    || true

# Compile layer: invalidated when sources change; reuses BuildKit Maven cache
COPY src ./src

ARG BUILD_SKIP_TESTS=false
RUN --mount=type=cache,target=/root/.m2 \
    if [ "$BUILD_SKIP_TESTS" = "true" ]; then \
      mvn -B package -DskipTests; \
    else \
      mvn -B package; \
    fi

# Stage 2 — lightweight JRE runtime
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# BusyBox adduser/wget are already on Alpine — no apk install required
RUN addgroup -S salama \
    && adduser -S salama -G salama

COPY --from=build /workspace/target/salama-lock-*.jar /app/app.jar

USER salama

EXPOSE 8080

# Container-aware JVM defaults; override via JAVA_OPTS
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75.0 -XX:+UseContainerSupport -Djava.security.egd=file:/dev/./urandom"

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
