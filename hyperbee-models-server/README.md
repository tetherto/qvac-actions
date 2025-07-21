# Hyperbee Models Server

A distributed AI model management system that downloads models from Hugging Face and AWS S3, stores them in Hyperdrive, and manages metadata in Hyperbee for efficient distribution and replication.

## Features

- **Multi-source Model Downloads**: Download models from Hugging Face and AWS S3
- **Distributed Storage**: Store models in Hyperdrive for efficient peer-to-peer distribution
- **Metadata Management**: Track model metadata, versions, and fingerprints in Hyperbee
- **Smart Caching**: Intelligent caching for HF and AWS models prevents redundant downloads
- **Automatic Fingerprinting**: Generate SHA-256 fingerprints to detect model changes
- **Inference Config Generation**: Automatically create inference configuration files
- **Network Seeding**: Share models across the network for replication
- **Graceful Shutdown**: Proper cleanup of resources and signal handling
- **Comprehensive Testing**: Full test suite with mocked external services

## Architecture

The system consists of several key components:

- **Model Manager** (`model-manager.js`): Main orchestrator for downloading and managing models
- **Hugging Face Integration** (`hf.js`): Downloads models from Hugging Face
- **AWS S3 Integration** (`aws.js`): Downloads models from AWS S3
- **Drive Management** (`drive.js`): Handles Hyperdrive operations and network seeding
- **Validation** (`validation.js`): Schema validation using Zod
- **Utilities** (`utils.js`): Helper functions for fingerprinting, config generation, etc.

## Prerequisites

- Node.js 16+
- npm
- AWS credentials (if using AWS S3 models)
- Hugging Face access (if using HF models)

## Installation

```bash
npm install
```

## Configuration

### Environment Variables

Set the following environment variables:

```bash
# Required for AWS S3 models
export AWS_ACCESS_KEY_ID="your-aws-access-key"
export AWS_SECRET_ACCESS_KEY="your-aws-secret-key"

# Optional: Custom corestore seed (defaults to 'default-seed-for-development')
export CORESTORE_SEED="your-custom-seed"
```

### Configuration File

Create or modify `refactor/config.json`:

```json
{
  "bucketName": "your-s3-bucket-name",
  "awsRegion": "us-east-1",
  "localBasePath": "./models",
  "addons": [
    "@qvac/translation-nmtcpp",
    "@qvac/transcription-whispercpp",
    "@qvac/translation-llamacpp",
    "@qvac/llm-llamacpp",
    "@qvac/embed-llamacpp",
    "@qvac/vad-onnx"
  ],
  "models": [
    {
      "source": "hf",
      "path": "https://huggingface.co/BSC-LT/salamandraTA-2B-instruct-GGUF/blob/main/salamandrata_2b_inst_q8.gguf",
      "addon": "@qvac/translation-llamacpp",
      "tags": {
        "function": "generation",
        "type": "instruct",
        "name": "salamandrata",
        "externalVersion": "1.0.0",
        "params": "2B",
        "quantization": "q8",
        "internalVersion": "1.0.0",
        "other": ""
      }
    },
    {
      "source": "aws",
      "path": "qvac_models_compiled/marian/linux/x64/vulkan/q4f16_1/en-it/",
      "addon": "@qvac/translation-nmtcpp",
      "tags": {
        "function": "translation",
        "type": "opus",
        "name": "marian",
        "externalVersion": "",
        "params": "",
        "quantization": "q4f16_1",
        "internalVersion": "1.0.0",
        "other": "en-it"
      }
    }
  ]
}
```

### Configuration Schema

The system validates configuration using Zod schemas:

- **Model Tags**: Must include function, type, name, and internalVersion
- **Model Sources**: Supported sources are 'hf' (Hugging Face) and 'aws' (AWS S3)
- **Addons**: Must follow the pattern `@qvac/package-name`
- **AWS Configuration**: Required when using AWS source models

## Usage

### Running the Model Manager

```bash
# Run the main model manager
node refactor/model-manager.js
```

### Available Scripts

```bash
# Run tests
npm test

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Check Hyperbee connection
npm run check-connection
```

## Model Management Process

1. **Configuration Validation**: Validates the config.json file against the schema
2. **Smart Download Logic**:
   - **HF Models**: Uses built-in HF Hub caching to skip existing files
   - **AWS Models**: Uses date-based fingerprinting to skip unchanged versions
3. **Fingerprint Generation**: Creates SHA-256 fingerprints for change detection
4. **Caching Check**: Skips download if model version hasn't changed
5. **Drive Creation**: Stores models in Hyperdrive for distributed access
6. **Metadata Storage**: Stores model metadata in Hyperbee
7. **Network Seeding**: Shares drives across the network for replication
8. **Inference Config**: Generates clean inference.config.json files (excludes internal files)

## Model Key Generation

Models are identified by keys generated from their tags:

```
function:type:name:externalVersion:params:quantization:internalVersion:other
```

Example: `generation:instruct:salamandrata:1.0.0:2B:q8:1.0.0:`

## Model Caching

The system implements intelligent caching to prevent unnecessary downloads:

### Hugging Face Models

- **Built-in Caching**: Uses HF Hub's native caching system
- **Automatic Detection**: Skips download if model files exist locally
- **Cache Location**: Stored in HF cache directory with integrity verification

### AWS S3 Models

- **Custom Fingerprinting**: SHA-256 hashes based on date folders (e.g., `2025-04-15`)
- **Local Storage**: Fingerprints stored in `.s3-fingerprint` files
- **Smart Comparison**: Downloads only when date version changes
- **Bandwidth Savings**: Prevents redundant downloads of unchanged models

## Testing

The project includes comprehensive tests that mock external services:

```bash
npm test
```

Tests cover:

- Model downloading from HF and AWS
- Drive creation and management
- Fingerprint generation and caching
- S3 fingerprint functionality and validation
- Configuration validation
- Resource cleanup
- Inference config exclusion of internal files
