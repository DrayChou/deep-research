#!/bin/bash
# Check if the script is run as root
if [ "$(id -u)" -ne 0 ]; then
    echo "This script must be run as root. Use 'sudo' to run it."
    exit 1
fi
# Check if the docker-compose command is available
if ! command -v docker-compose &> /dev/null; then
    echo "docker-compose could not be found. Please install it first."
    exit 1
fi
# Build the Docker images without cache
docker-compose build --no-cache
# Check if the build was successful
if [ $? -ne 0 ]; then
    echo "Docker build failed. Please check the output for errors."
    exit 1
fi
# Start the Docker containers in detached mode
docker-compose up -d
# Check if the containers started successfully
if [ $? -ne 0 ]; then
    echo "Failed to start Docker containers. Please check the output for errors."
    exit 1
fi
echo "Docker containers started successfully."
# Optionally, you can add a command to check the status of the containers
docker-compose ps
# Check if the containers are running
if [ $? -ne 0 ]; then
    echo "Some containers are not running. Please check the output for details."
    exit 1
fi
echo "All containers are running successfully."
