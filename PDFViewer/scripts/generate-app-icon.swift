import AppKit
import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let iconset = root
  .appendingPathComponent("macos/PDFViewer-macOS/Assets.xcassets/AppIcon.appiconset", isDirectory: true)

try FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)

struct IconSlot {
  let points: Int
  let scale: Int

  var pixels: Int { points * scale }
  var filename: String {
    scale == 1 ? "icon_\(points)x\(points).png" : "icon_\(points)x\(points)@2x.png"
  }
}

let slots = [
  IconSlot(points: 16, scale: 1),
  IconSlot(points: 16, scale: 2),
  IconSlot(points: 32, scale: 1),
  IconSlot(points: 32, scale: 2),
  IconSlot(points: 128, scale: 1),
  IconSlot(points: 128, scale: 2),
  IconSlot(points: 256, scale: 1),
  IconSlot(points: 256, scale: 2),
  IconSlot(points: 512, scale: 1),
  IconSlot(points: 512, scale: 2),
]

func color(_ hex: UInt32) -> NSColor {
  NSColor(
    calibratedRed: CGFloat((hex >> 16) & 0xff) / 255,
    green: CGFloat((hex >> 8) & 0xff) / 255,
    blue: CGFloat(hex & 0xff) / 255,
    alpha: 1
  )
}

func drawIcon(pixelSize: Int) throws -> Data {
  guard
    let rep = NSBitmapImageRep(
      bitmapDataPlanes: nil,
      pixelsWide: pixelSize,
      pixelsHigh: pixelSize,
      bitsPerSample: 8,
      samplesPerPixel: 4,
      hasAlpha: true,
      isPlanar: false,
      colorSpaceName: .deviceRGB,
      bitmapFormat: [.alphaFirst],
      bytesPerRow: 0,
      bitsPerPixel: 0
    ),
    let context = NSGraphicsContext(bitmapImageRep: rep)
  else {
    throw NSError(domain: "PDFViewerIcon", code: 1)
  }

  let size = CGFloat(pixelSize)
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = context

  let canvas = NSRect(x: 0, y: 0, width: size, height: size)
  NSColor.clear.setFill()
  canvas.fill()

  let radius = size * 0.23
  let background = NSBezierPath(roundedRect: canvas.insetBy(dx: size * 0.035, dy: size * 0.035), xRadius: radius, yRadius: radius)
  let gradient = NSGradient(colors: [color(0x2563eb), color(0x0f766e), color(0xf8fafc)])!
  gradient.draw(in: background, angle: 135)

  color(0x0f172a).withAlphaComponent(0.18).setFill()
  NSBezierPath(roundedRect: NSRect(x: size * 0.22, y: size * 0.15, width: size * 0.58, height: size * 0.68), xRadius: size * 0.075, yRadius: size * 0.075).fill()

  let page = NSRect(x: size * 0.18, y: size * 0.19, width: size * 0.58, height: size * 0.68)
  let pagePath = NSBezierPath(roundedRect: page, xRadius: size * 0.07, yRadius: size * 0.07)
  color(0xffffff).setFill()
  pagePath.fill()

  color(0xdbeafe).setFill()
  NSBezierPath(roundedRect: NSRect(x: page.minX + size * 0.08, y: page.maxY - size * 0.20, width: size * 0.33, height: size * 0.045), xRadius: size * 0.02, yRadius: size * 0.02).fill()
  NSBezierPath(roundedRect: NSRect(x: page.minX + size * 0.08, y: page.maxY - size * 0.30, width: size * 0.42, height: size * 0.035), xRadius: size * 0.018, yRadius: size * 0.018).fill()
  NSBezierPath(roundedRect: NSRect(x: page.minX + size * 0.08, y: page.maxY - size * 0.38, width: size * 0.36, height: size * 0.035), xRadius: size * 0.018, yRadius: size * 0.018).fill()

  color(0x2563eb).setFill()
  let barWidth = size * 0.055
  let chartBase = page.minY + size * 0.12
  for (index, height) in [0.16, 0.24, 0.34].enumerated() {
    let x = page.minX + size * (0.12 + CGFloat(index) * 0.13)
    let rect = NSRect(x: x, y: chartBase, width: barWidth, height: size * CGFloat(height))
    NSBezierPath(roundedRect: rect, xRadius: barWidth * 0.45, yRadius: barWidth * 0.45).fill()
  }

  color(0xfacc15).setStroke()
  let marker = NSBezierPath()
  marker.move(to: NSPoint(x: page.maxX - size * 0.18, y: page.minY + size * 0.18))
  marker.line(to: NSPoint(x: page.maxX + size * 0.08, y: page.minY + size * 0.40))
  marker.lineWidth = max(2, size * 0.035)
  marker.lineCapStyle = .round
  marker.stroke()

  color(0x0f172a).withAlphaComponent(0.20).setStroke()
  pagePath.lineWidth = max(1, size * 0.01)
  pagePath.stroke()

  NSGraphicsContext.restoreGraphicsState()

  guard let data = rep.representation(using: .png, properties: [:]) else {
    throw NSError(domain: "PDFViewerIcon", code: 2)
  }

  return data
}

for slot in slots {
  let data = try drawIcon(pixelSize: slot.pixels)
  try data.write(to: iconset.appendingPathComponent(slot.filename))
}

let contents = """
{
  "images" : [
    {
      "filename" : "icon_16x16.png",
      "idiom" : "mac",
      "scale" : "1x",
      "size" : "16x16"
    },
    {
      "filename" : "icon_16x16@2x.png",
      "idiom" : "mac",
      "scale" : "2x",
      "size" : "16x16"
    },
    {
      "filename" : "icon_32x32.png",
      "idiom" : "mac",
      "scale" : "1x",
      "size" : "32x32"
    },
    {
      "filename" : "icon_32x32@2x.png",
      "idiom" : "mac",
      "scale" : "2x",
      "size" : "32x32"
    },
    {
      "filename" : "icon_128x128.png",
      "idiom" : "mac",
      "scale" : "1x",
      "size" : "128x128"
    },
    {
      "filename" : "icon_128x128@2x.png",
      "idiom" : "mac",
      "scale" : "2x",
      "size" : "128x128"
    },
    {
      "filename" : "icon_256x256.png",
      "idiom" : "mac",
      "scale" : "1x",
      "size" : "256x256"
    },
    {
      "filename" : "icon_256x256@2x.png",
      "idiom" : "mac",
      "scale" : "2x",
      "size" : "256x256"
    },
    {
      "filename" : "icon_512x512.png",
      "idiom" : "mac",
      "scale" : "1x",
      "size" : "512x512"
    },
    {
      "filename" : "icon_512x512@2x.png",
      "idiom" : "mac",
      "scale" : "2x",
      "size" : "512x512"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
"""

try contents.write(to: iconset.appendingPathComponent("Contents.json"), atomically: true, encoding: .utf8)
print("Generated PDFViewer app icon set at \(iconset.path)")
