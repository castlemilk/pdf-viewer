import XCTest

final class PDFViewerUITests: XCTestCase {
  override func setUpWithError() throws {
    continueAfterFailure = false
  }

  func testMobilePdfControlsNavigateZoomAndHighlight() throws {
    let app = XCUIApplication()
    app.launchArguments = ["--uitesting"]
    app.launchEnvironment = [
      "PDFVIEWER_UITESTING": "1",
      "PDFVIEWER_RESET_STATE": "1",
    ]
    app.launch()

    XCTAssertTrue(
      waitForAnyElement([
        app.otherElements["mobile-library-screen"].firstMatch,
        app.otherElements["Mobile library screen"].firstMatch,
      ]),
      "Expected the compact mobile library to load"
    )

    tapFirstAvailable(
      [
        anyElement(app, "mobile-scope-favorites"),
        anyElement(app, "Favorites, 2 documents"),
      ],
      named: "Favorites scope"
    )
    XCTAssertTrue(app.staticTexts["Favorite Documents"].waitForExistence(timeout: 5))
    XCTAssertTrue(
      anyElement(app, "mobile-doc-row-product-roadmap").waitForExistence(timeout: 5),
      "Expected favorite documents to be visible"
    )
    XCTAssertFalse(
      anyElement(app, "mobile-doc-row-q4-market-analysis").waitForExistence(timeout: 1),
      "Expected non-favorite documents to be hidden in the Favorites scope"
    )

    tapFirstAvailable(
      [
        anyElement(app, "mobile-scope-library"),
        anyElement(app, "Library, 8 documents"),
      ],
      named: "Library scope"
    )
    XCTAssertTrue(
      anyElement(app, "mobile-doc-row-q4-market-analysis").waitForExistence(timeout: 5),
      "Expected all documents to return when switching back to Library"
    )

    tapFirstAvailable(
      [
        anyElement(app, "mobile-doc-card-q4-market-analysis"),
        anyElement(app, "mobile-doc-row-q4-market-analysis"),
        anyElement(app, "Open Q4 Market Analysis Report"),
      ],
      named: "Q4 Market Analysis Report"
    )

    XCTAssertTrue(
      waitForAnyElement([
        app.otherElements["mobile-viewer-screen"].firstMatch,
        app.otherElements["Mobile viewer screen Q4 Market Analysis Report"].firstMatch,
      ]),
      "Expected the mobile PDF viewer to open"
    )

    guard let canvas = firstExistingElement([
      anyElement(app, "pdf-canvas-fallback"),
      anyElement(app, "pdf-canvas-native"),
    ]) else {
      XCTFail("Expected a PDF canvas to exist")
      return
    }
    XCTAssertTrue(
      canvas.exists,
      "Expected a PDF canvas to exist"
    )
    XCTAssertTrue(app.staticTexts["1 / 32"].waitForExistence(timeout: 5))

    tapFirstAvailable(
      [
        anyElement(app, "mobile-page-next"),
        anyElement(app, "Next"),
      ],
      named: "Next"
    )
    XCTAssertTrue(app.staticTexts["2 / 32"].waitForExistence(timeout: 5))

    tapFirstAvailable(
      [
        anyElement(app, "mobile-page-previous"),
        anyElement(app, "Previous"),
      ],
      named: "Previous"
    )
    XCTAssertTrue(app.staticTexts["1 / 32"].waitForExistence(timeout: 5))

    tapFirstAvailable(
      [
        anyElement(app, "mobile-zoom-in"),
        anyElement(app, "+"),
      ],
      named: "Zoom in"
    )
    XCTAssertTrue(
      waitForLabel(anyElement(app, "mobile-zoom-label"), containing: "110%", timeout: 5) ||
        app.staticTexts["110%"].waitForExistence(timeout: 1)
    )

    tapFirstAvailable(
      [
        anyElement(app, "mobile-highlight"),
        anyElement(app, "Highlight"),
      ],
      named: "Highlight"
    )
    tapFirstAvailable(
      [
        anyElement(app, "mobile-highlight-color-blue"),
        anyElement(app, "Blue highlight"),
      ],
      named: "Blue highlight color"
    )
    XCTAssertTrue(
      anyElement(app, "pdf-tool-hint").waitForExistence(timeout: 5),
      "Expected the active highlighter hint to appear"
    )
    canvas.coordinate(withNormalizedOffset: CGVector(dx: 0.42, dy: 0.36))
      .press(forDuration: 0.1, thenDragTo: canvas.coordinate(withNormalizedOffset: CGVector(dx: 0.58, dy: 0.39)))

    XCTAssertTrue(
      waitForAnyElement([
        anyElement(app, "mobile-annotation-sheet"),
        anyElement(app, "Annotation actions"),
      ], timeout: 5),
      "Expected the mobile annotation action sheet to appear"
    )
    XCTAssertTrue(anyElement(app, "mobile-annotation-note").waitForExistence(timeout: 2))
    XCTAssertTrue(anyElement(app, "mobile-annotation-ask").waitForExistence(timeout: 2))
    XCTAssertTrue(anyElement(app, "mobile-annotation-link").waitForExistence(timeout: 2))
    XCTAssertTrue(anyElement(app, "mobile-annotation-share").waitForExistence(timeout: 2))
    tapFirstAvailable(
      [
        anyElement(app, "mobile-annotation-close"),
        anyElement(app, "Close annotation actions"),
      ],
      named: "Close annotation actions"
    )

    let detailPanel = anyElement(app, "mobile-detail-panel")
    if detailPanel.exists {
      detailPanel.swipeUp()
    } else {
      app.swipeUp()
    }
    for _ in 0..<3 where !anyElement(app, "comments-paywall").exists {
      app.swipeUp()
    }
    XCTAssertTrue(
      waitForAnyElement([
        anyElement(app, "comments-paywall"),
        anyElement(app, "Sign in to unlock comments"),
      ], timeout: 5),
      "Expected the comments Pro gate to appear"
    )

    tapFirstAvailable(
      [
        anyElement(app, "unlock-comments-button"),
        anyElement(app, "Sign in"),
      ],
      named: "Sign in"
    )

    for _ in 0..<3 where !anyElement(app, "comment-item-local-highlight").exists {
      app.swipeUp()
    }
    XCTAssertTrue(
      waitForAnyElement([
        anyElement(app, "comment-item-local-highlight"),
        anyElement(app, "Local non-destructive highlight"),
      ], timeout: 5),
      "Expected the local highlight comment to appear"
    )

    tapFirstAvailable(
      [
        anyElement(app, "mobile-note"),
        anyElement(app, "Note"),
      ],
      named: "Note"
    )
    XCTAssertTrue(
      anyElement(app, "pdf-tool-hint").waitForExistence(timeout: 5),
      "Expected the note placement hint to appear"
    )
    canvas.coordinate(withNormalizedOffset: CGVector(dx: 0.42, dy: 0.42)).tap()
    for _ in 0..<3 where !elementWithIdentifierPrefix(app, "comment-item-note-").exists {
      app.swipeUp()
    }
    XCTAssertTrue(
      elementWithIdentifierPrefix(app, "comment-item-note-").waitForExistence(timeout: 5),
      "Expected the note review item to appear"
    )

    tapFirstAvailable(
      [
        anyElement(app, "mobile-draw"),
        anyElement(app, "Draw"),
      ],
      named: "Draw"
    )
    XCTAssertTrue(
      anyElement(app, "pdf-tool-hint").waitForExistence(timeout: 5),
      "Expected the drawing placement hint to appear"
    )
    canvas.coordinate(withNormalizedOffset: CGVector(dx: 0.58, dy: 0.52))
      .press(forDuration: 0.1, thenDragTo: canvas.coordinate(withNormalizedOffset: CGVector(dx: 0.68, dy: 0.58)))
    for _ in 0..<3 where !elementWithIdentifierPrefix(app, "comment-item-drawing-").exists {
      app.swipeUp()
    }
    XCTAssertTrue(
      elementWithIdentifierPrefix(app, "comment-item-drawing-").waitForExistence(timeout: 5),
      "Expected the drawing review item to appear"
    )

    tapFirstAvailable(
      [
        anyElement(app, "mobile-signature"),
        anyElement(app, "Sign"),
      ],
      named: "Signature"
    )
    XCTAssertTrue(
      anyElement(app, "pdf-tool-hint").waitForExistence(timeout: 5),
      "Expected the signature placement hint to appear"
    )
    canvas.coordinate(withNormalizedOffset: CGVector(dx: 0.55, dy: 0.45)).tap()
    XCTAssertTrue(
      waitForAnyElement([
        anyElement(app, "pdf-annotation-signature"),
        anyElement(app, "Ben Ebsworth"),
      ], timeout: 5),
      "Expected the signature stamp to appear on the page"
    )
  }

