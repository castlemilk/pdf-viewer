# Acacia Direct Download Hosting

Acacia uses a low-cost GCP static hosting setup:

- GCP project: `acacia-496104`
- Public object bucket: `gs://acacia-496104-downloads`
- Release artifacts under `/downloads/`
- Static Vite landing page at the bucket root for fallback/direct distribution
- Primary launch landing page on Vercel: `https://acacia-eta.vercel.app`

The deployment script builds the fallback landing page with the live DMG URL and uploads:

- `downloads/Acacia-<version>.dmg`
- `downloads/Acacia-<version>.dmg.sha256`
- `downloads/Acacia-<version>.manifest.json`
- `index.html` and Vite assets

Run:

```bash
cd /Users/benebsworth/projects/pdf-viewer
scripts/deploy-gcp-direct-download.sh
```

Useful overrides:

```bash
GCP_PROJECT_ID=acacia-496104 \
GCS_BUCKET=acacia-496104-downloads \
GCS_LOCATION=australia-southeast1 \
GCP_BILLING_ACCOUNT_ID=003BEA-FE742A-9B16BC \
scripts/deploy-gcp-direct-download.sh
```

The public download URL has this shape:

```text
https://storage.googleapis.com/acacia-496104-downloads/downloads/Acacia-0.0.1.dmg
```

## S3-Compatible Access

GCS S3/XML interoperability is configured in `acacia-496104` with:

- Service account: `acacia-s3-deployer@acacia-496104.iam.gserviceaccount.com`
- Bucket role: `roles/storage.objectAdmin` on `gs://acacia-496104-downloads`
- Endpoint: `https://storage.googleapis.com`
- Local AWS CLI profile: `acacia-gcs`
- Local HMAC key material: `.gcp/acacia-gcs-hmac.json`

The `.gcp` directory is gitignored because the HMAC secret is only shown once by Google Cloud.

Validate the profile:

```bash
AWS_PROFILE=acacia-gcs aws s3 ls s3://acacia-496104-downloads/downloads/
```
