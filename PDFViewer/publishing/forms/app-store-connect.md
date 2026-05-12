# PDFViewer App Store Connect Publishing Packet

Prepared on 2026-05-12 for macOS-only publishing.

## Source References

- Apple screenshot requirements: https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications
- Apple screenshot upload flow: https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots/
- App information fields: https://developer.apple.com/help/app-store-connect/reference/app-information/app-information
- Platform version fields: https://developer.apple.com/help/app-store-connect/reference/platform-version-information
- App privacy fields: https://developer.apple.com/help/app-store-connect/reference/app-information/app-privacy/
- Age rating flow: https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating
- Accessibility Nutrition Labels: https://developer.apple.com/help/app-store-connect/manage-app-accessibility/manage-accessibility-nutrition-labels

## Current Artifact

- App name: PDFViewer
- Platform: macOS
- Bundle ID: com.benebsworth.pdfviewer
- Version: 0.0.1
- Build: 1
- Team ID: WFTX6CN23F
- Release artifact: dist/macos/PDFViewer-0.0.1.dmg
- Notarization status: Accepted
- Latest notarization submission: c1aa6ab6-20e1-4bec-989f-07f5afe67ac2
- DMG SHA-256: 0c21af237f156d031e6a0d65e7a9593b5bbe5da465e8d54e3602d3a678c8f099

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
PDFViewer

Subtitle:
Local PDF workspace

Bundle ID:
com.benebsworth.pdfviewer

SKU:
pdfviewer-macos-001

Primary language:
English (U.S.)

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
TBD: https://benebsworth.com/pdfviewer/privacy

Accessibility URL:
TBD: https://benebsworth.com/pdfviewer/accessibility

## Platform Version Information

Version number:
0.0.1

Recommended public version:
1.0.0 before App Store submission, unless this is intentionally an early private/TestFlight build.

Promotional text:
Local-first PDF reading, organization, annotations, comments, exports, and side-by-side comparison for professional Mac document workflows.

Description:
PDFViewer is a local-first PDF workspace for macOS, built for people who review reports, research, contracts, financial documents, and reference material every day.

Organize documents into a clean library with tags, collections, favorites, recents, metadata, and reading progress. Open PDFs in a focused native PDFKit viewer with thumbnails, page navigation, zoom controls, search, annotations, comments, bookmarks, and export actions.

PDFViewer keeps your original files untouched. Highlights, notes, comments, and review state are stored as local sidecar metadata, and annotated exports are created as separate copies when you need to share work.

For document review, compare mode places two versions side by side with synced navigation and a changes panel so you can quickly inspect additions, removals, and modified sections.

Core features:
- Local library for PDFs, tags, collections, favorites, and reading progress
- Native PDFKit document rendering on macOS
- Page thumbnails, search, zoom, page navigation, and metadata inspection
- Non-destructive annotations, comments, notes, highlights, signatures, and bookmarks
- Export actions for annotated copies, page images, and text
- Side-by-side compare mode with synced navigation and change counts
- Offline-first storage with no account required

PDFViewer is designed for solo professionals and teams that want a fast, quiet, desktop-native PDF review workflow without sending private documents to a cloud service.

Keywords:
documents,reader,annotations,comments,compare,library,review,reports,offline,productivity

Support URL:
TBD: https://benebsworth.com/pdfviewer/support

Marketing URL:
TBD: https://benebsworth.com/pdfviewer

Copyright:
2026 Ben Ebsworth

Version release setting:
Manual release after approval

App preview:
Not required for first submission. If added later, macOS previews must be landscape and meet Apple's app preview specs.

## App Review Information

Contact name:
TBD

Contact email:
TBD

Contact phone:
TBD

Sign-in required:
No

Demo account:
Not applicable

Review notes:
PDFViewer is a macOS-only, local-first PDF viewer. No account or network service is required. The app launches with a seeded demo library so review can test the main flows immediately.

Suggested review flow:
1. Launch the app and inspect the seeded Library.
2. Open "Q4 Market Analysis Report" from the inspector.
3. Use page thumbnails, zoom, search, and the bottom page scrubber.
4. Select "Highlight Text" in Quick Actions to see a local non-destructive annotation and comment thread.
5. Use Compare to open side-by-side compare mode and inspect the Changes panel.
6. Use Open File to import a local PDF if desired.

