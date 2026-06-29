FROM nginx:alpine

RUN apk add --no-cache openssl

COPY nginx.conf /etc/nginx/conf.d/default.conf

RUN mkdir -p /etc/nginx/certs && \
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /etc/nginx/certs/key.pem \
    -out /etc/nginx/certs/cert.pem \
    -subj "/CN=77.93.154.87" \
    -addext "subjectAltName=IP:77.93.154.87"

EXPOSE 443

CMD ["nginx", "-g", "daemon off;"]