#!/bin/sh
set -e
echo "Building application..."
npm run build
echo "Running database initialization..."
npm run init
echo "Starting server..."
npm start
