# Acacia App Store Connect Publishing Packet

Prepared on 2026-05-23 for macOS and iOS publishing.

## Current Artifact

- App name: Acacia
- Platforms: macOS and iOS
- Bundle ID: com.benebsworth.acacia
- Bundle ID resource ID: 3LNT77ZB3H
- App Store Connect app ID: 6768526705
- Version row: 1.0.3
- Selected macOS build: 202605221703 (`b768e742-12bd-4be9-ae5e-3fc36e8f6f85`)
- Selected iOS build: 202605221703 (`19643063-e930-43b5-b67a-3219612e9c3d`)
- Build processing state: VALID
- Team ID: WFTX6CN23F
- App Store state: PREPARE_FOR_SUBMISSION

## Screenshots

Apple currently requires 1 to 10 screenshots per display set in PNG/JPEG/JPG.

Mac screenshots are PNG files at 2880 x 1800:

1. publishing/screenshots/app-store/01-library.png
2. publishing/screenshots/app-store/02-viewer-info.png
3. publishing/screenshots/app-store/03-comments-annotations.png
4. publishing/screenshots/app-store/04-compare-changes.png

iPhone 6.5" screenshots are PNG files at 1284 x 2778:

1. publishing/screenshots/ios/iphone-65/01-library.png
2. publishing/screenshots/ios/iphone-65/02-viewer.png
3. publishing/screenshots/ios/iphone-65/03-annotations.png
4. publishing/screenshots/ios/iphone-65/04-compare.png

iPhone 6.7" screenshots are PNG files at 1290 x 2796:

1. publishing/screenshots/ios/iphone-67/01-library.png
2. publishing/screenshots/ios/iphone-67/02-viewer.png
3. publishing/screenshots/ios/iphone-67/03-annotations.png
4. publishing/screenshots/ios/iphone-67/04-compare.png

iPad 12.9" / 13" screenshots are PNG files at 2064 x 2752:

1. publishing/screenshots/ios/ipad-129/01-library.png
2. publishing/screenshots/ios/ipad-129/02-viewer.png
3. publishing/screenshots/ios/ipad-129/03-annotations.png
4. publishing/screenshots/ios/ipad-129/04-compare.png

App previews are MP4 files at 16 seconds, 30fps, H.264, yuv420p, with silent stereo AAC audio:

1. publishing/app-previews/iphone-65/01-acacia-preview.mp4 - 886 x 1920
2. publishing/app-previews/iphone-67/01-acacia-preview.mp4 - 886 x 1920
3. publishing/app-previews/ipad-129/01-acacia-preview.mp4 - 1200 x 1600

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
Does not contain, show, or access third-party content. The built-in demo documents are app-owned synthetic examples.

Made for Kids:
No

License agreement:
Apple Standard EULA

Privacy Policy URL:
https://acacia-eta.vercel.app/privacy.html

Accessibility URL:
https://acacia-eta.vercel.app/accessibility.html

Accessibility Nutrition Labels:
Draft declarations are configured in App Store Connect for Mac, iPhone, and iPad.
VoiceOver, Voice Control, Dark Interface, Differentiate Without Color Alone,
Sufficient Contrast, Reduced Motion, Captions, and Audio Descriptions are set for
all three device families. Larger Text is set for iPhone and iPad; Apple does not
allow that label on Mac. App Store Connect currently blocks publishing these
declarations until the app is available on the App Store.

## Platform Version Information

Version number:
1.0.3

Build note:
The App Store Connect macOS and iOS version rows are `1.0.3`; selected builds are `1.0.3 (202605221703)` and are valid.

Selected build status:
The macOS build `b768e742-12bd-4be9-ae5e-3fc36e8f6f85` and iOS build `19643063-e930-43b5-b67a-3219612e9c3d` are both `VALID`, not expired, and declare `usesNonExemptEncryption=false`.

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
https://acacia-eta.vercel.app/support.html

Marketing URL:
https://acacia-eta.vercel.app

## Review Notes

Acacia is a local-first PDF viewer for Mac and iOS. No account or network service is required for the core PDF library and viewer. The app launches with a seeded demo library so review can test the main flows immediately.

Acacia Pro uses StoreKit for all paid digital functionality. The Pro backend validates Firebase ID tokens, verifies StoreKit transactions server-side, and stores only entitlement/cloud-sync data required for Pro features.

Sign in with Apple is available from the Account panel. Signed-in users can delete their Acacia account in-app from the same Account panel via Delete Account. That flow confirms intent, requests Sign in with Apple token revocation through the backend when Apple authorization is available, deletes Pro entitlement/cloud data, deletes the Firebase account, clears local auth tokens, and keeps local PDF documents on the device.

## Remaining App Store Work

1. Confirm App Privacy, age rating, pricing, availability, and review notes in App Store Connect.
2. Confirm the selected macOS and iOS `1.0.3 (202605221703)` builds are attached to the release rows.
3. Submit the macOS and iOS version rows for App Review.
4. Publish the accessibility declarations once App Store Connect allows labels for the live app.
