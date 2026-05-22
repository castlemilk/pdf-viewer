# Acacia App Store Connect Publishing Packet

Prepared on 2026-05-12 for macOS-only publishing.

## Current Artifact

- App name: Acacia
- Platform: macOS
- Bundle ID: com.benebsworth.acacia
- Bundle ID resource ID: 3LNT77ZB3H
- App Store Connect app ID: 6768526705
- Version: 0.0.1
- Build: 1
- Team ID: WFTX6CN23F
- Release artifact: dist/macos/Acacia-0.0.1.dmg
- Notarization status: Accepted
- Latest notarization submission: a32b0b6f-87b6-4954-b77b-901ae9b7bd00
- DMG SHA-256: 6a11e7fefccb82a8d58f5eb53eaaf9befe38eb346a0ce16b96a4974e603147d1

## Screenshots

Apple currently requires 1 to 10 screenshots for Mac apps in PNG/JPEG/JPG. These screenshots are all PNG and 2880 x 1800.

1. publishing/screenshots/app-store/01-library.png
2. publishing/screenshots/app-store/02-viewer-info.png
3. publishing/screenshots/app-store/03-comments-annotations.png
4. publishing/screenshots/app-store/04-compare-changes.png

Recommended order:

1. Library and document organization
2. Native PDF viewer with metadata
3. Comments and non-destructive annotations
4. Side-by-side compare with changes

## App Information

Name:
Acacia

Subtitle:
Local PDF workspace

Bundle ID:
com.benebsworth.acacia

SKU:
acacia-macos-001

Primary language:
English (Australia)

Primary category:
Productivity

Secondary category:
Business

Content rights:
Does not contain, show, or access third-party content. The built-in demo documents are app-owned synthetic fixtures.

Made for Kids:
No

License agreement:
Apple Standard EULA

Privacy Policy URL:
https://storage.googleapis.com/acacia-496104-downloads/privacy.html

Accessibility URL:
https://storage.googleapis.com/acacia-496104-downloads/accessibility.html

## Platform Version Information

Version number:
1.0

Build note:
The App Store Connect macOS version row is `1.0`, so App Store archives should be built with `--version 1.0`.

Local archive status:
A universal `1.0 (1)` archive exists at `dist/app-store/Acacia-0.0.1-1.xcarchive`. The archive filename is stale from an earlier script bug, but the archive Info.plist confirms bundle ID `com.benebsworth.acacia`, version `1.0`, build `1`, and both `x86_64` and `arm64` slices.

Promotional text:
Local-first PDF reading, organization, annotations, comments, exports, and side-by-side comparison for professional Mac document workflows.

Description:
Acacia is a local-first PDF workspace for macOS, built for people who review reports, research, contracts, financial documents, and reference material every day.

Organize documents into a clean library with tags, collections, favorites, recents, metadata, and reading progress. Open PDFs in a focused native PDFKit viewer with thumbnails, page navigation, zoom controls, search, annotations, comments, bookmarks, and export actions.

Acacia keeps your original files untouched. Highlights, notes, comments, and review state are stored as local sidecar metadata, and annotated exports are created as separate copies when you need to share work.

For document review, compare mode places two versions side by side with synced navigation and a changes panel so you can quickly inspect additions, removals, and modified sections.

Core features:
- Local library for PDFs, tags, collections, favorites, and reading progress
- Native PDFKit document rendering on macOS
- Page thumbnails, search, zoom, page navigation, and metadata inspection
- Non-destructive annotations, comments, notes, highlights, signatures, and bookmarks
- Export actions for annotated copies, page images, and text
- Side-by-side compare mode with synced navigation and change counts
- Offline-first storage with no account required

Acacia is designed for solo professionals and teams that want a fast, quiet, desktop-native PDF review workflow without sending private documents to a cloud service.

Keywords:
documents,reader,annotations,comments,compare,library,review,reports,offline,productivity

Support URL:
https://storage.googleapis.com/acacia-496104-downloads/support.html

Marketing URL:
https://storage.googleapis.com/acacia-496104-downloads/index.html

## Review Notes

Acacia is a macOS-only, local-first PDF viewer. No account or network service is required. The app launches with a seeded demo library so review can test the main flows immediately.

## Remaining App Store Work

1. Install local `Mac App Distribution` and `Mac Installer Distribution` certificates, or grant the App Store Connect API key/account cloud signing permission.
2. Export/upload the Mac App Store archive using `--version 1.0`.
3. Complete app privacy, age rating, pricing/availability, and review submission.
