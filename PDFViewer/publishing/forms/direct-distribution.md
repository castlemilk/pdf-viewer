# Acacia Direct Distribution Packet

Prepared on 2026-05-24.

## Status

Direct Developer ID distribution is technically ready for the Acacia brand.

Artifact:
dist/macos/Acacia-1.0.3.dmg

SHA-256:
235fa5fc571847cc11f087922f2774b88fef525a591a87debd62aa91ddb5ae17

Bundle ID:
com.benebsworth.acacia

Team ID:
WFTX6CN23F

Notarization submission:
926cd38d-409d-415a-8bc8-540e4ac45e12

Public download:
https://storage.googleapis.com/acacia-496104-downloads/downloads/Acacia-1.0.3.dmg

Launch page:
https://acacia-eta.vercel.app

## Verification Completed

- Universal macOS app binary: x86_64 and arm64
- Developer ID signed app
- Developer ID signed hermes.framework
- Hardened runtime enabled
- Sandbox and user-selected file access entitlements present
- DMG stapled and validated
- syspolicy_check distribution passed
- Mounted-DMG launch smoke test passed
- Mounted-DMG verification passed with `scripts/verify-release-dmg.sh`

## Release Notes

Acacia 1.0.3 is the launch-ready macOS release:

- Local-first PDF library with tags, collections, favorites, recents, and reading progress
- Native PDFKit viewer with thumbnails, zoom, page navigation, search, and metadata
- Non-destructive sidecar annotations, comments, notes, highlights, signatures, and bookmarks
- Export actions for annotated copies, page images, and text
- Side-by-side compare mode with synced navigation and changes panel
- Seeded demo library for first launch

## Download Page Copy

Headline:
Acacia for macOS

Subheadline:
A local-first PDF workspace for reading, annotating, organizing, and comparing documents on your Mac.

Body:
Acacia keeps professional PDF workflows fast and private. Organize reports, contracts, research, invoices, and reference material in a clean local library, then open documents in a native PDFKit viewer with thumbnails, search, zoom, comments, annotations, exports, and side-by-side comparison.

Your original PDFs are never modified. Review notes and annotations are stored locally as sidecar metadata, and exports create separate copies when you need to share work.

System requirements:
macOS 14 or later recommended.

Install:
Download the DMG, open it, and drag Acacia to Applications.

Security:
Signed and notarized with Apple Developer ID.

Checksum:
235fa5fc571847cc11f087922f2774b88fef525a591a87debd62aa91ddb5ae17

## Support Page Copy

Acacia Support

Acacia is a local-first macOS PDF app. It does not require an account and does not upload your PDFs to a cloud service.

Common tasks:
- Import a PDF with Open File.
- Add tags and collections from the library.
- Open a document to view pages, thumbnails, metadata, and comments.
- Use Highlight Text, Add Note, Draw, Add Signature, or Add Bookmark from Quick Actions.
- Use Compare Versions to review two document versions side by side.
- Export an annotated copy, a page image, or extracted text from the viewer.

Troubleshooting:
- If a PDF cannot be opened, confirm the file is a valid PDF and that macOS has granted file access.
- If an exported file is missing, check the destination chosen in the save dialog.
- If keyboard or accessibility automation is being tested, grant Accessibility/Automation permissions to the test runner or terminal in System Settings.

Contact:
support@benebsworth.com

Public support page:
https://acacia-eta.vercel.app/support.html

## Privacy Policy Draft

Acacia Privacy Policy

Acacia is designed as a local-first PDF app.

The core app does not require an account and does not include analytics, advertising SDKs, or third-party tracking.

Documents you import remain on your device in the free local workspace. Tags, collections, favorites, comments, annotations, reading progress, bookmarks, and compare sessions are stored locally on your device. If you sign in and enable Acacia Pro cloud sync, Acacia uploads the documents and review metadata needed to sync your library across your devices.

If you choose to export, share, or send a file using macOS sharing features, that action is initiated by you and handled by the destination you choose.

If you choose to sign in or use Pro features, Acacia may process account identifiers, purchase receipts, subscription status, entitlement state, synced document data, annotations, comments, and basic diagnostic request metadata needed to provide and validate those features. This data is not used for tracking.

You can delete your Acacia account in the app from the Account panel. Account deletion revokes Sign in with Apple authorization when available, removes Pro entitlement and cloud sync data, deletes the Firebase account, and leaves local documents on your device.

If you contact support, we will use the information you provide to respond to your request.

Contact:
support@benebsworth.com

Public privacy policy:
https://acacia-eta.vercel.app/privacy.html

Last updated:
2026-05-28

## Remaining Direct Distribution Work

1. Smoke test the downloaded DMG from the final public URL before announcing the direct download.
2. Refresh and re-upload the DMG/checksum/manifest for each future direct-distribution release.
