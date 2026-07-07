#!/bin/bash
set -euo pipefail

# Signal async mode and timeout (300s for npm install to complete)
echo '{"async": true, "asyncTimeout": 300000}'

# Install dependencies
npm install
