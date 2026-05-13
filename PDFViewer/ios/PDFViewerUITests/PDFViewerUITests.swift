import XCTest

final class PDFViewerUITests: XCTestCase {
  override func setUpWithError() throws {
    continueAfterFailure = false
  }

  func testMobilePdfControlsNavigateZoomAndHighlight() throws {
    let app = XCUIApplication()
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

    XCTAssertNotNil(
      firstExistingElement([
        anyElement(app, "pdf-canvas-fallback"),
        anyElement(app, "pdf-canvas-native"),
      ]),
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
    XCTAssertTrue(app.staticTexts["110%"].waitForExistence(timeout: 5))

    tapFirstAvailable(
      [
        anyElement(app, "mobile-highlight"),
        anyElement(app, "Highlight"),
      ],
      named: "Highlight"
    )
    let detailPanel = anyElement(app, "mobile-detail-panel")
    if detailPanel.exists {
      detailPanel.swipeUp()
    } else {
      app.swipeUp()
    }
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
