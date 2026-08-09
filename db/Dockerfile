FROM pgvector/pgvector:pg16

COPY init/01-init.sh /docker-entrypoint-initdb.d/01-init.sh
RUN chmod +x /docker-entrypoint-initdb.d/01-init.sh
