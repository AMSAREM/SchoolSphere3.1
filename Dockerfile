# Stage 1: Build stage
FROM node:22-alpine AS builder

# Set working directory inside container
WORKDIR /app

# Copy dependency definition files first for better caching
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies) to allow building
RUN npm ci

# Copy the entire workspace to build the application
COPY . .

# Run the build process (produces dist/ folder containing built SPA)
RUN npm run build

# Stage 2: Runner stage
FROM node:22-alpine AS runner

# Set working directory inside container
WORKDIR /app

# Set production environment and default port
ENV NODE_ENV=production
ENV PORT=3000

# Copy dependency definition files
COPY package.json package-lock.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy the compiled production SPA and server runtime files from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/src/lib ./src/lib
COPY --from=builder /app/public ./public
COPY --from=builder /app/database.sql ./database.sql

# Expose the application port
EXPOSE 3000

# Start the full-stack server
CMD ["npm", "start"]
