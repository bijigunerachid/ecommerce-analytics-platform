# Analytics image: Apache Spark 4.1 (Java 21, Python 3.10) + the Kafka connector + psycopg.
FROM apache/spark:4.1.3-python3

USER root

# Apply pending OS security updates: the upstream Spark image is not rebuilt often enough
# (65 security updates were pending when this was added).
RUN apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && rm -rf /var/lib/apt/lists/*

# Kafka connector for Structured Streaming and its runtime dependencies, downloaded at build
# time (so jobs never fetch anything at runtime) and verified against Maven Central checksums.
ARG MAVEN=https://repo1.maven.org/maven2
RUN set -eux; \
    cd "$SPARK_HOME/jars"; \
    fetch() { curl -fsSL -o "$2" "$MAVEN/$1/$2"; echo "$3  $2" | sha1sum -c -; }; \
    fetch org/apache/spark/spark-sql-kafka-0-10_2.13/4.1.3 spark-sql-kafka-0-10_2.13-4.1.3.jar fa6f5869ac9f8f183e1941e0a8faae6257fd1ca2; \
    fetch org/apache/spark/spark-token-provider-kafka-0-10_2.13/4.1.3 spark-token-provider-kafka-0-10_2.13-4.1.3.jar 3903171bdc843d9560916a91ada4ecf9d10db1e7; \
    fetch org/apache/kafka/kafka-clients/3.9.1 kafka-clients-3.9.1.jar 86ca079953ed5606257ff298c24666b26da6985b; \
    fetch org/apache/commons/commons-pool2/2.12.1 commons-pool2-2.12.1.jar e5c7b6c9f5a4b59be2bba213fbec70b413376fc1

COPY requirements.txt requirements-dev.txt /tmp/
# The base image's pip, setuptools, and wheel (Ubuntu 22.04 packages) have known
# vulnerabilities (found with pip-audit); upgrade them before installing anything else.
RUN pip3 install --no-cache-dir --upgrade pip setuptools wheel \
 && pip3 install --no-cache-dir -r /tmp/requirements.txt -r /tmp/requirements-dev.txt

# Data directory for Parquet history and streaming checkpoints (a named volume in Compose).
RUN mkdir -p /data && chown spark:spark /data

WORKDIR /app
COPY --chown=spark:spark . /app

# Make PySpark and the project importable for plain `python`/`pytest`, not only spark-submit.
# The base image does not put Spark's bin/ on PATH.
ENV PATH=/opt/spark/bin:$PATH \
    PYTHONPATH=/app/src:/opt/spark/python:/opt/spark/python/lib/py4j-0.10.9.9-src.zip \
    PYSPARK_PYTHON=python3 \
    ANALYTICS_DATA_DIR=/data

USER spark

CMD ["spark-submit", "--driver-memory", "1g", "bin/stream_events.py"]