Important implementation notes:
- Original PDFs are not modified.
- Annotations and comments are local sidecar metadata.
- Export actions create separate output files.
- The app does not require internet access for core functionality.

## Privacy

Privacy Policy URL:
TBD: https://benebsworth.com/pdfviewer/privacy

User Privacy Choices URL:
Not applicable unless a hosted privacy controls page is created.

Tracking:
No

Data collection:
Data Not Collected

Rationale:
The app is local-first and does not include analytics, advertising SDKs, accounts, telemetry, or cloud document sync. Imported PDFs, tags, collections, annotations, comments, reading state, and compare sessions remain local to the user's Mac.

Data stored locally:
- Imported PDF bookmarks/security-scoped references
- Tags and collections
- Favorites and reading progress
- Annotations and comments
- Compare sessions

Data sent off-device by app:
None for normal use.

User-initiated sharing/export:
Users can export or share files manually through macOS workflows. This is user initiated and not app collection.

## Age Rating Questionnaire

Recommended responses for current app behavior:

- In-app controls or capabilities that restrict content: No
- Unrestricted web access: No
- User-generated content/social networking: No, because comments/annotations are local-only and not shared through a service
- Messaging/chat: No
- Advertising: No
- In-app purchases: No
- Contests/gambling/loot boxes: No
- Medical/treatment information: No
- Violence: None
- Sexual content or nudity: None
- Profanity or crude humor: None
- Alcohol, tobacco, or drug references: None
- Horror/fear themes: None
- Mature/suggestive themes: None
- Simulated gambling: None

Expected rating:
Likely lowest general audience rating, subject to Apple's generated result.

## Export Compliance

Recommended answer:
No proprietary or custom encryption.

Notes:
The app is local/offline and does not implement custom cryptography. If App Store Connect asks about standard encryption because Apple platform APIs or HTTPS are linked by dependencies, answer according to the exact App Store Connect questionnaire and legal review. Current app functionality does not transmit user documents to a server.

## Accessibility Nutrition Labels

Conservative first submission stance:
Do not claim support for a feature until the app has been audited against Apple's current evaluation criteria.

Recommended draft responses:
- Device: Mac
- VoiceOver: Not claimed yet
- Voice Control: Not claimed yet
- Larger Text / adjustable text size: Not claimed yet
- Dark Interface: Not claimed yet
- Differentiate Without Color Alone: Not claimed yet
- Sufficient Contrast: Not claimed yet
- Reduced Motion: Not claimed yet
- Captions: Not applicable / not claimed
- Audio Descriptions: Not applicable / not claimed

Accessibility URL:
TBD: https://benebsworth.com/pdfviewer/accessibility

Recommended remaining work before claiming accessibility support:
- VoiceOver pass through library, viewer, comments, export, and compare flows
- Keyboard-only navigation pass
- Dynamic type or app text scaling behavior definition
- Dark mode visual QA
- Contrast audit for tags, highlights, disabled states, and thumbnails

## Pricing And Availability

Price:
TBD

Recommended first decision:
Free for initial launch, unless there is already a paid positioning plan.

Availability:
TBD regions. For a simple local productivity app, worldwide availability is reasonable unless legal/support coverage needs limits.

In-app purchases:
None

Subscriptions:
None

Pre-order:
No

Phased release:
Not applicable for first release. Use manual release after approval.

## App Store Tags

Suggested tags if App Store Connect presents them:
- PDF Reader
- Document Management
- Productivity
- File Management
- Annotation
- Reports

## Remaining App Store Blockers

1. Create/confirm the App Store Connect app record for bundle ID com.benebsworth.pdfviewer.
2. Provide real Support, Marketing, Privacy Policy, and Accessibility URLs.
3. Decide whether the public version should be 1.0.0 instead of 0.0.1.
4. Confirm app name availability. "PDFViewer" may be too generic or unavailable.
5. Add a final branded app icon to the Xcode asset catalog.
6. Build and upload a Mac App Store distribution build. The current DMG is Developer ID/notarized for direct distribution, not an App Store upload artifact.
7. Complete the App Store age rating questionnaire in App Store Connect.
8. Complete privacy details and accessibility labels in App Store Connect.
9. Decide price, availability, and release timing.
10. Run a final App Store archive/upload validation after any bundle/version/icon changes.
