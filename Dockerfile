# Base Image
FROM node:18-slim

# Set working directory
WORKDIR /app

# Install system dependencies (for Native Modules if needed)
# RUN apt-get update && apt-get install -y python3 make g++

# Copy Package definitions FIRST (Layer Caching)
COPY bot/package*.json ./bot/
COPY agent/package*.json ./agent/

# Install Agent Dependencies
WORKDIR /app/agent
RUN npm install

# Install Bot Dependencies
WORKDIR /app/bot
RUN npm install

# Copy Source Code
COPY agent ./agent
COPY bot ./bot

# Copy Environment Variables (Ensure this is SECURE in real prod, typically injected via AWS Secrets Manager)
COPY .env ./

# Expose Port (Optional, App Runner likes port 8080 usually, but bots are outbound)
EXPOSE 8080

# Start Command (Runs both bots)
WORKDIR /app/bot
CMD ["npm", "run", "start"]
