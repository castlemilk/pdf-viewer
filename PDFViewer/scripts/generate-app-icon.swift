import AppKit
import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let defaultLogo = root
  .appendingPathComponent("../public/logo.png")
  .standardizedFileURL
let logoPath = ProcessInfo.processInfo.environment["ACACIA_LOGO_PATH"]
let logoURL = logoPath.map { URL(fileURLWithPath: $0) } ?? defaultLogo

guard let logo = NSImage(contentsOf: logoURL) else {
  throw NSError(
    domain: "AcaciaIcon",
    code: 1,
    userInfo: [NSLocalizedDescriptionKey: "Unable to load logo image at \(logoURL.path)"]
  )
}

struct IconSlot {
  let idiom: String
  let points: Double
  let scale: Int

  var pixels: Int { Int((points * Double(scale)).rounded()) }
  var filename: String {
    let normalizedIdiom = idiom.replacingOccurrences(of: "-", with: "_")
    let normalizedPoints = String(format: "%g", points).replacingOccurrences(of: ".", with: "_")
    let suffix = scale == 1 ? "" : "@\(scale)x"
    return "\(normalizedIdiom)_icon_\(normalizedPoints)x\(normalizedPoints)\(suffix).png"
  }
  var size: String {
    let normalizedPoints = String(format: "%g", points)
    return "\(normalizedPoints)x\(normalizedPoints)"
  }
  var scaleName: String { "\(scale)x" }
}

struct IconSet {
  let path: String
  let slots: [IconSlot]
}

let iconSets = [
  IconSet(
    path: "macos/PDFViewer-macOS/Assets.xcassets/AppIcon.appiconset",
    slots: [
      IconSlot(idiom: "mac", points: 16, scale: 1),
      IconSlot(idiom: "mac", points: 16, scale: 2),
      IconSlot(idiom: "mac", points: 32, scale: 1),
      IconSlot(idiom: "mac", points: 32, scale: 2),
      IconSlot(idiom: "mac", points: 128, scale: 1),
      IconSlot(idiom: "mac", points: 128, scale: 2),
      IconSlot(idiom: "mac", points: 256, scale: 1),
      IconSlot(idiom: "mac", points: 256, scale: 2),
      IconSlot(idiom: "mac", points: 512, scale: 1),
      IconSlot(idiom: "mac", points: 512, scale: 2),
    ]
  ),
  IconSet(
    path: "ios/PDFViewer/Images.xcassets/AppIcon.appiconset",
    slots: [
      IconSlot(idiom: "iphone", points: 20, scale: 2),
      IconSlot(idiom: "iphone", points: 20, scale: 3),
      IconSlot(idiom: "iphone", points: 29, scale: 2),
      IconSlot(idiom: "iphone", points: 29, scale: 3),
      IconSlot(idiom: "iphone", points: 40, scale: 2),
      IconSlot(idiom: "iphone", points: 40, scale: 3),
      IconSlot(idiom: "iphone", points: 60, scale: 2),
      IconSlot(idiom: "iphone", points: 60, scale: 3),
      IconSlot(idiom: "ipad", points: 20, scale: 1),
      IconSlot(idiom: "ipad", points: 20, scale: 2),
      IconSlot(idiom: "ipad", points: 29, scale: 1),
      IconSlot(idiom: "ipad", points: 29, scale: 2),
      IconSlot(idiom: "ipad", points: 40, scale: 1),
      IconSlot(idiom: "ipad", points: 40, scale: 2),
      IconSlot(idiom: "ipad", points: 76, scale: 1),
      IconSlot(idiom: "ipad", points: 76, scale: 2),
      IconSlot(idiom: "ipad", points: 83.5, scale: 2),
      IconSlot(idiom: "ios-marketing", points: 1024, scale: 1),
    ]
  ),
]

func drawIcon(pixelSize: Int) throws -> Data {
  let colorSpace = CGColorSpaceCreateDeviceRGB()
  guard let context = CGContext(
    data: nil,
    width: pixelSize,
    height: pixelSize,
    bitsPerComponent: 8,
    bytesPerRow: pixelSize * 4,
    space: colorSpace,
    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
  ) else {
    throw NSError(domain: "AcaciaIcon", code: 2)
  }

  let canvas = CGRect(x: 0, y: 0, width: pixelSize, height: pixelSize)
  context.interpolationQuality = .high

  context.setFillColor(CGColor(red: 0.972, green: 0.976, blue: 0.984, alpha: 1))
  context.fill(canvas)

  guard let cgLogo = logo.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    throw NSError(domain: "AcaciaIcon", code: 3)
  }

  let sourceSize = CGSize(width: cgLogo.width, height: cgLogo.height)
  let scale = min(canvas.width / sourceSize.width, canvas.height / sourceSize.height)
  let drawSize = CGSize(width: sourceSize.width * scale, height: sourceSize.height * scale)
  let drawRect = CGRect(
    x: canvas.midX - drawSize.width / 2,
    y: canvas.midY - drawSize.height / 2,
    width: drawSize.width,
    height: drawSize.height
  )

  context.draw(cgLogo, in: drawRect)

  guard let rendered = context.makeImage() else {
    throw NSError(domain: "AcaciaIcon", code: 4)
  }
  let rep = NSBitmapImageRep(cgImage: rendered)
  guard let data = rep.representation(using: .png, properties: [:]) else {
    throw NSError(domain: "AcaciaIcon", code: 5)
  }

  return data
}

func writeContents(for iconSet: IconSet, to iconsetURL: URL) throws {
  let images = iconSet.slots.map { slot -> [String: String] in
    [
      "filename": slot.filename,
      "idiom": slot.idiom,
      "scale": slot.scaleName,
      "size": slot.size,
    ]
  }
  let contents: [String: Any] = [
    "images": images,
    "info": [
      "author": "xcode",
      "version": 1,
    ],
  ]
  let data = try JSONSerialization.data(withJSONObject: contents, options: [.prettyPrinted, .sortedKeys])
  try data.write(to: iconsetURL.appendingPathComponent("Contents.json"), options: .atomic)
}

for iconSet in iconSets {
  let iconsetURL = root.appendingPathComponent(iconSet.path, isDirectory: true)
  try FileManager.default.createDirectory(at: iconsetURL, withIntermediateDirectories: true)

  for fileURL in try FileManager.default.contentsOfDirectory(
    at: iconsetURL,
    includingPropertiesForKeys: nil
  ) where fileURL.pathExtension == "png" {
    try FileManager.default.removeItem(at: fileURL)
  }

  for slot in iconSet.slots {
    let data = try drawIcon(pixelSize: slot.pixels)
    try data.write(to: iconsetURL.appendingPathComponent(slot.filename), options: .atomic)
  }

  try writeContents(for: iconSet, to: iconsetURL)
  print("Generated Acacia app icon set at \(iconsetURL.path)")
}
