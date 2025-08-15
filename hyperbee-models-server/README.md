# Hyperbee Models Server

A distributed AI model management system that downloads models from Hugging Face and AWS S3, stores them in Hyperdrive, and manages metadata in Hyperbee for efficient distribution and replication.

## Features

- **Multi-source Model Downloads**: Download models from Hugging Face and AWS S3
- **Multiple Models per Drive**: Support for multiple model files within each drive configuration
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
export HF_TOKEN="your-huggingface-token" # required for restricted models

# Optional: Custom corestore seed (defaults to 'default-seed-for-development')
export CORESTORE_SEED="your-custom-seed"
```

### Configuration File

Copy the appropriate config file to `config.json`:

- Production config: `cp prod.config.json config.json`
- Development config: `cp dev.config.json config.json`

### Configuration Schema

The system validates configuration using Zod schemas:

- **Model Tags**: Must include function, type, name, and internalVersion
- **Model Sources**: Supported sources are 'hf' (Hugging Face) and 'aws' (AWS S3)
- **Addons**: Must follow the pattern `@qvac/package-name`
- **AWS Configuration**: Required when using AWS source models
- **Drive Keys**: Optional `driveKey` field to skip download and use existing drive
- **Multiple Models**: Each drive can contain multiple models with different sources and paths

### Configuration Example

```json
{
  "bucketName": "my-model-bucket",
  "awsRegion": "eu-central-1",
  "localBasePath": "models",
  "addons": ["@qvac/translation-llamacpp", "@qvac/translation-nmtcpp"],
  "drives": [
    {
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
      },
      "models": [
        {
          "source": "hf",
          "path": "https://huggingface.co/BSC-LT/salamandraTA-2B-instruct-GGUF/blob/main/salamandrata_2b_inst_q8.gguf"
        },
        {
          "source": "hf",
          "path": "https://huggingface.co/BSC-LT/salamandraTA-2B-instruct-GGUF/blob/main/salamandrata_2b_inst_q4.gguf"
        }
      ]
    },
    {
      "addon": "@qvac/translation-nmtcpp",
      "tags": {
        "function": "translation",
        "type": "opus",
        "name": "marian",
        "externalVersion": "1.0.0",
        "params": "",
        "quantization": "q4f16_1",
        "internalVersion": "1.0.0",
        "other": "en-it"
      },
      "models": [
        {
          "source": "aws",
          "path": "models/marian/"
        },
        {
          "source": "aws",
          "path": "models/marian-large/"
        }
      ]
    }
  ]
}
```

## Adding New Models

Follow this step-by-step process to add, download, and distribute new models:

### 1. Configure Drive Entry

Add your drive configuration to `prod.config.json` in the `drives` array. Each drive can contain multiple models:

```json
{
  "addon": "@qvac/package-name",
  "tags": {
    "function": "generation", // generation, translation, transcription, embedding, vad
    "type": "instruct", // model type (e.g., instruct, base, chat)
    "name": "model-name", // model name
    "externalVersion": "", // external version (optional)
    "params": "7B", // parameter count (e.g., 7B, 13B, 70B)
    "quantization": "q4", // quantization level (e.g., q4, q8, f16)
    "internalVersion": "1.0.0", // internal version (required)
    "other": "" // additional info (optional)
  },
  "models": [
    {
      "source": "hf", // or "aws" for S3 models
      "path": "https://huggingface.co/username/repo/blob/main/model.gguf"
    }
    // Add more model files if needed
  ],
  "driveKey": "optional-predefined-drive-key" // optional: use existing drive
}
```

### 2. Update Addon Configuration

Ensure your addon is listed in the `addons` array at the top of `prod.config.json`:

```json
{
  "addons": [
    "@qvac/translation-nmtcpp",
    "@qvac/transcription-whispercpp",
    "@qvac/translation-llamacpp",
    "@qvac/llm-llamacpp",
    "@qvac/embed-llamacpp",
    "@qvac/vad-onnx",
    "@qvac/your-new-addon" // Add your addon here
  ]
}
```

### 3. Setup Configuration and Environment

```bash
# Copy production config to active config
cp prod.config.json config.json

# Set required environment variables (obtain from team lead)
export CORESTORE_SEED="production-seed"
export HF_TOKEN="your-huggingface-token"  # for gated models
export AWS_ACCESS_KEY_ID="your-aws-access-key"
export AWS_SECRET_ACCESS_KEY="your-aws-secret-key"
```

**Important**: Update `bucketName` and `awsRegion` values in `config.json` if using AWS models (obtain from team lead).

### 4. Download and Process Models

Run the model manager to download models, create Hyperdrive instances, and store metadata:

```bash
node model-manager.js
```

This process will:

- Validate configuration using Zod schema
- Download models from HuggingFace or AWS S3
- Generate SHA-256 fingerprints for change detection
- Create or update Hyperdrive instances for distributed storage
- Store model metadata in Hyperbee database with drive versioning
- Generate `inference.config.json` files for each drive
- Export Hyperbee and drive keys to `keys.txt`

### 5. Initial Network Seeding

After successful model processing, start the seeding process:

```bash
node seeder.js
```

The seeder will:

- Read the Hyperbee key and drive keys from `keys.txt`
- Create Corestore with proper namespacing
- Join the Hyperswarm network for both database and drives
- Broadcast discovery keys for the Hyperbee database and all model drives
- Enable initial replication across the P2P network

### 6. Share Keys for Network Distribution

1. **Extract Keys**: The `keys.txt` file contains:

   - Line 1: `bee <hyperbee-key>` - Main database key
   - Remaining lines: `<model-key> <drive-key>` - Individual model drive keys

2. **Share with Team**: Pass the complete `keys.txt` file to team leads for network distribution

3. **Continue Seeding**: Keep `seeder.js` running until confirmation of successful replication

### 7. Monitor and Verify

```bash
# Check Hyperbee connection and model availability
npm run check-connection

