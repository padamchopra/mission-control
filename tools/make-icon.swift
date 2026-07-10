import AppKit

let size = 1024.0
let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size),
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
let ctx = NSGraphicsContext.current!.cgContext

func rgb(_ r: Double, _ g: Double, _ b: Double) -> CGColor {
    CGColor(red: r, green: g, blue: b, alpha: 1)
}

// Background: deep navy vertical gradient (opaque — iOS masks the corners).
let bg = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
    colors: [rgb(0.10, 0.13, 0.20), rgb(0.03, 0.04, 0.07)] as CFArray,
    locations: [0, 1])!
ctx.drawLinearGradient(bg, start: CGPoint(x: 0, y: size), end: CGPoint(x: 0, y: 0), options: [])

// Soft radial glow behind the glyph.
let glow = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
    colors: [CGColor(red: 0.30, green: 0.55, blue: 1.0, alpha: 0.22), CGColor(red: 0.30, green: 0.55, blue: 1.0, alpha: 0)] as CFArray,
    locations: [0, 1])!
ctx.drawRadialGradient(glow, startCenter: CGPoint(x: size/2, y: size/2), startRadius: 0,
    endCenter: CGPoint(x: size/2, y: size/2), endRadius: size*0.5, options: [])

// Prompt chevron ">" drawn as a thick rounded stroke.
let cx = 326.0, apexX = 514.0
let top = 640.0, mid = 512.0, bot = 384.0
let chevron = CGMutablePath()
chevron.move(to: CGPoint(x: cx, y: top))
chevron.addLine(to: CGPoint(x: apexX, y: mid))
chevron.addLine(to: CGPoint(x: cx, y: bot))
ctx.setStrokeColor(rgb(0.96, 0.97, 1.0))
ctx.setLineWidth(78)
ctx.setLineCap(.round)
ctx.setLineJoin(.round)
ctx.addPath(chevron)
ctx.strokePath()

// Cursor block to the right, in the "working" blue accent, centered on the prompt line.
let cursor = CGRect(x: 554, y: 437, width: 150, height: 150)
ctx.setFillColor(rgb(0.16, 0.52, 1.0))
ctx.addPath(CGPath(roundedRect: cursor, cornerWidth: 34, cornerHeight: 34, transform: nil))
ctx.fillPath()

NSGraphicsContext.restoreGraphicsState()
let png = rep.representation(using: .png, properties: [:])!
let out = CommandLine.arguments[1]
try! png.write(to: URL(fileURLWithPath: out))
print("wrote \(out)")
