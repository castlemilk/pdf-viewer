# PDFViewer Direct Distribution Packet

Prepared on 2026-05-12.

## Status

Direct Developer ID distribution is technically ready.

Artifact:
dist/macos/PDFViewer-0.0.1.dmg

SHA-256:
0c21af237f156d031e6a0d65e7a9593b5bbe5da465e8d54e3602d3a678c8f099

Bundle ID:
com.benebsworth.pdfviewer

Team ID:
WFTX6CN23F

Notarization submission:
c1aa6ab6-20e1-4bec-989f-07f5afe67ac2

## Verification Completed

- Universal macOS app binary: x86_64 and arm64
- Developer ID signed app
- Developer ID signed hermes.framework
- Hardened runtime enabled
- Sandbox and user-selected file access entitlements present
- DMG stapled and validated
- syspolicy_check distribution passed
- Mounted-DMG launch smoke test passed
- Full npm run publish:macos pipeline passed

## Release Notes

PDFViewer 0.0.1 introduces the first macOS release:

- Local-first PDF library with tags, collections, favorites, recents, and reading progress
- Native PDFKit viewer with thumbnails, zoom, page navigation, search, and metadata
- Non-destructive sidecar annotations, comments, notes, highlights, signatures, and bookmarks
- Export actions for annotated copies, page images, and text
- Side-by-side compare mode with synced navigation and changes panel
- Seeded demo library for first launch

## Download Page Copy

Headline:
PDFViewer for macOS

Subheadline:
A local-first PDF workspace for reading, annotating, organizing, and comparing documents on your Mac.

Body:
PDFViewer keeps professional PDF workflows fast and private. Organize reports, contracts, research, invoices, and reference material in a clean local library, then open documents in a native PDFKit viewer with thumbnails, search, zoom, comments, annotations, exports, and side-by-side comparison.

Your original PDFs are never modified. Review notes and annotations are stored locally as sidecar metadata, and exports create separate copies when you need to share work.

System requirements:
macOS 14 or later recommended.

Install:
Download the DMG, open it, and drag PDFViewer to Applications.

Security:
Signed and notarized with Apple Developer ID.

Checksum:
0c21af237f156d031e6a0d65e7a9593b5bbe5da465e8d54e3602d3a678c8f099

## Support Page Copy

PDFViewer Support

PDFViewer is a local-first macOS PDF app. It does not require an account and does not upload your PDFs to a cloud service.

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
TBD support email, legal address, and phone number.

## Privacy Policy Draft

PDFViewer Privacy Policy

PDFViewer is designed as a local-first macOS app.

We do not collect personal data through the app. The app does not include analytics, advertising SDKs, accounts, telemetry, or cloud sync.

Documents you import remain on your Mac. Tags, collections, favorites, comments, annotations, reading progress, bookmarks, and compare sessions are stored locally on your device. PDFViewer does not upload this content to our servers.

If you choose to export, share, or send a file using macOS sharing features, that action is initiated by you and handled by the destination you choose.

If you contact support, we will use the information you provide to respond to your request.

Contact:
TBD support/privacy contact.

Last updated:
2026-05-12

## Remaining Direct Distribution Work

1. Choose public version number. Consider 1.0.0 for launch instead of 0.0.1.
2. Add a final branded app icon.
3. Publish support/privacy pages with real contact details.
4. Upload the DMG and checksum to the chosen download host.
5. Optionally create a GitHub Release or website changelog entry.
6. Smoke test the downloaded DMG from the final public URL.
