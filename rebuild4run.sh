#!/bin/bash
# Check if the script is run as root
if [ "$(id -u)" -ne 0 ]; then
    echo "This script must be run as root. Use 'sudo' to run it."
    exit 1
fi

# Function to detect available Docker Compose command
detect_docker_compose() {
    if command -v docker-compose &> /dev/null; then
        echo "docker-compose"
    elif command -v docker &> /dev/null && docker compose version &> /dev/null; then
        echo "docker compose"
    else
        return 1
    fi
}

# Detect and set the Docker Compose command
DOCKER_COMPOSE_CMD=$(detect_docker_compose)

if [ -z "$DOCKER_COMPOSE_CMD" ]; then
    echo "Neither 'docker-compose' nor 'docker compose' could be found."
    echo "Please install Docker Compose first."
    exit 1
fi

echo "Using Docker Compose command: $DOCKER_COMPOSE_CMD"

# Build the Docker images without cache
$DOCKER_COMPOSE_CMD build --no-cache
# Check if the build was successful
if [ $? -ne 0 ]; then
    echo "Docker build failed. Please check the output for errors."
    exit 1
fi

# Start the Docker containers in detached mode
$DOCKER_COMPOSE_CMD up -d
# Check if the containers started successfully
if [ $? -ne 0 ]; then
    echo "Failed to start Docker containers. Please check the output for errors."
    exit 1
fi

echo "Docker containers started successfully."

# Optionally, you can add a command to check the status of the containers
$DOCKER_COMPOSE_CMD ps
# Check if the containers are running
if [ $? -ne 0 ]; then
    echo "Some containers are not running. Please check the output for details."
    exit 1
fi

echo "All containers are running successfully."
