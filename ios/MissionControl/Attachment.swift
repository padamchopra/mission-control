import SwiftUI
import UIKit

struct Attachment: Identifiable {
    let id = UUID()
    let filename: String
    let contentType: String
    let data: Data
    let isVideo: Bool
    let thumbnail: UIImage?

    static func image(_ image: UIImage, index: Int = 0) -> Attachment? {
        guard let data = image.jpegData(compressionQuality: 0.85) else { return nil }
        return Attachment(
            filename: "image-\(index).jpg",
            contentType: "image/jpeg",
            data: data,
            isVideo: false,
            thumbnail: image
        )
    }
}
