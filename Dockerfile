# Use an official Python runtime as a parent image
FROM python:3.9-slim

# Set the working directory in the container
WORKDIR /app

# Copy only the requirements file first to leverage Docker layer caching
COPY requirements.txt /app/

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy only the necessary application files
COPY app.py /app/
COPY routes /app/routes
COPY utils /app/utils
COPY templates /app/templates
COPY static /app/static
COPY config.py /app/
COPY database.py /app/
COPY setup_tables.py /app/

# Expose the application port
EXPOSE 8000

# Set environment variables for production
ENV FLASK_ENV=production
ENV PORT=8000

# Run the application
CMD ["python", "app.py"]