# Use the drive key checker to verify specific drives
node scripts/driveKeyChecker.js <drive-key>

# Use the Hyperbee key checker to verify database entries
node scripts/hyperbeeKeyChecker.js <bee-key> <model-key>

# Check model availability (checks model database entry and associated drive files)
npm run check-model <model-key>
```

### 8. Push to Git

Once reseeding has been confirmed and the model is successfully distributed across the network:

- **Add Drive Key to Configuration**: Add the `driveKey` property to your drive entry in `prod.config.json`:

  ```json
  {
    "addon": "@qvac/your-addon",
    "tags": {
      // ... your model tags
    },
    "models": [
      // ... your model files
    ],
    "driveKey": "your-drive-key-from-keys.txt"
  }
  ```

  The drive key can be found in the `keys.txt` file generated during the model processing step.

- **Create Pull Request**: Create a PR with your model addition for review.

### Configuration Requirements by Source

#### Hugging Face Models

- **Path Format**: Full HuggingFace URL (resolve or blob format)
- **Environment**: `HF_TOKEN` required for gated/restricted models
- **Example**: `https://huggingface.co/username/repo/resolve/main/model.gguf`

#### AWS S3 Models

- **Path Format**: S3 path (folder or file)
- **Environment**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- **Config**: `bucketName` and `awsRegion` in `config.json`
- **Example**: `qvac_models_compiled/model-name/linux/x64/`

## Model Management Process

1. **Configuration Validation**: Validates the config.json file against the schema
2. **Drive Key Check**: If `driveKey` is provided, skips download and uses existing drive
3. **Smart Download Logic**:
   - **HF Models**: Uses built-in HF Hub caching to skip existing files
   - **AWS Models**: Uses date-based fingerprinting to skip unchanged versions
4. **Fingerprint Generation**: Creates SHA-256 fingerprints for change detection
5. **Caching Check**: Skips download if model version hasn't changed
6. **Drive Creation**: Stores models in Hyperdrive for distributed access
7. **Metadata Storage**: Stores model metadata in Hyperbee
8. **Network Seeding**: Shares drives across the network for replication
9. **Inference Config**: Generates clean inference.config.json files (excludes internal files)
10. **Key Export**: Writes model and drive keys to `keys.txt` file for external access

## Model Key Generation

Models are identified by keys generated from their tags:

```
function:type:name:externalVersion:params:quantization:internalVersion:other
```

Example: `generation:salamandrata:instruct:1.0.0:2B:q8:1.0.0` (without trailing colon when `other` is empty)

### Multiple Models per Drive

When multiple models are configured within the same drive, each model must have unique tags to generate distinct model keys. The system will:

- Process each model in the drive configuration
- Generate unique model keys based on their tags
- Create separate folders and inference configurations for each model
- Track all models in the addon model keys map

**Important**: Models within the same drive that have identical tags will be treated as duplicates and only the first one will be processed.

## Drive Key Integration

For models with existing Hyperdrive keys, you can specify a `driveKey` in the configuration:

```json
{
  "addon": "@qvac/translation-nmtcpp",
  "tags": {
    "function": "translation",
    "type": "opus",
    "name": "existing",
    "externalVersion": "1.0.0",
    "params": "",
    "quantization": "q4f16_1",
    "internalVersion": "1.0.0",
    "other": "en-de"
  },
  "models": [
    {
      "source": "aws",
      "path": "models/existing-model/"
    }
  ],
  "driveKey": "existing-hyperdrive-key-here"
}
```

**When `driveKey` is provided:**

- Model download is completely skipped
- No local files are created
- No inference config is generated
- Drive key is stored in Hyperbee with default fingerprint

## Model Caching

The system implements intelligent caching to prevent unnecessary downloads:

### Hugging Face Models

- **Built-in Caching**: Uses HF Hub's native caching system
- **Automatic Detection**: Skips download if model files exist locally
- **Cache Location**: Stored in HF cache directory with integrity verification

### AWS S3 Models

- **Dual Fingerprinting**:
  - **S3 Date Fingerprint**: SHA-256 hash based on date folders (e.g., `2025-04-15`) for download decisions
  - **Local Folder Fingerprint**: SHA-256 hash of local files (including inference config) for change detection
- **Smart Download Logic**: Uses S3 fingerprint to determine if download is needed
- **Change Detection**: Uses local folder fingerprint stored in Hyperbee to detect inference config changes
- **Bandwidth Savings**: Prevents redundant downloads while maintaining visibility into local file changes

## Available Scripts

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

## Testing

The project includes comprehensive tests that mock external services:

```bash
npm test
```

Tests cover:

- Model downloading from HF and AWS
- Multiple models per drive functionality
- Drive creation and management
- Fingerprint generation and caching
- S3 fingerprint functionality with dual fingerprinting (S3 date + local folder)
- Configuration validation
- Resource cleanup
- Inference config exclusion of internal files
- Model key generation and duplicate detection
- Addon model keys mapping with multiple models
