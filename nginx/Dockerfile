FROM nginx:alpine

# Remove default nginx configs
RUN rm -rf /etc/nginx/conf.d/* /etc/nginx/nginx.conf

# Copy custom NGINX load balancer configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy static frontend web assets
COPY ../public /usr/share/nginx/html

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
