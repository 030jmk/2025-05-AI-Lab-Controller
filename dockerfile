# Stage 1: Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Use npm install instead of npm ci for more flexibility
# We'll use the --production flag to skip devDependencies
RUN npm install --production

# Copy source files
COPY . .

# Stage 2: Production stage
FROM node:18-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

# Copy the installed node_modules from the builder stage
# This approach means we only install dependencies once
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy package files (for reference and for npm scripts if any)
COPY --chown=nodejs:nodejs package*.json ./

# Copy application files
COPY --chown=nodejs:nodejs . .

USER nodejs

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]