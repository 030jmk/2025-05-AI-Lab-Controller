# Use the official Node.js image as base
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package files first (this helps with Docker layer caching)
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy the rest of your application files
COPY . .

# Expose the port your app runs on
# Azure will set the PORT environment variable
EXPOSE 3000

# Start your application
CMD ["node", "server.js"]