  private func tapFirstAvailable(_ elements: [XCUIElement], named name: String) {
    guard let element = firstExistingElement(elements) else {
      XCTFail("Could not find \(name)")
      return
    }

    element.tap()
  }

  private func anyElement(_ app: XCUIApplication, _ identifier: String) -> XCUIElement {
    app.descendants(matching: .any)[identifier].firstMatch
  }

  private func elementWithIdentifierPrefix(
    _ app: XCUIApplication,
    _ prefix: String
  ) -> XCUIElement {
    app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier BEGINSWITH %@", prefix))
      .firstMatch
  }

  private func firstExistingElement(
    _ elements: [XCUIElement],
    timeout: TimeInterval = 12
  ) -> XCUIElement? {
    for element in elements {
      if element.waitForExistence(timeout: timeout) {
        return element
      }
    }

    return nil
  }

  private func waitForAnyElement(
    _ elements: [XCUIElement],
    timeout: TimeInterval = 20
  ) -> Bool {
    firstExistingElement(elements, timeout: timeout) != nil
  }

  private func waitForValue(
    _ element: XCUIElement,
    containing expectedValue: String,
    timeout: TimeInterval = 5
  ) -> Bool {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      let currentValue = String(describing: element.value ?? "")
      if currentValue.contains(expectedValue) {
        return true
      }
      RunLoop.current.run(until: Date().addingTimeInterval(0.2))
    }

    return false
  }

  private func waitForLabel(
    _ element: XCUIElement,
    containing expectedValue: String,
    timeout: TimeInterval = 5
  ) -> Bool {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      if element.exists &&
        (element.label.contains(expectedValue) ||
          String(describing: element.value ?? "").contains(expectedValue)) {
        return true
      }
      RunLoop.current.run(until: Date().addingTimeInterval(0.2))
    }

    return false
  }

  private func waitForValueChange(
    _ element: XCUIElement,
    from initialValue: String,
    timeout: TimeInterval = 5
  ) -> Bool {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      let currentValue = String(describing: element.value ?? "")
      if currentValue != initialValue {
        return true
      }
      RunLoop.current.run(until: Date().addingTimeInterval(0.2))
    }

    return false
  }
}
