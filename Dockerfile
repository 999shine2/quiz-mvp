# Use an image that has both Python and Node.js pre-installed
FROM nikolaik/python-nodejs:python3.10-nodejs20

# Set working directory
WORKDIR /app

# Install Python dependencies
# We use --break-system-packages because valid in this container context
RUN pip3 install youtube-transcript-api --break-system-packages

# Copy package.json and install Node dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose the port
ENV PORT=3000
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
